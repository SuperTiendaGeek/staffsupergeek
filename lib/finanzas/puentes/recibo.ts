import "server-only";

// Puente Recibo → Movimientos Financieros, para el recibo emitido DESDE una
// orden/operación (gancho de cuenta unificada).
//
// El recibo de mostrador ya tenía su propio asiento simple en
// lib/facturacion/recibos/efectos.ts (registrarIngresoRecibo): un Ingreso por
// el total, categoría "Venta Mostrador". Eso es correcto cuando nadie pagó
// nada antes. Pero una orden de reparación casi siempre llega con abonos ya
// cobrados y YA registrados en /finanzas (puente de Abonos). Registrar el
// total otra vez contaría ese dinero dos veces.
//
// Así que los movimientos de los abonos vigentes se marcan como documentados
// —enlazándolos al recibo— y NO se crea ningún ingreso por la cuenta.
//
// Auditoría ops, punto 1 (27-oct-2026): antes aquí se creaba un movimiento
// por el "saldo cobrado al emitir", sin abono y casi siempre sin cuenta
// (OR000510). Ahora la cuenta llega pagada con abonos (la emisión lo exige) y
// lo único que se cobra al emitir es la VENTA ADICIONAL, que entra con su
// propia cuenta (ver ./ventaAdicional.ts).

import { esAbonoVigente } from "@/types/cuenta-unificada";
import { getCuentaUnificada } from "@/lib/cuenta-unificada";
import type { OrigenGancho } from "@/lib/facturacion/emitirFactura";
import { actualizarMovimiento, crearMovimiento, fetchMovimientoById } from "../movimientos";
import { crearMovimientosVentaAdicional, type CobroVentaAdicional } from "./ventaAdicional";
import { fetchRecordById, firstLinkedId } from "../airtable-client";

const AMBIENTE_PRODUCCION = "2";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type PuenteReciboInput = {
  reciboRecordId:   string;
  numeroRecibo:     string;
  origen:           OrigenGancho;
  /** Cobros de la venta adicional (método del catálogo de Abonos). */
  pagosAdicionales: CobroVentaAdicional[];
  clienteRecordId?: string;
  registradoPor:    string;
  ambiente?:        string;
};

export type ResultadoPuenteRecibo = {
  estado: "OK" | "OMITIDO" | "ERROR";
  /** Monto de venta adicional registrado como ingreso nuevo. */
  adicionalRegistrado: number;
  /** Abonos cuyo movimiento quedó enlazado a este recibo. */
  abonosMarcados:  number;
  detalle?: string;
};

/**
 * Nunca lanza: el recibo ya existe y su PDF ya se generó cuando esto corre.
 * Un fallo aquí se reporta en el campo "Movimiento Contable" del recibo
 * (lo hace quien llama), nunca revierte el documento.
 */
export async function procesarPuenteRecibo(input: PuenteReciboInput): Promise<ResultadoPuenteRecibo> {
  // Guard de ambiente: /finanzas son datos reales compartidos — en PRUEBAS
  // nunca se tocan (mismo criterio que el puente de facturación).
  if (input.ambiente !== AMBIENTE_PRODUCCION) return { estado: "OMITIDO", adicionalRegistrado: 0, abonosMarcados: 0 };
  if (input.origen.tipo === "reserva") {
    // No existe hoy un recibo desde reserva; si algún día existe, se trata
    // aparte (la reserva no tiene cuenta unificada).
    return { estado: "OMITIDO", adicionalRegistrado: 0, abonosMarcados: 0 };
  }

  const problemas: string[] = [];
  let abonosMarcados = 0;

  try {
    const cuenta = await getCuentaUnificada(
      input.origen.tipo === "orden" ? { ordenId: input.origen.recordId } : { operacionId: input.origen.recordId }
    );
    const abonosVigentes = cuenta.abonos.filter(esAbonoVigente);

    for (const abono of abonosVigentes) {
      const abonoRecord = await fetchRecordById("Abonos", abono.id);
      const movimientoId = abonoRecord ? firstLinkedId(abonoRecord.fields["Movimiento Financiero"]) : null;
      if (!movimientoId) {
        problemas.push(`Abono ${abono.id} sin Movimiento Financiero — no se pudo marcar como documentado.`);
        continue;
      }
      try {
        await actualizarMovimiento(movimientoId, {
          reciboId: input.reciboRecordId,
          estadoDistribucion: "Pendiente de clasificar",
        });
        abonosMarcados += 1;
      } catch (e) {
        problemas.push(`Abono ${abono.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch (e) {
    problemas.push(`No se pudo leer la cuenta del origen: ${e instanceof Error ? e.message : String(e)}`);
  }

  // La cuenta ya está pagada con abonos (la emisión lo verificó). Solo la
  // venta adicional es dinero nuevo, y entra con su cuenta.
  const adicional = await crearMovimientosVentaAdicional({
    cobros: input.pagosAdicionales,
    documento: { reciboId: input.reciboRecordId, etiqueta: `el recibo interno ${input.numeroRecibo}` },
    clienteId: input.clienteRecordId,
    registradoPor: input.registradoPor,
  });
  problemas.push(...adicional.problemas);
  const adicionalRegistrado = round2(input.pagosAdicionales.reduce((s, p) => s + (p.total > 0 ? p.total : 0), 0));

  if (problemas.length > 0) {
    console.error("[Finanzas] Puente de recibo con problemas", { recibo: input.numeroRecibo, problemas });
    return { estado: "ERROR", adicionalRegistrado, abonosMarcados, detalle: problemas.join(" ") };
  }
  return { estado: "OK", adicionalRegistrado, abonosMarcados };
}

/**
 * Reverso al anular un recibo con origen.
 *
 * Decisión del dueño (auditoría ops, punto 1): anular el documento NO
 * devuelve el dinero de la cuenta. Los abonos siguen siendo pagos del cliente
 * aplicados a su orden/operación y el documento corregido los vuelve a usar.
 * Lo único que se revierte es lo que este recibo registró por su cuenta: la
 * venta adicional (y, en recibos anteriores al 27-oct-2026, el "saldo cobrado
 * al emitir"). Cada reversa sale de la MISMA cuenta a la que entró.
 */
export async function revertirPuenteRecibo(input: {
  reciboRecordId: string;
  numeroRecibo:   string;
  movimientoIds:  string[];
  clienteRecordId?: string;
  registradoPor:  string;
  ambiente?:      string;
}): Promise<{ montoRevertido: number }> {
  if (input.ambiente !== AMBIENTE_PRODUCCION) return { montoRevertido: 0 };
  if (input.movimientoIds.length === 0) return { montoRevertido: 0 };

  let total = 0;
  for (const id of input.movimientoIds) {
    const mov = await fetchMovimientoById(id).catch(() => null);
    if (!mov) continue;
    if (mov.estado === "Anulado") continue;
    if (mov.abonoIds.length > 0) continue;   // pago de la cuenta: se queda en la orden
    if (mov.tipo !== "Ingreso") continue;    // nunca revertir un egreso previo
    try {
      await crearMovimiento(
        {
          tipo: "Egreso",
          origen: "Facturación",
          categoria: "Devolución",
          monto: mov.monto,
          cuentaOrigenId: mov.cuentaDestinoId,
          estado: "Confirmado",
          metodo: mov.metodo,
          fecha: new Date().toISOString(),
          registradoPor: input.registradoPor,
          clienteId: input.clienteRecordId,
          reciboId: input.reciboRecordId,
          observacion: `Anulación del recibo interno ${input.numeroRecibo} — reversa de ${mov.movimientoId} (venta adicional / saldo cobrado al emitir)`,
        },
        { permitirCuentaFaltante: !mov.cuentaDestinoId }
      );
      total = round2(total + mov.monto);
    } catch (e) {
      console.error("[revertirPuenteRecibo]", e);
    }
  }
  return { montoRevertido: total };
}
