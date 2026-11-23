// Actividad de la orden — reglas PURAS (rediseño de la orden, parte R3 ·
// 22-nov-2026, decisión 4 del dueño).
//
// Antes: el historial mezclaba cambios de estado y notas en un solo texto, la
// «nota interna» era un campo aparte (y se usaba para la contraseña) y el
// mensaje al cliente salía de una automatización de Airtable
// («Generar mensaje IA»).
//
// Ahora (RepairDesk / RepairShopr: una sola línea de tiempo; nota privada o
// pública): todo lo que pasa en la orden va a UNA lista, la más reciente
// arriba:
//   · Notas de las personas: «Interna» (solo el personal) o «Al cliente»
//     (se ve en su enlace; se puede enviar por WhatsApp).
//   · Lo que entra solo: cambios de estado y de trabajos, pagos, la
//     aprobación del cliente por el enlace, regresos, reaperturas…
//   · ✨ redacta el mensaje para el cliente con la IA (borrador que la persona
//     revisa antes de guardar).
//
// Sin red ni Airtable: lo usan la ruta de la actividad, la tarjeta y el enlace.

export const TIPOS_ACTIVIDAD = [
  "Nota", "Cambio de estado", "Trabajo", "Pago", "Aprobación del cliente", "Aviso al cliente",
  "Responsable", "Alerta pospuesta", "Contraseña vista", "Reapertura", "Regreso", "Sistema",
] as const;
export type TipoActividad = (typeof TIPOS_ACTIVIDAD)[number];

export const VISIBILIDADES = ["Interna", "Al cliente"] as const;
export type Visibilidad = (typeof VISIBILIDADES)[number];

export const FILTROS_ACTIVIDAD = ["Todo", "Notas", "Al cliente", "Pagos"] as const;
export type FiltroActividad = (typeof FILTROS_ACTIVIDAD)[number];

export const NOTA_MIN = 2;
export const NOTA_MAX = 2000;
/** Cuántas se ven antes de «Ver toda la actividad». */
export const VISIBLES_AL_INICIO = 5;

const ESTADOS_ORDEN = ["Pendiente", "En Proceso", "Esperando Respuesta", "Completado", "Finalizado Entregado", "Enviado a Reciclaje"];

const nombre = (v: unknown): string =>
  typeof v === "string" ? v.trim() : v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name ?? "").trim() : "";

export function normalizarTipo(v: unknown): TipoActividad | "" {
  const t = nombre(v);
  return (TIPOS_ACTIVIDAD as readonly string[]).includes(t) ? (t as TipoActividad) : "";
}

export function normalizarVisibilidad(v: unknown): Visibilidad | "" {
  const t = nombre(v);
  return (VISIBILIDADES as readonly string[]).includes(t) ? (t as Visibilidad) : "";
}

export type EntradaActividad = {
  id: string;
  /** De dónde sale: una fila del historial, un pago o una respuesta del cliente. */
  origen: "historial" | "pago" | "aprobacion";
  tipo: TipoActividad;
  visibilidad: Visibilidad;
  /** ISO. */
  fecha: string;
  texto: string;
  autor: string;
  /** Mensaje para el cliente que dejó la automatización vieja («Generar mensaje IA»). */
  mensajeAnterior?: string;
  /** Pago anulado: se muestra tachado. */
  anulado?: boolean;
};

/**
 * Una fila del historial. Las viejas no traen tipo ni visibilidad: si el
 * texto es solo un estado de la orden es un cambio de estado; lo demás, una
 * nota interna (decisión del dueño: el historial viejo pasa como «Interna»).
 */
export function deHistorial(h: {
  id: string; texto: string; fecha: string; autor: string;
  tipo?: unknown; visibilidad?: unknown; mensajeIA?: string | null;
}): EntradaActividad {
  const texto = (h.texto ?? "").trim();
  const tipo = normalizarTipo(h.tipo) || (ESTADOS_ORDEN.includes(texto) ? "Cambio de estado" : "Nota");
  const visibilidad = normalizarVisibilidad(h.visibilidad) || "Interna";
  const mensaje = (h.mensajeIA ?? "").trim();
  return {
    id: h.id, origen: "historial", tipo, visibilidad, fecha: h.fecha, autor: h.autor,
    texto: tipo === "Cambio de estado" && ESTADOS_ORDEN.includes(texto) ? `Estado: ${texto}` : texto,
    ...(mensaje ? { mensajeAnterior: mensaje } : {}),
  };
}

const dinero = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;

/** Un pago de la cuenta: «Pago $160.00 · Transferencia · ABO-000316». */
export function dePago(a: { id: string; idAbono: string | null; fecha: string | null; monto: number; metodoPago: string | null; estado: string; registradoPor?: string | null }): EntradaActividad {
  const anulado = a.estado === "Anulado";
  return {
    id: `pago:${a.id}`, origen: "pago", tipo: "Pago", visibilidad: "Interna",
    fecha: a.fecha ?? "", autor: a.registradoPor ?? "",
    texto: [`Pago ${dinero(a.monto)}`, a.metodoPago, a.idAbono, anulado ? "anulado" : ""].filter(Boolean).join(" · "),
    ...(anulado ? { anulado: true } : {}),
  };
}

/** Una respuesta firmada del cliente en su enlace. */
export function deRespuesta(r: { id: string; fecha: string; nombre: string; detalle: Array<{ decision: string; cantidad: number; precioUnitario: number }> }): EntradaActividad {
  const aprobadas = r.detalle.filter((d) => d.decision === "aprobar");
  const total = aprobadas.reduce((s, d) => s + d.cantidad * d.precioUnitario, 0);
  const no = r.detalle.length - aprobadas.length;
  const partes = [
    aprobadas.length ? `aprobó ${aprobadas.length} ${aprobadas.length === 1 ? "línea" : "líneas"} · ${dinero(total)}` : "",
    no ? `no aprobó ${no}` : "",
  ].filter(Boolean);
  return {
    id: `respuesta:${r.id}`, origen: "aprobacion", tipo: "Aprobación del cliente", visibilidad: "Al cliente",
    fecha: r.fecha, autor: r.nombre,
    texto: `El cliente ${partes.join(", ") || "respondió"} por el enlace`,
  };
}

/** Más reciente arriba; las que no tienen fecha, al final. */
export function ordenar(entradas: readonly EntradaActividad[]): EntradaActividad[] {
  return [...entradas].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
}

export function filtrar(entradas: readonly EntradaActividad[], filtro: FiltroActividad): EntradaActividad[] {
  if (filtro === "Notas") return entradas.filter((e) => e.tipo === "Nota");
  if (filtro === "Pagos") return entradas.filter((e) => e.tipo === "Pago");
  if (filtro === "Al cliente") return entradas.filter((e) => e.visibilidad === "Al cliente" || e.tipo === "Aviso al cliente");
  return [...entradas];
}

/** Solo las notas de las personas se corrigen o se borran; lo automático, no. */
export const esEditable = (e: Pick<EntradaActividad, "origen" | "tipo">): boolean => e.origen === "historial" && e.tipo === "Nota";

export function revisarNota(o: { texto: unknown; visibilidad: unknown }): { ok: true; texto: string; visibilidad: Visibilidad } | { ok: false; error: string } {
  const texto = typeof o.texto === "string" ? o.texto.trim() : "";
  if (texto.length < NOTA_MIN) return { ok: false, error: "Escribe la nota." };
  if (texto.length > NOTA_MAX) return { ok: false, error: `Muy larga (máximo ${NOTA_MAX} letras).` };
  const visibilidad = normalizarVisibilidad(o.visibilidad);
  if (!visibilidad) return { ok: false, error: "Elige si es interna o para el cliente." };
  return { ok: true, texto, visibilidad };
}

/** Lo que el cliente ve en «Novedades» de su enlace: solo lo escrito para él. */
export function novedadesParaCliente(entradas: readonly EntradaActividad[], max = 10): Array<{ fecha: string; texto: string }> {
  return ordenar(entradas)
    .filter((e) => e.origen === "historial" && e.visibilidad === "Al cliente" && (e.tipo === "Nota" || e.tipo === "Aviso al cliente"))
    .slice(0, max)
    .map((e) => ({ fecha: e.fecha, texto: e.texto }));
}
