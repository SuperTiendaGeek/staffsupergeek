export const NOTIFICACION_TIPOS = ["Amonestación", "Tarea", "Sistema", "Pago", "Horario", "Pedido", "Reparación", "Otro"] as const;
export const NOTIFICACION_ESTADOS = ["No leída", "Leída", "Archivada"] as const;
export const NOTIFICACION_PRIORIDADES = ["Normal", "Alta", "Crítica"] as const;
export const NOTIFICACION_ENTIDAD_TIPOS = ["Amonestación", "Tarea", "Pago", "Jornada", "Pedido", "Orden Reparación", "Sistema"] as const;

export type NotificacionTipo = (typeof NOTIFICACION_TIPOS)[number];
export type NotificacionEstado = (typeof NOTIFICACION_ESTADOS)[number];
export type NotificacionPrioridad = (typeof NOTIFICACION_PRIORIDADES)[number];
export type NotificacionEntidadTipo = (typeof NOTIFICACION_ENTIDAD_TIPOS)[number];

export type Notificacion = {
  id: string;
  destinatarioIds: string[];
  destinatarioNombre?: string;
  destinatarioEmail?: string;
  correoDestinatario?: string;
  tipo: NotificacionTipo | string;
  titulo: string;
  mensaje: string;
  urlAccion?: string;
  estado: NotificacionEstado | string;
  prioridad: NotificacionPrioridad | string;
  enviarEmail: boolean;
  estadoEmail?: string;
  errorEmail?: string;
  entidadTipo?: NotificacionEntidadTipo | string;
  entidadId?: string;
  creadoPorIds: string[];
  fechaLeida?: string;
  creado?: string;
};

export type CrearNotificacionInput = {
  destinatarioId: string;
  tipo: NotificacionTipo | string;
  titulo: string;
  mensaje: string;
  urlAccion?: string | null;
  prioridad?: NotificacionPrioridad | string;
  enviarEmail?: boolean;
  entidadTipo?: NotificacionEntidadTipo | string | null;
  entidadId?: string | null;
  creadoPorId?: string | null;
};
