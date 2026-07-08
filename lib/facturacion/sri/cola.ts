import "server-only";

import type { FacturacionConfig } from "../config";
import { consultarAutorizacion, type ResultadoAutorizacion } from "./autorizacion";

// ─── Backoff con polling ──────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ─── ¿Es un resultado definitivo? ─────────────────────────────────────────────

/**
 * Un AUTORIZADO sin numeroAutorizacion o sin fechaAutorizacion no es todavía
 * un resultado definitivo: se observó en producción (facturas 001-002-666 y
 * 001-002-667, ambiente PRUEBAS) que el SRI puede reflejar el cambio de
 * estado a AUTORIZADO un instante antes de terminar de poblar esos dos
 * campos — consultada la misma clave de acceso momentos después, ya vienen
 * completos. Sin esta espera, emitirFactura() arma el RIDE con "NÚMERO DE
 * AUTORIZACIÓN" en blanco y "FECHA Y HORA DE AUTORIZACIÓN" en
 * NaN/NaN/NaN NaN:NaN:NaN — el generador del RIDE solo imprime lo que recibe.
 */
export function esResultadoDefinitivo(resultado: ResultadoAutorizacion): boolean {
  if (resultado.estado === "EN PROCESAMIENTO") return false;
  if (resultado.estado === "AUTORIZADO") {
    return Boolean(resultado.numeroAutorizacion) && Boolean(resultado.fechaAutorizacion);
  }
  return true; // NO AUTORIZADO es definitivo tal cual
}

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

    if (esResultadoDefinitivo(resultado)) {
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
