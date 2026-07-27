import "server-only";

import type { CategoriaMovimiento, EstadoMovimiento, MetodoMovimiento } from "@/types/finanzas";
import {
  airtableRequest,
  cleanString,
  fetchRecordById,
  firstLinkedId,
  getClient,
  tableUrl,
  type AirtableListResponse,
  type AirtableRecord,
} from "../airtable-client";
import { fetchCuentaPorNombre } from "../cuentas";
import { anularMovimiento, crearMovimiento } from "../movimientos";

// Tabla "Abonos" (tbli03YnDxVsrnmZK) — campos relevantes para este puente.
// No confundir con MOVIMIENTOS_FIELDS (esos son de "Movimientos Financieros").
const ABONOS_TABLE = "Abonos";
const ABONOS_FIELDS = {
  monto: "Monto",
  metodoPago: "Método de Pago",
  fechaAbono: "Fecha de Abono",
  numeroTransaccion: "Número de Transacción",
  observacion: "Observación",
  aplicadoAOperacion: "Aplicado a: Operación",
  aplicadoAOrden: "Aplicado a: Orden",
  // Tercer origen de abono (Fase reservas): link Abonos → Reservas. El usuario
  // crea este campo a mano en Airtable (la API no crea links). Si el campo no
  // existe todavía, el abono de reserva simplemente no lo trae y el puente cae
  // al comportamiento sin reserva (cliente/ref quedan vacíos) — nunca rompe.
  aplicadoAReserva: "Aplicado a: Reserva",
  // Campo inverso auto-creado por Airtable al vincular Movimientos.Abono,
  // renombrado en el checklist de esta fase (antes: "Shipping Finanzas
  // Movimientos", heredado del nombre de tabla pre-rename de la Fase 20.1).
  movimientoFinanciero: "Movimiento Financiero",
} as const;

const OPERACION_TABLE = "Operación Comercial";
const OPERACION_FIELDS = { cliente: "Cliente", codigo: "Código Operación" } as const;

const ORDEN_TABLE = "Órdenes de Reparación";
const ORDEN_FIELDS = { cliente: "Cliente", codigo: "ID" } as const;

const RESERVA_TABLE = "Reservas";
const RESERVA_FIELDS = { cliente: "Cliente", numero: "Número" } as const;

function firstString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/**
 * §1.4 del diseño — mapeo basado en inventario real de `Abonos` (2026-07-12):
 * Efectivo y Transferencia son el 100% del uso real hoy; el resto son
 * opciones del esquema sin caso real todavía, pero deben estar listas. El
 * campo `Cuenta Destino` (texto libre) de Abonos se ignora a propósito —
 * vacío en 97% de los registros y no siempre consistente con Método de Pago
 * cuando sí está lleno.
 */
const MAPA_METODO_PAGO_ABONO: Record<
  string,
  { cuentaDestinoNombre: string; estado: EstadoMovimiento; metodo: MetodoMovimiento } | null
> = {
  Efectivo: { cuentaDestinoNombre: "Caja Registradora", estado: "Confirmado", metodo: "Efectivo" },
  Transferencia: { cuentaDestinoNombre: "SGINGRESOS", estado: "Confirmado", metodo: "Transferencia bancaria" },
  Depósito: { cuentaDestinoNombre: "SGINGRESOS", estado: "Confirmado", metodo: "Depósito" },
  Tarjeta: { cuentaDestinoNombre: "Tarjetas en Tránsito", estado: "Pendiente", metodo: "Tarjeta" },
  PayPal: { cuentaDestinoNombre: "PayPal", estado: "Confirmado", metodo: "PayPal" },
  PayPhone: { cuentaDestinoNombre: "Tarjetas en Tránsito", estado: "Pendiente", metodo: "PayPhone" },
  // "Otro" y cualquier valor no reconocido (incluido vacío) caen al `null`
  // del default más abajo — sin cuenta resuelta, Alerta Descuadre.
  Otro: null,
};

function resolverMapeoMetodoPago(metodoPago: string | null) {
  const clave = cleanString(metodoPago);
  if (!clave) return null;
  return MAPA_METODO_PAGO_ABONO[clave] ?? null;
}

export type ResultadoPuenteAbono = { ok: true; movimientoId: string } | { ok: false; error: string };

async function resolverClienteYReferencia(operacionId: string | null, ordenId: string | null, reservaId: string | null) {
  let clienteId: string | null = null;
  let refOrden: string | null = null;
  let refOperacion: string | null = null;
  let refReserva: string | null = null;

  if (ordenId) {
    const orden = await fetchRecordById(ORDEN_TABLE, ordenId);
    if (orden) {
      clienteId = firstLinkedId(orden.fields[ORDEN_FIELDS.cliente]);
      refOrden = firstString(orden.fields[ORDEN_FIELDS.codigo]) || ordenId;
    }
  }
  if (operacionId) {
    const operacion = await fetchRecordById(OPERACION_TABLE, operacionId);
    if (operacion) {
      if (!clienteId) clienteId = firstLinkedId(operacion.fields[OPERACION_FIELDS.cliente]);
      refOperacion = firstString(operacion.fields[OPERACION_FIELDS.codigo]) || operacionId;
    }
  }
  if (reservaId) {
    const reserva = await fetchRecordById(RESERVA_TABLE, reservaId);
    if (reserva) {
      if (!clienteId) clienteId = firstLinkedId(reserva.fields[RESERVA_FIELDS.cliente]);
      refReserva = firstString(reserva.fields[RESERVA_FIELDS.numero]) || reservaId;
    }
  }

  let referenciaOrigen = "";
  if (refOrden && refOperacion) referenciaOrigen = `Abono sobre Orden #${refOrden} (Operación #${refOperacion})`;
  else if (refOrden) referenciaOrigen = `Abono sobre Orden #${refOrden}`;
  else if (refOperacion) referenciaOrigen = `Abono sobre Operación #${refOperacion}`;
  else if (refReserva) referenciaOrigen = `Abono sobre Reserva ${refReserva}`;

  return { clienteId, referenciaOrigen };
}

/**
 * Puente 1 (§1.2 del diseño) — única función compartida entre los 2
 * escritores de Abonos. Nunca lanza: cualquier error se loguea y se
 * devuelve `{ ok: false }`, para que el registro primario (el Abono) jamás
 * se bloquee por un fallo de este puente.
 */
export async function crearMovimientoParaAbono(input: {
  abonoId: string;
  monto: number;
  metodoPago: string | null;
  fecha: string;
  registradoPor: string;
  comprobanteUrl?: string;
  numeroTransaccion?: string;
  observacion?: string;
}): Promise<ResultadoPuenteAbono> {
  try {
    // Guard de idempotencia — mismo patrón que el puente Shipping (20.1). El
    // mismo fetch también trae "Aplicado a: Operación"/"Aplicado a: Orden"
    // directo del registro (fuente única de verdad — no hace falta que el
    // caller los pase por separado ni arriesgarse a que no coincidan).
    const abonoActual = await fetchRecordById(ABONOS_TABLE, input.abonoId);
    if (!abonoActual) return { ok: false, error: `Abono ${input.abonoId} no encontrado.` };
    const movimientoExistente = firstLinkedId(abonoActual.fields[ABONOS_FIELDS.movimientoFinanciero]);
    if (movimientoExistente) return { ok: true, movimientoId: movimientoExistente };

    const operacionId = firstLinkedId(abonoActual.fields[ABONOS_FIELDS.aplicadoAOperacion]);
    const ordenId = firstLinkedId(abonoActual.fields[ABONOS_FIELDS.aplicadoAOrden]);
    const reservaId = firstLinkedId(abonoActual.fields[ABONOS_FIELDS.aplicadoAReserva]);
    const { clienteId, referenciaOrigen } = await resolverClienteYReferencia(operacionId, ordenId, reservaId);
    const mapeo = resolverMapeoMetodoPago(input.metodoPago);
    const cuenta = mapeo ? await fetchCuentaPorNombre(mapeo.cuentaDestinoNombre) : null;

    const observacionFinal = [referenciaOrigen, cleanString(input.observacion)].filter(Boolean).join(" — ") || undefined;

    const movimiento = await crearMovimiento(
      {
        tipo: "Ingreso",
        origen: "Abonos",
        categoria: "Anticipo Cliente" as CategoriaMovimiento,
        monto: input.monto,
        cuentaDestinoId: cuenta?.id ?? null,
        estado: mapeo?.estado ?? "Confirmado",
        estadoDistribucion: "Sin distribuir",
        metodo: mapeo?.metodo,
        fecha: input.fecha,
        transaccionId: input.numeroTransaccion,
        comprobanteUrl: input.comprobanteUrl,
        observacion: observacionFinal,
        registradoPor: input.registradoPor,
        abonoId: input.abonoId,
        clienteId: clienteId ?? undefined,
      },
      { permitirCuentaFaltante: cuenta === null }
    );

    return { ok: true, movimientoId: movimiento.id };
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    console.error("[Finanzas] No se pudo crear el movimiento financiero del abono", { abonoId: input.abonoId, error: mensaje });
    return { ok: false, error: mensaje };
  }
}

/**
 * §1.5 (Corrección 1) — al anular un abono, anula también su movimiento
 * vinculado. Si ese movimiento ya estaba vinculado a una Factura
 * Electrónica, la anulación procede igual, pero devuelve un warning
 * explícito (y lo loguea) en vez de bloquear o intentar resolver la
 * inconsistencia por su cuenta.
 */
export async function anularMovimientoDeAbono(abonoId: string): Promise<{ warning: string | null }> {
  try {
    const abono = await fetchRecordById(ABONOS_TABLE, abonoId);
    const movimientoId = abono ? firstLinkedId(abono.fields[ABONOS_FIELDS.movimientoFinanciero]) : null;
    if (!movimientoId) return { warning: null };

    // Fase 20.3 §2.4 — anularMovimiento ahora también puede devolver una
    // advertencia de cadena (si este movimiento fuera un hijo de una
    // acreditación); en la práctica un movimiento de origen Abonos nunca
    // tiene `Reversa a` poblado, pero se combina de forma genérica.
    const { movimiento, warning: warningCadena } = await anularMovimiento(movimientoId, "Abono anulado en el portal.");
    if (movimiento.facturaElectronicaIds.length === 0) return { warning: warningCadena };

    const facturaId = movimiento.facturaElectronicaIds[0];
    const factura = await fetchRecordById("Facturas Electrónicas", facturaId);
    const numeroFactura =
      firstString(factura?.fields?.["Número de Factura"]) || firstString(factura?.fields?.["Clave de Acceso"]) || facturaId;

    console.warn("[Finanzas] Abono anulado con factura vinculada", {
      abonoId,
      movimientoId,
      facturaId,
      numeroFactura,
    });

    const warningFactura = `Este abono ya estaba vinculado a la factura ${numeroFactura} — el movimiento financiero se anuló igual, pero revisa si corresponde una nota de crédito o corregir la factura.`;

    return { warning: [warningFactura, warningCadena].filter(Boolean).join(" ") };
  } catch (error) {
    console.error("[Finanzas] No se pudo anular el movimiento financiero del abono", {
      abonoId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { warning: null };
  }
}

/**
 * §4.1 — detección para reparación manual. Lista los Abonos (Fecha de Abono
 * ≥ `desde`) cuyo campo inverso `Movimiento Financiero` está vacío. Sin
 * cron ni proceso automático — se corre a mano (script o endpoint admin).
 */
export async function listarAbonosSinMovimiento(desde: string): Promise<AirtableRecord[]> {
  const client = getClient();
  const url = new URL(`${client.baseUrl}/${encodeURIComponent(ABONOS_TABLE)}`);
  url.searchParams.set("pageSize", "100");
  url.searchParams.set(
    "filterByFormula",
    `AND(IS_AFTER({${ABONOS_FIELDS.fechaAbono}}, '${desde}'), {${ABONOS_FIELDS.metodoPago}} != '')`
  );
  const registros: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    if (offset) url.searchParams.set("offset", offset);
    const data = await airtableRequest<AirtableListResponse>(url.toString());
    registros.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);

  return registros.filter((r) => !firstLinkedId(r.fields[ABONOS_FIELDS.movimientoFinanciero]));
}

export { ABONOS_FIELDS, ABONOS_TABLE };
