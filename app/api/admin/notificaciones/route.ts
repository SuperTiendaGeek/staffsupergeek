import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { listPortalUsers } from "@/lib/airtable";
import { crearNotificacion, obtenerNotificacionesAdmin } from "@/lib/notificaciones/airtable";
import { NOTIFICACION_ENTIDAD_TIPOS, NOTIFICACION_PRIORIDADES, NOTIFICACION_TIPOS } from "@/types/notificaciones";

export const dynamic = "force-dynamic";

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isAllowed(value: string, allowed: readonly string[]) {
  return allowed.includes(value);
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeString(item)).filter(Boolean);
}

function isAirtableRecordId(value: string) {
  return /^rec[a-zA-Z0-9]{14}$/.test(value);
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
  const enviarATodos = body?.enviarATodos === true;
  const destinatarioIdsInput = normalizeStringArray(body?.destinatarioIds);
  const destinatarioIdLegacy = normalizeString(body?.destinatarioId);
  const destinatarioIds = Array.from(
    new Set([...(destinatarioIdsInput.length ? destinatarioIdsInput : []), ...(destinatarioIdLegacy ? [destinatarioIdLegacy] : [])])
  );
  const tipo = normalizeString(body?.tipo) || "Sistema";
  const titulo = normalizeString(body?.titulo);
  const mensaje = normalizeString(body?.mensaje);
  const prioridad = normalizeString(body?.prioridad) || "Normal";
  const entidadTipo = normalizeString(body?.entidadTipo);

  if ((!enviarATodos && destinatarioIds.length === 0) || !titulo || !mensaje) {
    return NextResponse.json({ success: false, error: "Destinatarios, título y mensaje son obligatorios" }, { status: 400 });
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
    const users = await listPortalUsers();
    const activeUsers = users.filter((user) => user.activo);
    const allTargetUsers = activeUsers.length > 0 ? activeUsers : users;
    const allowedUserIds = new Set(users.map((user) => user.id));
    const targetIds = enviarATodos ? allTargetUsers.map((user) => user.id) : destinatarioIds;
    const invalidIds = targetIds.filter((id) => !isAirtableRecordId(id) || !allowedUserIds.has(id));

    if (invalidIds.length > 0) {
      return NextResponse.json({ success: false, error: "Uno o más destinatarios no son válidos" }, { status: 400 });
    }

    if (targetIds.length === 0) {
      return NextResponse.json({ success: false, error: "No hay destinatarios disponibles" }, { status: 400 });
    }

    const notifications = [];
    const errores: Array<{ destinatarioId: string; error: string }> = [];

    for (const destinatarioId of targetIds) {
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
        notifications.push(notification);
      } catch (error) {
        errores.push({
          destinatarioId,
          error: error instanceof Error ? error.message : "No se pudo crear la notificación"
        });
      }
    }

    const totalEmailsEnviados = notifications.filter((notification) => notification.estadoEmail === "Enviado").length;
    const totalEmailsError = notifications.filter((notification) => notification.estadoEmail === "Error").length;
    const summary = {
      totalCreadas: notifications.length,
      totalEmailsEnviados,
      totalEmailsError,
      errores
    };

    return NextResponse.json({ success: notifications.length > 0, summary, notifications }, { status: notifications.length > 0 ? 201 : 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo crear la notificación";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
