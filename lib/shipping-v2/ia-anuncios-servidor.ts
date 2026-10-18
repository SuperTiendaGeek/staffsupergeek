import "server-only";

// Llamada a Claude para ✨ Sugerir (punto 10d-3). La clave va solo en Vercel
// (ANTHROPIC_API_KEY); el modelo se puede cambiar con ANTHROPIC_MODELO_ANUNCIOS.

import { MODELO_ANUNCIOS_POR_DEFECTO, construirPedido, limpiarSugerencia, type PedidoSugerencia } from "./ia-anuncios";

export function iaAnunciosDisponible() {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export async function sugerirTextoAnuncio(pedido: PedidoSugerencia): Promise<string> {
  const clave = process.env.ANTHROPIC_API_KEY?.trim();
  if (!clave) throw new Error("Falta configurar la clave de IA (ANTHROPIC_API_KEY en Vercel).");
  const modelo = process.env.ANTHROPIC_MODELO_ANUNCIOS?.trim() || MODELO_ANUNCIOS_POR_DEFECTO;
  const { sistema, mensaje, maxTokens } = construirPedido(pedido);

  const control = new AbortController();
  const espera = setTimeout(() => control.abort(), 30_000);
  try {
    const respuesta = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: control.signal,
      headers: {
        "x-api-key": clave,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: modelo,
        max_tokens: maxTokens,
        system: sistema,
        messages: [{ role: "user", content: mensaje }],
        output_config: { effort: "low" },
      }),
    });
    const datos = (await respuesta.json().catch(() => ({}))) as {
      content?: Array<{ type: string; text?: string }>;
      error?: { message?: string };
    };
    if (!respuesta.ok) {
      console.error("Claude (✨ Sugerir) respondió", respuesta.status, datos.error?.message);
      if (respuesta.status === 401) throw new Error("La clave de IA no es válida. Revísala en Vercel.");
      if (respuesta.status === 429) throw new Error("La IA está ocupada. Intenta en un momento.");
      if (respuesta.status === 400 && /credit|billing/i.test(datos.error?.message ?? "")) throw new Error("La cuenta de IA no tiene saldo. Revisa Billing en platform.claude.com.");
      throw new Error("La IA no pudo responder. Intenta de nuevo.");
    }
    const texto = (datos.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    const limpio = limpiarSugerencia(texto, pedido.que);
    if (!limpio) throw new Error("La IA no devolvió texto. Intenta de nuevo.");
    return limpio;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("La IA tardó demasiado. Intenta de nuevo.");
    throw error;
  } finally {
    clearTimeout(espera);
  }
}
