import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { bloqueImagen, iaDisponible, llamarClaude, type ImagenIA } from "@/lib/ia/claude";
import { DOMINIOS_TECNICO, extraerJson } from "@/lib/ia/respuesta";
import { ErrorAsistente, leerOrdenParaIA, leerTecnicoParaIA } from "@/lib/asistente/servidor";
import {
  faltaParaEntregar, normalizarResumen, normalizarTecnico, pedidoMensaje, pedidoPregunta, pedidoRedactar, pedidoResumen,
  pedidoTecnico, pidePrecios, type TurnoChat,
} from "@/lib/asistente/contexto";

export const dynamic = "force-dynamic";
// El técnico experto puede buscar en internet: le damos tiempo.
export const maxDuration = 90;

type Params = { params: Promise<{ id: string }> };

// Asistente de la orden (auditoría ops, punto 11B · 21-nov-2026).
// Lee, resume y redacta; NUNCA escribe. Lo que falta para entregar lo dice
// lib/entrega (no la IA). Las reglas viven en lib/asistente/contexto.ts.
//   modo "orden":   accion resumen | pregunta | corto | otro
//   modo "tecnico": mensaje + chat (+ foto) → causas, pruebas y fuentes
export async function POST(request: Request, { params }: Params) {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  const { id: ordenId } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const ahora = new Date().toISOString();

  try {
    if (body.modo === "tecnico") {
      const mensaje = String(body.mensaje ?? "").trim().slice(0, 1500);
      if (!mensaje) return NextResponse.json({ success: false, error: "Cuenta qué viste o qué probaste." }, { status: 400 });
      if (!iaDisponible()) return NextResponse.json({ success: false, error: "Falta configurar la clave de IA (ANTHROPIC_API_KEY en Vercel)." }, { status: 503 });
      const chat = (Array.isArray(body.chat) ? body.chat : [])
        .map((t) => (t && typeof t === "object" ? (t as Record<string, unknown>) : {}))
        .filter((t) => (t.rol === "tecnico" || t.rol === "ia") && typeof t.texto === "string")
        .map((t) => ({ rol: t.rol, texto: String(t.texto).slice(0, 3000) }) as TurnoChat);
      const foto = leerFoto(body.foto);

      const datos = await leerTecnicoParaIA(ordenId, pidePrecios(mensaje));
      const pedido = pedidoTecnico(datos, chat, mensaje);
      const mensajes = pedido.mensajes.map((m, i) =>
        foto && i === pedido.mensajes.length - 1
          ? { role: m.role, content: [bloqueImagen(foto), { type: "text" as const, text: m.content }] }
          : m);
      const r = await llamarClaude({
        uso: "tecnico-experto",
        sistema: pedido.sistema,
        mensajes,
        maxTokens: pedido.maxTokens,
        esfuerzo: "medium",
        busqueda: { dominios: DOMINIOS_TECNICO, maxUsos: 3 },
        tiempoMs: 80_000,
      });
      return NextResponse.json({
        success: true,
        data: { ...normalizarTecnico(extraerJson(r.texto), r.texto), fuentes: r.fuentes, busquedas: r.busquedas, hora: ahora },
      });
    }

    const accion = String(body.accion ?? "resumen");
    const datos = await leerOrdenParaIA(ordenId);
    const falta = faltaParaEntregar(datos);

    if (accion === "resumen") {
      if (!iaDisponible()) {
        return NextResponse.json({ success: true, data: { falta, leidoEn: ahora, sinIA: "Falta configurar la clave de IA (ANTHROPIC_API_KEY en Vercel)." } });
      }
      const p = pedidoResumen(datos, ahora);
      const r = await llamarClaude({ uso: "asistente-orden", sistema: p.sistema, mensajes: [{ role: "user", content: p.mensaje }], maxTokens: p.maxTokens });
      return NextResponse.json({
        success: true,
        data: { ...normalizarResumen(extraerJson(r.texto), r.texto), falta, leidoEn: ahora, cliente: datos.clienteNombre, codigo: datos.codigo },
      });
    }

    if (!iaDisponible()) return NextResponse.json({ success: false, error: "Falta configurar la clave de IA (ANTHROPIC_API_KEY en Vercel)." }, { status: 503 });

    if (accion === "pregunta") {
      const pregunta = String(body.pregunta ?? "").trim();
      if (!pregunta) return NextResponse.json({ success: false, error: "Escribe la pregunta." }, { status: 400 });
      const p = pedidoPregunta(datos, pregunta, ahora);
      const r = await llamarClaude({ uso: "asistente-pregunta", sistema: p.sistema, mensajes: [{ role: "user", content: p.mensaje }], maxTokens: p.maxTokens });
      const json = extraerJson(r.texto);
      return NextResponse.json({ success: true, data: { respuesta: typeof json?.respuesta === "string" ? json.respuesta : r.texto } });
    }

    if (accion === "redactar") {
      const p = pedidoRedactar(datos, String(body.apunte ?? ""), ahora);
      const r = await llamarClaude({ uso: "asistente-mensaje", sistema: p.sistema, mensajes: [{ role: "user", content: p.mensaje }], maxTokens: p.maxTokens });
      const json = extraerJson(r.texto);
      return NextResponse.json({ success: true, data: { mensaje: typeof json?.mensaje === "string" ? json.mensaje.trim() : r.texto } });
    }

    if (accion === "corto" || accion === "otro") {
      const p = pedidoMensaje(datos, String(body.mensajeActual ?? ""), accion, ahora);
      const r = await llamarClaude({ uso: "asistente-mensaje", sistema: p.sistema, mensajes: [{ role: "user", content: p.mensaje }], maxTokens: p.maxTokens });
      const json = extraerJson(r.texto);
      return NextResponse.json({ success: true, data: { mensaje: typeof json?.mensaje === "string" ? json.mensaje.trim() : r.texto } });
    }

    return NextResponse.json({ success: false, error: "Acción no válida." }, { status: 400 });
  } catch (error) {
    const status = error instanceof ErrorAsistente ? 404 : 502;
    console.error("[asistente]", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status });
  }
}

/** Foto del equipo (base64 sin el prefijo data:), hasta ~4 MB. */
function leerFoto(v: unknown): ImagenIA | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const tipo = o.tipo === "image/png" || o.tipo === "image/webp" ? o.tipo : o.tipo === "image/jpeg" ? "image/jpeg" : null;
  const datos = typeof o.datos === "string" ? o.datos.replace(/^data:[^,]+,/, "") : "";
  if (!tipo || !datos || datos.length > 5_500_000 || !/^[A-Za-z0-9+/=]+$/.test(datos.slice(0, 200))) return null;
  return { tipo, datos };
}
