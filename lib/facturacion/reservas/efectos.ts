import "server-only";

// Efectos reales de una reserva, guardados por ambiente "2" (en PRUEBAS no se
// tocan Shipping Items ni /finanzas). Fase 1:
//   · reservarItem  → marca el ítem "Reservado" y fuera de venta.
//   · liberarItem   → lo devuelve a "Disponible" (al vencer y liberar).
//   · registrarIngresoAbono → Ingreso en el Sistema Contable SG por cada abono
//     (regla del dueño: el dinero de la reserva genera los mismos movimientos
//     que cualquier venta). La reconciliación al facturar es Fase 2.

import { fetchRecordsByIds, firstString } from "../gancho/airtableGancho";
import { crearMovimiento } from "@/lib/finanzas/movimientos";
import { fetchCuentaPorNombre } from "@/lib/finanzas/cuentas";
import type { EstadoMovimiento, MetodoMovimiento } from "@/types/finanzas";

const SHIPPING_ITEMS_TABLE = "Shipping Items";
const AMBIENTE_PRODUCCION = "2";

async function patchItem(itemId: string, fields: Record<string, unknown>): Promise<void> {
  const token = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !baseId) throw new Error("Falta AIRTABLE_API_KEY/BASE_ID.");
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(SHIPPING_ITEMS_TABLE)}/${encodeURIComponent(itemId)}`;
  const retryable = new Set([429, 502, 503, 504]);
  let res: Response | null = null;
  for (let i = 0; i < 3; i++) {
    res = await fetch(url, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields, typecast: true }), cache: "no-store" });
    if (res.ok || !retryable.has(res.status) || i === 2) break;
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  if (!res || !res.ok) throw new Error(`PATCH Shipping Items ${itemId} → ${res?.status ?? "?"}: ${res ? await res.text() : "sin respuesta"}`);
}

/** Marca el ítem como reservado y fuera de venta. Idempotente. */
export async function reservarItem(shippingItemId: string, ambiente?: string): Promise<void> {
  if (ambiente !== AMBIENTE_PRODUCCION) return;
  const [rec] = await fetchRecordsByIds(SHIPPING_ITEMS_TABLE, [shippingItemId]);
  if (rec && firstString(rec.fields["Estado Item"]) === "Reservado") return; // ya reservado
  await patchItem(shippingItemId, { "Estado Item": "Reservado", "Disponible para venta": false, "Reservado": true });
}

/** Devuelve el ítem a disponible (al liberar una reserva vencida). Idempotente. */
export async function liberarItem(shippingItemId: string, ambiente?: string): Promise<void> {
  if (ambiente !== AMBIENTE_PRODUCCION) return;
  const [rec] = await fetchRecordsByIds(SHIPPING_ITEMS_TABLE, [shippingItemId]);
  if (rec && firstString(rec.fields["Estado Item"]) === "Disponible") return; // ya disponible
  await patchItem(shippingItemId, { "Estado Item": "Disponible", "Disponible para venta": true, "Reservado": false });
}

// ─── Ingreso por abono ────────────────────────────────────────────────────────

const MAPA_FORMA_PAGO: Record<string, { cuenta: string; estado: EstadoMovimiento; metodo: MetodoMovimiento } | null> = {
  "01": { cuenta: "Caja Registradora", estado: "Confirmado", metodo: "Efectivo" },
  "16": { cuenta: "Tarjetas en Tránsito", estado: "Pendiente", metodo: "Tarjeta débito" },
  "19": { cuenta: "Tarjetas en Tránsito", estado: "Pendiente", metodo: "Tarjeta crédito" },
  "18": { cuenta: "Tarjetas en Tránsito", estado: "Pendiente", metodo: "Tarjeta débito" },
  "17": { cuenta: "SGINGRESOS", estado: "Confirmado", metodo: "Dinero electrónico" },
  "15": null, "20": null, "21": null,
};

export async function registrarIngresoAbono(input: {
  numeroReserva: string; monto: number; formaPago: string; clienteRecordId?: string; registradoPor: string; ambiente?: string;
}): Promise<{ estado: "OK" | "OMITIDO" | "ERROR"; detalle?: string }> {
  if (input.ambiente !== AMBIENTE_PRODUCCION) return { estado: "OMITIDO" };
  if (!(input.monto > 0)) return { estado: "OMITIDO" };
  try {
    const mapeo = MAPA_FORMA_PAGO[input.formaPago] ?? null;
    const cuenta = mapeo ? await fetchCuentaPorNombre(mapeo.cuenta) : null;
    await crearMovimiento(
      {
        tipo: "Ingreso", origen: "Facturación", categoria: "Venta Mostrador",
        monto: input.monto, cuentaDestinoId: cuenta?.id ?? null,
        estado: mapeo?.estado ?? "Confirmado", estadoDistribucion: "Pendiente de clasificar",
        metodo: mapeo?.metodo, fecha: new Date().toISOString(), registradoPor: input.registradoPor,
        clienteId: input.clienteRecordId,
        observacion: `Abono de reserva ${input.numeroReserva} (anticipo, documento no tributario)`,
      },
      { permitirCuentaFaltante: cuenta === null }
    );
    return { estado: "OK" };
  } catch (e) {
    return { estado: "ERROR", detalle: e instanceof Error ? e.message : String(e) };
  }
}
