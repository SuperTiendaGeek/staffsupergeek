import "server-only";

// Actividad v2 (24-nov-2026, tableros 13–15 aprobados): el mensaje para el
// cliente nace de UNA línea de la actividad y vive pegado a ella, en la misma
// fila del «Historial de Estados»:
//   · «Estado Generado IA»   → el texto del mensaje (como lo dejaba la IA de Airtable)
//   · «Mensaje enviado»      → cuándo se envió o copió (vacío = sin enviar)
//   · «Mensaje enviado por»  → «Alexis Bolaños · WhatsApp» / «… · Copiado»
// Se guarda apenas existe (no se pierde), se corrige ahí mismo y se envía con
// un clic. Con la orden Completado, enviarlo marca «Cliente avisado».
// No toca «Solicitar Mensaje Cliente» (eso dispara la Automatización 2 vieja).

import { ids, porIds, texto } from "@/lib/estado-cuenta/airtable";
import { AIRTABLE_TABLES, loadAirtableEnv } from "@/lib/tecnicos/config/airtable";
import { iaDisponible, llamarClaude } from "@/lib/ia/claude";
import { extraerJson } from "@/lib/ia/respuesta";
import { leerOrdenParaIA } from "@/lib/asistente/servidor";
import { pedidoMensaje, pedidoRedactar } from "@/lib/asistente/contexto";
import { formatoWhatsApp } from "@/lib/asistente/formato";
import { olvidarAlertas } from "@/lib/tecnicos/alertas/servidor";
import { deHistorial, revisarMensaje, textoEnviadoPor, type EntradaActividad, type ViaMensaje } from "./reglas";
import { ErrorActividad } from "./servidor";

export const CAMPOS_LINEA = [
  "Estado Nuevo", "Fecha", "Creado por Nombre", "Técnico", "Visibilidad", "Tipo de actividad",
  "Estado Generado IA", "Mensaje enviado", "Mensaje enviado por", "Órdenes de Reparación",
];

export type AccionMensaje = "crear" | "corto" | "otro" | "talCual" | "guardar" | "enviar" | "descartar";
export const ACCIONES_MENSAJE: readonly AccionMensaje[] = ["crear", "corto", "otro", "talCual", "guardar", "enviar", "descartar"];

type Usuario = { nombre: string | null; email: string | null; id: string | null };

function aEntrada(r: { id: string; createdTime?: string; fields: Record<string, unknown> }): EntradaActividad {
  return deHistorial({
    id: r.id,
    texto: texto(r.fields["Estado Nuevo"]),
    fecha: texto(r.fields["Fecha"]) || r.createdTime || "",
    autor: texto(r.fields["Creado por Nombre"]) || texto(r.fields["Técnico"]),
    tipo: r.fields["Tipo de actividad"],
    visibilidad: r.fields["Visibilidad"],
    mensajeIA: texto(r.fields["Estado Generado IA"]),
    mensajeEnviado: texto(r.fields["Mensaje enviado"]),
    mensajeEnviadoPor: texto(r.fields["Mensaje enviado por"]),
  });
}

async function leerLinea(ordenId: string, lineaId: string): Promise<EntradaActividad> {
  const r = (await porIds(AIRTABLE_TABLES.historial, [lineaId], CAMPOS_LINEA)).get(lineaId);
  if (!r || !ids(r.fields["Órdenes de Reparación"]).includes(ordenId)) throw new ErrorActividad("Esa línea no es de esta orden.", 404);
  return aEntrada(r);
}

async function patch(tabla: string, id: string, fields: Record<string, unknown>): Promise<{ id: string; createdTime?: string; fields: Record<string, unknown> }> {
  const { token, baseId } = loadAirtableEnv();
  const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tabla)}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields, typecast: false }),
  });
  if (!res.ok) throw new Error(`Airtable ${tabla}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

async function redactar(ordenId: string, linea: EntradaActividad, accion: "crear" | "corto" | "otro"): Promise<string> {
  if (!iaDisponible()) throw new ErrorActividad("Falta configurar la clave de IA (ANTHROPIC_API_KEY en Vercel).", 503);
  const datos = await leerOrdenParaIA(ordenId);
  const ahora = new Date().toISOString();
  const apunte = linea.tipo === "Cambio de estado"
    ? `La orden pasó a «${linea.texto.replace(/^Estado:\s*/, "")}».`
    : linea.texto;
  const p = accion === "crear"
    ? pedidoRedactar(datos, apunte, ahora)
    : pedidoMensaje(datos, linea.mensaje?.texto ?? "", accion, ahora);
  const r = await llamarClaude({ uso: "actividad-mensaje", sistema: p.sistema, mensajes: [{ role: "user", content: p.mensaje }], maxTokens: p.maxTokens });
  const json = extraerJson(r.texto);
  const mensaje = formatoWhatsApp(typeof json?.mensaje === "string" ? json.mensaje : r.texto);
  if (mensaje.length < 2) throw new ErrorActividad("La IA no devolvió un mensaje. Intenta de nuevo.", 502);
  return mensaje;
}

/** Una acción sobre el mensaje de una línea. Devuelve la línea como queda. */
export async function accionMensaje(o: {
  ordenId: string;
  lineaId: string;
  accion: AccionMensaje;
  texto?: unknown;
  via?: unknown;
  usuario: Usuario;
}): Promise<EntradaActividad> {
  const linea = await leerLinea(o.ordenId, o.lineaId);
  if (!linea.puedeMensaje) throw new ErrorActividad("Esta línea no puede tener mensaje para el cliente.");
  const enviado = !!linea.mensaje?.enviado;

  if (o.accion === "descartar") {
    if (enviado) throw new ErrorActividad("Ese mensaje ya se envió: queda en la actividad.");
    return aEntrada(await patch(AIRTABLE_TABLES.historial, o.lineaId, { "Estado Generado IA": "" }));
  }

  if (o.accion === "crear" || o.accion === "corto" || o.accion === "otro" || o.accion === "talCual") {
    if (enviado && o.accion !== "crear") throw new ErrorActividad("Ese mensaje ya se envió.");
    const nuevo = o.accion === "talCual" ? linea.texto : await redactar(o.ordenId, linea, o.accion);
    // Un mensaje nuevo sobre una línea ya enviada empieza de cero (sin marca de envío).
    return aEntrada(await patch(AIRTABLE_TABLES.historial, o.lineaId, {
      "Estado Generado IA": nuevo, "Mensaje enviado": null, "Mensaje enviado por": "",
    }));
  }

  const r = revisarMensaje(o.texto);
  if (!r.ok) throw new ErrorActividad(r.error);

  if (o.accion === "guardar") {
    if (enviado) throw new ErrorActividad("Ese mensaje ya se envió: no se cambia.");
    return aEntrada(await patch(AIRTABLE_TABLES.historial, o.lineaId, { "Estado Generado IA": r.texto }));
  }

  // enviar (WhatsApp) o copiar (para WhatsApp de escritorio)
  const via: ViaMensaje = o.via === "Copiado" ? "Copiado" : "WhatsApp";
  const ahora = new Date().toISOString();
  const fila = await patch(AIRTABLE_TABLES.historial, o.lineaId, {
    "Estado Generado IA": r.texto,
    "Mensaje enviado": ahora,
    "Mensaje enviado por": textoEnviadoPor(o.usuario.nombre || o.usuario.email, via),
  });
  // Mandarle algo al cliente cuenta como movimiento; con la orden Completado, además queda «Cliente avisado».
  const orden = (await porIds(AIRTABLE_TABLES.ordenes, [o.ordenId], ["Estado Actual"]).catch(() => new Map())).get(o.ordenId);
  const campos: Record<string, unknown> = { "Último movimiento": ahora };
  if (orden && texto(orden.fields["Estado Actual"]) === "Completado") campos["Cliente avisado"] = ahora;
  await patch(AIRTABLE_TABLES.ordenes, o.ordenId, campos).catch((e) => console.error("[actividad] mensaje enviado → orden", e));
  olvidarAlertas();
  return aEntrada(fila);
}
