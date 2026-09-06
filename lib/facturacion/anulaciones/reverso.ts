import "server-only";

// Reverso al confirmarse la anulación de una factura (Fase 18 PR5).
// Una factura anulada nunca entregó mercadería ni retuvo el dinero:
//   · Inventario: cada línea de producto vuelve al stock.
//   · Contable: se devuelve el dinero (Egreso) solo si la factura tiene un
//     Ingreso real enlazado en Finanzas. Si no hay movimiento financiero, no
//     se inventa forma de pago ni se mueve saldo.
// Ambos guardados por ambiente "2" (en pruebas no tocan datos reales).
//
// Productos digitales (este trabajo): rama independiente de la de Shipping
// Items dentro de revertirInventarioFacturaAnulada() — misma forma (guard,
// idempotencia por link de Factura, sin typecast) pero resultado
// DELIBERADAMENTE distinto del que usa la nota de crédito
// (notaCredito/revertirInventario.ts): ver el comentario junto a
// revertirProductosDigitalesFacturaAnulada() más abajo. Corren en paralelo
// porque son tablas distintas sin relación entre sí.

import { fetchRecordsByIds, linkedIds, firstString, numberOrZero } from "../gancho/airtableGancho";
import { crearMovimiento, fetchMovimientoById } from "@/lib/finanzas/movimientos";
import type { EstadoMovimiento, Movimiento } from "@/types/finanzas";

const SHIPPING_ITEMS_TABLE = "Shipping Items";
const PRODUCTOS_DIGITALES_TABLE = "Productos Digitales";
const AMBIENTE_PRODUCCION = "2";

type DetalleFacturaMin = { tipo?: string; shippingItemId?: string; productoDigitalId?: string; cantidad?: number; descripcion?: string };

// ─── PATCH con reintento ──────────────────────────────────────────────────────
// Parametrizado por tabla para que Shipping Items y Productos Digitales lo
// compartan — mismo patrón que gancho/postEmision.ts y
// notaCredito/revertirInventario.ts.

async function patchConReintento(table: string, recordId: string, fields: Record<string, unknown>): Promise<void> {
  const token = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !baseId) throw new Error("Falta AIRTABLE_API_KEY/BASE_ID.");
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`;
  const retryable = new Set([429, 502, 503, 504]);
  let res: Response | null = null;
  for (let i = 0; i < 3; i++) {
    res = await fetch(url, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields }), cache: "no-store" });
    if (res.ok || !retryable.has(res.status) || i === 2) break;
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  if (!res || !res.ok) throw new Error(`PATCH ${table} ${recordId} → ${res?.status ?? "?"}: ${res ? await res.text() : "sin respuesta"}`);
}

// Se conserva el nombre de siempre (misma tabla, mismo comportamiento) para
// no tocar la rama de Shipping Items ni una línea de más.
async function patchItem(itemId: string, fields: Record<string, unknown>): Promise<void> {
  return patchConReintento(SHIPPING_ITEMS_TABLE, itemId, fields);
}

// ─── Inventario ──────────────────────────────────────────────────────────────

// Cuerpo SIN CAMBIOS respecto a antes de este trabajo (solo se le quitó el
// guardián de ambiente, que ahora vive una sola vez en el orquestador
// revertirInventarioFacturaAnulada() de más abajo).
async function revertirShippingItemsFacturaAnulada(input: {
  facturaRecordId: string; detalles: DetalleFacturaMin[];
}): Promise<{ estado: "OK" | "ERROR"; detalle?: string }> {
  const conItem = input.detalles.filter((d): d is DetalleFacturaMin & { shippingItemId: string } => d.tipo === "producto" && !!d.shippingItemId);
  if (conItem.length === 0) return { estado: "OK" };

  const porItem = new Map<string, number>();
  for (const d of conItem) porItem.set(d.shippingItemId, (porItem.get(d.shippingItemId) ?? 0) + (d.cantidad && d.cantidad > 0 ? d.cantidad : 0));

  const records = await fetchRecordsByIds(SHIPPING_ITEMS_TABLE, [...porItem.keys()]);
  const actual = new Map(records.map((r) => [r.id, {
    cantidad: numberOrZero(r.fields["Cantidad"]),
    facturaIds: linkedIds(r.fields["Factura"]),
    disponible: r.fields["Disponible para venta"] === true,
    estadoItem: firstString(r.fields["Estado Item"]),
  }]));

  const fallidos: string[] = [];
  for (const [itemId, qty] of porItem) {
    const est = actual.get(itemId);
    // Idempotente: solo revierte si esta factura sigue enlazada al item.
    if (!est || !est.facturaIds.includes(input.facturaRecordId)) continue;
    const nueva = (est.cantidad ?? 0) + qty;
    const fields: Record<string, unknown> = {
      "Cantidad": nueva,
      "Factura": est.facturaIds.filter((id) => id !== input.facturaRecordId),
    };
    if (nueva > 0 && !est.disponible) { fields["Disponible para venta"] = true; fields["Estado Item"] = "Disponible"; }
    try { await patchItem(itemId, fields); }
    catch (e) { fallidos.push(`${itemId}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  return fallidos.length === 0 ? { estado: "OK" } : { estado: "ERROR", detalle: `Fallaron: ${fallidos.join("; ")}` };
}

// ─── Productos Digitales — devolver a "Disponible" ──────────────────────────
//
// ── Por qué "Disponible" aquí y "Anulado" en la nota de crédito (decisión
//    de negocio de Alex, 15/ago/2026) ────────────────────────────────────────
// Una anulación significa que la factura fue un error y la venta NUNCA
// ocurrió — la clave normalmente ni se llegó a entregar (o si se entregó,
// la anulación es justamente la corrección de esa venta que no debió
// pasar). El producto vuelve al stock vendible de verdad. Esto es
// DELIBERADAMENTE distinto de lo que hace una nota de crédito
// (notaCredito/revertirInventario.ts), que deja el producto "Anulado" para
// siempre porque ahí la venta sí ocurrió y el cliente probablemente ya usó
// la clave. Dos rutas, dos resultados, a propósito — no "unificar" esto
// pensando que es una inconsistencia.
//
// ── Qué campos se limpian y cuáles no (decisión campo por campo) ───────────
// postEmisionProductosDigitales() (gancho/postEmision.ts) escribe tres
// campos al vender: Estado, Factura, Fecha de Uso / Venta, y a veces Tipo de
// Uso. Para que el producto quede REALMENTE listo para revenderse (no solo
// con el Estado cambiado), hay que deshacer esos mismos tres:
//   - "Fecha de Uso / Venta" → null. Mismo criterio que
//     desasignarProductoDigitalDeOrden() (lib/tecnicos/airtable/index.ts):
//     un producto Disponible no debe cargar la fecha de un uso que ya no
//     existe — sería engañoso si se revende en otra fecha.
//   - "Tipo de Uso" → null. Mismo criterio: ya no está en uso por nada.
//   - "Factura" → se QUITA solo el id de ESTA factura (nunca se vacía el
//     array entero) — mismo patrón que ya usa esta función para Shipping
//     Items un poco más arriba, y sirve de marca de idempotencia: si el id
//     ya no está, es que ya se revirtió.
// Lo que NO se toca, y por qué:
//   - "Orden de Reparación" → se conserva. No estaba en la lista de campos
//     que escribe postEmision, así que no es este reverso el que debe
//     deshacerlo — y conservarlo permite refacturar el producto desde esa
//     MISMA orden después de la anulación, sin tener que re-vincularlo a
//     mano. (Distinto del caso de desasignarProductoDigitalDeOrden(), que
//     si limpia este campo porque su propósito completo es desvincular.)
//   - "Usado/Vendido por" / "Usuario ID Portal" → se conservan. Ninguno de
//     los dos lo escribe postEmisionProductosDigitales() al vender —son
//     metadatos de asignarProductoDigitalAOrden(), fuera de lo que este
//     reverso es responsable de deshacer.
async function revertirProductosDigitalesFacturaAnulada(input: {
  facturaRecordId: string; detalles: DetalleFacturaMin[];
}): Promise<{ estado: "OK" | "ERROR"; detalle?: string }> {
  const conProducto = input.detalles.filter(
    (d): d is DetalleFacturaMin & { productoDigitalId: string } => d.tipo === "productoDigital" && !!d.productoDigitalId
  );
  if (conProducto.length === 0) return { estado: "OK" };

  const ids = [...new Set(conProducto.map((d) => d.productoDigitalId))];
  const records = await fetchRecordsByIds(PRODUCTOS_DIGITALES_TABLE, ids);
  const actual = new Map(records.map((r) => [r.id, { facturaIds: linkedIds(r.fields["Factura"]) }]));

  const fallidos: string[] = [];
  for (const id of ids) {
    const est = actual.get(id);
    // Idempotente: solo revierte si esta factura sigue enlazada al producto.
    if (!est || !est.facturaIds.includes(input.facturaRecordId)) continue;

    // Sin typecast: si "Disponible" no existiera como opción, esto debe
    // fallar y verse — no crear la opción sola (bitácora §6).
    const fields: Record<string, unknown> = {
      "Estado":               "Disponible",
      "Factura":              est.facturaIds.filter((fid) => fid !== input.facturaRecordId),
      "Fecha de Uso / Venta": null,
      "Tipo de Uso":          null,
    };
    try { await patchConReintento(PRODUCTOS_DIGITALES_TABLE, id, fields); }
    catch (e) { fallidos.push(`${id}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  return fallidos.length === 0 ? { estado: "OK" } : { estado: "ERROR", detalle: `Fallaron: ${fallidos.join("; ")}` };
}

// ─── Orquestador ──────────────────────────────────────────────────────────────
// Shipping Items y Productos Digitales son tablas independientes sin
// relación entre sí — corren en paralelo y ninguno hace fallar al otro. El
// guardián de ambiente vive UNA sola vez aquí y gobierna las dos ramas.
export async function revertirInventarioFacturaAnulada(input: {
  facturaRecordId: string; detalles: DetalleFacturaMin[]; ambiente?: string;
}): Promise<{ estado: "OK" | "ERROR"; detalle?: string }> {
  if (input.ambiente !== AMBIENTE_PRODUCCION) return { estado: "OK" };

  const [resultadoItems, resultadoProductosDigitales] = await Promise.all([
    revertirShippingItemsFacturaAnulada(input),
    revertirProductosDigitalesFacturaAnulada(input),
  ]);

  if (resultadoItems.estado === "OK" && resultadoProductosDigitales.estado === "OK") {
    return { estado: "OK" };
  }

  const detalle = [resultadoItems.detalle, resultadoProductosDigitales.detalle]
    .filter((d): d is string => !!d)
    .join(" | ");
  return { estado: "ERROR", detalle };
}

// ─── Contable: devolver el dinero (Egreso por cada ingreso real) ─────────────

export type ResultadoReversoContableAnulacion = {
  estado: "OK" | "OMITIDO" | "ERROR";
  movimientosRevertidos: number;
  totalRevertido: number;
  detalle?: string;
};

function resultadoContable(
  estado: ResultadoReversoContableAnulacion["estado"],
  movimientosRevertidos: number,
  totalRevertido: number,
  detalle?: string
): ResultadoReversoContableAnulacion {
  return {
    estado,
    movimientosRevertidos,
    totalRevertido: Math.round((totalRevertido + Number.EPSILON) * 100) / 100,
    ...(detalle ? { detalle } : {}),
  };
}

function esIngresoFacturacionActivo(movimiento: Movimiento): boolean {
  return movimiento.origen === "Facturación" &&
    movimiento.tipo === "Ingreso" &&
    movimiento.estado !== "Anulado" &&
    movimiento.monto > 0;
}

function estadoReversoPara(movimiento: Movimiento): EstadoMovimiento {
  return movimiento.estado === "Pendiente" ? "Pendiente" : "Confirmado";
}

async function yaTieneDevolucionActiva(movimiento: Movimiento): Promise<boolean> {
  if (movimiento.compensadoPorIds.length === 0) return false;
  const compensadores = await Promise.all(movimiento.compensadoPorIds.map((id) => fetchMovimientoById(id)));
  return compensadores.some((compensador) =>
    !!compensador &&
    compensador.estado !== "Anulado" &&
    compensador.tipo === "Egreso" &&
    compensador.origen === "Facturación" &&
    compensador.categoria === "Devolución"
  );
}

export async function revertirContableFacturaAnulada(input: {
  numeroFactura: string;
  movimientosFinancierosIds: string[];
  clienteRecordId?: string;
  registradoPor: string;
  ambiente?: string;
}): Promise<ResultadoReversoContableAnulacion> {
  if (input.ambiente !== AMBIENTE_PRODUCCION) return resultadoContable("OK", 0, 0);

  const ids = [...new Set(input.movimientosFinancierosIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    return resultadoContable(
      "OMITIDO",
      0,
      0,
      "No se creó egreso: la factura no tiene movimiento financiero enlazado; no hay un ingreso real que revertir."
    );
  }

  const movimientos: Movimiento[] = [];
  const fallidos: string[] = [];

  for (const id of ids) {
    try {
      const movimiento = await fetchMovimientoById(id);
      if (movimiento) movimientos.push(movimiento);
      else fallidos.push(`${id}: movimiento financiero no encontrado`);
    } catch (e) {
      fallidos.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const ingresos = movimientos.filter(esIngresoFacturacionActivo);
  if (ingresos.length === 0 && fallidos.length === 0) {
    return resultadoContable(
      "OMITIDO",
      0,
      0,
      "No se creó egreso: los movimientos enlazados no son ingresos activos de Facturación."
    );
  }

  let movimientosRevertidos = 0;
  let totalRevertido = 0;
  for (const movimiento of ingresos) {
    try {
      if (await yaTieneDevolucionActiva(movimiento)) continue;
      await crearMovimiento(
        {
          tipo: "Egreso", origen: "Facturación", categoria: "Devolución",
          monto: movimiento.monto, cuentaOrigenId: movimiento.cuentaDestinoId,
          estado: estadoReversoPara(movimiento), metodo: movimiento.metodo ?? "Otro",
          fecha: new Date().toISOString(), registradoPor: input.registradoPor,
          clienteId: movimiento.clienteIds[0] ?? input.clienteRecordId,
          reversaAId: movimiento.id,
          observacion: `Anulación de la factura ${input.numeroFactura} — reverso del ingreso ${movimiento.movimientoId}`,
        },
        { permitirCuentaFaltante: movimiento.cuentaDestinoId === null }
      );
      movimientosRevertidos++;
      totalRevertido += movimiento.monto;
    } catch (e) {
      fallidos.push(`${movimiento.movimientoId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (fallidos.length > 0) {
    return resultadoContable(
      "ERROR",
      movimientosRevertidos,
      totalRevertido,
      `Reverso contable incompleto: ${fallidos.join("; ")}`
    );
  }

  return resultadoContable("OK", movimientosRevertidos, totalRevertido);
}
