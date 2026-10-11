// Novedades de Shipping V2. Módulo puro: sin red, testeable.
//
// ─── Reglas del dueño (auditoría punto 8, 9 y 10-oct-2026) ──────────────────
//
// · Una novedad es un problema encontrado en un artículo que TODAVÍA es de la
//   tienda. Sobre algo vendido, agotado o dado de baja no se registra: eso es
//   la garantía de SUPER GEEK al cliente (orden de reparación; punto 16).
//
// · Solo 3 estados: Abierta → En solución → Cerrada. Mientras está Abierta se
//   muestra de quién es el turno ("Esperando al proveedor" / "Respondió el
//   proveedor"); no hacen falta más estados.
//
// · El TIPO decide quién la resuelve (ya no se pregunta):
//     Incompleto, Dañado, Diferente al comprado, Observación menor
//       → garantía del PROVEEDOR: se le notifica y conversa con él.
//     Asunto interno, Perdido en tienda → la resolvemos NOSOTROS.
//
// · Conversación con el proveedor: él SOLO responde (con una propuesta);
//   nosotros aceptamos (resolvemos) o le contestamos, con historial, hasta
//   aceptar. Por los proveedores sin portal escribe alguien de la tienda.
//
// · Bloqueo de venta: lo decide quien registra (casilla "Bloquear venta");
//   cualquiera del personal puede bloquear después; SOLO el Administrador
//   desbloquea, aunque la novedad ya esté cerrada. El bloqueo impide reservar
//   y vender. "Perdido en tienda" siempre bloquea.
//
// · Al resolver se elige QUÉ PASA CON EL ARTÍCULO y el sistema lo ejecuta.
//   "Se descarta" desapareció: se usaba creyendo que se descartaba la
//   novedad. Dar de baja, Va a despiece, Pasa a activo, Devuelto al proveedor
//   y No procedía son SOLO del Administrador.
//
// · Lo que ofrece el proveedor (Reemplazo, Reembolso, Crédito a favor, Sin
//   compensación) solo se registra: NO cambia el costo del artículo.

function normalize(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// ─── Estados ─────────────────────────────────────────────────────────────────

export const SHIPPING_V2_NOVEDAD_ESTADOS = ["Abierta", "En solución", "Cerrada"] as const;
export type ShippingV2NovedadEstadoReal = (typeof SHIPPING_V2_NOVEDAD_ESTADOS)[number];

/**
 * Estados de diseños anteriores. No hay ningún registro en ellos (10-oct), pero
 * si apareciera uno se lee con su equivalente de 3 estados en vez de romper.
 */
const ESTADOS_LEGADO: Record<string, ShippingV2NovedadEstadoReal> = {
  "en revision interna": "Abierta",
  "enviada a proveedor": "Abierta",
  "esperando respuesta": "Abierta",
  "respondida por proveedor": "Abierta",
  escalada: "Abierta",
  rechazada: "Cerrada",
  "cerrada sin respuesta": "Cerrada",
};

const ESTADO_POR_NORMALIZADO = new Map<string, ShippingV2NovedadEstadoReal>(
  SHIPPING_V2_NOVEDAD_ESTADOS.map((estado) => [normalize(estado), estado])
);

export function normalizarEstadoNovedad(estado?: string | null): ShippingV2NovedadEstadoReal | null {
  const n = normalize(estado);
  return ESTADO_POR_NORMALIZADO.get(n) ?? ESTADOS_LEGADO[n] ?? null;
}

export function isNovedadCerrada(estado?: string | null): boolean {
  // fail-closed: un estado desconocido cuenta como abierto.
  return normalizarEstadoNovedad(estado) === "Cerrada";
}

export function isNovedadAbierta(estado?: string | null): boolean {
  return !isNovedadCerrada(estado);
}

// ─── Tipos y quién resuelve ──────────────────────────────────────────────────

export const SHIPPING_V2_TIPOS_PROVEEDOR = ["Incompleto", "Dañado", "Diferente al comprado", "Observación menor"] as const;
export const SHIPPING_V2_TIPOS_INTERNOS = ["Asunto interno", "Perdido en tienda"] as const;
export const SHIPPING_V2_TIPOS_NOVEDAD = [...SHIPPING_V2_TIPOS_PROVEEDOR, ...SHIPPING_V2_TIPOS_INTERNOS] as const;
export type ShippingV2TipoNovedad = (typeof SHIPPING_V2_TIPOS_NOVEDAD)[number];
export const TIPO_PERDIDO_EN_TIENDA = "Perdido en tienda";

export const SHIPPING_V2_NOVEDAD_RESPONSABLES = ["SUPER GEEK", "Proveedor"] as const;
export type ShippingV2NovedadResponsable = (typeof SHIPPING_V2_NOVEDAD_RESPONSABLES)[number];

export function normalizarTipoNovedad(tipo?: string | null): ShippingV2TipoNovedad | null {
  const n = normalize(tipo);
  return SHIPPING_V2_TIPOS_NOVEDAD.find((t) => normalize(t) === n) ?? null;
}

/** Quién resuelve según el tipo. null = tipo viejo o desconocido. */
export function responsableDeTipo(tipo?: string | null): ShippingV2NovedadResponsable | null {
  const t = normalizarTipoNovedad(tipo);
  if (!t) return null;
  return (SHIPPING_V2_TIPOS_PROVEEDOR as readonly string[]).includes(t) ? "Proveedor" : "SUPER GEEK";
}

export function esResponsableProveedor(responsable?: string | null): boolean {
  return normalize(responsable) === normalize("Proveedor");
}

export function esPerdidoEnTienda(tipo?: string | null): boolean {
  return normalize(tipo) === normalize(TIPO_PERDIDO_EN_TIENDA);
}

// ─── Lo que propone el proveedor (solo se registra) ─────────────────────────

export const SHIPPING_V2_PROPUESTAS_PROVEEDOR = [
  { valor: "Reemplazo", label: "Reemplazo" },
  { valor: "Reembolso", label: "Reembolso (total o parcial)" },
  { valor: "Crédito", label: "Crédito a favor" },
  { valor: "Sin compensación", label: "Sin compensación" },
] as const;

export function esPropuestaValida(valor?: string | null): boolean {
  const n = normalize(valor);
  return SHIPPING_V2_PROPUESTAS_PROVEEDOR.some((p) => normalize(p.valor) === n);
}

export function etiquetaPropuesta(valor?: string | null): string {
  const n = normalize(valor);
  return SHIPPING_V2_PROPUESTAS_PROVEEDOR.find((p) => normalize(p.valor) === n)?.label ?? String(valor || "");
}

// ─── Qué pasa con el artículo (lo ejecuta el sistema) ───────────────────────

export type ShippingV2DecisionArticulo =
  | "No requiere solución"
  | "Reparado"
  | "Se vende con descuento"
  | "Dar de baja"
  | "Va a despiece"
  | "Pasa a activo"
  | "Devuelto al proveedor"
  | "No procedía";

export type ShippingV2DecisionConfig = {
  valor: ShippingV2DecisionArticulo;
  ayuda: string;
  soloAdmin: boolean;
  /** Saca unidades de la venta (baja, despiece, activo, devolución). No se puede reabrir. */
  mueveArticulo: boolean;
  pidePrecio: boolean;
  pideCantidad: boolean;
};

export const SHIPPING_V2_DECISIONES_ARTICULO: readonly ShippingV2DecisionConfig[] = [
  { valor: "No requiere solución", ayuda: "El artículo queda igual.", soloAdmin: false, mueveArticulo: false, pidePrecio: false, pideCantidad: false },
  { valor: "Reparado", ayuda: "Se arregló (nosotros o con lo que mandó el proveedor). El artículo queda igual.", soloAdmin: false, mueveArticulo: false, pidePrecio: false, pideCantidad: false },
  { valor: "Se vende con descuento", ayuda: "Cambia el precio de venta del artículo.", soloAdmin: false, mueveArticulo: false, pidePrecio: true, pideCantidad: false },
  { valor: "Dar de baja", ayuda: "Esas unidades salen del inventario (se perdió, se dañó sin arreglo).", soloAdmin: true, mueveArticulo: true, pidePrecio: false, pideCantidad: true },
  { valor: "Va a despiece", ayuda: "Queda “Destinado a partes”; se desarma desde su ficha.", soloAdmin: true, mueveArticulo: true, pidePrecio: false, pideCantidad: false },
  { valor: "Pasa a activo", ayuda: "Esas unidades pasan a ser activos de la tienda.", soloAdmin: true, mueveArticulo: true, pidePrecio: false, pideCantidad: true },
  { valor: "Devuelto al proveedor", ayuda: "Esas unidades salen del inventario porque vuelven al proveedor.", soloAdmin: true, mueveArticulo: true, pidePrecio: false, pideCantidad: true },
  { valor: "No procedía", ayuda: "Error de registro: no había problema.", soloAdmin: true, mueveArticulo: false, pidePrecio: false, pideCantidad: false },
];

export function getDecisionConfig(valor?: string | null): ShippingV2DecisionConfig | null {
  const n = normalize(valor);
  return SHIPPING_V2_DECISIONES_ARTICULO.find((d) => normalize(d.valor) === n) ?? null;
}

/** Decisiones que se le ofrecen a quien resuelve. */
export function getDecisionesPermitidas(input: { tipo?: string | null; isSiteAdmin?: boolean }): ShippingV2DecisionConfig[] {
  const admin = input.isSiteAdmin === true;
  const perdido = esPerdidoEnTienda(input.tipo);
  return SHIPPING_V2_DECISIONES_ARTICULO.filter((d) => {
    if (d.soloAdmin && !admin) return false;
    // Lo perdido: o aparece, o se da de baja, o no procedía.
    if (perdido) return ["No requiere solución", "Dar de baja", "No procedía"].includes(d.valor);
    return true;
  });
}

// ─── Artículo: ¿sigue siendo de la tienda? ───────────────────────────────────

/** Estados en los que el artículo ya salió del inventario. */
const ESTADOS_SALIDA = new Set([
  "vendido",
  "agotado",
  "dado de baja",
  "cancelado",
  "usado en reparacion",
  "desarmado completamente",
  "desarmado parcialmente",
  "destinado a partes",
  "migrado",
  "archivado",
  "devuelto",
]);

export function articuloSalioDelInventario(a: { estado?: string | null; cantidad?: number | null }): boolean {
  if (ESTADOS_SALIDA.has(normalize(a.estado))) return true;
  return !(Number(a.cantidad) > 0);
}

/** Etiquetas que pone el bloqueo de venta. */
export const ETIQUETA_CON_NOVEDAD = "Con novedad";
export const ETIQUETA_PERDIDO = "Perdido en tienda";
export const ETIQUETAS_DE_BLOQUEO = [ETIQUETA_CON_NOVEDAD, ETIQUETA_PERDIDO] as const;

export function esEtiquetaDeBloqueo(estado?: string | null): boolean {
  const n = normalize(estado);
  return ETIQUETAS_DE_BLOQUEO.some((e) => normalize(e) === n);
}

/** ¿Esta novedad impide reservar y vender? Solo su casilla lo decide. */
export function esNovedadBloqueante(novedad: { bloqueaVenta?: boolean | null }): boolean {
  return novedad.bloqueaVenta === true;
}

/** Etiqueta que debe mostrar un artículo bloqueado por estas novedades. */
export function etiquetaDeBloqueo(novedades: Array<{ tipo?: string | null; bloqueaVenta?: boolean | null }>): string | null {
  const bloqueantes = novedades.filter(esNovedadBloqueante);
  if (!bloqueantes.length) return null;
  return bloqueantes.some((n) => esPerdidoEnTienda(n.tipo)) ? ETIQUETA_PERDIDO : ETIQUETA_CON_NOVEDAD;
}

/**
 * Etiqueta que tenía el artículo antes de bloquearse (la más reciente que no
 * sea de bloqueo). Respaldo para devolverlo a su etapa si todavía no llegó; al
 * desbloquear se usa primero la de la novedad que se desbloquea.
 */
export function estadoPrevioParaRestaurar(
  novedades: Array<{ estadoPrevioArticulo?: string | null; fechaRegistro?: string | null }>
): string | null {
  // La más reciente primero: es la etapa más cercana a donde estaba.
  const ordenadas = [...novedades].sort((a, b) => String(b.fechaRegistro || "").localeCompare(String(a.fechaRegistro || "")));
  for (const n of ordenadas) {
    const previo = String(n.estadoPrevioArticulo || "").trim();
    if (previo && !esEtiquetaDeBloqueo(previo)) return previo;
  }
  return null;
}

// ─── Registrar ───────────────────────────────────────────────────────────────

export type ValidacionRegistro =
  | { ok: true; tipo: ShippingV2TipoNovedad; responsable: ShippingV2NovedadResponsable; bloqueaVenta: boolean }
  | { ok: false; motivo: string };

export function validarRegistroNovedad(input: {
  tipo?: string | null;
  descripcion?: string | null;
  bloquearVenta?: boolean;
  esPersonalTienda: boolean;
  articulo: { estado?: string | null; cantidad?: number | null; recibido?: boolean | null; proveedorCompraId?: string | null };
}): ValidacionRegistro {
  if (!input.esPersonalTienda) return { ok: false, motivo: "Solo el personal de la tienda registra novedades." };
  const tipo = normalizarTipoNovedad(input.tipo);
  if (!tipo) return { ok: false, motivo: "Elige un tipo de novedad válido." };
  if (!String(input.descripcion || "").trim()) return { ok: false, motivo: "Describe la novedad." };
  if (articuloSalioDelInventario(input.articulo)) {
    return {
      ok: false,
      motivo: `Este artículo ya salió del inventario (${input.articulo.estado || "0 unidades"}). Si un cliente reclama una falla, abre una orden de reparación.`,
    };
  }
  const responsable = responsableDeTipo(tipo) ?? "SUPER GEEK";
  if (responsable === "Proveedor" && !String(input.articulo.proveedorCompraId || "").trim()) {
    return { ok: false, motivo: "Este artículo no tiene proveedor de compra a quien reclamar. Regístralo como “Asunto interno”." };
  }
  const perdido = esPerdidoEnTienda(tipo);
  if (perdido && input.articulo.recibido !== true) {
    return { ok: false, motivo: "“Perdido en tienda” es para lo que ya estaba en la tienda (Recibido). Si no llegó, usa “Incompleto”." };
  }
  return { ok: true, tipo, responsable, bloqueaVenta: perdido || input.bloquearVenta === true };
}

// ─── El hilo de la conversación ──────────────────────────────────────────────
//
// "Mensaje enviado al proveedor" (lo nuestro) y "Respuesta del proveedor" (lo
// suyo) se APENDEN con fecha y autor, para no perder nada al ir y venir.

const SEPARADOR_ENTRADA = /^\[(\d{4}-\d{2}-\d{2}T[^\]]+)\]\s*([^:]+):\s*/;

export type EntradaHilo = {
  fecha: string;
  autor: string;
  texto: string;
  lado: "super-geek" | "proveedor";
};

export function formatEntradaHilo(autor: string, texto: string, fechaISO = new Date().toISOString()): string {
  return `[${fechaISO}] ${autor.trim() || "Sin identificar"}: ${texto.trim()}`;
}

export function appendEntradaHilo(actual: string | undefined, autor: string, texto: string, fechaISO?: string): string {
  const entrada = formatEntradaHilo(autor, texto, fechaISO);
  const previo = (actual ?? "").trim();
  return previo ? `${previo}\n${entrada}` : entrada;
}

function parseCampoHilo(campo: string | undefined, lado: EntradaHilo["lado"]): EntradaHilo[] {
  const texto = (campo ?? "").trim();
  if (!texto) return [];

  const entradas: EntradaHilo[] = [];
  let actual: EntradaHilo | null = null;

  for (const linea of texto.split("\n")) {
    const match = linea.match(SEPARADOR_ENTRADA);
    if (match) {
      if (actual) entradas.push(actual);
      actual = { fecha: match[1], autor: match[2].trim(), texto: linea.slice(match[0].length), lado };
    } else if (actual) {
      actual.texto += `\n${linea}`;
    } else {
      // Texto anterior al formato con fecha (datos viejos escritos a mano).
      actual = { fecha: "", autor: lado === "proveedor" ? "Proveedor" : "SUPER GEEK", texto: linea, lado };
    }
  }
  if (actual) entradas.push(actual);
  return entradas.map((entrada) => ({ ...entrada, texto: entrada.texto.trim() })).filter((entrada) => entrada.texto);
}

export function construirHiloNovedad(novedad: {
  descripcion?: string;
  registradoPor?: string;
  fechaRegistro?: string;
  mensajeProveedor?: string;
  respuestaProveedor?: string;
}): EntradaHilo[] {
  const inicial: EntradaHilo[] = novedad.descripcion?.trim()
    ? [{
        fecha: novedad.fechaRegistro ?? "",
        autor: novedad.registradoPor?.trim() || "SUPER GEEK",
        texto: novedad.descripcion.trim(),
        lado: "super-geek",
      }]
    : [];

  const hilo = [
    ...inicial,
    ...parseCampoHilo(novedad.mensajeProveedor, "super-geek"),
    ...parseCampoHilo(novedad.respuestaProveedor, "proveedor"),
  ];

  return hilo.sort((a, b) => {
    if (!a.fecha || !b.fecha) return 0;
    return a.fecha.localeCompare(b.fecha);
  });
}

// ─── Turno ───────────────────────────────────────────────────────────────────

export type ShippingV2NovedadTurno = "nosotros" | "proveedor" | "espera" | "nadie";

type NovedadParaTurno = {
  estado?: string | null;
  responsable?: string | null;
  descripcion?: string;
  registradoPor?: string;
  fechaRegistro?: string;
  mensajeProveedor?: string;
  respuestaProveedor?: string;
};

/** ¿Quién habló último? (sin contar el registro inicial) */
function ultimoLado(novedad: NovedadParaTurno): EntradaHilo["lado"] | null {
  const nuestras = parseCampoHilo(novedad.mensajeProveedor, "super-geek");
  const suyas = parseCampoHilo(novedad.respuestaProveedor, "proveedor");
  if (!suyas.length) return nuestras.length ? "super-geek" : null;
  if (!nuestras.length) return "proveedor";
  const ultimaNuestra = nuestras[nuestras.length - 1].fecha;
  const ultimaSuya = suyas[suyas.length - 1].fecha;
  // Sin fecha (dato viejo) se asume que lo nuestro es lo último.
  if (!ultimaSuya || !ultimaNuestra) return "super-geek";
  return ultimaSuya > ultimaNuestra ? "proveedor" : "super-geek";
}

export function getTurnoNovedad(novedad: NovedadParaTurno): ShippingV2NovedadTurno {
  const estado = normalizarEstadoNovedad(novedad.estado);
  if (estado === "Cerrada") return "nadie";
  if (estado === "En solución") return "espera";
  if (!esResponsableProveedor(novedad.responsable)) return "nosotros";
  return ultimoLado(novedad) === "proveedor" ? "nosotros" : "proveedor";
}

export function etiquetaTurno(novedad: NovedadParaTurno): string {
  const turno = getTurnoNovedad(novedad);
  if (turno === "nadie") return "Cerrada";
  if (turno === "espera") return "Esperando que se cumpla";
  if (!esResponsableProveedor(novedad.responsable)) return "Por resolver";
  return turno === "nosotros" ? "Respondió el proveedor" : "Esperando al proveedor";
}

// ─── Pestañas ────────────────────────────────────────────────────────────────

export type ShippingV2NovedadBucket = "nuestro-turno" | "con-proveedor" | "en-solucion" | "cerradas";

export const SHIPPING_V2_NOVEDAD_BUCKETS: Array<{ key: ShippingV2NovedadBucket; label: string; descripcion: string }> = [
  { key: "nuestro-turno", label: "Nuestro turno", descripcion: "Por resolver, o el proveedor ya respondió." },
  { key: "con-proveedor", label: "Esperando al proveedor", descripcion: "Se le notificó o se le contestó y falta su respuesta." },
  { key: "en-solucion", label: "En solución", descripcion: "Ya se decidió; falta que el proveedor cumpla (reemplazo, reembolso…)." },
  { key: "cerradas", label: "Cerradas", descripcion: "Terminadas." },
];

export function getNovedadBucket(novedad: NovedadParaTurno): ShippingV2NovedadBucket {
  const turno = getTurnoNovedad(novedad);
  if (turno === "nadie") return "cerradas";
  if (turno === "espera") return "en-solucion";
  if (turno === "proveedor") return "con-proveedor";
  return "nuestro-turno";
}

// ─── Acciones ────────────────────────────────────────────────────────────────

export type ShippingV2NovedadRol = "admin" | "staff" | "proveedor" | "ninguno";

export type ShippingV2NovedadAccion =
  | "responder"
  | "registrar-respuesta"
  | "contestar"
  | "resolver"
  | "cumplida"
  | "reabrir"
  | "bloquear"
  | "desbloquear";

export type ShippingV2NovedadAccionConfig = {
  accion: ShippingV2NovedadAccion;
  label: string;
  descripcion: string;
  quien: "proveedor" | "staff" | "admin";
  desde: ShippingV2NovedadEstadoReal[];
  soloConProveedor: boolean;
  tono: "principal" | "neutral" | "peligro";
};

export const SHIPPING_V2_NOVEDAD_ACCIONES: readonly ShippingV2NovedadAccionConfig[] = [
  { accion: "responder", label: "Responder", descripcion: "Tu respuesta y tu propuesta para resolverla.", quien: "proveedor", desde: ["Abierta"], soloConProveedor: true, tono: "principal" },
  { accion: "resolver", label: "Resolver", descripcion: "Qué pasa con el artículo. El sistema lo ejecuta.", quien: "staff", desde: ["Abierta"], soloConProveedor: false, tono: "principal" },
  { accion: "contestar", label: "Contestar al proveedor", descripcion: "Le escribimos (por ejemplo, una contrapropuesta). Vuelve a su turno.", quien: "staff", desde: ["Abierta"], soloConProveedor: true, tono: "neutral" },
  { accion: "registrar-respuesta", label: "Anotar respuesta del proveedor", descripcion: "Para proveedores sin portal: lo que nos dijo por otro medio.", quien: "staff", desde: ["Abierta"], soloConProveedor: true, tono: "neutral" },
  { accion: "cumplida", label: "Marcar cumplida", descripcion: "Lo acordado ya ocurrió. Se cierra la novedad.", quien: "staff", desde: ["En solución"], soloConProveedor: false, tono: "principal" },
  { accion: "bloquear", label: "Bloquear venta", descripcion: "Impide reservar y vender el artículo. Solo el Administrador lo quita.", quien: "staff", desde: ["Abierta", "En solución"], soloConProveedor: false, tono: "peligro" },
  { accion: "desbloquear", label: "Desbloquear venta", descripcion: "El artículo vuelve a poder reservarse y venderse.", quien: "admin", desde: ["Abierta", "En solución", "Cerrada"], soloConProveedor: false, tono: "peligro" },
  { accion: "reabrir", label: "Reabrir", descripcion: "Vuelve a estar abierta. Solo si se cerró por error.", quien: "admin", desde: ["Cerrada"], soloConProveedor: false, tono: "peligro" },
];

export function getAccionConfig(accion?: string | null): ShippingV2NovedadAccionConfig | null {
  return SHIPPING_V2_NOVEDAD_ACCIONES.find((a) => a.accion === accion) ?? null;
}

function rolAlcanza(rol: ShippingV2NovedadRol, quien: ShippingV2NovedadAccionConfig["quien"]): boolean {
  if (quien === "proveedor") return rol === "proveedor";
  if (quien === "staff") return rol === "staff" || rol === "admin";
  return rol === "admin";
}

type NovedadParaAccion = {
  estado?: string | null;
  responsable?: string | null;
  tipo?: string | null;
  bloqueaVenta?: boolean | null;
  decision?: string | null;
};

function motivoNoDisponible(cfg: ShippingV2NovedadAccionConfig, novedad: NovedadParaAccion, rol: ShippingV2NovedadRol): string | null {
  if (!rolAlcanza(rol, cfg.quien)) {
    return cfg.quien === "admin" ? `Solo un Administrador puede "${cfg.label}".` : `No puedes "${cfg.label}".`;
  }
  const estado = normalizarEstadoNovedad(novedad.estado);
  if (!estado) return `Estado de novedad no reconocido: "${novedad.estado}".`;
  if (!cfg.desde.includes(estado)) return `No se puede "${cfg.label}" una novedad ${estado.toLowerCase()}.`;
  if (cfg.soloConProveedor && !esResponsableProveedor(novedad.responsable)) {
    return `"${cfg.label}" solo aplica a novedades que se resuelven con el proveedor.`;
  }
  if (cfg.accion === "bloquear" && novedad.bloqueaVenta === true) return "La venta ya está bloqueada.";
  if (cfg.accion === "desbloquear" && novedad.bloqueaVenta !== true) return "La venta no está bloqueada.";
  if (cfg.accion === "reabrir" && getDecisionConfig(novedad.decision)?.mueveArticulo) {
    return `Se resolvió con "${novedad.decision}" y el artículo ya se movió: no se puede reabrir. Deshazlo con su propia acción (por ejemplo, Revertir baja).`;
  }
  return null;
}

export function getAccionesDisponibles(novedad: NovedadParaAccion, rol: ShippingV2NovedadRol): ShippingV2NovedadAccionConfig[] {
  return SHIPPING_V2_NOVEDAD_ACCIONES.filter((cfg) => motivoNoDisponible(cfg, novedad, rol) === null);
}

export type ValoresAccionNovedad = {
  /** Texto principal: respuesta, mensaje, nota de lo que se hizo o motivo. */
  texto?: string;
  decision?: string;
  propuesta?: string;
  precio?: number | null;
  cantidad?: number | null;
  comoAparecio?: string;
  /** Al resolver: falta que el proveedor cumpla algo → queda "En solución". */
  pendienteProveedor?: boolean;
  /** Al resolver (solo Administrador): quitar también el bloqueo de venta. */
  desbloquear?: boolean;
  montoReclamado?: number | null;
  montoRecuperado?: number | null;
};

export type ValidacionAccion =
  | { ok: true; config: ShippingV2NovedadAccionConfig; estadoDestino: ShippingV2NovedadEstadoReal; decision: ShippingV2DecisionConfig | null }
  | { ok: false; motivo: string };

const ESTADO_DESTINO: Record<ShippingV2NovedadAccion, ShippingV2NovedadEstadoReal | null> = {
  responder: "Abierta",
  "registrar-respuesta": "Abierta",
  contestar: "Abierta",
  resolver: null, // depende de pendienteProveedor
  cumplida: "Cerrada",
  reabrir: "Abierta",
  bloquear: null, // no cambia
  desbloquear: null, // no cambia
};

function montoValido(valor: number | null | undefined): boolean {
  return valor === null || valor === undefined || (Number.isFinite(valor) && valor >= 0);
}

/**
 * Valida una acción ANTES de escribir. La usan la pantalla (qué mostrar) y el
 * servidor (qué se puede escribir). Nunca se confía en que la pantalla validó.
 */
export function validarAccionNovedad(input: {
  accion: string;
  novedad: NovedadParaAccion;
  rol: ShippingV2NovedadRol;
  valores?: ValoresAccionNovedad;
}): ValidacionAccion {
  const cfg = getAccionConfig(input.accion);
  if (!cfg) return { ok: false, motivo: "Acción de novedad no soportada." };
  const noDisponible = motivoNoDisponible(cfg, input.novedad, input.rol);
  if (noDisponible) return { ok: false, motivo: noDisponible };

  const v = input.valores ?? {};
  const texto = String(v.texto || "").trim();
  const estadoActual = normalizarEstadoNovedad(input.novedad.estado) as ShippingV2NovedadEstadoReal;
  if (!montoValido(v.montoReclamado) || !montoValido(v.montoRecuperado)) return { ok: false, motivo: "Los montos deben ser números de 0 en adelante." };

  switch (cfg.accion) {
    case "responder":
    case "registrar-respuesta":
      if (!texto) return { ok: false, motivo: "Escribe la respuesta del proveedor." };
      if (v.propuesta && !esPropuestaValida(v.propuesta)) return { ok: false, motivo: "Elige una propuesta válida." };
      return { ok: true, config: cfg, estadoDestino: "Abierta", decision: null };
    case "contestar":
      if (!texto) return { ok: false, motivo: "Escribe el mensaje para el proveedor." };
      return { ok: true, config: cfg, estadoDestino: "Abierta", decision: null };
    case "cumplida":
      return { ok: true, config: cfg, estadoDestino: "Cerrada", decision: null };
    case "bloquear":
      return { ok: true, config: cfg, estadoDestino: estadoActual, decision: null };
    case "desbloquear":
    case "reabrir":
      if (texto.length < 5) return { ok: false, motivo: "Escribe el motivo (mínimo 5 caracteres)." };
      return { ok: true, config: cfg, estadoDestino: ESTADO_DESTINO[cfg.accion] ?? estadoActual, decision: null };
    case "resolver": {
      const decision = getDecisionConfig(v.decision);
      if (!decision) return { ok: false, motivo: "Elige qué pasa con el artículo." };
      const admin = input.rol === "admin";
      const permitidas = getDecisionesPermitidas({ tipo: input.novedad.tipo, isSiteAdmin: admin });
      if (!permitidas.some((d) => d.valor === decision.valor)) {
        return {
          ok: false,
          motivo: decision.soloAdmin && !admin
            ? `Solo un Administrador puede elegir "${decision.valor}".`
            : `"${decision.valor}" no aplica a una novedad de tipo "${input.novedad.tipo}".`,
        };
      }
      if (!texto) return { ok: false, motivo: "Anota brevemente qué se hizo." };
      if (decision.pidePrecio && !(typeof v.precio === "number" && Number.isFinite(v.precio) && v.precio > 0)) {
        return { ok: false, motivo: "Escribe el nuevo precio de venta." };
      }
      if (decision.pideCantidad && !(typeof v.cantidad === "number" && Number.isInteger(v.cantidad) && v.cantidad >= 1)) {
        return { ok: false, motivo: "Escribe cuántas unidades (entero mayor a 0)." };
      }
      if (esPerdidoEnTienda(input.novedad.tipo) && decision.valor === "No requiere solución" && !String(v.comoAparecio || "").trim()) {
        return { ok: false, motivo: "Anota dónde o cómo apareció el artículo." };
      }
      const conProveedor = esResponsableProveedor(input.novedad.responsable);
      if (v.propuesta && (!conProveedor || !esPropuestaValida(v.propuesta))) {
        return { ok: false, motivo: "La propuesta del proveedor solo aplica a novedades con el proveedor." };
      }
      if (v.pendienteProveedor && !conProveedor) {
        return { ok: false, motivo: "Solo una novedad con el proveedor puede quedar esperando que él cumpla." };
      }
      if (v.desbloquear && !admin) return { ok: false, motivo: "Solo un Administrador puede desbloquear la venta." };
      return { ok: true, config: cfg, estadoDestino: v.pendienteProveedor ? "En solución" : "Cerrada", decision };
    }
  }
}
