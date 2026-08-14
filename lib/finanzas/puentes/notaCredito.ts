import "server-only";

/**
 * Puente contable de la nota de crédito: revertir el ingreso al autorizarse.
 *
 * ─── Por qué existe ──────────────────────────────────────────────────────────
 *
 * Hasta agosto de 2026 una nota de crédito no tocaba Finanzas. La razón era
 * buena —una NC no devuelve efectivo, solo deja un crédito interno— pero se
 * quedó a medias: el ingreso de la factura original seguía registrado y la
 * factura de reemplazo registraba ingreso otra vez. La parte pagada con el
 * crédito entra como forma de pago SRI "15" (Compensación de deudas) y el
 * puente de facturación la crea igual, sin cuenta pero como Ingreso.
 *
 *     Venta de $100                        Ingreso  +100
 *     Devuelve → nota de crédito                   (nada)
 *     Compra otra cosa con el crédito      Ingreso  +100
 *                                          ─────────────
 *                                          ingresos  200   con $100 de dinero real
 *
 * Este puente pone la pata que faltaba: un Egreso por el total de la NC,
 * categoría "Devolución", SIN CUENTA. No mueve caja —eso no cambia— pero deja
 * el ingreso neto donde debe estar.
 *
 *     Devuelve y compra otra cosa   +100 −100 +100 = 100 ✓
 *     Devuelve y el crédito caduca  +100 −100 +100 = 100 ✓  (ver caducidad.ts)
 *     Devuelve y el crédito vive    +100 −100      =   0 ✓  le debes mercadería
 *
 * Ver docs/DISENO_NC_REVERSA_Y_CADUCIDAD.md.
 *
 * ─── Cómo se comporta ────────────────────────────────────────────────────────
 *
 * Corre DESPUÉS de que la NC quede autorizada, nunca dentro de la emisión, y
 * detrás de su propio try/catch: una nota de crédito ya autorizada ante el SRI
 * es un documento real, y ningún fallo contable puede alterarla.
 *
 * Guardián de ambiente: solo produce efectos con ambiente "2". Fail-closed,
 * igual que postEmision() y que el puente de facturación — cualquier otro
 * valor, incluido undefined, no escribe nada.
 *
 * Idempotente: si la NC ya tiene "Movimiento Reversa" enlazado, no hace nada.
 * Un reintento no puede duplicar el asiento.
 */

import { obtenerNotaCreditoPorId, marcarReversaContable } from "@/lib/facturacion/notaCredito/airtable";
import { fechaDeCaducidad } from "@/lib/facturacion/notaCredito/caducidad";
import { crearMovimiento } from "../movimientos";

const AMBIENTE_PRODUCCION = "2";

export type ResultadoPuenteNotaCredito =
  | { estado: "OK";       movimientoId?: string; motivo?: string }
  | { estado: "OMITIDO";  motivo: string }
  | { estado: "ERROR";    motivo: string };

export type PuenteNotaCreditoInput = {
  notaCreditoRecordId: string;
  ambiente?:           string;
  registradoPor:       string;
};

/**
 * Crea el asiento de reversa y fija la fecha de caducidad del crédito.
 *
 * NUNCA lanza. Devuelve qué pasó para poder registrarlo, pero el llamador
 * puede ignorarlo sin riesgo.
 */
export async function procesarPuenteNotaCredito(
  input: PuenteNotaCreditoInput
): Promise<ResultadoPuenteNotaCredito> {
  try {
    if (input.ambiente !== AMBIENTE_PRODUCCION) {
      return { estado: "OMITIDO", motivo: "Ambiente de pruebas: no se toca Finanzas." };
    }

    const nc = await obtenerNotaCreditoPorId(input.notaCreditoRecordId);
    if (!nc) {
      return { estado: "ERROR", motivo: `Nota de crédito ${input.notaCreditoRecordId} no encontrada.` };
    }
    if (nc.estado !== "AUTORIZADO") {
      return { estado: "OMITIDO", motivo: `La nota de crédito está ${nc.estado}, no AUTORIZADO.` };
    }

    // Idempotencia: el asiento ya existe.
    if (nc.movimientoReversaIds.length > 0) {
      return { estado: "OK", movimientoId: nc.movimientoReversaIds[0], motivo: "El asiento de reversa ya existía." };
    }

    if (!(nc.total > 0)) {
      return { estado: "OMITIDO", motivo: "La nota de crédito no tiene total que revertir." };
    }

    // El Egreso va SIN cuenta: no sale dinero de ninguna caja. Es el mismo
    // criterio con el que el puente de facturación crea el componente
    // "Compensación de deudas" sin cuenta destino.
    const movimiento = await crearMovimiento(
      {
        tipo:               "Egreso",
        origen:             "Facturación",
        categoria:          "Devolución",
        monto:              nc.total,
        cuentaOrigenId:     null,
        estado:             "Confirmado",
        estadoDistribucion: "Pendiente de clasificar",
        registradoPor:      input.registradoPor,
        notaCreditoId:      nc.recordId,
        clienteId:          nc.clienteRecordId,
        observacion:
          `Reversa del ingreso por la nota de crédito ${nc.numeroNotaCredito}. ` +
          `No mueve caja: el crédito queda a favor del cliente.`,
      },
      { permitirCuentaFaltante: true }
    );

    // El reloj del crédito arranca en la fecha de AUTORIZACIÓN, no en la de
    // hoy: si el asiento se crea en un reintento días después, el cliente no
    // pierde ni gana días.
    const caducidad = fechaDeCaducidad(nc.fechaAutorizacion);

    await marcarReversaContable(nc.recordId, movimiento.id, caducidad);

    return { estado: "OK", movimientoId: movimiento.id };
  } catch (error) {
    const motivo = error instanceof Error ? error.message : String(error);
    console.error("[Finanzas] Puente de nota de crédito falló", {
      notaCreditoRecordId: input.notaCreditoRecordId,
      error: motivo,
    });
    return { estado: "ERROR", motivo };
  }
}
