import "server-only";

// Efectos reales de una reserva, guardados por ambiente "2" (en PRUEBAS no se
// tocan Shipping Items ni /finanzas ni la tabla Abonos). Fase 1:
//   · reservarItem  → marca el ítem "Reservado" y fuera de venta.
//   · liberarItem   → lo devuelve a "Disponible" (al vencer y liberar).
//   · registrarAbonoReserva → crea un registro en la tabla CENTRALIZADA "Abonos"
//     (ligado a la reserva por "Aplicado a: Reserva") y su movimiento financiero
//     vía el puente compartido `crearMovimientoParaAbono` — el mismo camino que
//     usan órdenes y operaciones. Esto centraliza los abonos y los clasifica
//     como "Anticipo Cliente" (no "Venta Mostrador"): el depósito es un anticipo
//     hasta que se factura. La venta se registra recién al facturar (Fase 2),
//     que reconcilia estos abonos y solo cobra el saldo como ingreso nuevo.

import { fetchRecordsByIds, firstString } from "../gancho/airtableGancho";
import { getMaxIdAbono } from "@/lib/operaciones/airtable";
import { crearMovimientoParaAbono } from "@/lib/finanzas/puentes/abonos";

const SHIPPING_ITEMS_TABLE = "Shipping Items";
const ABONOS_TABLE = "Abonos";
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

// ─── Abono en la tabla centralizada "Abonos" ─────────────────────────────────

// El abono de reserva llega con el CÓDIGO SRI de forma de pago (01, 16, …). La
// tabla Abonos usa un single-select "Método de Pago" con estos valores reales:
// Efectivo · Transferencia · Tarjeta · Depósito · PayPal · PayPhone · Otro.
// El puente `crearMovimientoParaAbono` mapea ese método → cuenta contable.
//
// Casos claros y de uso real (~100% efectivo/tarjeta) se mapean directo. Los
// códigos poco usados (17 dinero electrónico, 20 otros sist. financiero, 21
// endoso) caen a "Otro" a propósito: el puente los deja sin cuenta resuelta
// (Alerta Descuadre) para que un humano los clasifique, en vez de adivinar la
// cuenta. Pendiente confirmar con la contadora el método deseado para esos 3.
const MAPA_FORMA_PAGO_A_METODO: Record<string, string> = {
  "01": "Efectivo",
  "16": "Tarjeta", // débito
  "18": "Tarjeta", // prepago
  "19": "Tarjeta", // crédito
  "17": "Otro",    // dinero electrónico — confirmar con contadora
  "20": "Otro",    // otros con sist. financiero — confirmar con contadora
  "21": "Otro",    // endoso de títulos — confirmar con contadora
  "15": "Otro",    // compensación de deudas
};

function metodoDeAbonoDesdeFormaPago(formaPago: string): string {
  return MAPA_FORMA_PAGO_A_METODO[formaPago] ?? "Otro";
}

async function postAbono(fields: Record<string, unknown>): Promise<string> {
  const token = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !baseId) throw new Error("Falta AIRTABLE_API_KEY/BASE_ID.");
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(ABONOS_TABLE)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields, typecast: true }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`POST Abonos → ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

/**
 * Registra un abono de reserva en la tabla centralizada Abonos y dispara su
 * movimiento financiero (Anticipo Cliente) por el puente compartido. Solo en
 * ambiente "2" (en PRUEBAS no se escribe nada real). Best-effort: nunca lanza
 * hacia el caller, para que el registro de la reserva no se bloquee.
 */
export async function registrarAbonoReserva(input: {
  reservaRecordId: string;
  numeroReserva: string;
  monto: number;
  formaPago: string;
  registradoPor: string;
  fecha?: string; // ISO; por defecto ahora
  ambiente?: string;
}): Promise<{ estado: "OK" | "OMITIDO" | "ERROR"; abonoId?: string; detalle?: string }> {
  if (input.ambiente !== AMBIENTE_PRODUCCION) return { estado: "OMITIDO" };
  if (!(input.monto > 0)) return { estado: "OMITIDO" };
  try {
    const metodoPago = metodoDeAbonoDesdeFormaPago(input.formaPago);
    const fecha = (input.fecha ?? new Date().toISOString()).slice(0, 10);

    // Crear el registro en Abonos, ligado a la reserva (tercer origen de abono).
    const idAbono = (await getMaxIdAbono()) + 1;
    const abonoId = await postAbono({
      "ID Abono": idAbono,
      "Monto": input.monto,
      "Método de Pago": metodoPago,
      "Fecha de Abono": fecha,
      "Estado del Abono": "Registrado",
      "Registrado Por": input.registradoPor,
      "Aplicado a: Reserva": [input.reservaRecordId],
    });

    // Movimiento financiero (Anticipo Cliente) — mismo puente que órdenes/operaciones.
    const puente = await crearMovimientoParaAbono({
      abonoId,
      monto: input.monto,
      metodoPago,
      fecha,
      registradoPor: input.registradoPor,
      observacion: `Abono de reserva ${input.numeroReserva}`,
    });
    if (!puente.ok) return { estado: "ERROR", abonoId, detalle: puente.error };
    return { estado: "OK", abonoId };
  } catch (e) {
    return { estado: "ERROR", detalle: e instanceof Error ? e.message : String(e) };
  }
}
