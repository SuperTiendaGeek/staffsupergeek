import "server-only";

// Efectos reales de una reserva:
//   · apartarItemParaReserva → marca el ítem "Reservado" y fuera de venta.
//   · liberarItem            → lo devuelve a "Disponible" (al vencer y liberar).
//   · registrarAbonoReserva  → crea un registro en la tabla CENTRALIZADA "Abonos"
//     (ligado a la reserva por el link "Reservas") y su movimiento financiero
//     vía el puente compartido `crearMovimientoParaAbono` — el mismo camino que
//     usan órdenes y operaciones. Esto centraliza los abonos y los clasifica
//     como "Anticipo Cliente" (no "Venta Mostrador"): el depósito es un anticipo
//     hasta que se factura. La venta se registra recién al facturar (Fase 2),
//     que reconcilia estos abonos y solo cobra el saldo como ingreso nuevo.
//
// ─── Por qué esto YA NO depende de SRI_AMBIENTE ──────────────────────────────
//
// Hasta aquí los tres efectos estaban detrás de `if (ambiente !== "2") return`,
// heredando el guard que sí tiene sentido para lo que nace de una factura
// electrónica (postEmisión, notas de crédito, anulaciones, puente de
// facturación): en el ambiente de PRUEBAS del SRI esos documentos son ficticios
// y no deben tocar inventario ni /finanzas.
//
// Una reserva NO es un documento del SRI. Es un apartado de mostrador: el
// cliente deja dinero real y el equipo se retira de la venta. Eso ocurre igual
// esté el SRI en pruebas o en producción. Con el guard puesto, la reserva se
// creaba (con su PDF para el cliente) pero el ítem nunca se bloqueaba, el abono
// nunca llegaba a la tabla Abonos y nunca se generaba el movimiento financiero.
// Efecto observado en producción: $110 cobrados fuera de /finanzas y una misma
// unidad (DES-000005) con dos reservas activas de dos clientes distintos.
//
// El ambiente sigue mandando en la facturación electrónica; ya no manda en el
// apartado ni en la caja.

import { fetchRecordsByIds, firstString } from "../gancho/airtableGancho";
import { getMaxIdAbono } from "@/lib/operaciones/airtable";
import { crearMovimientoParaAbono } from "@/lib/finanzas/puentes/abonos";

const SHIPPING_ITEMS_TABLE = "Shipping Items";
const ABONOS_TABLE = "Abonos";

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

/**
 * Aparta el ítem: "Reservado", fuera de venta.
 *
 * NO es idempotente a propósito. Antes, si el ítem ya estaba reservado esta
 * función devolvía sin hacer nada y quien llamaba lo interpretaba como éxito —
 * es decir, una segunda reserva sobre la misma unidad pasaba sin ruido. Ahora
 * lanza: apartar algo que ya está apartado es un error del negocio, no un
 * no-op. Es la única barrera dura contra la doble reserva.
 */
export async function apartarItemParaReserva(shippingItemId: string): Promise<void> {
  const [rec] = await fetchRecordsByIds(SHIPPING_ITEMS_TABLE, [shippingItemId]);
  if (!rec) throw new Error("El ítem a reservar no existe.");

  const estado = firstString(rec.fields["Estado Item"]);
  const yaReservado = rec.fields["Reservado"] === true || estado === "Reservado";
  if (yaReservado) throw new Error("Este ítem ya está apartado para otra reserva.");
  if (rec.fields["Disponible para venta"] !== true) {
    throw new Error("Este ítem no está disponible para venta.");
  }

  await patchItem(shippingItemId, { "Estado Item": "Reservado", "Disponible para venta": false, "Reservado": true });
}

/**
 * Devuelve el ítem a la venta al liberar una reserva. Idempotente: si ya está
 * disponible no hace nada.
 *
 * Solo revierte cuando el ítem sigue en "Reservado". Si entre medias pasó a
 * otro estado (Vendido, Con novedad, Destinado a partes…) NO lo toca: liberar
 * una reserva no puede resucitar a la venta un equipo que ya siguió otro
 * camino.
 */
export async function liberarItem(shippingItemId: string): Promise<void> {
  const [rec] = await fetchRecordsByIds(SHIPPING_ITEMS_TABLE, [shippingItemId]);
  if (!rec) return;

  const estado = firstString(rec.fields["Estado Item"]);
  if (estado === "Disponible") return; // ya disponible
  if (estado !== "Reservado") {
    // El ítem avanzó por otro lado; solo se suelta la marca de reservado.
    if (rec.fields["Reservado"] === true) await patchItem(shippingItemId, { "Reservado": false });
    return;
  }

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
// cuenta.
//
// TODO(contadora): confirmar a qué "Método de Pago" / cuenta contable deben
// mapear los códigos 17 (dinero electrónico), 20 (otros con sistema
// financiero) y 21 (endoso de títulos) cuando lleguen a usarse en una reserva.
// Hoy → "Otro" (sin cuenta, marca Alerta Descuadre para clasificación manual).
// Al confirmarse, cambiar los valores de estos 3 códigos en el mapa de abajo.
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
 * movimiento financiero (Anticipo Cliente) por el puente compartido.
 *
 * Best-effort: nunca lanza hacia el caller, para que un fallo de /finanzas no
 * impida registrar la reserva. Devuelve el estado para que la ruta pueda
 * avisar al operador si el abono no llegó a la caja.
 */
export async function registrarAbonoReserva(input: {
  reservaRecordId: string;
  numeroReserva: string;
  monto: number;
  formaPago: string;
  registradoPor: string;
  fecha?: string; // ISO; por defecto ahora
}): Promise<{ estado: "OK" | "OMITIDO" | "ERROR"; abonoId?: string; detalle?: string }> {
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
      // Campo link Abonos → Reservas (inverso "Abonos (Reserva)"). En esta base
      // quedó nombrado "Reservas"; si algún día se renombra a la convención
      // "Aplicado a: Reserva", actualizar también ABONOS_FIELDS.aplicadoAReserva.
      "Reservas": [input.reservaRecordId],
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
