import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { iaDisponible, llamarClaude } from "@/lib/ia/claude";
import { extraerJson } from "@/lib/ia/respuesta";
import { ErrorAsistente, leerOrdenParaBorrador } from "@/lib/asistente/servidor";
import { notasDelHistorial, pedidoBorrador, type TurnoChat } from "@/lib/asistente/contexto";
import { hayMaterialParaFicha, normalizarBorrador } from "@/lib/manual-tecnico/reglas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

// La IA arma la ficha del Manual técnico con lo que ya está en la orden
// (punto 11B, decisión del dueño: al pasar a Completado; el técnico solo toca
// Guardar / Corregir / No hace falta). No escribe nada: solo propone.
export async function POST(request: Request, { params }: Params) {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  const { id: ordenId } = await params;
  const body = (await request.json().catch(() => ({}))) as { chat?: unknown };
  try {
    const o = await leerOrdenParaBorrador(ordenId);
    const notas = notasDelHistorial(o.historial).map((n) => n.texto);
    if (!hayMaterialParaFicha({ diagnostico: o.diagnostico, notas })) {
      return NextResponse.json({ success: true, data: { proponer: false, motivo: "La orden no tiene notas que expliquen qué se encontró." } });
    }
    if (!iaDisponible()) return NextResponse.json({ success: false, error: "Falta configurar la clave de IA (ANTHROPIC_API_KEY en Vercel)." }, { status: 503 });
    const chat = (Array.isArray(body.chat) ? body.chat : [])
      .map((t) => (t && typeof t === "object" ? (t as Record<string, unknown>) : {}))
      .filter((t) => (t.rol === "tecnico" || t.rol === "ia") && typeof t.texto === "string")
      .map((t) => ({ rol: t.rol, texto: String(t.texto).slice(0, 3000) }) as TurnoChat);
    const p = pedidoBorrador({ ...o, chat });
    const r = await llamarClaude({ uso: "manual-borrador", sistema: p.sistema, mensajes: [{ role: "user", content: p.mensaje }], maxTokens: p.maxTokens });
    const borrador = normalizarBorrador(extraerJson(r.texto));
    if (!borrador) return NextResponse.json({ success: false, error: "La IA no devolvió la ficha. Intenta de nuevo." }, { status: 502 });
    return NextResponse.json({ success: true, data: borrador });
  } catch (error) {
    const status = error instanceof ErrorAsistente ? 404 : 502;
    console.error("[manual-tecnico/borrador]", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status });
  }
}
