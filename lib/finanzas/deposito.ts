import "server-only";

import type { Movimiento } from "@/types/finanzas";
import { fetchCuentaById } from "./cuentas";
import { crearMovimiento } from "./movimientos";
import { algunaCuentaSinFechaCorte, PreGoLiveError } from "./pre-go-live";

export type DepositoInput = {
  cuentaOrigenId: string;
  cuentaDestinoId: string;
  monto: number;
  fecha: string;
  registradoPor: string;
  comprobanteUrl?: string;
  observacion?: string;
};

/**
 * Fase 20.3 §4.1/§4.2 — el caso de negocio del depósito de caja es
 * exactamente el `Movimiento Interno` que 20.1 ya construyó (matriz `Permite
 * Transferir A`/`Permite Recibir De` + bloqueo duro por saldo insuficiente).
 * Se extrae a una función de librería (en vez de dejar la lógica solo en el
 * route handler) para que el chequeo PRE_GO_LIVE sea testeable sin simular
 * sesión/HTTP — mismo criterio que `procesarAcreditacion`.
 */
export async function procesarDeposito(input: DepositoInput): Promise<Movimiento> {
  const [cuentaOrigen, cuentaDestino] = await Promise.all([
    fetchCuentaById(input.cuentaOrigenId),
    fetchCuentaById(input.cuentaDestinoId),
  ]);
  if (algunaCuentaSinFechaCorte([cuentaOrigen, cuentaDestino])) {
    throw new PreGoLiveError();
  }

  return crearMovimiento({
    tipo: "Movimiento Interno",
    origen: "Manual",
    categoria: "Depósito de Caja",
    monto: input.monto,
    cuentaOrigenId: input.cuentaOrigenId,
    cuentaDestinoId: input.cuentaDestinoId,
    estado: "Confirmado",
    estadoDistribucion: "No aplica",
    fecha: input.fecha,
    comprobanteUrl: input.comprobanteUrl,
    observacion: input.observacion,
    registradoPor: input.registradoPor,
  });
}
