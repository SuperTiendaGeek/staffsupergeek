import "server-only";

import { Resend } from "resend";
import { listPortalUsers } from "@/lib/airtable";
import type { PortalUser } from "@/types/admin-users";
import type { CrearNotificacionInput, Notificacion } from "@/types/notificaciones";

const NOTIFICACIONES_TABLE = process.env.AIRTABLE_NOTIFICACIONES_TABLE?.trim() || "Notificaciones";
const DEFAULT_LIMIT = 20;

const NOTIFICACIONES_FIELDS = {
  destinatario: "Destinatario",
  correoDestinatario: "Correo Destinatario",
  tipo: "Tipo",
  titulo: "Título",
  mensaje: "Mensaje",
  urlAccion: "URL Acción",
  estado: "Estado",
  prioridad: "Prioridad",
  enviarEmail: "Enviar Email",
  estadoEmail: "Estado Email",
  errorEmail: "Error Email",
  entidadTipo: "Entidad Tipo",
  entidadId: "Entidad ID",
  creadoPor: "Creado por",
  fechaLeida: "Fecha Leída",
  creado: "Creado"
} as const;

type AirtableRecord<TFields> = {
  id: string;
  fields: TFields;
};

type AirtableListResponse<TFields> = {
  records: Array<AirtableRecord<TFields>>;
  offset?: string;
};

type NotificacionFields = {
  Destinatario?: string[];
  "Correo Destinatario"?: string[] | string;
  Tipo?: string;
  "Título"?: string;
  Mensaje?: string;
  "URL Acción"?: string;
  Estado?: string;
  Prioridad?: string;
  "Enviar Email"?: boolean;
  "Estado Email"?: string;
  "Error Email"?: string;
  "Entidad Tipo"?: string;
  "Entidad ID"?: string;
  "Creado por"?: string[];
  "Fecha Leída"?: string;
  Creado?: string;
};

export type NotificacionesAdminFilters = {
  usuarioId?: string;
  estado?: string;
  tipo?: string;
  prioridad?: string;
  limit?: number;
};

function getRequiredEnv(name: "AIRTABLE_API_KEY" | "AIRTABLE_BASE_ID") {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing Airtable environment variable: ${name}`);
  }

  return value;
}

function getAirtableHeaders() {
  return {
    Authorization: `Bearer ${getRequiredEnv("AIRTABLE_API_KEY")}`,
    "Content-Type": "application/json"
  };
}

function getTableUrl(recordId?: string) {
  const recordPath = recordId ? `/${encodeURIComponent(recordId)}` : "";

  return `https://api.airtable.com/v0/${getRequiredEnv("AIRTABLE_BASE_ID")}/${encodeURIComponent(NOTIFICACIONES_TABLE)}${recordPath}`;
}

function escapeFormulaString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function isAirtableRecordId(value?: string | null) {
  return Boolean(value && /^rec[a-zA-Z0-9]{14}$/.test(value));
}

function debugNotificaciones(message: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.info(`[notificaciones] ${message}`, payload);
}

async function parseAirtableJson<T>(response: Response) {
  return (await response.json()) as T;
}

async function airtableRequest<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...getAirtableHeaders(),
      ...(init?.headers || {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Airtable notificaciones request failed with status ${response.status}: ${responseText}`);
  }

  return parseAirtableJson<T>(response);
}

async function listAllNotificaciones(query: URLSearchParams) {
  const records: Array<AirtableRecord<NotificacionFields>> = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams(query);

    if (offset) {
      params.set("offset", offset);
    }

    const data = await airtableRequest<AirtableListResponse<NotificacionFields>>(`${getTableUrl()}?${params}`);
    records.push(...data.records);
    offset = data.offset;
  } while (offset);

  return records;
}

function getLookupText(value?: string[] | string) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(", ");
  }

  return value || "";
}

function mapNotificacion(record: AirtableRecord<NotificacionFields>): Notificacion {
  const fields = record.fields;

  return {
    id: record.id,
    destinatarioIds: fields[NOTIFICACIONES_FIELDS.destinatario] || [],
    correoDestinatario: getLookupText(fields[NOTIFICACIONES_FIELDS.correoDestinatario]),
    tipo: fields[NOTIFICACIONES_FIELDS.tipo] || "Sistema",
    titulo: fields[NOTIFICACIONES_FIELDS.titulo] || "Notificación",
    mensaje: fields[NOTIFICACIONES_FIELDS.mensaje] || "",
    urlAccion: fields[NOTIFICACIONES_FIELDS.urlAccion],
    estado: fields[NOTIFICACIONES_FIELDS.estado] || "No leída",
    prioridad: fields[NOTIFICACIONES_FIELDS.prioridad] || "Normal",
    enviarEmail: fields[NOTIFICACIONES_FIELDS.enviarEmail] === true,
    estadoEmail: fields[NOTIFICACIONES_FIELDS.estadoEmail],
    errorEmail: fields[NOTIFICACIONES_FIELDS.errorEmail],
    entidadTipo: fields[NOTIFICACIONES_FIELDS.entidadTipo],
    entidadId: fields[NOTIFICACIONES_FIELDS.entidadId],
    creadoPorIds: fields[NOTIFICACIONES_FIELDS.creadoPor] || [],
    fechaLeida: fields[NOTIFICACIONES_FIELDS.fechaLeida],
    creado: fields[NOTIFICACIONES_FIELDS.creado]
  };
}

function enrichNotificacionesWithUsers(notifications: Notificacion[], users: PortalUser[]) {
  const usersById = new Map(users.map((user) => [user.id, user]));

  return notifications.map((notification) => {
    const firstDestinatarioId = notification.destinatarioIds[0];
    const user = firstDestinatarioId ? usersById.get(firstDestinatarioId) : undefined;

    return {
      ...notification,
      destinatarioNombre: user?.nombre,
      destinatarioEmail: user?.email || notification.correoDestinatario
    };
  });
}

function assertUserId(usuarioId: string) {
  if (!isAirtableRecordId(usuarioId)) {
    throw new Error("El usuario autenticado no tiene un record ID válido.");
  }
}

function notificationBelongsToUser(notification: Notificacion, usuarioId: string) {
  return notification.destinatarioIds.includes(usuarioId);
}

export async function contarNotificacionesNoLeidas(usuarioId: string) {
  assertUserId(usuarioId);

  const records = await listAllNotificaciones(new URLSearchParams({
    pageSize: "100",
    filterByFormula: `{${NOTIFICACIONES_FIELDS.estado}} = 'No leída'`
  }));
  const notifications = records.map(mapNotificacion).filter((notification) => notificationBelongsToUser(notification, usuarioId));

  debugNotificaciones("conteo no leidas", {
    usuarioId,
    formula: `{${NOTIFICACIONES_FIELDS.estado}} = 'No leída'`,
    registrosAirtable: records.length,
    notificacionesUsuario: notifications.length,
    destinatariosEncontrados: notifications.map((notification) => notification.destinatarioIds)
  });

  return notifications.length;
}

export async function obtenerNotificacionesUsuario(usuarioId: string, options?: { limit?: number; includeArchived?: boolean }) {
  assertUserId(usuarioId);

  const formulas: string[] = [];

  if (!options?.includeArchived) {
    formulas.push(`{${NOTIFICACIONES_FIELDS.estado}} != 'Archivada'`);
  }

  const limit = options?.limit || DEFAULT_LIMIT;
  const records = await listAllNotificaciones(new URLSearchParams({
    pageSize: "100",
    ...(formulas.length ? { filterByFormula: formulas.length === 1 ? formulas[0] : `AND(${formulas.join(", ")})` } : {}),
    "sort[0][field]": NOTIFICACIONES_FIELDS.creado,
    "sort[0][direction]": "desc"
  }));

  const notifications = records
    .map(mapNotificacion)
    .filter((notification) => notificationBelongsToUser(notification, usuarioId))
    .slice(0, limit);

  debugNotificaciones("notificaciones usuario", {
    usuarioId,
    formula: formulas.length ? formulas.join(" AND ") : "sin formula de usuario; filtro por record ID en servidor",
    registrosAirtable: records.length,
    notificacionesUsuario: notifications.length,
    destinatariosEncontrados: notifications.map((notification) => notification.destinatarioIds)
  });

  return notifications;
}

export async function obtenerNotificacionesAdmin(filters: NotificacionesAdminFilters = {}) {
  const formulas: string[] = [];
  const usuarioId = filters.usuarioId && isAirtableRecordId(filters.usuarioId) ? filters.usuarioId : "";

  if (filters.estado) {
    formulas.push(`{${NOTIFICACIONES_FIELDS.estado}} = '${escapeFormulaString(filters.estado)}'`);
  }

  if (filters.tipo) {
    formulas.push(`{${NOTIFICACIONES_FIELDS.tipo}} = '${escapeFormulaString(filters.tipo)}'`);
  }

  if (filters.prioridad) {
    formulas.push(`{${NOTIFICACIONES_FIELDS.prioridad}} = '${escapeFormulaString(filters.prioridad)}'`);
  }

  const query = new URLSearchParams({
    maxRecords: String(filters.limit || 100),
    "sort[0][field]": NOTIFICACIONES_FIELDS.creado,
    "sort[0][direction]": "desc"
  });

  if (formulas.length) {
    query.set("filterByFormula", formulas.length === 1 ? formulas[0] : `AND(${formulas.join(", ")})`);
  }

  const records = await listAllNotificaciones(query);
  const users = await listPortalUsers();

  const notifications = records
    .map(mapNotificacion)
    .filter((notification) => !usuarioId || notificationBelongsToUser(notification, usuarioId));

  return enrichNotificacionesWithUsers(notifications, users);
}

async function fetchNotificacionById(id: string) {
  if (!isAirtableRecordId(id)) {
    return null;
  }

  const record = await airtableRequest<AirtableRecord<NotificacionFields>>(getTableUrl(id));

  return mapNotificacion(record);
}

export async function marcarNotificacionComoLeida(notificacionId: string, usuarioId: string) {
  assertUserId(usuarioId);
  const notification = await fetchNotificacionById(notificacionId);

  if (!notification || !notificationBelongsToUser(notification, usuarioId)) {
    throw new Error("No se encontró la notificación para este usuario.");
  }

  if (notification.estado === "Leída") {
    return notification;
  }

  const record = await airtableRequest<AirtableRecord<NotificacionFields>>(getTableUrl(notificacionId), {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        [NOTIFICACIONES_FIELDS.estado]: "Leída",
        [NOTIFICACIONES_FIELDS.fechaLeida]: new Date().toISOString()
      }
    })
  });

  return mapNotificacion(record);
}

export async function marcarTodasComoLeidas(usuarioId: string) {
  assertUserId(usuarioId);
  const notifications = await obtenerNotificacionesUsuario(usuarioId, { limit: 1000, includeArchived: false });
  const unread = notifications.filter((notification) => notification.estado === "No leída");

  await Promise.all(unread.map((notification) => marcarNotificacionComoLeida(notification.id, usuarioId)));

  return unread.length;
}

async function updateEmailStatus(recordId: string, estadoEmail: string, errorEmail?: string) {
  await airtableRequest<AirtableRecord<NotificacionFields>>(getTableUrl(recordId), {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        [NOTIFICACIONES_FIELDS.estadoEmail]: estadoEmail,
        ...(errorEmail ? { [NOTIFICACIONES_FIELDS.errorEmail]: errorEmail } : {})
      }
    })
  });
}

async function maybeSendEmail(recordId: string, input: CrearNotificacionInput) {
  if (!input.enviarEmail) {
    return;
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim() || process.env.EMAIL_FROM?.trim();

  if (!apiKey || !from) {
    await updateEmailStatus(recordId, "Error", "Resend no está configurado.");
    return;
  }

  const destinatario = (await listPortalUsers()).find((user) => user.id === input.destinatarioId);

  if (!destinatario?.email) {
    await updateEmailStatus(recordId, "Error", "El destinatario no tiene correo.");
    return;
  }

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from,
      to: destinatario.email,
      subject: input.titulo,
      text: `${input.mensaje}${input.urlAccion ? `\n\nVer en el portal: ${input.urlAccion}` : ""}`
    });
    await updateEmailStatus(recordId, "Enviado");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido al enviar email.";
    await updateEmailStatus(recordId, "Error", message);
  }
}

export async function crearNotificacion(input: CrearNotificacionInput) {
  const destinatarioId = input.destinatarioId.trim();
  const titulo = input.titulo.trim();
  const mensaje = input.mensaje.trim();

  if (!isAirtableRecordId(destinatarioId)) {
    throw new Error("El destinatario no es válido.");
  }

  if (!titulo || !mensaje) {
    throw new Error("Título y mensaje son obligatorios.");
  }

  const fields: NotificacionFields = {
    [NOTIFICACIONES_FIELDS.destinatario]: [destinatarioId],
    [NOTIFICACIONES_FIELDS.tipo]: input.tipo || "Sistema",
    [NOTIFICACIONES_FIELDS.titulo]: titulo,
    [NOTIFICACIONES_FIELDS.mensaje]: mensaje,
    [NOTIFICACIONES_FIELDS.estado]: "No leída",
    [NOTIFICACIONES_FIELDS.prioridad]: input.prioridad || "Normal",
    [NOTIFICACIONES_FIELDS.enviarEmail]: input.enviarEmail === true,
    [NOTIFICACIONES_FIELDS.estadoEmail]: input.enviarEmail ? "Pendiente" : "No aplica"
  };

  if (input.urlAccion?.trim()) {
    fields[NOTIFICACIONES_FIELDS.urlAccion] = input.urlAccion.trim();
  }

  if (input.entidadTipo?.trim()) {
    fields[NOTIFICACIONES_FIELDS.entidadTipo] = input.entidadTipo.trim();
  }

  if (input.entidadId?.trim()) {
    fields[NOTIFICACIONES_FIELDS.entidadId] = input.entidadId.trim();
  }

  if (isAirtableRecordId(input.creadoPorId)) {
    fields[NOTIFICACIONES_FIELDS.creadoPor] = [input.creadoPorId as string];
  }

  const record = await airtableRequest<AirtableRecord<NotificacionFields>>(getTableUrl(), {
    method: "POST",
    body: JSON.stringify({ fields })
  });

  debugNotificaciones("notificacion creada", {
    id: record.id,
    destinatarioId,
    destinatarioGuardado: record.fields[NOTIFICACIONES_FIELDS.destinatario],
    tipo: fields[NOTIFICACIONES_FIELDS.tipo],
    estado: fields[NOTIFICACIONES_FIELDS.estado]
  });

  await maybeSendEmail(record.id, input);

  const fresh = await fetchNotificacionById(record.id);

  const [notification] = enrichNotificacionesWithUsers([fresh || mapNotificacion(record)], await listPortalUsers());

  return notification;
}
