import { esAbonoVigente } from "@/types/cuenta-unificada";
import "server-only";

import { getCuentaUnificada } from "@/lib/cuenta-unificada";
import type { DatosVenta, OrigenGancho, ResultadoEmision } from "@/lib/facturacion/emitirFactura";
import type { Pago } from "@/lib/facturacion/types/factura";
import type { CategoriaMovimiento, EstadoMovimiento, MetodoMovimiento } from "@/types/finanzas";
import { fetchCuentaPorNombre } from "../cuentas";
import { actualizarMovimiento, crearMovimiento } from "../movimientos";
import { fetchRecordById, firstLinkedId } from "../airtable-client";

const AMBIENTE_PRODUCCION = "2";

/**
 * §2.4 del diseño — mapeo de código SRI (catálogo Tabla 22, el mismo que ya
 * ofrece FacturacionForm.tsx) a Cuenta Destino/Estado. Independiente del
 * mapeo de Abonos (§1.4, fuente distinta) pero da el mismo resultado para
 * los casos que se solapan conceptualmente (efectivo→Caja, tarjeta→Tránsito).
 */
const MAPA_FORMA_PAGO_SRI: Record<string, { cuentaDestinoNombre: string; estado: EstadoMovimiento; metodo: MetodoMovimiento } | null> = {
  "01": { cuentaDestinoNombre: "Caja Registradora", estado: "Confirmado", metodo: "Efectivo" },
  "16": { cuentaDestinoNombre: "Tarjetas en Tránsito", estado: "Pendiente", metodo: "Tarjeta débito" },
  "19": { cuentaDestinoNombre: "Tarjetas en Tránsito", estado: "Pendiente", metodo: "Tarjeta crédito" },
  "18": { cuentaDestinoNombre: "Tarjetas en Tránsito", estado: "Pendiente", metodo: "Tarjeta débito" },
  "17": { cuentaDestinoNombre: "SGINGRESOS", estado: "Confirmado", metodo: "Dinero electrónico" },
  // "15" Compensación de deudas: no es un flujo de caja real (se cancela una
  // obligación con otra deuda, no con dinero) — nunca representa un ingreso
  // real a una cuenta física. Se crea igual (trazabilidad fiscal), sin cuenta.
  "15": null,
  // "20"/"21": sin caso real hoy, sin forma de saber a qué cuenta van sin más
  // contexto de negocio — mismo tratamiento que un valor no mapeable.
  "20": null,
  "21": null,
};

function resolverMapeoFormaPago(formaPago: string) {
  return MAPA_FORMA_PAGO_SRI[formaPago] ?? null;
}

async function crearMovimientoDeComponente(params: {
  pago: Pago;
  categoria: CategoriaMovimiento;
  facturaElectronicaId: string;
  clienteId?: string;
  registradoPor: string;
  fecha: string;
}) {
  const mapeo = resolverMapeoFormaPago(params.pago.formaPago);
  const cuenta = mapeo ? await fetchCuentaPorNombre(mapeo.cuentaDestinoNombre) : null;
  return crearMovimiento(
    {
      tipo: "Ingreso",
      origen: "Facturación",
      categoria: params.categoria,
      monto: params.pago.total,
      cuentaDestinoId: cuenta?.id ?? null,
      estado: mapeo?.estado ?? "Confirmado",
      estadoDistribucion: "Pendiente de clasificar",
      metodo: mapeo?.metodo,
      fecha: params.fecha,
      registradoPor: params.registradoPor,
      facturaElectronicaId: params.facturaElectronicaId,
      clienteId: params.clienteId,
    },
    { permitirCuentaFaltante: cuenta === null }
  );
}

/**
 * Puente 2 (§2 del diseño). Se invoca únicamente cuando `resultado.estado
 * === "AUTORIZADO"`. Nunca lanza — cualquier error se loguea; la factura ya
 * fue autorizada por el SRI en este punto, no hay nada que "revertir".
 */
export async function procesarPuenteFacturacion(resultado: ResultadoEmision, body: DatosVenta, registradoPor: string): Promise<void> {
  if (resultado.estado !== "AUTORIZADO" || !resultado.recordId) return;
  if (resultado.ambiente !== AMBIENTE_PRODUCCION) return; // nunca contaminar /finanzas con datos de PRUEBAS

  try {
    if (!body.origen) {
      await procesarMostrador(resultado.recordId, body, registradoPor);
    } else {
      await procesarConOrigen(resultado.recordId, body, body.origen, registradoPor);
    }
  } catch (error) {
    console.error("[Finanzas] Puente de facturación falló", {
      facturaId: resultado.recordId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// (a) Factura de mostrador — un movimiento de Ingreso por cada componente de pago.
async function procesarMostrador(facturaId: string, body: DatosVenta, registradoPor: string) {
  const fecha = new Date().toISOString();
  for (const pago of body.pagos) {
    await crearMovimientoDeComponente({
      pago,
      categoria: "Venta Mostrador",
      facturaElectronicaId: facturaId,
      clienteId: body.clienteRecordId,
      registradoPor,
      fecha,
    });
  }
}

// Reserva: los abonos vigentes se leen del inverso "Abonos (Reserva)" del
// registro de Reservas (regla de la casa: nunca filtrar por campo link). Es
// el mismo mecanismo que órdenes/operaciones, pero sin cuenta unificada (una
// reserva es un solo ítem + sus abonos, no una cuenta con servicios/repuestos).
const RESERVA_TABLE_FACT = "Reservas";
const RESERVA_ABONOS_INVERSO = "Abonos (Reserva)";

function textoDe(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function abonoIdsVigentesDeReserva(reservaId: string): Promise<string[]> {
  const reserva = await fetchRecordById(RESERVA_TABLE_FACT, reservaId);
  if (!reserva) return [];
  const raw = reserva.fields[RESERVA_ABONOS_INVERSO];
  const ids = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  const vigentes: string[] = [];
  for (const id of ids) {
    const ab = await fetchRecordById("Abonos", id);
    const estado = ab ? textoDe(ab.fields["Estado del Abono"]) : "";
    if (estado !== "Anulado") vigentes.push(id);
  }
  return vigentes;
}

// (b) Factura sobre Orden/Operación/Reserva — anti doble conteo: marca como
// facturados los movimientos de los abonos vigentes (nunca crea un ingreso
// nuevo por ellos) y solo crea movimiento nuevo por el componente "saldo"
// (dinero no cubierto por ningún abono previo, cobrado en el instante de
// facturar).
async function procesarConOrigen(facturaId: string, body: DatosVenta, origen: OrigenGancho, registradoPor: string) {
  // Reunir los IDs de abonos vigentes del origen.
  let abonoIds: string[];
  if (origen.tipo === "reserva") {
    abonoIds = await abonoIdsVigentesDeReserva(origen.recordId);
  } else {
    const cuenta = await getCuentaUnificada(origen.tipo === "orden" ? { ordenId: origen.recordId } : { operacionId: origen.recordId });
    abonoIds = cuenta.abonos.filter(esAbonoVigente).map((a) => a.id);
  }

  for (const abonoId of abonoIds) {
    const abonoRecord = await fetchRecordById("Abonos", abonoId);
    const movimientoId = abonoRecord ? firstLinkedId(abonoRecord.fields["Movimiento Financiero"]) : null;
    if (!movimientoId) {
      console.warn("[Finanzas] Abono vigente sin Movimiento Financiero al facturar — no se pudo marcar como facturado", {
        abonoId,
        facturaId,
      });
      continue;
    }
    try {
      await actualizarMovimiento(movimientoId, { facturaElectronicaId: facturaId, estadoDistribucion: "Pendiente de clasificar" });
    } catch (error) {
      console.error("[Finanzas] No se pudo marcar el movimiento del abono como facturado", {
        abonoId,
        movimientoId,
        facturaId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Orden → servicio; operación y reserva → venta de producto.
  const categoria: CategoriaMovimiento = origen.tipo === "orden" ? "Servicio Reparación" : "Venta Producto";
  const componentesSaldo = body.pagos.filter((p) => p.origenPago === "saldo");
  const fecha = new Date().toISOString();
  for (const pago of componentesSaldo) {
    if (pago.total <= 0) continue;
    await crearMovimientoDeComponente({
      pago,
      categoria,
      facturaElectronicaId: facturaId,
      clienteId: body.clienteRecordId,
      registradoPor,
      fecha,
    });
  }
}
