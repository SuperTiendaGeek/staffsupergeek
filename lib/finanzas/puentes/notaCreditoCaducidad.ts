import "server-only";

/**
 * Caducidad del crédito: convertir en ingreso lo que el cliente nunca usó.
 *
 * ─── La tercera pata ─────────────────────────────────────────────────────────
 *
 * Al autorizarse una nota de crédito, `puentes/notaCredito.ts` revierte el
 * ingreso original: el dinero deja de ser tuyo y pasa a ser una deuda con el
 * cliente, que puede gastarla en una factura de reemplazo.
 *
 * Si nunca la gasta, a los seis meses esa deuda se extingue. Ahí el dinero
 * vuelve a ser ingreso — del período en que caduca, no del de la venta
 * original.
 *
 *     Venta                          Ingreso  +100
 *     Nota de crédito                Egreso   −100   (deuda con el cliente)
 *     Caduca a los 6 meses           Ingreso  +100   ← esto
 *                                    ─────────────
 *                                              100   con $100 de dinero real ✓
 *
 * Ver docs/DISENO_NC_REVERSA_Y_CADUCIDAD.md.
 *
 * ─── Cómo se comporta ────────────────────────────────────────────────────────
 *
 * Guardián de ambiente: solo con "2". Fail-closed.
 *
 * Idempotente por nota: se salta las que ya tienen "Movimiento Caducidad"
 * enlazado. El proceso se puede correr todas las veces que haga falta sin
 * anotar dos veces el mismo ingreso.
 *
 * Aislado por nota: si una falla, las demás siguen. Un problema con un registro
 * no puede dejar sin procesar el resto del cierre de mes.
 */

import {
  listarCandidatasACaducar,
  marcarCreditoCaducado,
  type NotaCreditoCandidataCaducidad,
} from "@/lib/facturacion/notaCredito/airtable";
import { debeCaducar } from "@/lib/facturacion/notaCredito/caducidad";
import { crearMovimiento } from "../movimientos";

const AMBIENTE_PRODUCCION = "2";

export type CaducidadProcesada = {
  recordId:          string;
  numeroNotaCredito: string;
  cliente:           string;
  monto:             number;
  movimientoId:      string;
};

export type CaducidadFallida = {
  recordId:          string;
  numeroNotaCredito: string;
  motivo:            string;
};

export type ResultadoCaducidades = {
  estado:      "OK" | "OMITIDO";
  motivo?:     string;
  revisadas:   number;
  procesadas:  CaducidadProcesada[];
  fallidas:    CaducidadFallida[];
  montoTotal:  number;
};

export type ProcesarCaducidadesInput = {
  ambiente?:     string;
  registradoPor: string;
  /** "aaaa-mm-dd". Se inyecta para poder probarlo; por defecto, hoy. */
  hoy?:          string;
};

function hoyEnGuayaquil(): string {
  // America/Guayaquil es UTC-5 todo el año (Ecuador continental no cambia de
  // hora). Se calcula explícito para que el resultado no dependa de la zona
  // horaria del servidor: Vercel corre en UTC y, pasadas las 19:00 locales,
  // "hoy" en UTC ya es mañana — un crédito caducaría un día antes de tiempo.
  const ahora = new Date(Date.now() - 5 * 60 * 60 * 1000);
  return ahora.toISOString().slice(0, 10);
}

/** NUNCA lanza. Devuelve el detalle de lo hecho y lo que falló. */
export async function procesarCaducidades(
  input: ProcesarCaducidadesInput
): Promise<ResultadoCaducidades> {
  const vacio = { revisadas: 0, procesadas: [], fallidas: [], montoTotal: 0 };

  if (input.ambiente !== AMBIENTE_PRODUCCION) {
    return { estado: "OMITIDO", motivo: "Ambiente de pruebas: no se toca Finanzas.", ...vacio };
  }

  const hoy = input.hoy || hoyEnGuayaquil();

  let candidatas: NotaCreditoCandidataCaducidad[];
  try {
    candidatas = await listarCandidatasACaducar(hoy);
  } catch (error) {
    const motivo = error instanceof Error ? error.message : String(error);
    console.error("[Finanzas] No se pudieron leer las notas de crédito por caducar", motivo);
    return { estado: "OK", motivo: `No se pudo leer Airtable: ${motivo}`, ...vacio };
  }

  const procesadas: CaducidadProcesada[] = [];
  const fallidas:   CaducidadFallida[]   = [];

  for (const nc of candidatas) {
    // Segunda comprobación, ya en memoria: la fórmula de Airtable no puede
    // preguntar por el enlace, así que la idempotencia se decide aquí.
    if (!debeCaducar(nc, hoy)) continue;

    try {
      const movimiento = await crearMovimiento(
        {
          tipo:               "Ingreso",
          origen:             "Facturación",
          categoria:          "Crédito Caducado",
          monto:              nc.saldoDisponible,
          cuentaDestinoId:    null,
          estado:             "Confirmado",
          estadoDistribucion: "Pendiente de clasificar",
          registradoPor:      input.registradoPor,
          notaCreditoId:      nc.recordId,
          clienteId:          nc.clienteRecordId,
          observacion:
            `Crédito caducado de la nota ${nc.numeroNotaCredito}. ` +
            `Venció el ${nc.fechaCaducidad} sin que el cliente lo usara. ` +
            `Sin comprobante: no es una venta, es una deuda que se extingue.`,
        },
        { permitirCuentaFaltante: true }
      );

      await marcarCreditoCaducado(nc.recordId, movimiento.id);

      procesadas.push({
        recordId:          nc.recordId,
        numeroNotaCredito: nc.numeroNotaCredito,
        cliente:           nc.clienteNombre,
        monto:             nc.saldoDisponible,
        movimientoId:      movimiento.id,
      });
    } catch (error) {
      // Una nota que falla no detiene a las demás.
      const motivo = error instanceof Error ? error.message : String(error);
      console.error("[Finanzas] Caducidad fallida", { nota: nc.numeroNotaCredito, motivo });
      fallidas.push({ recordId: nc.recordId, numeroNotaCredito: nc.numeroNotaCredito, motivo });
    }
  }

  return {
    estado:     "OK",
    revisadas:  candidatas.length,
    procesadas,
    fallidas,
    montoTotal: procesadas.reduce((suma, p) => suma + p.monto, 0),
  };
}
