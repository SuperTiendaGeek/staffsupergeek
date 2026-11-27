import "server-only";

// Adaptador DeUna (etapa D, 18-nov-2026). Reglas puras en ./deuna-reglas.ts.
//   - Las claves (x-api-key, x-api-secret) viajan SOLO de nuestro servidor a
//     DeUna. Nunca al navegador, a Airtable ni a los registros (logs).
//   - Sin devoluciones en esta entrega (DeUna solo devuelve el mismo día y el
//     monto completo: se hacen a mano en la app de DeUna).

import type { ConfigPasarela } from "./config";
import { cuerpoSolicitud, leerInfo, leerRespuestaSolicitud, type CobroDeUna, type InfoDeUna } from "./deuna-reglas";

async function llamar(c: ConfigPasarela, ruta: "request" | "info", cuerpo: unknown): Promise<{ status: number; datos: unknown }> {
  const controlador = new AbortController();
  const corte = setTimeout(() => controlador.abort(), 15_000);
  try {
    // Producción o QA según la configuración (nunca se mezclan: config.ts).
    if (!/^https:\/\/apis-merchant\.(pdn|qa)\.deunalab\.com\//.test(`${c.base}/`)) throw new Error("Dirección de DeUna no válida.");
    const res = await fetch(`${c.base}/${ruta}`, {
      method: "POST",
      headers: { "x-api-key": c.apiKey, "x-api-secret": c.apiSecret, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(cuerpo),
      cache: "no-store",
      signal: controlador.signal,
    });
    return { status: res.status, datos: await res.json().catch(() => null) };
  } finally {
    clearTimeout(corte);
  }
}

/** Pide un cobro dinámico (un solo uso) por el monto exacto. Lanza si DeUna no lo da. */
export async function solicitarCobroDeUna(c: ConfigPasarela, intento: { codigo: string; monto: number; detalle: string; caja?: string }): Promise<CobroDeUna> {
  const { status, datos } = await llamar(c, "request", cuerpoSolicitud({ pointOfSale: intento.caja || c.caja, monto: intento.monto, codigo: intento.codigo, detalle: intento.detalle }));
  const cobro = status >= 200 && status < 300 ? leerRespuestaSolicitud(datos) : null;
  // Solo el código HTTP en el error: la respuesta podría traer datos que no deben ir a los registros.
  if (!cobro) throw new Error(`DeUna no generó el cobro (HTTP ${status}).`);
  return cobro;
}

/**
 * Pregunta a DeUna cómo quedó un pago. tipo: "transaccion" (ID de DeUna) o
 * "referencia" (nuestro PL-…). Lanza si no hubo respuesta válida (se reintenta).
 */
export async function consultarPagoDeUna(c: ConfigPasarela, id: string, tipo: "transaccion" | "referencia"): Promise<InfoDeUna> {
  const { status, datos } = await llamar(c, "info", { idTransacionReference: id, idType: tipo === "transaccion" ? "0" : "1" });
  if (status < 200 || status >= 300) throw new Error(`DeUna respondió HTTP ${status} al consultar.`);
  const info = leerInfo(datos);
  if (!info.status) throw new Error("DeUna respondió sin estado.");
  return info;
}
