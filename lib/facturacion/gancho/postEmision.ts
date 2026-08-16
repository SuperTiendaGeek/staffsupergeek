import "server-only";

// Post-emisión (Fase 16 PR3): descuento de inventario tras una emisión
// AUTORIZADA que vino del gancho (tiene origen). Corre DESPUÉS de
// emitirFactura() — nunca dentro de ella — invocado por el caller
// (POST /api/facturacion/emitir) y, en reintento, por
// POST /api/facturacion/historial/[recordId]/sincronizar. emitirFactura()
// se mantiene puro (solo emisión al SRI); esto es un paso separado cuyo
// fallo JAMÁS debe alterar el resultado ya devuelto de la emisión — la
// factura ya es real ante el SRI aunque este paso falle.
//
// Regla de la casa: nunca filtrar por campo de link — se lee el estado
// actual de cada Shipping Item (o Producto Digital) por su record id (ya
// conocido, viene en la línea) y se escribe directamente por RECORD_ID
// (PATCH por id, no por filterByFormula).
//
// Productos digitales (este trabajo): rama independiente de la de Shipping
// Items, misma forma pero sobre la tabla "Productos Digitales" — marca
// Estado="Usado" y enlaza la factura, nunca descuenta inventario. Corren en
// paralelo porque son tablas distintas sin relación entre sí; sus fallos se
// combinan en un solo resultado, pero uno no puede hacer fallar al otro.

import { fetchRecordsByIds, linkedIds, firstString, numberOrZero } from "./airtableGancho";
import { actualizarSincronizacionInventario } from "../airtable/facturas";
import { ahoraEnEcuador } from "../fechaEcuador";
import type { DetalleFactura } from "../types/factura";

const SHIPPING_ITEMS_TABLE = "Shipping Items";
const PRODUCTOS_DIGITALES_TABLE = "Productos Digitales";

// ─── Estado actual del item (para decidir si ya está hecho) ─────────────────

type EstadoItemActual = { estadoItem: string; facturaIds: string[]; cantidad: number };

async function fetchEstadoActualItems(itemIds: string[]): Promise<Map<string, EstadoItemActual>> {
  const records = await fetchRecordsByIds(SHIPPING_ITEMS_TABLE, itemIds);
  const map = new Map<string, EstadoItemActual>();
  for (const r of records) {
    map.set(r.id, {
      estadoItem: firstString(r.fields["Estado Item"]),
      facturaIds: linkedIds(r.fields["Factura"]),
      cantidad:   numberOrZero(r.fields["Cantidad"]),
    });
  }
  return map;
}

// ─── Estado actual del producto digital (idempotencia + Tipo de Uso) ────────
// "Factura" es la marca de "ya hecho" (mismo criterio que Shipping Items).
// El estado se sobreescribe siempre a "Usado" cuando no está hecho — no hace
// falta leerlo antes. "Orden de Reparación" sí hace falta leerlo: decide si
// esta venta es de mostrador (sin orden) para escribir "Tipo de Uso" —
// ver el comentario junto a esa escritura, más abajo.

type EstadoProductoDigitalActual = { facturaIds: string[]; tieneOrden: boolean };

async function fetchEstadoActualProductosDigitales(ids: string[]): Promise<Map<string, EstadoProductoDigitalActual>> {
  const records = await fetchRecordsByIds(PRODUCTOS_DIGITALES_TABLE, ids);
  const map = new Map<string, EstadoProductoDigitalActual>();
  for (const r of records) {
    map.set(r.id, {
      facturaIds: linkedIds(r.fields["Factura"]),
      tieneOrden: linkedIds(r.fields["Orden de Reparación"]).length > 0,
    });
  }
  return map;
}

// ─── PATCH con reintento ──────────────────────────────────────────────────────
// Ni Shipping Items ni Productos Digitales tienen un helper de reintentos
// propio todavía (el módulo gancho trae sus propios fetchers mínimos, sin
// tocar lib/shipping-v2/ ni lib/tecnicos/airtable/ — mismo patrón que
// airtableGancho.ts). Reintenta 429/502/503/504 con backoff simple — igual
// en espíritu al patrón ya usado en lib/horarios/airtable.ts, acotado a
// este módulo. Parametrizado por tabla para que ambas ramas lo compartan.

async function patchConReintento(
  table:  string,
  recordId: string,
  fields: Record<string, unknown>
): Promise<void> {
  const token  = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token)  throw new Error("Falta AIRTABLE_API_KEY en .env.local.");
  if (!baseId) throw new Error("Falta AIRTABLE_BASE_ID en .env.local.");

  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`;
  const retryable = new Set([429, 502, 503, 504]);

  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(url, {
      method:  "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ fields }),
      cache:   "no-store",
    });
    if (res.ok || !retryable.has(res.status) || attempt === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }

  if (!res || !res.ok) {
    const text = res ? await res.text() : "sin respuesta";
    throw new Error(`PATCH ${table} ${recordId} → ${res?.status ?? "?"}: ${text}`);
  }
}

// Shipping Items seguía llamando a esta función por su nombre — se conserva
// tal cual (misma tabla, mismo comportamiento) para no tocar la rama de
// Shipping Items ni una línea de más.
async function patchShippingItemConReintento(
  itemId: string,
  fields: Record<string, unknown>
): Promise<void> {
  return patchConReintento(SHIPPING_ITEMS_TABLE, itemId, fields);
}

// ─── postEmision ──────────────────────────────────────────────────────────────

export type ResultadoPostEmision = {
  estado:  "OK" | "ERROR";
  detalle?: string; // texto legible: cuántos items sí, cuáles no y por qué
};

export type PostEmisionInput = {
  facturaRecordId: string;
  detalles:        DetalleFactura[];
  // Fase 17 — ver guard debajo. Opcional solo por compatibilidad de tipos con
  // ResultadoEmision.ambiente (string | undefined); en la práctica todo
  // llamador real debe mandarlo.
  ambiente?:       string;
};

// Guard de ambiente (Fase 17 — hardening pre-producción). Shipping Items es
// UN SOLO inventario real, sin distinción de pruebas/producción — a
// diferencia del SRI (celcer vs cel) o del puente contable (que sí tiene su
// propio guard en lib/finanzas/puentes/facturacion.ts). Antes de este guard,
// probar el botón "Emitir factura" del gancho en ambiente pruebas con una
// orden/operación real ya marcaba un repuesto real como "Vendido" — pasó de
// verdad (ver docs/AUDITORIA_FASE17_18_FACTURACION_PRODUCCION_NOTAS_CREDITO.md
// sección 1.1; los registros afectados, REP-000010/REP-000011, se corrigieron
// a mano en Airtable el 2026-07-16, pero el hueco de código seguía abierto).
// "Fail closed": cualquier valor que no sea exactamente "2" (incluido
// undefined) NO toca inventario — mismo criterio que ya usa el puente
// contable para "2" === producción.
const AMBIENTE_PRODUCCION = "2";

/**
 * ¿Corresponde intentar el descuento de inventario tras esta emisión?
 *
 * ─── Por qué esta función existe ─────────────────────────────────────────────
 *
 * Porque su ausencia costó una factura real. El endpoint de emisión tenía la
 * condición escrita a mano así:
 *
 *     if (resultado.estado === "AUTORIZADO" && body.origen && resultado.recordId)
 *
 * Ese `body.origen` venía de la Fase 16, cuando SOLO el gancho (órdenes y
 * operaciones comerciales) descontaba inventario. En la Fase 17.b se conectó
 * el mostrador: el buscador del formulario empezó a vincular cada línea con su
 * Shipping Item, y la verificación previa de stock pasó a correr para TODAS
 * las facturas. Pero la condición del descuento se quedó como estaba.
 *
 * El resultado era una contradicción silenciosa: una venta de mostrador no
 * tiene `origen`, así que el sistema comprobaba que hubiera stock, dejaba
 * vender, y no descontaba nada. Lo encontró Alex en la primera factura real
 * de producción, la 001-002-000000674, el 14 de agosto de 2026.
 *
 * La regla NO mira el origen. Importa que la factura sea real (AUTORIZADO) y
 * que exista su registro. Qué líneas descuentan lo decide postEmision(), que
 * ignora servicios y líneas manuales, y el ambiente lo filtra su propio
 * guardián.
 */
export function debeIntentarPostEmision<T extends { estado: string; recordId?: string }>(
  resultado: T
): resultado is T & { recordId: string } {
  return resultado.estado === "AUTORIZADO" && !!resultado.recordId;
}

// ─── Shipping Items — descuento de inventario ────────────────────────────────
// Cuerpo SIN CAMBIOS respecto a antes de este trabajo (solo se le quitó el
// guardián de ambiente de arriba, que ahora vive una sola vez en el
// orquestador postEmision() de más abajo y gobierna las dos ramas).
async function postEmisionShippingItems(input: PostEmisionInput): Promise<ResultadoPostEmision> {
  // Solo líneas tipo:"producto" con shippingItemId cuentan — servicios y
  // líneas manuales agregadas a mano en el formulario (buscador o "+
  // Agregar línea manual") nunca llevan esta marca, se ignoran aquí tal
  // como se documentó (§5 y PR4-pendiente del diseño).
  const itemsProducto = input.detalles.filter(
    (d): d is DetalleFactura & { shippingItemId: string } =>
      d.tipo === "producto" && !!d.shippingItemId
  );

  if (itemsProducto.length === 0) {
    await actualizarSincronizacionInventario(input.facturaRecordId, "OK").catch((e) => {
      console.error("[postEmision] no se pudo marcar OK (sin items de inventario):", e);
    });
    return { estado: "OK" };
  }

  // Best-effort: si esta escritura falla, seguimos igual con el trabajo
  // real (marcar los items) — "Sincronización Inventario" es observabilidad,
  // no debe bloquear el descuento de inventario en sí.
  await actualizarSincronizacionInventario(input.facturaRecordId, "PENDIENTE").catch((e) => {
    console.error("[postEmision] no se pudo marcar PENDIENTE:", e);
  });

  // Fase 17.b — inventario por cantidad. Varias líneas de la misma factura
  // pueden apuntar al mismo Shipping Item; se agrupan y se descuenta la SUMA
  // una sola vez por item (un solo PATCH), no línea por línea.
  const vendidaPorItem = new Map<string, { cantidad: number; descripcion: string }>();
  for (const linea of itemsProducto) {
    const prev = vendidaPorItem.get(linea.shippingItemId);
    vendidaPorItem.set(linea.shippingItemId, {
      cantidad:    (prev?.cantidad ?? 0) + (Number.isFinite(linea.cantidad) && linea.cantidad > 0 ? linea.cantidad : 0),
      descripcion: prev?.descripcion ?? linea.descripcion,
    });
  }

  const itemIds       = [...vendidaPorItem.keys()];
  // Releído AQUÍ, justo antes de escribir — no se confía en la cantidad que
  // haya visto el formulario/pre-chequeo minutos antes (mitiga la ventana de
  // carrera entre dos facturas simultáneas sobre el mismo item).
  const estadoActual  = await fetchEstadoActualItems(itemIds);
  const fallidos: Array<{ id: string; descripcion: string; error: string }> = [];
  const advertencias: string[] = [];
  let yaHechos  = 0;
  let marcados  = 0;

  for (const [itemId, venta] of vendidaPorItem) {
    const actual = estadoActual.get(itemId);

    // Idempotente: el link a ESTA factura es la marca de "ya descontado".
    // Se escribe en el mismo PATCH que el descuento, así que su presencia
    // implica que el descuento de esta factura ya se aplicó — un reintento
    // (/sincronizar) no debe descontar dos veces.
    if (actual && actual.facturaIds.includes(input.facturaRecordId)) {
      yaHechos++;
      continue;
    }

    const disponible = actual?.cantidad ?? 0;
    const nueva      = disponible - venta.cantidad;
    const nuevaFinal = Math.max(0, nueva);

    if (nueva < 0) {
      // La factura ya es real ante el SRI — no se puede rechazar la venta.
      // Se deja el stock en 0 (lo más cercano a la realidad) y constancia
      // visible del descuadre para corrección manual.
      advertencias.push(
        `${venta.descripcion} (${itemId}): stock insuficiente al descontar — había ${disponible}, se facturaron ${venta.cantidad}. Cantidad dejada en 0; revisar inventario físico.`
      );
    }

    const fields: Record<string, unknown> = {
      "Cantidad": nuevaFinal,
      // APPEND, nunca reemplazo: con ventas parciales un mismo item puede
      // acumular varias facturas a lo largo de su stock.
      "Factura":  [...(actual?.facturaIds ?? []), input.facturaRecordId],
    };
    // Solo cuando el stock se agota, el registro se cierra como Vendido y
    // deja de estar disponible para venta. Con stock restante, el registro
    // sigue vivo tal como está (su Estado Item logístico no cambia).
    if (nuevaFinal === 0) {
      fields["Estado Item"]           = "Vendido";
      fields["Disponible para venta"] = false;
    }

    try {
      await patchShippingItemConReintento(itemId, fields);
      marcados++;
    } catch (e) {
      fallidos.push({
        id:          itemId,
        descripcion: venta.descripcion,
        error:       e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (fallidos.length === 0 && advertencias.length === 0) {
    await actualizarSincronizacionInventario(input.facturaRecordId, "OK").catch((e) => {
      console.error("[postEmision] no se pudo marcar OK:", e);
    });
    return { estado: "OK" };
  }

  const partes: string[] = [
    `${marcados + yaHechos}/${vendidaPorItem.size} items sincronizados.`,
  ];
  if (fallidos.length > 0) {
    partes.push("Fallaron: " + fallidos.map((f) => `${f.descripcion} (${f.id}): ${f.error}`).join("; "));
  }
  if (advertencias.length > 0) {
    partes.push("Advertencias: " + advertencias.join("; "));
  }
  const detalle = partes.join(" ");

  await actualizarSincronizacionInventario(input.facturaRecordId, "ERROR", detalle).catch((e) => {
    console.error("[postEmision] no se pudo marcar ERROR en Sincronización Inventario:", e);
  });

  return { estado: "ERROR", detalle };
}

// ─── Productos Digitales — marcar Usado y enlazar la factura ────────────────
//
// Espejo de postEmisionShippingItems(), pero para "Productos Digitales": al
// autorizarse la factura, cada producto digital vendido queda Usado y
// enlazado — nunca descuenta inventario (esa tabla no tiene cantidad, cada
// registro es una unidad). "Orden de Reparación" no se toca aquí: ya viene
// puesto desde asignarProductoDigitalAOrden() (lib/tecnicos/airtable), que
// desde este trabajo dejó de escribir Estado — ese campo ahora lo pone
// exclusivamente esta función, al facturarse de verdad.
//
// "Tipo de Uso" (venta en mostrador, PR de productos digitales en
// mostrador): se escribe "Venta directa" SOLO cuando el producto no tiene
// orden vinculada — una venta de mostrador nunca pasó por
// asignarProductoDigitalAOrden(), así que ese campo llegaría vacío si no se
// pone aquí. Con orden vinculada no se toca: ya dice "Orden de reparación".
async function postEmisionProductosDigitales(input: PostEmisionInput): Promise<ResultadoPostEmision> {
  const lineasProductoDigital = input.detalles.filter(
    (d): d is DetalleFactura & { productoDigitalId: string } =>
      d.tipo === "productoDigital" && !!d.productoDigitalId
  );

  if (lineasProductoDigital.length === 0) {
    return { estado: "OK" };
  }

  // Un producto digital es siempre 1 unidad — a diferencia de Shipping
  // Items no hace falta agrupar cantidades, solo deduplicar por si la misma
  // línea apareciera más de una vez.
  const productosPorId = new Map<string, { descripcion: string }>();
  for (const linea of lineasProductoDigital) {
    if (!productosPorId.has(linea.productoDigitalId)) {
      productosPorId.set(linea.productoDigitalId, { descripcion: linea.descripcion });
    }
  }

  const ids          = [...productosPorId.keys()];
  const estadoActual = await fetchEstadoActualProductosDigitales(ids);
  const fallidos: Array<{ id: string; descripcion: string; error: string }> = [];
  let yaHechos = 0;
  let marcados = 0;

  // ahoraEnEcuador(), no new Date(): Vercel corre en UTC, y new Date() aquí
  // habría escrito la fecha de "mañana" entre las 19:00 y medianoche hora
  // Ecuador (mismo bug que fechaEcuador.ts documenta para la emisión).
  // Con getters LOCALES (getDate/getMonth/getFullYear), no con
  // .toISOString(): ese reconvierte a UTC y deshace la corrección salvo que
  // el servidor ya esté en UTC — mismo patrón que usa el resto del módulo
  // (claveAcceso.ts, ride/generarRide.ts, almacenamiento/blob.ts, etc.).
  const ahora = ahoraEnEcuador();
  const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;

  for (const [id, producto] of productosPorId) {
    const actual = estadoActual.get(id);

    // Idempotente: el link a ESTA factura es la marca de "ya hecho" — mismo
    // criterio que Shipping Items. Un reintento (/sincronizar) no debe
    // volver a escribir lo que ya quedó marcado.
    if (actual && actual.facturaIds.includes(input.facturaRecordId)) {
      yaHechos++;
      continue;
    }

    // Sin typecast: si "Usado" (o "Venta directa") no existiera como opción
    // en el desplegable, esto debe fallar y verse — no crear la opción sola
    // (bitácora §6).
    const fields: Record<string, unknown> = {
      "Estado":              "Usado",
      "Factura":             [...(actual?.facturaIds ?? []), input.facturaRecordId],
      "Fecha de Uso / Venta": hoy,
    };
    // "Tipo de Uso" SOLO si el producto no tiene orden vinculada — una
    // venta de mostrador nunca pasó por asignarProductoDigitalAOrden(), así
    // que ese campo quedaría vacío si no se escribe aquí. Si SÍ tiene
    // orden, no se toca: ya dice "Orden de reparación" (lo puso
    // asignarProductoDigitalAOrden() al vincular).
    if (!actual?.tieneOrden) {
      fields["Tipo de Uso"] = "Venta directa";
    }

    try {
      await patchConReintento(PRODUCTOS_DIGITALES_TABLE, id, fields);
      marcados++;
    } catch (e) {
      fallidos.push({
        id,
        descripcion: producto.descripcion,
        error:       e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (fallidos.length === 0) {
    return { estado: "OK" };
  }

  const detalle =
    `${marcados + yaHechos}/${productosPorId.size} productos digitales marcados. Fallaron: ` +
    fallidos.map((f) => `${f.descripcion} (${f.id}): ${f.error}`).join("; ");

  return { estado: "ERROR", detalle };
}

// ─── Orquestador ──────────────────────────────────────────────────────────────
// Shipping Items y Productos Digitales son tablas independientes sin
// relación entre sí — corren en paralelo y ninguno hace fallar al otro. El
// guardián de ambiente vive UNA sola vez aquí y gobierna las dos ramas.
export async function postEmision(input: PostEmisionInput): Promise<ResultadoPostEmision> {
  if (input.ambiente !== AMBIENTE_PRODUCCION) {
    return { estado: "OK" };
  }

  const [resultadoItems, resultadoProductosDigitales] = await Promise.all([
    postEmisionShippingItems(input),
    postEmisionProductosDigitales(input),
  ]);

  if (resultadoItems.estado === "OK" && resultadoProductosDigitales.estado === "OK") {
    return { estado: "OK" };
  }

  const detalle = [resultadoItems.detalle, resultadoProductosDigitales.detalle]
    .filter((d): d is string => !!d)
    .join(" | ");

  return { estado: "ERROR", detalle };
}
