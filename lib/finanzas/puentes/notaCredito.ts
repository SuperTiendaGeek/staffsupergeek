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
 *
 * ─── Destino "Reembolso" (26-oct-2026) ───────────────────────────────────────
 *
 * Si la nota de crédito se emitió para DEVOLVERLE el dinero al cliente, el
 * mismo asiento lleva la cuenta de la que sale ese dinero (la que se eligió en
 * la pantalla y quedó guardada en "Líneas JSON"). Así un solo Egreso revierte
 * el ingreso y descuenta la caja, y el crédito se cierra en 0 ("Consumido")
 * en vez de quedar vigente seis meses. Si no se sabe de qué cuenta salió, no
 * se escribe nada: un reembolso sin cuenta mentiría en el saldo de caja.
 * Ver lib/facturacion/notaCredito/reembolso.ts.
 */

import {
  obtenerNotaCreditoPorId,
  marcarReversaContable,
  marcarReembolsoContable,
} from "@/lib/facturacion/notaCredito/airtable";
import { fechaDeCaducidad } from "@/lib/facturacion/notaCredito/caducidad";
import { leerReembolsoDeLineasJson, observacionReembolso } from "@/lib/facturacion/notaCredito/reembolso";
import { crearMovimiento } from "../movimientos";
import { airtableRequest, getClient, tableUrl, type AirtableListResponse } from "../airtable-client";
import { conResolucionDeTablaMovimientos } from "../table-names";
import { MOVIMIENTOS_FIELDS as F } from "../movimientos-fields";

const AMBIENTE_PRODUCCION = "2";

export type ResultadoPuenteNotaCredito =
  | { estado: "OK";       movimientoId?: string; motivo?: string; reembolso?: { monto: number; cuenta: string } }
  | { estado: "OMITIDO";  motivo: string }
  | { estado: "ERROR";    motivo: string; movimientoId?: string };

/** Recupera un egreso creado antes de que fallara el enlace con la NC.
 * Se filtra por textos y se comprueba el link por id en memoria: Airtable
 * no permite comparar el record id directamente en un campo de enlace. */
async function buscarReembolsoExistente(notaCreditoId: string): Promise<string | undefined> {
  return conResolucionDeTablaMovimientos(getClient(), async (tabla) => {
    let offset: string | undefined;
    do {
      const url = new URL(tableUrl(tabla));
      url.searchParams.set("filterByFormula", `AND({${F.tipo}}='Egreso',{${F.categoria}}='Devolución',{${F.origen}}='Facturación',{${F.estado}}!='Anulado')`);
      url.searchParams.set("pageSize", "100");
      if (offset) url.searchParams.set("offset", offset);
      const data = await airtableRequest<AirtableListResponse>(url.toString());
      const existente = data.records?.find((r) => {
        const ids = r.fields[F.notaCredito];
        return Array.isArray(ids) && ids.includes(notaCreditoId);
      });
      if (existente) return existente.id;
      offset = data.offset;
    } while (offset);
    return undefined;
  });
}

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
      const datos = nc.destino === "Reembolso" ? leerReembolsoDeLineasJson(nc.lineasJson) : null;
      return { estado: "OK", movimientoId: nc.movimientoReversaIds[0], motivo: "El asiento de reversa ya existía.",
        ...(datos ? { reembolso: { monto: nc.total, cuenta: datos.cuentaOrigenNombre } } : {}) };
    }

    if (!(nc.total > 0)) {
      return { estado: "OMITIDO", motivo: "La nota de crédito no tiene total que revertir." };
    }

    if (nc.destino === "Reembolso") {
      const datos = leerReembolsoDeLineasJson(nc.lineasJson);
      if (!datos) {
        return {
          estado: "ERROR",
          motivo:
            `La nota de crédito ${nc.numeroNotaCredito} es un reembolso pero no tiene guardada la cuenta de la que ` +
            `salió el dinero. No se registró nada en Finanzas: hay que registrar el egreso a mano.`,
        };
      }

      // Egreso CON cuenta: aquí sí sale dinero. crearMovimiento() vuelve a
      // comprobar que la cuenta exista y esté activa, y marca "Alerta
      // Descuadre" si el saldo del sistema no alcanza (no bloquea: el dinero
      // ya se entregó).
      const existenteId = await buscarReembolsoExistente(nc.recordId);
      const movimiento = existenteId ? { id: existenteId } : await crearMovimiento({
        tipo:               "Egreso",
        origen:             "Facturación",
        categoria:          "Devolución",
        monto:              nc.total,
        cuentaOrigenId:     datos.cuentaOrigenId,
        estado:             "Confirmado",
        estadoDistribucion: "Pendiente de clasificar",
        metodo:             datos.metodo,
        transaccionId:      datos.transaccionId,
        registradoPor:      input.registradoPor,
        notaCreditoId:      nc.recordId,
        clienteId:          nc.clienteRecordId,
        observacion:        observacionReembolso({
          numeroNotaCredito:       nc.numeroNotaCredito,
          numeroFacturaModificada: nc.numeroFacturaModificada,
          datos,
        }),
      });

      try {
        await marcarReembolsoContable(nc.recordId, movimiento.id);
      } catch (error) {
        console.error("[Finanzas] Reembolso creado pero no enlazado a la NC:", error);
        return {
          estado: "ERROR", movimientoId: movimiento.id,
          motivo: `El egreso ${movimiento.id} ya existe en Finanzas, pero no se pudo enlazar a la nota de crédito. No registres otro egreso; revisa el enlace con el administrador.`,
        };
      }

      return {
        estado: "OK",
        movimientoId: movimiento.id,
        reembolso: { monto: nc.total, cuenta: datos.cuentaOrigenNombre },
      };
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
