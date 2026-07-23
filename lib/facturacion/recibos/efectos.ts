import "server-only";

// Efectos internos del recibo (Fase 18 PR4): descuento de inventario + ingreso
// en el Sistema Contable SG. Guardados por ambiente igual que factura/NC:
// Shipping Items y /finanzas son datos REALES compartidos, así que en PRUEBAS
// no se tocan (el recibo se usa solo tras el go-live, cuando SRI_AMBIENTE=2).
// El recibo (registro + PDF) sí se crea siempre; estos efectos son aparte.

import { fetchRecordsByIds, linkedIds, firstString, numberOrZero } from "../gancho/airtableGancho";
import { crearMovimiento } from "@/lib/finanzas/movimientos";
import { fetchCuentaPorNombre } from "@/lib/finanzas/cuentas";
import { actualizarEfectosRecibo } from "./airtable";
import type { LineaRecibo } from "./types";
import type { EstadoMovimiento, MetodoMovimiento } from "@/types/finanzas";

const SHIPPING_ITEMS_TABLE = "Shipping Items";
const AMBIENTE_PRODUCCION = "2";

// ─── Inventario: descuenta Cantidad, mismo criterio que la factura ───────────

export async function descontarInventarioRecibo(input: {
  reciboRecordId: string;
  numeroRecibo:   string;
  lineas:         LineaRecibo[];
  ambiente?:      string;
}): Promise<{ estado: "OK" | "ERROR"; detalle?: string }> {
  if (input.ambiente !== AMBIENTE_PRODUCCION) return { estado: "OK" };

  const conItem = input.lineas.filter((l): l is LineaRecibo & { shippingItemId: string } => !!l.shippingItemId);
  if (conItem.length === 0) {
    await actualizarEfectosRecibo(input.reciboRecordId, "Sincronización Inventario", "OK").catch(() => {});
    return { estado: "OK" };
  }

  await actualizarEfectosRecibo(input.reciboRecordId, "Sincronización Inventario", "PENDIENTE").catch(() => {});

  const porItem = new Map<string, { cantidad: number; descripcion: string }>();
  for (const l of conItem) {
    const prev = porItem.get(l.shippingItemId);
    porItem.set(l.shippingItemId, {
      cantidad: (prev?.cantidad ?? 0) + (Number.isFinite(l.cantidad) && l.cantidad > 0 ? l.cantidad : 0),
      descripcion: prev?.descripcion ?? l.descripcion,
    });
  }

  const ids = [...porItem.keys()];
  const records = await fetchRecordsByIds(SHIPPING_ITEMS_TABLE, ids);
  const actual = new Map(records.map((r) => [r.id, {
    cantidad: numberOrZero(r.fields["Cantidad"]),
    reciboIds: linkedIds(r.fields["Recibo"]),
    estadoItem: firstString(r.fields["Estado Item"]),
  }]));

  const fallidos: string[] = [];
  const advertencias: string[] = [];
  for (const [itemId, venta] of porItem) {
    const est = actual.get(itemId);
    if (est && est.reciboIds.includes(input.reciboRecordId)) continue; // idempotente

    const disponible = est?.cantidad ?? 0;
    const nueva = disponible - venta.cantidad;
    if (nueva < 0) advertencias.push(`${venta.descripcion}: stock insuficiente (había ${disponible}, se vendieron ${venta.cantidad}). Cantidad dejada en 0.`);
    const nuevaFinal = Math.max(0, nueva);

    const fields: Record<string, unknown> = {
      "Cantidad": nuevaFinal,
      "Recibo": [...(est?.reciboIds ?? []), input.reciboRecordId],
    };
    if (nuevaFinal === 0) { fields["Estado Item"] = "Vendido"; fields["Disponible para venta"] = false; }

    try { await patchItem(itemId, fields); }
    catch (e) { fallidos.push(`${venta.descripcion}: ${e instanceof Error ? e.message : String(e)}`); }
  }

  if (fallidos.length === 0 && advertencias.length === 0) {
    await actualizarEfectosRecibo(input.reciboRecordId, "Sincronización Inventario", "OK").catch(() => {});
    return { estado: "OK" };
  }
  const detalle = [...(fallidos.length ? [`Fallaron: ${fallidos.join("; ")}`] : []), ...(advertencias.length ? [`Advertencias: ${advertencias.join("; ")}`] : [])].join(" ");
  await actualizarEfectosRecibo(input.reciboRecordId, "Sincronización Inventario", "ERROR", detalle).catch(() => {});
  return { estado: "ERROR", detalle };
}

// Reverso de inventario al anular un recibo: suma de vuelta el stock.
export async function revertirInventarioRecibo(input: { reciboRecordId: string; lineas: LineaRecibo[]; ambiente?: string }): Promise<void> {
  if (input.ambiente !== AMBIENTE_PRODUCCION) return;
  const conItem = input.lineas.filter((l): l is LineaRecibo & { shippingItemId: string } => !!l.shippingItemId);
  if (conItem.length === 0) return;

  const porItem = new Map<string, number>();
  for (const l of conItem) porItem.set(l.shippingItemId, (porItem.get(l.shippingItemId) ?? 0) + (l.cantidad > 0 ? l.cantidad : 0));

  const records = await fetchRecordsByIds(SHIPPING_ITEMS_TABLE, [...porItem.keys()]);
  const actual = new Map(records.map((r) => [r.id, {
    cantidad: numberOrZero(r.fields["Cantidad"]),
    reciboIds: linkedIds(r.fields["Recibo"]),
    disponible: r.fields["Disponible para venta"] === true,
  }]));

  for (const [itemId, qty] of porItem) {
    const est = actual.get(itemId);
    // Solo revierte si este recibo está enlazado (evita revertir dos veces).
    if (!est || !est.reciboIds.includes(input.reciboRecordId)) continue;
    const nueva = (est.cantidad ?? 0) + qty;
    const fields: Record<string, unknown> = {
      "Cantidad": nueva,
      "Recibo": est.reciboIds.filter((id) => id !== input.reciboRecordId),
    };
    if (nueva > 0 && !est.disponible) { fields["Disponible para venta"] = true; fields["Estado Item"] = "Disponible"; }
    await patchItem(itemId, fields).catch((e) => console.error("[revertirInventarioRecibo]", e));
  }
}

async function patchItem(itemId: string, fields: Record<string, unknown>): Promise<void> {
  const token = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !baseId) throw new Error("Falta AIRTABLE_API_KEY/BASE_ID.");
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(SHIPPING_ITEMS_TABLE)}/${encodeURIComponent(itemId)}`;
  const retryable = new Set([429, 502, 503, 504]);
  let res: Response | null = null;
  for (let i = 0; i < 3; i++) {
    res = await fetch(url, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields }), cache: "no-store" });
    if (res.ok || !retryable.has(res.status) || i === 2) break;
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  if (!res || !res.ok) throw new Error(`PATCH Shipping Items ${itemId} → ${res?.status ?? "?"}: ${res ? await res.text() : "sin respuesta"}`);
}

// ─── Contable: Ingreso en el Sistema Contable SG ─────────────────────────────
// Sin IVA (el recibo no desglosa). Reutiliza crearMovimiento con la misma
// categoría de venta de mostrador; la observación lo identifica como recibo.

const MAPA_FORMA_PAGO: Record<string, { cuenta: string; estado: EstadoMovimiento; metodo: MetodoMovimiento } | null> = {
  "01": { cuenta: "Caja Registradora", estado: "Confirmado", metodo: "Efectivo" },
  "16": { cuenta: "Tarjetas en Tránsito", estado: "Pendiente", metodo: "Tarjeta débito" },
  "19": { cuenta: "Tarjetas en Tránsito", estado: "Pendiente", metodo: "Tarjeta crédito" },
  "18": { cuenta: "Tarjetas en Tránsito", estado: "Pendiente", metodo: "Tarjeta débito" },
  "17": { cuenta: "SGINGRESOS", estado: "Confirmado", metodo: "Dinero electrónico" },
  "15": null, "20": null, "21": null,
};

export async function registrarIngresoRecibo(input: {
  reciboRecordId: string;
  numeroRecibo:   string;
  total:          number;
  formaPago:      string;
  clienteRecordId?: string;
  registradoPor:  string;
  ambiente?:      string;
}): Promise<{ estado: "OK" | "OMITIDO" | "ERROR"; detalle?: string }> {
  if (input.ambiente !== AMBIENTE_PRODUCCION) return { estado: "OMITIDO" };
  if (!(input.total > 0)) return { estado: "OMITIDO" };

  await actualizarEfectosRecibo(input.reciboRecordId, "Movimiento Contable", "PENDIENTE").catch(() => {});
  try {
    const mapeo = MAPA_FORMA_PAGO[input.formaPago] ?? null;
    const cuenta = mapeo ? await fetchCuentaPorNombre(mapeo.cuenta) : null;
    await crearMovimiento(
      {
        tipo: "Ingreso", origen: "Facturación", categoria: "Venta Mostrador",
        monto: input.total, cuentaDestinoId: cuenta?.id ?? null,
        estado: mapeo?.estado ?? "Confirmado", estadoDistribucion: "Pendiente de clasificar",
        metodo: mapeo?.metodo, fecha: new Date().toISOString(), registradoPor: input.registradoPor,
        clienteId: input.clienteRecordId,
        observacion: `Recibo interno ${input.numeroRecibo} (documento no tributario, sin IVA)`,
      },
      { permitirCuentaFaltante: cuenta === null }
    );
    await actualizarEfectosRecibo(input.reciboRecordId, "Movimiento Contable", "OK").catch(() => {});
    return { estado: "OK" };
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e);
    await actualizarEfectosRecibo(input.reciboRecordId, "Movimiento Contable", "ERROR", detalle).catch(() => {});
    return { estado: "ERROR", detalle };
  }
}

// Reverso contable al anular un recibo: Egreso categoría "Devolución".
export async function revertirIngresoRecibo(input: {
  numeroRecibo: string; total: number; formaPago: string; clienteRecordId?: string; registradoPor: string; ambiente?: string;
}): Promise<void> {
  if (input.ambiente !== AMBIENTE_PRODUCCION) return;
  if (!(input.total > 0)) return;
  try {
    const mapeo = MAPA_FORMA_PAGO[input.formaPago] ?? null;
    const cuenta = mapeo ? await fetchCuentaPorNombre(mapeo.cuenta) : null;
    await crearMovimiento(
      {
        tipo: "Egreso", origen: "Facturación", categoria: "Devolución",
        monto: input.total, cuentaOrigenId: cuenta?.id ?? null,
        estado: "Confirmado", fecha: new Date().toISOString(), registradoPor: input.registradoPor,
        clienteId: input.clienteRecordId,
        observacion: `Anulación del recibo interno ${input.numeroRecibo}`,
      },
      { permitirCuentaFaltante: cuenta === null }
    );
  } catch (e) {
    console.error("[revertirIngresoRecibo]", e);
  }
}
