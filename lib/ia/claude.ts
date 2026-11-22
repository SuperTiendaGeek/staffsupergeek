import "server-only";

// Motor ÚNICO de IA del portal (punto 11B · 21-nov-2026). Todo lo que habla
// con Claude pasa por aquí: ✨ Sugerir de Shipping, el Asistente de la orden,
// el técnico experto y el borrador del Manual técnico. Una sola clave
// (ANTHROPIC_API_KEY en Vercel), un solo manejo de errores y de tiempo.
//
// Nunca escribe en Airtable: solo pregunta y devuelve texto.

import {
  contarBusquedas, extraerFuentes, extraerTexto, mensajeErrorIA,
  type BloqueRespuesta, type FuenteWeb,
} from "./respuesta";

export const MODELO_POR_DEFECTO = "claude-sonnet-5-5";

export type ImagenIA = { tipo: "image/jpeg" | "image/png" | "image/webp"; datos: string };

export type ContenidoIA =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: ImagenIA["tipo"]; data: string } };

export type MensajeIA = { role: "user" | "assistant"; content: string | ContenidoIA[] | BloqueRespuesta[] };

export type PedidoIA = {
  sistema: string;
  mensajes: MensajeIA[];
  maxTokens: number;
  esfuerzo?: "low" | "medium" | "high";
  /** Búsqueda web solo en estos dominios (técnico experto). */
  busqueda?: { dominios: readonly string[]; maxUsos: number };
  /** Modelo; por defecto ANTHROPIC_MODELO_ASISTENTE o claude-sonnet-5-5. */
  modelo?: string;
  tiempoMs?: number;
  /** Para el registro: quién llamó ("sugerir", "asistente-orden", …). */
  uso: string;
};

export type RespuestaIA = {
  texto: string;
  fuentes: FuenteWeb[];
  busquedas: number;
  tokensEntrada: number;
  tokensSalida: number;
};

export function iaDisponible(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export function modeloAsistente(): string {
  return process.env.ANTHROPIC_MODELO_ASISTENTE?.trim() || MODELO_POR_DEFECTO;
}

/** Imagen adjunta (foto del equipo) como bloque de la API. */
export function bloqueImagen(img: ImagenIA): ContenidoIA {
  return { type: "image", source: { type: "base64", media_type: img.tipo, data: img.datos } };
}

type DatosApi = {
  content?: BloqueRespuesta[];
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
};

export async function llamarClaude(pedido: PedidoIA): Promise<RespuestaIA> {
  const clave = process.env.ANTHROPIC_API_KEY?.trim();
  if (!clave) throw new Error("Falta configurar la clave de IA (ANTHROPIC_API_KEY en Vercel).");

  const herramientas = pedido.busqueda
    ? [{
        type: "web_search_20250305",
        name: "web_search",
        max_uses: pedido.busqueda.maxUsos,
        allowed_domains: [...pedido.busqueda.dominios],
      }]
    : undefined;

  const control = new AbortController();
  const espera = setTimeout(() => control.abort(), pedido.tiempoMs ?? 45_000);
  const mensajes: MensajeIA[] = [...pedido.mensajes];
  const bloques: BloqueRespuesta[] = [];
  let tokensEntrada = 0;
  let tokensSalida = 0;

  try {
    // Una búsqueda larga puede volver "en pausa" (pause_turn): se le devuelve
    // tal cual y sigue. Como mucho dos vueltas extra.
    for (let vuelta = 0; vuelta < 3; vuelta++) {
      const respuesta = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: control.signal,
        headers: {
          "x-api-key": clave,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: pedido.modelo || modeloAsistente(),
          max_tokens: pedido.maxTokens,
          system: pedido.sistema,
          messages: mensajes,
          ...(herramientas ? { tools: herramientas } : {}),
          output_config: { effort: pedido.esfuerzo ?? "low" },
        }),
      });
      const datos = (await respuesta.json().catch(() => ({}))) as DatosApi;
      if (!respuesta.ok) {
        console.error(`Claude (${pedido.uso}) respondió`, respuesta.status, datos.error?.message);
        throw new Error(mensajeErrorIA(respuesta.status, datos.error?.message ?? ""));
      }
      const contenido = datos.content ?? [];
      bloques.push(...contenido);
      tokensEntrada += datos.usage?.input_tokens ?? 0;
      tokensSalida += datos.usage?.output_tokens ?? 0;
      if (datos.stop_reason !== "pause_turn") break;
      mensajes.push({ role: "assistant", content: contenido });
    }

    const texto = extraerTexto(bloques).trim();
    if (!texto) throw new Error("La IA no devolvió texto. Intenta de nuevo.");
    const busquedas = contarBusquedas(bloques);
    console.info(`[ia] ${pedido.uso}: ${tokensEntrada} tokens de entrada, ${tokensSalida} de salida, ${busquedas} búsquedas`);
    return { texto, fuentes: extraerFuentes(bloques), busquedas, tokensEntrada, tokensSalida };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("La IA tardó demasiado. Intenta de nuevo.");
    throw error;
  } finally {
    clearTimeout(espera);
  }
}
