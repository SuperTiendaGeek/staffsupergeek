import "server-only";

// Reverso al confirmarse la anulación de una factura (Fase 18 PR5).
// Una factura anulada nunca entregó mercadería ni retuvo el dinero:
//   · Inventario: cada línea de producto vuelve al stock.
//   · Contable: se devuelve el dinero (Egreso) por cada forma de pago que fue
//     un cobro real de caja — la compensación (crédito de NC, código 15) no se
//     devuelve en efectivo. Es el ÚNICO documento que genera egreso de caja
//     (decisión del dueño: anulación = cliente devuelve el equipo y su dinero).
// Ambos guardados por ambiente "2" (en pruebas no tocan datos reales).

import { fetchRecordsByIds, linkedIds, firstString, numberOrZero } from "../gancho/airtableGancho";
import { crearMovimiento } from "@/lib/finanzas/movimientos";
import { fetchCuentaPorNombre } from "@/lib/finanzas/cuentas";
import type { EstadoMovimiento, MetodoMovimiento } from "@/types/finanzas";

const SHIPPING_ITEMS_TABLE = "Shipping Items";
const AMBIENTE_PRODUCCION = "2";

type DetalleFacturaMin = { tipo?: string; shippingItemId?: string; cantidad?: number; descripcion?: string };
type PagoMin = { formaPago: string; total: number };

// ─── Inventario ──────────────────────────────────────────────────────────────

export async function revertirInventarioFacturaAnulada(input: {
  facturaRecordId: string; detalles: DetalleFacturaMin[]; ambiente?: string;
}): Promise<{ estado: "OK" | "ERROR"; detalle?: string }> {
  if (input.ambiente !== AMBIENTE_PRODUCCION) return { estado: "OK" };

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
  if (!res || !res.ok) throw new Error(`PATCH ${itemId} → ${res?.status ?? "?"}: ${res ? await res.text() : "sin respuesta"}`);
}

// ─── Contable: devolver el dinero (Egreso por cada cobro real) ───────────────

const MAPA: Record<string, { cuenta: string; estado: EstadoMovimiento; metodo: MetodoMovimiento } | null> = {
  "01": { cuenta: "Caja Registradora", estado: "Confirmado", metodo: "Efectivo" },
  "16": { cuenta: "Tarjetas en Tránsito", estado: "Pendiente", metodo: "Tarjeta débito" },
  "19": { cuenta: "Tarjetas en Tránsito", estado: "Pendiente", metodo: "Tarjeta crédito" },
  "18": { cuenta: "Tarjetas en Tránsito", estado: "Pendiente", metodo: "Tarjeta débito" },
  "17": { cuenta: "SGINGRESOS", estado: "Confirmado", metodo: "Dinero electrónico" },
  "15": null, "20": null, "21": null,
};

export async function revertirContableFacturaAnulada(input: {
  numeroFactura: string; pagos: PagoMin[]; clienteRecordId?: string; registradoPor: string; ambiente?: string;
}): Promise<void> {
  if (input.ambiente !== AMBIENTE_PRODUCCION) return;
  for (const pago of input.pagos) {
    if (!(pago.total > 0)) continue;
    const mapeo = MAPA[pago.formaPago] ?? null;
    // La compensación (15) no fue caja real → no se devuelve en efectivo.
    if (!mapeo) continue;
    try {
      const cuenta = await fetchCuentaPorNombre(mapeo.cuenta);
      await crearMovimiento(
        {
          tipo: "Egreso", origen: "Facturación", categoria: "Devolución",
          monto: pago.total, cuentaOrigenId: cuenta?.id ?? null,
          estado: "Confirmado", metodo: mapeo.metodo, fecha: new Date().toISOString(),
          registradoPor: input.registradoPor, clienteId: input.clienteRecordId,
          observacion: `Anulación de la factura ${input.numeroFactura} — devolución al cliente`,
        },
        { permitirCuentaFaltante: cuenta === null }
      );
    } catch (e) {
      console.error("[revertirContableFacturaAnulada]", e);
    }
  }
}
