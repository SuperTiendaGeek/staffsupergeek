// Enlace público de aprobación del presupuesto — reglas PURAS (sin Airtable).
//
// Un solo enlace por orden. El cliente lo abre sin login, ve el presupuesto
// y responde línea por línea. Si después el técnico agrega, edita o quita
// algo, el MISMO enlace le muestra qué cambió y le pide responder solo eso.
//
// Cómo se detecta un cambio: al responder se guarda en la línea una "huella"
// de lo que el cliente vio (descripción, cantidad, precio, tiempo). Si la
// línea cambia, la huella deja de coincidir y la línea vuelve a pedir
// respuesta, mostrando el valor anterior (tomado de la última respuesta
// firmada). Una línea que estaba en la última respuesta y ya no existe se
// muestra como "retirada por el taller".
//
// Qué puede cambiar el cliente por su cuenta: solo lo que no tiene efectos
// reales todavía. Una línea ya cargada a la orden, o un repuesto bajo pedido
// que ya tiene operación, queda "en proceso": para cambiarla debe hablar con
// la tienda (el técnico usa las reversas de la tarjeta).

import { normalizarPrioridad, prioridadDeGrupo, type LineaPresupuesto, type Prioridad } from "./reglas";

export const VIGENCIA_DIAS = 7;
export const MAX_INTENTOS_CEDULA = 5;
export const BLOQUEO_MINUTOS = 30;
export const TOKEN_REGEX = /^[A-Za-z0-9_-]{32}$/;

export type Decision = "aprobar" | "no";

export type Situacion =
  | "nueva"        // nunca respondida
  | "modificada"   // respondida, pero el taller la cambió
  | "repropuesta"  // el cliente dijo no y el taller la volvió a proponer
  | "aprobada"     // aprobada, aún sin efectos: puede cambiar de opinión
  | "no_aprobada"  // no aprobada: puede cambiar de opinión
  | "en_proceso"   // aprobada y ya en marcha: no se cambia desde el enlace
  | "anulada";     // el taller la anuló (p. ej. proveedor sin stock)

export const SITUACIONES_PENDIENTES: ReadonlySet<Situacion> = new Set(["nueva", "modificada", "repropuesta"]);

/** Lo que vio el cliente de una línea en una respuesta firmada. */
export type DetalleRespondido = {
  lineaId: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  huella: string;
  decision: Decision;
};

export type VistaLinea = {
  id: string;
  tipo: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  bajoPedido: boolean;
  tiempoEstimado: string;
  prioridad: Prioridad;
  /** Explicación del técnico para el cliente. */
  notaCliente: string;
  /** Grupo de alternativas (solo si tiene 2 o más opciones). */
  grupo: string;
  situacion: Situacion;
  pendiente: boolean;
  /** Decisión vigente (null si nunca respondió o si cambió). */
  decisionActual: Decision | null;
  /** Puede elegir/cambiar su decisión desde el enlace. */
  puedeResponder: boolean;
  huella: string;
  /** Lo que vio la última vez, si la línea cambió. */
  anterior: { descripcion: string; cantidad: number; precioUnitario: number } | null;
  nota: string;
};

export type LineaRetirada = { descripcion: string; cantidad: number; precioUnitario: number; subtotal: number };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** FNV-1a 32 bits, en hex. Suficiente para detectar cambios (no es seguridad). */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Huella de lo que el cliente ve de una línea. */
export function huellaLinea(l: Pick<LineaPresupuesto, "tipo" | "descripcion" | "cantidad" | "precioUnitario" | "tiempoEstimado" | "prioridad" | "notaCliente" | "grupoAlternativas">): string {
  const canon = [
    l.tipo, l.descripcion.trim().replace(/\s+/g, " "), String(l.cantidad), l.precioUnitario.toFixed(2), (l.tiempoEstimado ?? "").trim(),
    normalizarPrioridad(l.prioridad), (l.notaCliente ?? "").trim().replace(/\s+/g, " "), l.grupoAlternativas ? "alt" : "",
  ].join("|");
  return `v2-${fnv1a(canon)}-${fnv1a([...canon].reverse().join(""))}`;
}

/** Busca, de la respuesta más nueva a la más vieja, lo último que vio de cada línea. */
export function ultimoVisto(respuestas: DetalleRespondido[][]): Map<string, DetalleRespondido> {
  const out = new Map<string, DetalleRespondido>();
  for (const detalle of respuestas) for (const d of detalle) if (!out.has(d.lineaId)) out.set(d.lineaId, d);
  return out;
}

export function clasificarLinea(l: LineaPresupuesto, visto: DetalleRespondido | undefined): VistaLinea {
  const huella = huellaLinea(l);
  const respuesta = l.respuestaCliente ?? "";
  const respondidaIgual = !!respuesta && (l.huellaRespondida ?? "") === huella;
  const conEfectos = !!(l.operacionId || l.cargoServicioId || l.cargoProductoDigitalId);

  let situacion: Situacion;
  if (l.estado === "Propuesta") {
    situacion = !respuesta ? "nueva" : respondidaIgual ? "repropuesta" : "modificada";
  } else if (l.estado === "Cargada") {
    situacion = "en_proceso";
  } else if (l.estado === "Aprobada") {
    situacion = conEfectos ? "en_proceso" : "aprobada";
  } else {
    situacion = l.operacionId ? "anulada" : "no_aprobada";
  }

  const pendiente = SITUACIONES_PENDIENTES.has(situacion);
  const decisionActual: Decision | null =
    situacion === "aprobada" || situacion === "en_proceso" ? "aprobar"
    : situacion === "no_aprobada" ? "no"
    : null;
  const anterior = situacion === "modificada" && visto && visto.huella !== huella
    ? { descripcion: visto.descripcion, cantidad: visto.cantidad, precioUnitario: visto.precioUnitario }
    : null;

  return {
    id: l.id,
    tipo: l.tipo,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    precioUnitario: l.precioUnitario,
    subtotal: r2(l.cantidad * l.precioUnitario),
    bajoPedido: l.bajoPedido,
    tiempoEstimado: l.bajoPedido ? l.tiempoEstimado : "",
    prioridad: normalizarPrioridad(l.prioridad),
    notaCliente: (l.notaCliente ?? "").trim(),
    grupo: "",
    situacion,
    pendiente,
    decisionActual,
    puedeResponder: pendiente || situacion === "aprobada" || situacion === "no_aprobada",
    huella,
    anterior,
    // Solo notas pensadas para el cliente: la anulación del taller.
    nota: situacion === "anulada" ? "El taller anuló esta línea. Si tienes dudas, comunícate con nosotros." : "",
  };
}

export type GrupoVista = { id: string; prioridad: Prioridad; lineaIds: string[]; pendiente: boolean; bloqueado: boolean };
/** `desde`: prioridades cuyo monto es "desde" (hay alternativas sin elegir). */
export type TotalesPrioridad = Record<Prioridad, number> & { desde: Prioridad[] };

export function construirVista(lineas: LineaPresupuesto[], respuestas: DetalleRespondido[][]) {
  const visto = ultimoVisto(respuestas);
  const vistas = lineas.map((l) => clasificarLinea(l, visto.get(l.id)));

  // Alternativas: un grupo solo existe con 2+ líneas. Todas comparten la
  // prioridad del grupo; si una ya está en proceso, las demás se cierran.
  const miembros = new Map<string, number[]>();
  lineas.forEach((l, i) => { if (l.grupoAlternativas) miembros.set(l.grupoAlternativas, [...(miembros.get(l.grupoAlternativas) ?? []), i]); });
  const grupos: GrupoVista[] = [];
  for (const [id, idx] of miembros) {
    if (idx.length < 2) continue;
    const prioridad = prioridadDeGrupo(idx.map((i) => lineas[i]));
    const bloqueado = idx.some((i) => vistas[i].situacion === "en_proceso");
    for (const i of idx) {
      const v = vistas[i];
      v.grupo = id;
      v.prioridad = prioridad;
      if (bloqueado && v.situacion !== "en_proceso") {
        v.pendiente = false; v.puedeResponder = false;
        if (v.situacion !== "anulada") { v.decisionActual = "no"; v.nota = "Elegiste otra alternativa."; }
      }
    }
    grupos.push({ id, prioridad, lineaIds: idx.map((i) => vistas[i].id), pendiente: idx.some((i) => vistas[i].pendiente), bloqueado });
  }

  const actuales = new Set(lineas.map((l) => l.id));
  const retiradas: LineaRetirada[] = [...visto.values()]
    .filter((d) => !actuales.has(d.lineaId))
    .map((d) => ({ descripcion: d.descripcion, cantidad: d.cantidad, precioUnitario: d.precioUnitario, subtotal: r2(d.cantidad * d.precioUnitario) }));
  const totalAprobado = r2(vistas.filter((v) => v.decisionActual === "aprobar").reduce((s, v) => s + v.subtotal, 0));

  // Pendiente: una línea suelta suma su precio; un grupo suma su alternativa
  // más barata (el cliente elegirá una sola).
  let totalPendiente = 0;
  const vivas = (v: VistaLinea) => v.situacion !== "no_aprobada" && v.situacion !== "anulada";
  const porPrioridad: TotalesPrioridad = { Necesaria: 0, Recomendada: 0, Opcional: 0, desde: [] };
  for (const v of vistas) {
    if (v.grupo) continue;
    if (v.pendiente) totalPendiente += v.subtotal;
    if (vivas(v)) porPrioridad[v.prioridad] += v.subtotal;
  }
  for (const g of grupos) {
    const vs = vistas.filter((v) => v.grupo === g.id);
    const aprobada = vs.find((v) => v.decisionActual === "aprobar");
    const abiertas = vs.filter((v) => v.pendiente || v.puedeResponder);
    if (g.pendiente && abiertas.length) totalPendiente += Math.min(...abiertas.map((v) => v.subtotal));
    if (aprobada) porPrioridad[g.prioridad] += aprobada.subtotal;
    else if (abiertas.length) { porPrioridad[g.prioridad] += Math.min(...abiertas.map((v) => v.subtotal)); if (!porPrioridad.desde.includes(g.prioridad)) porPrioridad.desde.push(g.prioridad); }
  }
  porPrioridad.Necesaria = r2(porPrioridad.Necesaria);
  porPrioridad.Recomendada = r2(porPrioridad.Recomendada);
  porPrioridad.Opcional = r2(porPrioridad.Opcional);

  return {
    lineas: vistas,
    grupos,
    retiradas,
    pendientes: vistas.filter((v) => v.pendiente && !v.grupo).length + grupos.filter((g) => g.pendiente).length,
    totalAprobado,
    totalPendiente: r2(totalPendiente),
    porPrioridad,
  };
}

/** Deja juntas las alternativas de un grupo (en la posición de la primera). */
export function ordenarPorGrupo<T extends { id: string; grupo: string }>(vistas: T[]): T[] {
  const out: T[] = [];
  const hechos = new Set<string>();
  for (const v of vistas) {
    if (hechos.has(v.id)) continue;
    const bloque = v.grupo ? vistas.filter((x) => x.grupo === v.grupo) : [v];
    for (const x of bloque) { out.push(x); hechos.add(x.id); }
  }
  return out;
}

// ─── Envío de la respuesta ───────────────────────────────────────────────────

export type EnvioRespuesta = {
  decisiones: Array<{ lineaId: string; decision: Decision; huella: string }>;
  nombre: string;
  cedula4: string;
  acepta: boolean;
  /** Confirma que entiende que sin lo Necesario no se puede reparar. */
  entiendeNecesarias?: boolean;
};

export type CambioLinea = {
  lineaId: string;
  decision: Decision;
  nuevoEstado: "Aprobada" | "Rechazada";
  vista: VistaLinea;
};

export type ResultadoValidacion =
  | { ok: true; cambios: CambioLinea[]; cedulaVerificada: boolean; necesariasRechazadas: string[] }
  | { ok: false; error: string; codigo: "DATOS" | "CEDULA" | "CAMBIO" | "PENDIENTES" | "ALTERNATIVAS" | "NECESARIA" };

/** Dígitos de una cédula/RUC; "" si no hay al menos 4. */
export function digitosCedula(cedula: string): string {
  const d = (cedula ?? "").replace(/\D/g, "");
  return d.length >= 4 ? d : "";
}

export function validarEnvio(vistas: VistaLinea[], envio: EnvioRespuesta, cedulaOrden: string): ResultadoValidacion {
  const nombre = (envio.nombre ?? "").trim();
  if (nombre.length < 3) return { ok: false, codigo: "DATOS", error: "Escribe tu nombre completo." };
  if (envio.acepta !== true) return { ok: false, codigo: "DATOS", error: "Debes aceptar los términos para enviar tu respuesta." };

  const digitos = digitosCedula(cedulaOrden);
  if (digitos) {
    if ((envio.cedula4 ?? "").replace(/\D/g, "") !== digitos.slice(-4)) {
      return { ok: false, codigo: "CEDULA", error: "Los últimos 4 dígitos de la cédula no coinciden con los de la orden." };
    }
  }

  const porId = new Map(vistas.map((v) => [v.id, v]));
  const decididas = new Map<string, EnvioRespuesta["decisiones"][number]>();
  for (const d of envio.decisiones ?? []) {
    if (d.decision !== "aprobar" && d.decision !== "no") return { ok: false, codigo: "DATOS", error: "Respuesta inválida." };
    const v = porId.get(d.lineaId);
    if (!v) return { ok: false, codigo: "CAMBIO", error: "El presupuesto cambió mientras respondías. Recarga la página para ver la versión actual." };
    if (v.huella !== d.huella) return { ok: false, codigo: "CAMBIO", error: `"${v.descripcion}" cambió mientras respondías. Recarga la página para ver la versión actual.` };
    if (!v.puedeResponder) return { ok: false, codigo: "CAMBIO", error: `"${v.descripcion}" ya está en proceso; para cambiarla comunícate con la tienda.` };
    decididas.set(d.lineaId, d);
  }

  const faltan = vistas.filter((v) => v.pendiente && !decididas.has(v.id));
  if (faltan.length > 0) {
    return { ok: false, codigo: "PENDIENTES", error: `Falta responder: ${faltan.map((v) => v.descripcion).join(", ")}.` };
  }

  // Decisión final de cada línea (lo enviado o lo que ya estaba).
  const final = (v: VistaLinea): Decision | null => decididas.get(v.id)?.decision ?? v.decisionActual;

  // Alternativas: como máximo una aprobada por grupo.
  const porGrupo = new Map<string, VistaLinea[]>();
  for (const v of vistas) if (v.grupo) porGrupo.set(v.grupo, [...(porGrupo.get(v.grupo) ?? []), v]);
  for (const vs of porGrupo.values()) {
    const aprobadas = vs.filter((v) => final(v) === "aprobar");
    if (aprobadas.length > 1) return { ok: false, codigo: "ALTERNATIVAS", error: `Elige solo una opción entre: ${vs.map((v) => v.descripcion).join(" / ")}.` };
  }

  const cambios: CambioLinea[] = [];
  for (const d of decididas.values()) {
    const v = porId.get(d.lineaId)!;
    // Sin cambio real (ya estaba así): no se toca.
    if (!v.pendiente && v.decisionActual === d.decision) continue;
    cambios.push({ lineaId: v.id, decision: d.decision, nuevoEstado: d.decision === "aprobar" ? "Aprobada" : "Rechazada", vista: v });
  }
  if (cambios.length === 0) return { ok: false, codigo: "DATOS", error: "No hay cambios que enviar." };

  // Lo Necesario que queda sin aprobar por ESTE envío: el cliente debe
  // confirmar que entiende que sin eso no se puede reparar.
  const tocadas = new Set(cambios.map((c) => c.lineaId));
  const necesariasRechazadas: string[] = [];
  for (const v of vistas) {
    if (v.grupo || v.prioridad !== "Necesaria" || !tocadas.has(v.id)) continue;
    if (final(v) === "no") necesariasRechazadas.push(v.descripcion);
  }
  for (const vs of porGrupo.values()) {
    if (vs[0].prioridad !== "Necesaria" || !vs.some((v) => tocadas.has(v.id))) continue;
    if (!vs.some((v) => final(v) === "aprobar")) necesariasRechazadas.push(vs.map((v) => v.descripcion).join(" / "));
  }
  if (necesariasRechazadas.length > 0 && envio.entiendeNecesarias !== true) {
    return { ok: false, codigo: "NECESARIA", error: `Sin "${necesariasRechazadas.join('", "')}" no podemos continuar con la reparación. Confirma que lo entiendes para enviar tu respuesta.` };
  }
  return { ok: true, cambios, cedulaVerificada: !!digitos, necesariasRechazadas };
}

// ─── Vigencia y bloqueo ──────────────────────────────────────────────────────

export type EstadoEnlace = "vigente" | "vencido" | "bloqueado";

export function estadoEnlace(venceIso: string, bloqueadoHastaIso: string, ahora: Date = new Date()): EstadoEnlace {
  const bloqueo = Date.parse(bloqueadoHastaIso || "");
  if (Number.isFinite(bloqueo) && bloqueo > ahora.getTime()) return "bloqueado";
  const vence = Date.parse(venceIso || "");
  if (!Number.isFinite(vence) || vence <= ahora.getTime()) return "vencido";
  return "vigente";
}

export function nuevaVigencia(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() + VIGENCIA_DIAS * 24 * 3600 * 1000).toISOString();
}

/** Tras un intento fallido de cédula: nuevo contador y bloqueo (si toca). */
export function registrarIntentoFallido(intentos: number, ahora: Date = new Date()): { intentos: number; bloqueadoHasta: string | null } {
  const n = intentos + 1;
  if (n >= MAX_INTENTOS_CEDULA) return { intentos: 0, bloqueadoHasta: new Date(ahora.getTime() + BLOQUEO_MINUTOS * 60 * 1000).toISOString() };
  return { intentos: n, bloqueadoHasta: null };
}

/** "Carlos Andrés Pérez" → "Carlos" (el enlace no expone el nombre completo). */
export function primerNombre(nombre: string): string {
  return (nombre ?? "").trim().split(/\s+/)[0] ?? "";
}
