// Alertas de atención de las órdenes (rediseño R10, tableros 10 y 11
// aprobados el 22-nov-2026) — reglas PURAS.
//
// Cada orden abierta tiene UNA situación que manda (la más atrasada) y un
// semáforo: al día · por vencer (ámbar) · necesita atención (rojo). El reloj
// cuenta solo el horario del taller (lun–vie 9:30–18:00, sáb 9:00–14:00;
// domingo no cuenta). «1 d» = una jornada de lunes a viernes.
// Decisiones del dueño (22 y 23-nov): responsable = quien toma la orden; el
// botón rojo cuenta todas las órdenes del taller; el repuesto se pone rojo al
// pasar la fecha prevista = día que el cliente aprobó + el tiempo estimado de
// la línea («2 a 3 semanas» → 21 días). Las «Esperando Respuesta» de 60 días o
// más ya están en la política de baja: aquí no suenan.
//
// Ojo (Tailwind lee lib/**): nada de corchetes con dos puntos; las horas van
// en minutos desde la medianoche (570 = 9:30).

import { diasDeTiempo, fechaEcuador } from "@/lib/pedidos-especiales/seguimiento";

// ─── Configuración ───────────────────────────────────────────────────────────

export type Tramo = { desde: number; hasta: number };
export type Horario = { lunVie: Tramo; sab: Tramo | null };
export type Plazo = { n: number; u: "h" | "d" };
export type Umbral = { porVencer: Plazo | null; atencion: Plazo | null };

export const CLAVES_ALERTA = [
  "sinResponsable", "sinPresupuesto", "presupuestoSinEnviar", "clienteNoResponde", "aprobadoSinEmpezar",
  "sinAvance", "repuestoAtrasado", "esperaCliente", "todoHecho", "sinAvisar", "noRetira",
] as const;
export type ClaveAlerta = (typeof CLAVES_ALERTA)[number];

/** Las que se editan en los ajustes (el repuesto va por fecha). */
export const CLAVES_CON_PLAZO = CLAVES_ALERTA.filter((c) => c !== "repuestoAtrasado") as Exclude<ClaveAlerta, "repuestoAtrasado">[];

export const NOMBRE_SITUACION: Record<ClaveAlerta, string> = {
  sinResponsable: "Sin responsable",
  sinPresupuesto: "Sin presupuesto",
  presupuestoSinEnviar: "Presupuesto sin enviar",
  clienteNoResponde: "Cliente no responde el presupuesto",
  aprobadoSinEmpezar: "Aprobado, sin empezar",
  sinAvance: "En proceso sin avance",
  repuestoAtrasado: "En espera · repuesto",
  esperaCliente: "En espera · pago o respuesta del cliente",
  todoHecho: "Todo «Hecho», orden sin completar",
  sinAvisar: "Completado, cliente sin avisar",
  noRetira: "Avisado, no retira",
};

export type ConfigAlertas = { horario: Horario; plazos: Record<Exclude<ClaveAlerta, "repuestoAtrasado">, Umbral> };

const h = (n: number): Plazo => ({ n, u: "h" });
const d = (n: number): Plazo => ({ n, u: "d" });

/** Tablero 11 aprobado (los tiempos los puede cambiar un administrador). */
export const CONFIG_INICIAL: ConfigAlertas = {
  horario: { lunVie: { desde: 570, hasta: 1080 }, sab: { desde: 540, hasta: 840 } },
  plazos: {
    sinResponsable: { porVencer: h(2), atencion: h(4) },
    sinPresupuesto: { porVencer: d(1), atencion: d(2) },
    presupuestoSinEnviar: { porVencer: h(4), atencion: d(1) },
    clienteNoResponde: { porVencer: d(2), atencion: d(4) },
    aprobadoSinEmpezar: { porVencer: d(1), atencion: d(2) },
    sinAvance: { porVencer: d(2), atencion: d(3) },
    esperaCliente: { porVencer: d(2), atencion: d(4) },
    todoHecho: { porVencer: null, atencion: h(4) },
    sinAvisar: { porVencer: null, atencion: h(4) },
    noRetira: { porVencer: d(7), atencion: d(15) },
  },
};

export const DIAS_BAJA = 60;

// ─── Reloj del taller ────────────────────────────────────────────────────────

const HORA = 3_600_000;
const DIA = 24 * HORA;
const OFFSET_EC = 5 * HORA; // Ecuador: UTC−5 todo el año

export const minutosDia = (h0: Horario) => h0.lunVie.hasta - h0.lunVie.desde;
export const minutosDe = (p: Plazo, h0: Horario) => (p.u === "h" ? p.n * 60 : p.n * minutosDia(h0));

/** Minutos dentro del horario del taller entre dos instantes. */
export function minutosHabiles(desde: string | Date, hasta: Date, h0: Horario): number {
  const a = (typeof desde === "string" ? Date.parse(desde) : desde.getTime()) - OFFSET_EC;
  const b = hasta.getTime() - OFFSET_EC;
  if (!Number.isFinite(a) || b <= a) return 0;
  let total = 0;
  // Tope de 2 años para no recorrer de más con fechas raras.
  const inicio = Math.max(Math.floor(a / DIA) * DIA, b - 730 * DIA);
  for (let dia = inicio; dia < b; dia += DIA) {
    const dow = new Date(dia).getUTCDay();
    const tramo = dow === 0 ? null : dow === 6 ? h0.sab : h0.lunVie;
    if (!tramo) continue;
    const s = Math.max(a, dia + tramo.desde * 60_000);
    const e = Math.min(b, dia + tramo.hasta * 60_000);
    if (e > s) total += (e - s) / 60_000;
  }
  return Math.floor(total);
}

/** «<1 h» · «3 h» · «2 d» (días de jornada). */
export function textoHace(minutos: number, h0: Horario): string {
  if (minutos < 60) return "<1 h";
  const dia = minutosDia(h0);
  return minutos < dia ? `${Math.floor(minutos / 60)} h` : `${Math.floor(minutos / dia)} d`;
}

export function textoPlazo(p: Plazo | null): string {
  return p ? `${p.n} ${p.u}` : "—";
}

/** «4 h», «1 d», «1,5 d» → plazo. Vacío o «—» → null. */
export function leerPlazo(t: string): Plazo | null | "error" {
  const s = t.trim().toLowerCase().replace(",", ".");
  if (!s || s === "—" || s === "-") return null;
  const m = /^(\d+(?:\.\d+)?)\s*(h|hora|horas|d|dia|dias|día|días)$/.exec(s);
  if (!m) return "error";
  const n = Number(m[1]);
  if (!(n > 0) || n > 365) return "error";
  return { n, u: m[2].startsWith("h") ? "h" : "d" };
}

export function textoHora(min: number): string {
  return `${Math.floor(min / 60)}${String.fromCharCode(58)}${String(min % 60).padStart(2, "0")}`;
}

/** «9:30» → 570. */
export function leerHora(t: string): number | null {
  const m = /^(\d{1,2})(?:\x3a|\.|h)?(\d{2})?$/.exec(t.trim());
  if (!m) return null;
  const hh = Number(m[1]), mm = Number(m[2] ?? "0");
  return hh <= 23 && mm <= 59 ? hh * 60 + mm : null;
}

// ─── Datos de una orden ──────────────────────────────────────────────────────

export type LineaAlerta = {
  estado: string;
  estadoTrabajo: string;
  motivoEspera: string;
  trabajoEn: string | null;
  fechaAprobacion: string | null;
  bajoPedido: boolean;
  tiempoEstimado: string;
  descripcion: string;
};

export type OrdenAlerta = {
  id: string;
  codigo: string;
  estado: string;
  fechaIngreso: string;
  responsableId: string | null;
  ultimoMovimiento: string | null;
  pospuestaHasta: string | null;
  clienteAvisado: string | null;
  presupuestoEnviado: string | null;
  lineas: LineaAlerta[];
};

export type Nivel = "atencion" | "porVencer" | "alDia";

export type AccionAlerta = "presupuesto" | "escribir" | "anotar" | "completar" | null;

export type Alerta = {
  clave: ClaveAlerta;
  nivel: Nivel;
  /** «Cliente no responde» · «Repuesto atrasado (llegaba 18 nov)». */
  texto: string;
  desde: string;
  minutos: number;
  hace: string;
  /** Si alguien la pospuso y aún no llega la fecha (no suena). */
  pospuestaHasta: string | null;
  accion: AccionAlerta;
};

const CERRADAS = new Set(["Finalizado Entregado", "Enviado a Reciclaje"]);
const APROBADA = new Set(["Aprobada", "Cargada"]);
const ESPERA_CLIENTE = new Set(["Pago del cliente", "Respuesta del cliente", "Novedad"]);

const TEXTO: Record<ClaveAlerta, string> = {
  sinResponsable: "Sin responsable",
  sinPresupuesto: "Sin presupuesto",
  presupuestoSinEnviar: "Presupuesto sin enviar",
  clienteNoResponde: "Cliente no responde",
  aprobadoSinEmpezar: "Aprobado, sin empezar",
  sinAvance: "Sin avance",
  repuestoAtrasado: "Repuesto atrasado",
  esperaCliente: "Esperando al cliente",
  todoHecho: "Todo hecho, sin completar",
  sinAvisar: "Cliente sin avisar",
  noRetira: "Avisado, no retira",
};

const ACCION: Record<ClaveAlerta, AccionAlerta> = {
  sinResponsable: null, // la cabecera ya tiene «Tomar orden»
  sinPresupuesto: "presupuesto",
  presupuestoSinEnviar: "presupuesto",
  clienteNoResponde: "escribir",
  aprobadoSinEmpezar: "anotar",
  sinAvance: "anotar",
  repuestoAtrasado: "anotar",
  esperaCliente: "escribir",
  todoHecho: "completar",
  sinAvisar: null, // la cabecera ya tiene «Avisar al cliente»
  noRetira: "escribir",
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const diaCorto = (fecha: string) => { const x = new Date(`${fecha}T12:00:00Z`); return `${x.getUTCDate()} ${MESES[x.getUTCMonth()]}`; };

const maxIso = (xs: Array<string | null | undefined>): string | null => {
  let mejor: string | null = null;
  for (const x of xs) if (x && Number.isFinite(Date.parse(x)) && (!mejor || Date.parse(x) > Date.parse(mejor))) mejor = x;
  return mejor;
};
const minIso = (xs: Array<string | null | undefined>): string | null => {
  let mejor: string | null = null;
  for (const x of xs) if (x && Number.isFinite(Date.parse(x)) && (!mejor || Date.parse(x) < Date.parse(mejor))) mejor = x;
  return mejor;
};

const trabajo = (l: LineaAlerta) => (l.estadoTrabajo || "Por hacer").trim();

/** Fecha prevista de llegada del repuesto ("aaaa-mm-dd") o null si no hay datos. */
export function llegadaPrevista(l: Pick<LineaAlerta, "fechaAprobacion" | "tiempoEstimado">): string | null {
  const r = diasDeTiempo(l.tiempoEstimado);
  if (!r || !l.fechaAprobacion || !Number.isFinite(Date.parse(l.fechaAprobacion))) return null;
  const base = fechaEcuador(l.fechaAprobacion);
  return new Date(Date.parse(`${base}T12:00:00Z`) + r[1] * DIA).toISOString().slice(0, 10);
}

type Candidata = { clave: ClaveAlerta; desde: string; vencida?: string };

/** Situaciones que aplican a la orden (antes de mirar los tiempos). */
export function situaciones(o: OrdenAlerta, ahora: Date): Candidata[] {
  if (CERRADAS.has(o.estado)) return [];
  const mov = maxIso([o.ultimoMovimiento, o.fechaIngreso]) ?? o.fechaIngreso;
  const c: Candidata[] = [];
  if (!o.responsableId) c.push({ clave: "sinResponsable", desde: o.fechaIngreso });

  const vivas = o.lineas.filter((l) => l.estado !== "Rechazada");
  const aprobadas = vivas.filter((l) => APROBADA.has(l.estado));

  if (o.estado === "Completado") {
    c.push(o.clienteAvisado ? { clave: "noRetira", desde: o.clienteAvisado } : { clave: "sinAvisar", desde: mov });
    return c;
  }

  if (!aprobadas.length) {
    if (!vivas.length && o.estado !== "Esperando Respuesta") c.push({ clave: "sinPresupuesto", desde: o.fechaIngreso });
    else if (o.presupuestoEnviado || o.estado === "Esperando Respuesta") {
      const desde = o.presupuestoEnviado ?? mov;
      // 60 días o más: ya es de la política de baja (tiene sus propios filtros).
      if ((ahora.getTime() - Date.parse(desde)) / DIA < DIAS_BAJA) c.push({ clave: "clienteNoResponde", desde });
    } else c.push({ clave: "presupuestoSinEnviar", desde: mov });
    return c;
  }

  const pendientes = aprobadas.filter((l) => trabajo(l) !== "Hecho");
  if (!pendientes.length) {
    c.push({ clave: "todoHecho", desde: maxIso([...aprobadas.map((l) => l.trabajoEn), mov]) ?? mov });
    return c;
  }
  const esperaRepuesto = pendientes.filter((l) =>
    (trabajo(l) === "En espera" && l.motivoEspera === "Repuesto") || (l.bajoPedido && trabajo(l) === "Por hacer"));
  const esperaCliente = pendientes.filter((l) => trabajo(l) === "En espera" && ESPERA_CLIENTE.has(l.motivoEspera));
  const activos = pendientes.filter((l) => !esperaRepuesto.includes(l) && !esperaCliente.includes(l));

  const hoy = fechaEcuador(ahora);
  for (const l of esperaRepuesto) {
    const eta = llegadaPrevista(l);
    if (eta && hoy > eta) c.push({ clave: "repuestoAtrasado", desde: `${eta}T23:00:00.000Z`, vencida: eta });
  }
  if (esperaCliente.length) c.push({ clave: "esperaCliente", desde: maxIso([...esperaCliente.map((l) => l.trabajoEn), mov]) ?? mov });
  if (activos.length) {
    const empezado = aprobadas.some((l) => trabajo(l) !== "Por hacer");
    c.push(empezado
      ? { clave: "sinAvance", desde: maxIso([...aprobadas.map((l) => l.trabajoEn), mov]) ?? mov }
      : { clave: "aprobadoSinEmpezar", desde: minIso(aprobadas.map((l) => l.fechaAprobacion)) ?? mov });
  }
  return c;
}

const PESO: Record<Nivel, number> = { atencion: 2, porVencer: 1, alDia: 0 };

/** La situación que manda en la orden, con su semáforo. null = nada que vigilar. */
export function evaluarOrden(o: OrdenAlerta, cfg: ConfigAlertas, ahora: Date): Alerta | null {
  const cands = situaciones(o, ahora);
  if (!cands.length) return null;
  const evaluadas = cands.map((s) => {
    const minutos = minutosHabiles(s.desde, ahora, cfg.horario);
    let nivel: Nivel = "alDia";
    let avance = 0;
    if (s.clave === "repuestoAtrasado") { nivel = "atencion"; avance = 2; }
    else {
      const u = cfg.plazos[s.clave];
      const at = u.atencion ? minutosDe(u.atencion, cfg.horario) : null;
      const pv = u.porVencer ? minutosDe(u.porVencer, cfg.horario) : null;
      if (at !== null && minutos >= at) nivel = "atencion";
      else if (pv !== null && minutos >= pv) nivel = "porVencer";
      avance = at ? minutos / at : 0;
    }
    const texto = s.clave === "repuestoAtrasado" && s.vencida ? `${TEXTO.repuestoAtrasado} (llegaba ${diaCorto(s.vencida)})` : TEXTO[s.clave];
    return { s, minutos, nivel, avance, texto };
  });
  evaluadas.sort((a, b) => PESO[b.nivel] - PESO[a.nivel] || b.avance - a.avance);
  const top = evaluadas[0];
  const pospuesta = o.pospuestaHasta && Date.parse(o.pospuestaHasta) > ahora.getTime() ? o.pospuestaHasta : null;
  return {
    clave: top.s.clave,
    nivel: pospuesta ? "alDia" : top.nivel,
    texto: top.texto,
    desde: top.s.desde,
    minutos: top.minutos,
    hace: textoHace(top.minutos, cfg.horario),
    pospuestaHasta: pospuesta,
    accion: ACCION[top.s.clave],
  };
}

// ─── Resumen (barra y lista) ─────────────────────────────────────────────────

export type FilaAlerta = { ordenId: string; codigo: string; responsableId: string | null; alerta: Alerta };

export function resumenAlertas(filas: FilaAlerta[], yo: string | null) {
  const suenan = filas.filter((f) => f.alerta.nivel !== "alDia");
  return {
    atencion: suenan.filter((f) => f.alerta.nivel === "atencion").length,
    porVencer: suenan.filter((f) => f.alerta.nivel === "porVencer").length,
    mias: yo ? suenan.filter((f) => f.responsableId === yo).length : 0,
    sinResponsable: filas.filter((f) => !f.responsableId).length,
  };
}

/** Lo más urgente primero: rojo, ámbar; dentro de cada uno, lo más atrasado. */
export function ordenarFilas<T extends { alerta: Alerta }>(filas: T[]): T[] {
  return [...filas].sort((a, b) => PESO[b.alerta.nivel] - PESO[a.alerta.nivel] || b.alerta.minutos - a.alerta.minutos);
}

// ─── Posponer ────────────────────────────────────────────────────────────────

/** Próximo día que abre el taller después de hoy (para «Mañana» / «Lun 24»). */
export function proximoDiaHabil(ahora: Date, h0: Horario, saltos = 1): string {
  let t = Date.parse(`${fechaEcuador(ahora)}T12:00:00Z`);
  let n = 0;
  while (n < saltos) {
    t += DIA;
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && (dow !== 6 || h0.sab)) n++;
  }
  return new Date(t).toISOString().slice(0, 10);
}

/** body: { hasta: "aaaa-mm-dd", motivo } → vuelve a sonar ese día al abrir. */
export function revisarPosponer(body: unknown, ahora: Date, h0: Horario): { ok: true; hasta: string; fecha: string; motivo: string } | { ok: false; error: string } {
  const b = (body ?? {}) as { hasta?: unknown; motivo?: unknown };
  const fecha = typeof b.hasta === "string" ? b.hasta.trim() : "";
  const motivo = typeof b.motivo === "string" ? b.motivo.trim().replace(/\s+/g, " ") : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(Date.parse(`${fecha}T12:00:00Z`))) return { ok: false, error: "Elige hasta cuándo." };
  if (fecha <= fechaEcuador(ahora)) return { ok: false, error: "La fecha debe ser después de hoy." };
  if (Date.parse(`${fecha}T12:00:00Z`) - ahora.getTime() > 60 * DIA) return { ok: false, error: "Máximo 60 días." };
  if (motivo.length < 5) return { ok: false, error: "Escribe el motivo (lo verá el equipo en la Actividad)." };
  if (motivo.length > 200) return { ok: false, error: "Motivo muy largo (máximo 200 letras)." };
  const dow = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  const tramo = dow === 6 ? h0.sab : h0.lunVie;
  const abre = tramo?.desde ?? h0.lunVie.desde;
  // Hora de apertura de ese día en Ecuador, guardada en UTC.
  const hasta = new Date(Date.parse(`${fecha}T00:00:00Z`) + abre * 60_000 + OFFSET_EC).toISOString();
  return { ok: true, hasta, fecha, motivo };
}

export function textoFecha(fecha: string): string {
  const x = new Date(`${fecha}T12:00:00Z`);
  return `${["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][x.getUTCDay()]} ${x.getUTCDate()} ${MESES[x.getUTCMonth()]}`;
}

// ─── Ajustes ─────────────────────────────────────────────────────────────────

/** Lo guardado se mezcla con lo inicial (una clave nueva nunca queda vacía). */
export function mezclarConfig(guardada: unknown): ConfigAlertas {
  const g = (guardada ?? {}) as Partial<ConfigAlertas>;
  const tramo = (t: unknown, def: Tramo | null): Tramo | null => {
    if (t === null) return null;
    const x = t as Tramo | undefined;
    return x && Number.isFinite(x.desde) && Number.isFinite(x.hasta) && x.hasta > x.desde ? { desde: x.desde, hasta: x.hasta } : def;
  };
  const plazo = (p: unknown, def: Plazo | null): Plazo | null => {
    if (p === null) return null;
    const x = p as Plazo | undefined;
    return x && x.n > 0 && (x.u === "h" || x.u === "d") ? { n: x.n, u: x.u } : def;
  };
  const plazos = { ...CONFIG_INICIAL.plazos };
  for (const k of CLAVES_CON_PLAZO) {
    const u = (g.plazos as Record<string, Umbral> | undefined)?.[k];
    if (u) plazos[k] = { porVencer: plazo(u.porVencer, CONFIG_INICIAL.plazos[k].porVencer), atencion: plazo(u.atencion, CONFIG_INICIAL.plazos[k].atencion) };
  }
  return {
    horario: {
      lunVie: tramo(g.horario?.lunVie, CONFIG_INICIAL.horario.lunVie) ?? CONFIG_INICIAL.horario.lunVie,
      sab: g.horario && "sab" in g.horario ? tramo(g.horario.sab, CONFIG_INICIAL.horario.sab) : CONFIG_INICIAL.horario.sab,
    },
    plazos,
  };
}

/** Lo que manda la pantalla de ajustes. El ámbar debe llegar antes que el rojo. */
export function revisarConfig(body: unknown): { ok: true; config: ConfigAlertas } | { ok: false; error: string } {
  const c = mezclarConfig(body);
  const b = (body ?? {}) as Partial<ConfigAlertas>;
  if (!b.horario || !b.plazos) return { ok: false, error: "Faltan el horario o los tiempos." };
  for (const k of CLAVES_CON_PLAZO) {
    const u = c.plazos[k];
    if (u.porVencer && u.atencion && minutosDe(u.porVencer, c.horario) >= minutosDe(u.atencion, c.horario)) {
      return { ok: false, error: `«${NOMBRE_SITUACION[k]}»: «por vencer» debe ser menor que «atención».` };
    }
    if (!u.atencion) return { ok: false, error: `«${NOMBRE_SITUACION[k]}» necesita un tiempo de atención.` };
  }
  return { ok: true, config: c };
}

// ─── Último movimiento ───────────────────────────────────────────────────────

/** Lo que hace una persona y cuenta como movimiento de la orden. */
export function cuentaComoMovimiento(tipoActividad: string | null | undefined): boolean {
  return !["Contraseña vista", "Alerta pospuesta", "Responsable"].includes((tipoActividad ?? "").trim());
}
