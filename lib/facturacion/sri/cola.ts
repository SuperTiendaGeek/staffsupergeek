import "server-only";

import type { FacturacionConfig } from "../config";
import { consultarAutorizacion, type ResultadoAutorizacion } from "./autorizacion";

// ─── Backoff con polling ──────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Consulta la autorización con reintentos exponenciales mientras el estado
 * sea EN_PROCESAMIENTO.
 *
 * Resolución NAC-DGERCGC25-00000017: la transmisión es en tiempo real,
 * pero el SRI puede tardar varios segundos en autorizar bajo carga.
 *
 * @param claveAcceso   - 49 dígitos del comprobante
 * @param config        - Config con endpoint del ambiente activo
 * @param opts.maxEsperaMs  - Tiempo máximo total de espera (default 60 s)
 * @param opts.intervaloBase - Intervalo inicial entre reintentos (default 2 s)
 */
export async function esperarAutorizacion(
  claveAcceso: string,
  config: Pick<FacturacionConfig, "endpointAutorizacion">,
  opts: { maxEsperaMs?: number; intervaloBase?: number } = {}
): Promise<ResultadoAutorizacion> {
  const { maxEsperaMs = 60_000, intervaloBase = 2_000 } = opts;
  const inicio = Date.now();
  let intento = 0;

  while (true) {
    const resultado = await consultarAutorizacion(claveAcceso, config);

    if (resultado.estado !== "EN PROCESAMIENTO") {
      return resultado;
    }

    intento++;
    const transcurrido = Date.now() - inicio;
    // Backoff exponencial acotado: 2s, 4s, 8s, 8s, 8s …
    const espera = Math.min(intervaloBase * 2 ** (intento - 1), 8_000);

    if (transcurrido + espera >= maxEsperaMs) {
      throw new Error(
        `Autorización SRI no resuelta en ${maxEsperaMs / 1000}s ` +
        `(clave: ${claveAcceso}). Reintentar más tarde.`
      );
    }

    await sleep(espera);
  }
}
