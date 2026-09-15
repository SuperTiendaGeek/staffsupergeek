// Ciclo de vida de una novedad de Shipping V2. Puro, sin red, testeable.
//
// ─── El modelo ───────────────────────────────────────────────────────────────
//
// Una novedad NACE ENCAMINADA: quien la detecta ya sabe si la resolvemos
// nosotros o si hay que reclamarle al proveedor. Ese dato vive en el campo
// `Responsable de solución` y decide todo lo demás: qué soluciones se ofrecen,
// quién la ve y de quién es el turno.
//
//   SUPER GEEK          Proveedor
//   ──────────          ─────────
//   Abierta             Enviada a proveedor
//      │                     │  el proveedor propone una solución
//      │ elegimos            ▼
//      │ resolución    Respondida por proveedor
//      │                  │        │
//      │        aceptamos │        │ rechazamos (vuelve a su cancha)
//      ▼                  ▼        └──► Enviada a proveedor
//   En solución ◄─────────┘
//      │
//      ▼
//   Cerrada
//
// Un diseño anterior tenía "Tomar para revisión", "Enviar al proveedor" y
// "Escalar". Los tres sobraban: los dos primeros porque la novedad ya nace
// encaminada, y "Escalar" porque no hay instancia por encima de SUPER GEEK y
// el proveedor a quien acudir.
//
// Los estados "En revisión interna", "Esperando respuesta" y "Escalada" siguen
// existiendo en Airtable (puede haber datos viejos), pero el portal ya no los
// produce. Si aparecen, se muestran y cuentan como abiertos.

export const SHIPPING_V2_NOVEDAD_ESTADOS = [
  "Abierta",
  "En revisión interna",
  "Enviada a proveedor",
  "Esperando respuesta",
  "Respondida por proveedor",
  "En solución",
  "Cerrada",
  "Rechazada",
  "Escalada",
  "Cerrada sin respuesta",
] as const;

export type ShippingV2NovedadEstadoReal = (typeof SHIPPING_V2_NOVEDAD_ESTADOS)[number];

/**
 * Estados en los que la novedad ya no pide trabajo de nadie.
 *
 * OJO — aquí había un bug real: `isOpenNovedadStatus()` consideraba cerradas
 * solo las que contuvieran "resuelta/cancelada/cerrada" exactas. "Rechazada" y
 * "Cerrada sin respuesta" NO entraban, así que seguían contando como abiertas:
 * bloqueaban el cierre de ciclo del packing y la disponibilidad del artículo
 * para siempre.
 */
export const SHIPPING_V2_NOVEDAD_ESTADOS_FINALES = [
  "Cerrada",
  "Rechazada",
  "Cerrada sin respuesta",
] as const;

// ─── Quién resuelve ──────────────────────────────────────────────────────────

export const SHIPPING_V2_NOVEDAD_RESPONSABLES = ["SUPER GEEK", "Proveedor"] as const;
export type ShippingV2NovedadResponsable = (typeof SHIPPING_V2_NOVEDAD_RESPONSABLES)[number];

/** Soluciones que puede proponer el PROVEEDOR. Ya existen en Airtable. */
export const SHIPPING_V2_SOLUCIONES_PROVEEDOR = [
  "Reemplazo",
  "Reembolso",
  "Crédito",
  "Descuento",
  "Aceptado con observación",
  "Aceptado sin garantía",
  "Otro",
] as const;

/**
 * Soluciones cuando la resolvemos NOSOTROS.
 *
 * Requieren que estas opciones existan en el single select "Solución" de
 * Airtable. Si falta alguna, la escritura falla con el error de Airtable en
 * vez de crearla en silencio: crear opciones de esquema sin que nadie lo sepa
 * es justo el tipo de automatización invisible que este proyecto evita.
 */
export const SHIPPING_V2_SOLUCIONES_INTERNAS = [
  "Se vende con descuento",
  "Se repara internamente",
  "Va a despiece",
  "Se destina a uso local",
  "Se descarta",
  "Aceptado con observación",
  "Otro",
] as const;

export function getSolucionesDisponibles(responsable?: string | null): readonly string[] {
  return normalize(responsable) === normalize("Proveedor")
    ? SHIPPING_V2_SOLUCIONES_PROVEEDOR
    : SHIPPING_V2_SOLUCIONES_INTERNAS;
}

/** Estado con el que nace una novedad, según quién la resuelve. */
export function getEstadoInicialNovedad(responsable?: string | null): ShippingV2NovedadEstadoReal {
  return normalize(responsable) === normalize("Proveedor") ? "Enviada a proveedor" : "Abierta";
}

export function esResponsableProveedor(responsable?: string | null): boolean {
  return normalize(responsable) === normalize("Proveedor");
}

// ─── Agrupación para las pestañas ────────────────────────────────────────────

export type ShippingV2NovedadBucket = "nuestras" | "con-proveedor" | "en-solucion" | "cerradas";

export const SHIPPING_V2_NOVEDAD_BUCKETS: Array<{
  key: ShippingV2NovedadBucket;
  label: string;
  descripcion: string;
}> = [
  { key: "nuestras", label: "Las resolvemos nosotros", descripcion: "Novedades nuestras sin resolución definida todavía." },
  { key: "con-proveedor", label: "Con el proveedor", descripcion: "La pelota está en su cancha, o ya respondió y hay que aceptar o rechazar." },
  { key: "en-solucion", label: "Esperando que se cumpla", descripcion: "Ya hay acuerdo pero falta que ocurra algo: que llegue el reemplazo, que se repare. Las resoluciones inmediatas no pasan por aquí, se cierran de una vez." },
  { key: "cerradas", label: "Cerradas", descripcion: "Terminadas: resueltas, anuladas o cerradas sin respuesta." },
];

function normalize(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

const ESTADO_POR_NORMALIZADO = new Map<string, ShippingV2NovedadEstadoReal>(
  SHIPPING_V2_NOVEDAD_ESTADOS.map((estado) => [normalize(estado), estado])
);

export function normalizarEstadoNovedad(estado?: string | null): ShippingV2NovedadEstadoReal | null {
  return ESTADO_POR_NORMALIZADO.get(normalize(estado)) ?? null;
}

export function isNovedadCerrada(estado?: string | null): boolean {
  const canonico = normalizarEstadoNovedad(estado);
  if (!canonico) return false; // fail-closed: un estado raro cuenta como abierto
  return (SHIPPING_V2_NOVEDAD_ESTADOS_FINALES as readonly string[]).includes(canonico);
}

export function isNovedadAbierta(estado?: string | null): boolean {
  return !isNovedadCerrada(estado);
}

export function getNovedadBucket(novedad: { estado?: string | null; responsable?: string | null }): ShippingV2NovedadBucket {
  const estado = normalizarEstadoNovedad(novedad.estado);
  if (!estado) return "nuestras";
  if ((SHIPPING_V2_NOVEDAD_ESTADOS_FINALES as readonly string[]).includes(estado)) return "cerradas";
  if (estado === "En solución") return "en-solucion";
  if (estado === "Enviada a proveedor" || estado === "Esperando respuesta" || estado === "Respondida por proveedor") {
    return "con-proveedor";
  }
  // Abierta / En revisión interna / Escalada: depende de quién la resuelve.
  return esResponsableProveedor(novedad.responsable) ? "con-proveedor" : "nuestras";
}

/** ¿De quién es el turno de actuar? Sirve para ordenar y para avisar. */
export function getTurnoNovedad(novedad: { estado?: string | null; responsable?: string | null }): "nosotros" | "proveedor" | "nadie" {
  const estado = normalizarEstadoNovedad(novedad.estado);
  if (!estado || isNovedadCerrada(estado)) return "nadie";
  if (estado === "Enviada a proveedor" || estado === "Esperando respuesta") return "proveedor";
  return "nosotros";
}

// ─── Qué novedades bloquean la venta ─────────────────────────────────────────
//
// No toda novedad debe sacar el artículo del inventario vendible. Una webcam
// que no enciende se vende con observación y descuento; un artículo Faltante
// no se vende porque no existe. El tipo "Observación menor" está en Airtable
// exactamente para eso.

export const SHIPPING_V2_TIPOS_NOVEDAD_NO_BLOQUEANTES = ["Observación menor"] as const;

const TIPOS_NO_BLOQUEANTES_NORMALIZADOS = new Set(
  SHIPPING_V2_TIPOS_NOVEDAD_NO_BLOQUEANTES.map((tipo) => normalize(tipo))
);

export function esNovedadBloqueante(novedad: { tipo?: string | null; estado?: string | null }): boolean {
  if (isNovedadCerrada(novedad.estado)) return false;
  return !TIPOS_NO_BLOQUEANTES_NORMALIZADOS.has(normalize(novedad.tipo));
}

// ─── Transiciones ────────────────────────────────────────────────────────────

export type ShippingV2NovedadAccion =
  | "responder"
  | "aceptar-propuesta"
  | "rechazar-propuesta"
  | "resolver"
  | "cerrar"
  | "anular"
  | "cerrar-sin-respuesta"
  | "reabrir";

export type ShippingV2NovedadTransicion = {
  accion: ShippingV2NovedadAccion;
  label: string;
  descripcion: string;
  desde: ShippingV2NovedadEstadoReal[];
  hacia: ShippingV2NovedadEstadoReal;
  /** Limita la acción a novedades de un responsable concreto. */
  soloResponsable?: ShippingV2NovedadResponsable;
  soloAdmin: boolean;
  campoRequerido: null | { nombre: string; label: string; placeholder?: string };
  /** Campo que se ofrece pero no se exige. */
  campoOpcional?: null | { nombre: string; label: string; placeholder?: string };
  /** true = además exige elegir una Solución del catálogo que corresponda. */
  requiereSolucion: boolean;
  /**
   * true = la acción puede cerrar la novedad de una vez.
   *
   * Muchas resoluciones son instantáneas: "se vende con descuento" ya está
   * decidido y hecho, no hay nada que esperar. Obligar a pasar por "En
   * solución" y volver a escribir cómo quedó resuelta era pedir dos veces lo
   * mismo. Ahora se decide en el momento: si ya está hecho, se cierra.
   */
  permiteCerrarDirecto?: boolean;
  tono: "principal" | "neutral" | "peligro";
};

export const SHIPPING_V2_NOVEDAD_TRANSICIONES: ShippingV2NovedadTransicion[] = [
  {
    accion: "responder",
    label: "Registrar respuesta del proveedor",
    descripcion: "Lo que el proveedor propone hacer. Si responde desde su portal, lo escribe él mismo.",
    desde: ["Enviada a proveedor", "Esperando respuesta", "Escalada"],
    hacia: "Respondida por proveedor",
    soloResponsable: "Proveedor",
    soloAdmin: false,
    campoRequerido: { nombre: "respuesta", label: "Qué propone el proveedor", placeholder: "Envío una batería nueva en el packing de la próxima semana." },
    requiereSolucion: true,
    tono: "principal",
  },
  {
    accion: "aceptar-propuesta",
    label: "Aceptar propuesta",
    descripcion: "Estamos de acuerdo con lo que ofrece el proveedor.",
    desde: ["Respondida por proveedor"],
    hacia: "En solución",
    soloResponsable: "Proveedor",
    soloAdmin: false,
    campoRequerido: null,
    campoOpcional: { nombre: "descripcionSolucion", label: "Nota (opcional)", placeholder: "Quedamos atentos al tracking del reemplazo." },
    requiereSolucion: false,
    permiteCerrarDirecto: true,
    tono: "principal",
  },
  {
    accion: "rechazar-propuesta",
    label: "Rechazar propuesta",
    descripcion: "No aceptamos lo que ofrece. Vuelve a su cancha con el motivo para que proponga otra cosa.",
    desde: ["Respondida por proveedor"],
    hacia: "Enviada a proveedor",
    soloResponsable: "Proveedor",
    soloAdmin: false,
    campoRequerido: { nombre: "motivo", label: "Por qué no aceptamos", placeholder: "El descuento no cubre el costo de la batería de reemplazo." },
    requiereSolucion: false,
    tono: "neutral",
  },
  {
    accion: "resolver",
    label: "Resolver",
    descripcion: "Qué hacemos con el artículo.",
    desde: ["Abierta", "En revisión interna", "Escalada"],
    hacia: "En solución",
    soloResponsable: "SUPER GEEK",
    soloAdmin: false,
    campoRequerido: { nombre: "descripcionSolucion", label: "Qué hacemos", placeholder: "La webcam no enciende; se vende con $30 de descuento y observación en la ficha." },
    requiereSolucion: true,
    permiteCerrarDirecto: true,
    tono: "principal",
  },
  {
    accion: "cerrar",
    label: "Marcar como cumplida",
    // Solo desde "En solución": lo que faltaba ya se cumplió. La resolución y
    // su descripción se registraron al acordarla, así que aquí NO se vuelve a
    // pedir: sería preguntar dos veces lo mismo.
    descripcion: "Lo acordado ya se cumplió. El artículo recupera su disponibilidad si no queda nada más bloqueándolo.",
    desde: ["En solución", "Escalada"],
    hacia: "Cerrada",
    soloAdmin: false,
    campoRequerido: null,
    campoOpcional: { nombre: "observacionFinal", label: "Nota de cierre (opcional)", placeholder: "Llegó la batería de reemplazo y se instaló." },
    requiereSolucion: false,
    tono: "principal",
  },
  {
    accion: "cerrar-sin-respuesta",
    label: "Cerrar sin respuesta",
    descripcion: "El proveedor nunca contestó. Queda registrado como pérdida asumida.",
    desde: ["Enviada a proveedor", "Esperando respuesta", "Escalada"],
    hacia: "Cerrada sin respuesta",
    soloResponsable: "Proveedor",
    soloAdmin: true,
    campoRequerido: { nombre: "motivo", label: "Motivo del cierre sin respuesta" },
    requiereSolucion: false,
    tono: "peligro",
  },
  {
    accion: "anular",
    label: "Anular novedad",
    descripcion: "No procedía: error de registro, se confundió el artículo. No hay reclamo ni resolución.",
    desde: ["Abierta", "En revisión interna", "Enviada a proveedor", "Esperando respuesta", "Respondida por proveedor", "En solución", "Escalada"],
    hacia: "Rechazada",
    soloAdmin: true,
    campoRequerido: { nombre: "motivo", label: "Motivo de la anulación" },
    requiereSolucion: false,
    tono: "peligro",
  },
  {
    accion: "reabrir",
    label: "Reabrir",
    descripcion: "Vuelve a estar activa. Úsalo solo si se cerró por error o apareció información nueva.",
    desde: ["Cerrada", "Rechazada", "Cerrada sin respuesta"],
    hacia: "Abierta",
    soloAdmin: true,
    campoRequerido: { nombre: "motivo", label: "Motivo de la reapertura" },
    requiereSolucion: false,
    tono: "peligro",
  },
];

const TRANSICION_POR_ACCION = new Map(
  SHIPPING_V2_NOVEDAD_TRANSICIONES.map((transicion) => [transicion.accion, transicion])
);

export function getShippingV2NovedadTransicion(accion: string): ShippingV2NovedadTransicion | null {
  return TRANSICION_POR_ACCION.get(accion as ShippingV2NovedadAccion) ?? null;
}

/**
 * Al reabrir, la novedad vuelve a la cancha que le corresponde según quién la
 * resuelve: si es del proveedor, a "Enviada a proveedor"; si es nuestra, a
 * "Abierta". Sin esto, una novedad de proveedor reabierta caería en la bandeja
 * equivocada.
 */
export function getEstadoDestino(
  transicion: ShippingV2NovedadTransicion,
  responsable?: string | null,
  cerrarDirecto?: boolean
): ShippingV2NovedadEstadoReal {
  if (transicion.accion === "reabrir") return getEstadoInicialNovedad(responsable);
  if (cerrarDirecto && transicion.permiteCerrarDirecto) return "Cerrada";
  return transicion.hacia;
}

export function getShippingV2NovedadAccionesDisponibles(input: {
  estado?: string | null;
  responsable?: string | null;
  isSiteAdmin?: boolean;
}): ShippingV2NovedadTransicion[] {
  const estado = normalizarEstadoNovedad(input.estado);
  if (!estado) return [];
  const esProveedor = esResponsableProveedor(input.responsable);
  return SHIPPING_V2_NOVEDAD_TRANSICIONES.filter((transicion) => {
    if (!transicion.desde.includes(estado)) return false;
    if (transicion.soloAdmin && input.isSiteAdmin !== true) return false;
    if (transicion.soloResponsable === "Proveedor" && !esProveedor) return false;
    if (transicion.soloResponsable === "SUPER GEEK" && esProveedor) return false;
    return true;
  });
}

export type ValidacionTransicion =
  | { ok: true; transicion: ShippingV2NovedadTransicion; estadoDestino: ShippingV2NovedadEstadoReal }
  | { ok: false; motivo: string };

/**
 * Valida una transición ANTES de escribir en Airtable.
 *
 * Se usa igual en el servidor y en la pantalla: la UI llama a esto para
 * decidir qué botones mostrar, y la ruta de API vuelve a llamarlo antes de
 * escribir. Nunca se confía en que la pantalla ya validó.
 */
export function validarTransicionNovedad(input: {
  estadoActual?: string | null;
  responsable?: string | null;
  accion: string;
  isSiteAdmin?: boolean;
  valores?: Record<string, string | undefined>;
  solucion?: string;
  /** El usuario marcó "ya está hecho": se cierra sin pasar por En solución. */
  cerrarDirecto?: boolean;
}): ValidacionTransicion {
  const transicion = getShippingV2NovedadTransicion(input.accion);
  if (!transicion) return { ok: false, motivo: "Acción de novedad no soportada." };

  const estado = normalizarEstadoNovedad(input.estadoActual);
  if (!estado) {
    return { ok: false, motivo: `Estado de novedad no reconocido: "${input.estadoActual}".` };
  }
  if (!transicion.desde.includes(estado)) {
    return { ok: false, motivo: `No puedes "${transicion.label}" una novedad en estado "${estado}".` };
  }
  if (transicion.soloAdmin && input.isSiteAdmin !== true) {
    return { ok: false, motivo: `Solo un administrador puede ejecutar "${transicion.label}".` };
  }

  const esProveedor = esResponsableProveedor(input.responsable);
  if (transicion.soloResponsable === "Proveedor" && !esProveedor) {
    return { ok: false, motivo: `"${transicion.label}" solo aplica a novedades que resuelve el proveedor.` };
  }
  if (transicion.soloResponsable === "SUPER GEEK" && esProveedor) {
    return { ok: false, motivo: `"${transicion.label}" solo aplica a novedades que resolvemos nosotros.` };
  }

  if (transicion.campoRequerido) {
    const valor = input.valores?.[transicion.campoRequerido.nombre]?.trim();
    if (!valor) return { ok: false, motivo: `Completa "${transicion.campoRequerido.label}".` };
  }

  if (transicion.requiereSolucion) {
    const solucion = input.solucion?.trim();
    if (!solucion) return { ok: false, motivo: "Elige una solución antes de continuar." };
    const permitidas = getSolucionesDisponibles(input.responsable);
    if (!permitidas.some((opcion) => normalize(opcion) === normalize(solucion))) {
      return {
        ok: false,
        motivo: `"${solucion}" no es una solución válida para una novedad que resuelve ${esProveedor ? "el proveedor" : "SUPER GEEK"}.`,
      };
    }
  }

  if (input.cerrarDirecto && !transicion.permiteCerrarDirecto) {
    return { ok: false, motivo: `"${transicion.label}" no puede cerrar la novedad directamente.` };
  }

  return {
    ok: true,
    transicion,
    estadoDestino: getEstadoDestino(transicion, input.responsable, input.cerrarDirecto),
  };
}

// ─── El hilo de la conversación ──────────────────────────────────────────────
//
// Airtable guarda "Mensaje enviado al proveedor" y "Respuesta del proveedor"
// como dos campos sueltos. Si rechazamos una propuesta y el proveedor vuelve a
// responder, lo anterior se perdería. Para que sea una conversación de verdad,
// cada entrada se APENDE con fecha y autor — el mismo patrón que ya usa
// "Observación recepción" en este proyecto. Cero campos nuevos.

const SEPARADOR_ENTRADA = /^\[(\d{4}-\d{2}-\d{2}T[^\]]+)\]\s*([^:]+):\s*/;

export type EntradaHilo = {
  fecha: string;
  autor: string;
  texto: string;
  lado: "super-geek" | "proveedor";
};

/** Formatea una entrada para guardarla apendida al campo. */
export function formatEntradaHilo(autor: string, texto: string, fechaISO = new Date().toISOString()): string {
  return `[${fechaISO}] ${autor.trim() || "Sin identificar"}: ${texto.trim()}`;
}

/** Agrega una entrada al final del campo, conservando lo anterior. */
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

/**
 * Reconstruye la conversación completa en orden cronológico: el registro
 * inicial, lo que le dijimos al proveedor y lo que contestó.
 */
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

  // Las entradas sin fecha (datos viejos) se dejan donde estaban.
  return hilo.sort((a, b) => {
    if (!a.fecha || !b.fecha) return 0;
    return a.fecha.localeCompare(b.fecha);
  });
}
