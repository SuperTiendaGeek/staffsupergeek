import "server-only";

// Llamada a Claude para ✨ Sugerir (punto 10d-3). Desde el punto 11B usa el
// motor único lib/ia/claude.ts (misma clave, mismos errores). El modelo se
// puede cambiar con ANTHROPIC_MODELO_ANUNCIOS.

import { iaDisponible, llamarClaude } from "@/lib/ia/claude";
import { MODELO_ANUNCIOS_POR_DEFECTO, construirPedido, limpiarSugerencia, type PedidoSugerencia } from "./ia-anuncios";

export function iaAnunciosDisponible() {
  return iaDisponible();
}

export async function sugerirTextoAnuncio(pedido: PedidoSugerencia): Promise<string> {
  const { sistema, mensaje, maxTokens } = construirPedido(pedido);
  const { texto } = await llamarClaude({
    uso: "sugerir",
    modelo: process.env.ANTHROPIC_MODELO_ANUNCIOS?.trim() || MODELO_ANUNCIOS_POR_DEFECTO,
    sistema,
    mensajes: [{ role: "user", content: mensaje }],
    maxTokens,
    esfuerzo: "low",
    tiempoMs: 30_000,
  });
  const limpio = limpiarSugerencia(texto, pedido.que);
  if (!limpio) throw new Error("La IA no devolvió texto. Intenta de nuevo.");
  return limpio;
}
