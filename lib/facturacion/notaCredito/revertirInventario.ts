import "server-only";

// Reverso de inventario al autorizarse una nota de crédito (Fase 18 PR2a).
//
// Es el espejo EXACTO de postEmision() (gancho/postEmision.ts): donde la
// factura RESTA de Cantidad al vender, la NC SUMA de vuelta al devolver. Solo
// las líneas marcadas con devolucionFisica=true mueven inventario — una NC
// por ajuste de precio (sin devolución del equipo) no toca stock.
//
// Guard de ambiente idéntico al de postEmision y al puente contable: Shipping
// Items es UN SOLO inventario real; en ambiente pruebas NO se toca nada.
//
// Best-effort: corre DESPUÉS de emitirNotaCredito(), desde el endpoint, en su
// propio try/catch. Un fallo suyo jamás altera el resultado de una NC que el
// SRI ya autorizó — la NC es un documento fiscal real aunque este ajuste falle.
//
// Idempotencia: el link de la NC en el Shipping Item ("Nota de Crédito") es la
// marca de "ya revertido". Un reintento re-lee el estado y salta los items que
// ya tienen esta NC vinculada — nunca suma dos veces.
//
// Regla de la casa: nunca filtrar por campo de link; se lee cada item por su
// record id (ya conocido, viene en la línea) y se escribe por PATCH directo.
//
// Productos digitales (este trabajo): rama independiente de la de Shipping
// Items, misma forma (guard, idempotencia por link de NC, sin typecast) pero
// resultado DELIBERADAMENTE distinto — ver el comentario junto a
// revertirProductosDigitalesNotaCredito() más abajo. Corren en paralelo
// porque son tablas distintas sin relación entre sí; sus fallos se combinan
// en un solo resultado, pero uno no puede hacer fallar al otro.

import { fetchRecordsByIds, linkedIds, firstString, numberOrZero } from "../gancho/airtableGancho";
import { actualizarReversoInventario } from "./airtable";
import type { DetalleNotaCredito } from "./types";

const SHIPPING_ITEMS_TABLE = "Shipping Items";
const PRODUCTOS_DIGITALES_TABLE = "Productos Digitales";
const AMBIENTE_PRODUCCION = "2";

type EstadoItemActual = { estadoItem: string; notaCreditoIds: string[]; cantidad: number; disponibleVenta: boolean };

async function fetchEstadoActual(itemIds: string[]): Promise<Map<string, EstadoItemActual>> {
  const records = await fetchRecordsByIds(SHIPPING_ITEMS_TABLE, itemIds);
  const map = new Map<string, EstadoItemActual>();
  for (const r of records) {
    map.set(r.id, {
      estadoItem:      firstString(r.fields["Estado Item"]),
      notaCreditoIds:  linkedIds(r.fields["Nota de Crédito"]),
      cantidad:        numberOrZero(r.fields["Cantidad"]),
      disponibleVenta: r.fields["Disponible para venta"] === true,
    });
  }
  return map;
}

// ─── Estado actual del producto digital (idempotencia) ──────────────────────
// Solo hace falta "Nota de Crédito": es la marca de "ya hecho" (mismo
// criterio que Shipping Items, con su propio link de NC).

type EstadoProductoDigitalActual = { notaCreditoIds: string[] };

async function fetchEstadoActualProductosDigitales(ids: string[]): Promise<Map<string, EstadoProductoDigitalActual>> {
  const records = await fetchRecordsByIds(PRODUCTOS_DIGITALES_TABLE, ids);
  const map = new Map<string, EstadoProductoDigitalActual>();
  for (const r of records) {
    map.set(r.id, { notaCreditoIds: linkedIds(r.fields["Nota de Crédito"]) });
  }
  return map;
}

// ─── PATCH con reintento ──────────────────────────────────────────────────────
// Parametrizado por tabla para que Shipping Items y Productos Digitales lo
// compartan — mismo patrón que gancho/postEmision.ts.

async function patchConReintento(table: string, recordId: string, fields: Record<string, unknown>): Promise<void> {
  const token = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !baseId) throw new Error("Falta AIRTABLE_API_KEY/BASE_ID.");
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
// tal cual (misma tabla, mismo comportamiento) para no tocar su lógica ni
// una línea de más.
async function patchItemConReintento(itemId: string, fields: Record<string, unknown>): Promise<void> {
  return patchConReintento(SHIPPING_ITEMS_TABLE, itemId, fields);
}

export type ResultadoReverso = { estado: "OK" | "ERROR"; detalle?: string };

export type ReversoInput = {
  notaCreditoRecordId: string;
  detalles:            DetalleNotaCredito[];
  ambiente?:           string;
  /** Estado Item al que se restaura un item agotado que vuelve a tener stock.
   *  Default "Disponible" — valor razonable; el operador puede reclasificarlo. */
  estadoItemRestaurado?: string;
};

// ─── Shipping Items — reverso de inventario ──────────────────────────────────
// Cuerpo SIN CAMBIOS respecto a antes de este trabajo (solo se le quitó el
// guardián de ambiente de arriba, que ahora vive una sola vez en el
// orquestador revertirInventarioNotaCredito() de más abajo, y se le cambió
// el nombre a la función de PATCH que llama — mismo comportamiento, ver
// patchItemConReintento()).
async function revertirInventarioShippingItemsNotaCredito(input: ReversoInput): Promise<ResultadoReverso> {
  // Solo líneas de producto con devolución física suman de vuelta.
  const aDevolver = input.detalles.filter(
    (d): d is DetalleNotaCredito & { shippingItemId: string } =>
      d.tipo === "producto" && !!d.shippingItemId && d.devolucionFisica === true
  );

  if (aDevolver.length === 0) {
    await actualizarReversoInventario(input.notaCreditoRecordId, "OK").catch((e) =>
      console.error("[revertirInventario] no se pudo marcar OK (sin items físicos):", e)
    );
    return { estado: "OK" };
  }

  await actualizarReversoInventario(input.notaCreditoRecordId, "PENDIENTE").catch((e) =>
    console.error("[revertirInventario] no se pudo marcar PENDIENTE:", e)
  );

  // Agrupar por item (varias líneas de la NC podrían apuntar al mismo item).
  const devueltoPorItem = new Map<string, { cantidad: number; descripcion: string }>();
  for (const d of aDevolver) {
    const prev = devueltoPorItem.get(d.shippingItemId);
    devueltoPorItem.set(d.shippingItemId, {
      cantidad:    (prev?.cantidad ?? 0) + (Number.isFinite(d.cantidad) && d.cantidad > 0 ? d.cantidad : 0),
      descripcion: prev?.descripcion ?? d.descripcion,
    });
  }

  const itemIds = [...devueltoPorItem.keys()];
  const actual  = await fetchEstadoActual(itemIds);
  const fallidos: Array<{ id: string; descripcion: string; error: string }> = [];
  let yaHechos = 0;
  let revertidos = 0;

  for (const [itemId, dev] of devueltoPorItem) {
    const est = actual.get(itemId);

    // Idempotente: el link de ESTA NC en el item marca "ya revertido".
    if (est && est.notaCreditoIds.includes(input.notaCreditoRecordId)) {
      yaHechos++;
      continue;
    }

    const cantidadActual = est?.cantidad ?? 0;
    const nuevaCantidad  = cantidadActual + dev.cantidad;

    const fields: Record<string, unknown> = {
      "Cantidad": nuevaCantidad,
      "Nota de Crédito": [...(est?.notaCreditoIds ?? []), input.notaCreditoRecordId],
    };
    // Si el item estaba agotado/vendido y vuelve a tener stock, se reactiva
    // como disponible (espejo del cierre que hace postEmision al llegar a 0).
    if (nuevaCantidad > 0 && est && !est.disponibleVenta) {
      fields["Disponible para venta"] = true;
      fields["Estado Item"] = input.estadoItemRestaurado ?? "Disponible";
    }

    try {
      await patchItemConReintento(itemId, fields);
      revertidos++;
    } catch (e) {
      fallidos.push({ id: itemId, descripcion: dev.descripcion, error: e instanceof Error ? e.message : String(e) });
    }
  }

  if (fallidos.length === 0) {
    await actualizarReversoInventario(input.notaCreditoRecordId, "OK").catch((e) =>
      console.error("[revertirInventario] no se pudo marcar OK:", e)
    );
    return { estado: "OK" };
  }

  const detalle =
    `${revertidos + yaHechos}/${devueltoPorItem.size} items revertidos. Fallaron: ` +
    fallidos.map((f) => `${f.descripcion} (${f.id}): ${f.error}`).join("; ");

  await actualizarReversoInventario(input.notaCreditoRecordId, "ERROR", detalle).catch((e) =>
    console.error("[revertirInventario] no se pudo marcar ERROR:", e)
  );

  return { estado: "ERROR", detalle };
}

// ─── Productos Digitales — marcar Anulado ────────────────────────────────────
//
// Espejo de postEmisionProductosDigitales() (gancho/postEmision.ts), en
// reversa: donde la factura marca "Usado" al vender, la NC marca "Anulado"
// al devolver.
//
// ── Por qué "Anulado" y NUNCA "Disponible" (decisión de negocio de Alex,
//    15/ago/2026) ──────────────────────────────────────────────────────────
// El cliente ya recibió la clave de activación en el momento en que la
// factura se autorizó — lo más probable es que ya la haya usado. No se
// puede revender como si nada. Esto es DELIBERADAMENTE distinto de lo que
// hace una ANULACIÓN de factura (anulaciones/reverso.ts), que sí devuelve
// el producto a "Disponible": ahí la factura fue un error y la venta nunca
// ocurrió de verdad, así que la clave normalmente ni se entregó. Dos rutas,
// dos resultados, a propósito — no "unificar" esto pensando que es una
// inconsistencia.
//
// ── Por qué devolucionFisica se IGNORA por completo para estas líneas ──────
// Esa bandera existe para distinguir, en Shipping Items, "el cliente
// devolvió el equipo" (suma stock) de "solo un ajuste de precio" (no lo
// suma). Un producto digital no tiene nada FÍSICO que devolver — la clave ya
// se entregó apenas se autorizó la factura, sin importar si esta NC es "por
// cambio" o "solo un ajuste de precio parcial": en los dos casos la licencia
// concreta ya se expuso al cliente y no es revendible. Tratar
// devolucionFisica=false como "no hagas nada" habría sido un error: dejaría
// una licencia comprometida marcada como si nunca se hubiera tocado. El
// filtro es solo (tipo === "productoDigital" && productoDigitalId) — igual
// de incondicional que "Estado = Anulado" en sí.
//
// ── Qué se toca y qué no ────────────────────────────────────────────────────
// "Nota de Crédito": se enlaza — es la marca de "ya revertido" (idempotencia)
// y deja trazabilidad de qué NC lo anuló, mismo criterio que usa la rama de
// Shipping Items con su propio link. "Factura" NUNCA se toca: es la historia
// de la venta original y se conserva (a diferencia de una anulación, donde
// la venta se borra de la historia porque nunca ocurrió).
async function revertirProductosDigitalesNotaCredito(input: ReversoInput): Promise<ResultadoReverso> {
  const lineasProductoDigital = input.detalles.filter(
    (d): d is DetalleNotaCredito & { productoDigitalId: string } =>
      d.tipo === "productoDigital" && !!d.productoDigitalId
  );

  if (lineasProductoDigital.length === 0) {
    return { estado: "OK" };
  }

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

  for (const [id, producto] of productosPorId) {
    const actual = estadoActual.get(id);

    // Idempotente: el link a ESTA nota de crédito es la marca de "ya hecho".
    if (actual && actual.notaCreditoIds.includes(input.notaCreditoRecordId)) {
      yaHechos++;
      continue;
    }

    // Sin typecast: si "Anulado" no existiera como opción en el desplegable,
    // esto debe fallar y verse — no crear la opción sola (bitácora §6).
    const fields: Record<string, unknown> = {
      "Estado":          "Anulado",
      "Nota de Crédito": [...(actual?.notaCreditoIds ?? []), input.notaCreditoRecordId],
    };

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
    `${marcados + yaHechos}/${productosPorId.size} productos digitales marcados Anulado. Fallaron: ` +
    fallidos.map((f) => `${f.descripcion} (${f.id}): ${f.error}`).join("; ");

  return { estado: "ERROR", detalle };
}

// ─── Orquestador ──────────────────────────────────────────────────────────────
// Shipping Items y Productos Digitales son tablas independientes sin
// relación entre sí — corren en paralelo y ninguno hace fallar al otro. El
// guardián de ambiente vive UNA sola vez aquí y gobierna las dos ramas.
//
// "Reverso Inventario" (el campo de estado en la propia NC) sigue siendo
// responsabilidad EXCLUSIVA de la rama de Shipping Items, sin cambios — no
// hay un campo equivalente para productos digitales, y escribir el mismo
// campo desde las dos ramas en paralelo sería una carrera real. El
// resultado combinado de esta función (OK/ERROR) sí refleja a las dos.
export async function revertirInventarioNotaCredito(input: ReversoInput): Promise<ResultadoReverso> {
  // Guard de ambiente — fail closed. Solo producción mueve inventario real.
  if (input.ambiente !== AMBIENTE_PRODUCCION) {
    return { estado: "OK" };
  }

  const [resultadoItems, resultadoProductosDigitales] = await Promise.all([
    revertirInventarioShippingItemsNotaCredito(input),
    revertirProductosDigitalesNotaCredito(input),
  ]);

  if (resultadoItems.estado === "OK" && resultadoProductosDigitales.estado === "OK") {
    return { estado: "OK" };
  }

  const detalle = [resultadoItems.detalle, resultadoProductosDigitales.detalle]
    .filter((d): d is string => !!d)
    .join(" | ");

  return { estado: "ERROR", detalle };
}
