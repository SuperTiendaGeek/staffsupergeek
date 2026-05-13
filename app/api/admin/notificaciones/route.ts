import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { crearNotificacion, obtenerNotificacionesAdmin } from "@/lib/notificaciones/airtable";
import { NOTIFICACION_ENTIDAD_TIPOS, NOTIFICACION_PRIORIDADES, NOTIFICACION_TIPOS } from "@/types/notificaciones";

export const dynamic = "force-dynamic";

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isAllowed(value: string, allowed: readonly string[]) {
  return allowed.includes(value);
}

export async function GET(request: Request) {
  const { response } = await requireAdminSession();

  if (response) {
    return response;
  }

  const url = new URL(request.url);

  try {
    const notifications = await obtenerNotificacionesAdmin({
      usuarioId: normalizeString(url.searchParams.get("usuarioId")),
      estado: normalizeString(url.searchParams.get("estado")),
      tipo: normalizeString(url.searchParams.get("tipo")),
      prioridad: normalizeString(url.searchParams.get("prioridad")),
      limit: 100
    });

    return NextResponse.json({ success: true, notifications });
  } catch (error) {
    console.error("Error al listar notificaciones admin:", error);
    return NextResponse.json({ success: false, error: "No se pudieron cargar las notificaciones" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { session, response } = await requireAdminSession();

  if (response) {
    return response;
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const destinatarioId = normalizeString(body?.destinatarioId);
  const tipo = normalizeString(body?.tipo) || "Sistema";
  const titulo = normalizeString(body?.titulo);
  const mensaje = normalizeString(body?.mensaje);
  const prioridad = normalizeString(body?.prioridad) || "Normal";
  const entidadTipo = normalizeString(body?.entidadTipo);

  if (!destinatarioId || !titulo || !mensaje) {
    return NextResponse.json({ success: false, error: "Destinatario, título y mensaje son obligatorios" }, { status: 400 });
  }

  if (!isAllowed(tipo, NOTIFICACION_TIPOS)) {
    return NextResponse.json({ success: false, error: "Tipo de notificación inválido" }, { status: 400 });
  }

  if (!isAllowed(prioridad, NOTIFICACION_PRIORIDADES)) {
    return NextResponse.json({ success: false, error: "Prioridad inválida" }, { status: 400 });
  }

  if (entidadTipo && !isAllowed(entidadTipo, NOTIFICACION_ENTIDAD_TIPOS)) {
    return NextResponse.json({ success: false, error: "Tipo de entidad inválido" }, { status: 400 });
  }

  try {
    const notification = await crearNotificacion({
      destinatarioId,
      tipo,
      titulo,
      mensaje,
      prioridad,
      urlAccion: normalizeString(body?.urlAccion) || null,
      enviarEmail: body?.enviarEmail === true,
      entidadTipo: entidadTipo || null,
      entidadId: normalizeString(body?.entidadId) || null,
      creadoPorId: session.user.userId
    });

    return NextResponse.json({ success: true, notification }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo crear la notificación";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
