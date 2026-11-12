// Seguimiento del PEDIDO ESPECIAL — reglas PURAS (punto 10B, 12-nov-2026).
// Sin Airtable ni React: con prueba en __tests__/seguimiento.test.ts.
//
// Decisiones del dueño (10 y 12-nov), claude/Diseno_Fase3_Pedidos.md:
//   · Títulos y frases de los hitos APROBADOS (tabla de abajo).
//   · Automáticos desde Shipping V2 (Logística ya lo registra):
//       Pedido confirmado     ← el pago que confirma el pedido (Aceptado en)
//       Comprado para ti      ← la solicitud de compra queda Comprada (Fecha compra)
//       Enviado por el prov.  ← el artículo tiene rastreo / va "En tránsito"
//       Preparándose p/viajar ← el artículo llegó al casillero (en una caja / por empacar)
//       En camino a Ecuador   ← rastreo Miami → Ecuador (del artículo o de su caja)
//                               o flete a Ecuador pagado (NO la fecha de envío de la caja:
//                               puede ser solo cuando se cerró o se agrupó en Miami)
//       En proceso de aduana  ← MANUAL ("Siguiente"): no siempre hay arancel
//       ¡Llegó a la tienda!   ← SOLO Recepción ("Recibido"); nunca a mano
//       Entregado             ← Entregar al cliente
//   · Proveedor local: Confirmado → Comprado → En camino a la tienda → ¡Llegó! → Entregado.
//   · Llegada estimada: el "Tiempo de llegada" de lo aceptado, contado desde la
//     confirmación; el empleado puede corregirla. Si pasa y no llegó, el
//     cliente ve "Con un poco de retraso".
//   · "Necesitamos hablar contigo": lo activa el empleado con una nota INTERNA;
//     el cliente ve solo el título y el botón de WhatsApp.
//
// Un pedido con varios artículos avanza al ritmo del más atrasado: un paso
// está hecho cuando TODOS sus artículos lo alcanzaron.

const DIA = 86_400_000;

export type Ruta = "extranjero" | "local";

export type ClaveHito =
  | "confirmado" | "comprado" | "enviado" | "preparando" | "en_camino" | "aduana"
  | "en_camino_tienda" | "llego" | "entregado";

export const HITOS: Record<ClaveHito, { titulo: string; frase: string }> = {
  confirmado:       { titulo: "Pedido confirmado",        frase: "Recibimos tu pago y ya estamos gestionando tu pedido." },
  comprado:         { titulo: "Comprado para ti",         frase: "Ya lo compramos y está apartado a tu nombre." },
  enviado:          { titulo: "Enviado por el proveedor", frase: "Va camino a nuestro centro de envíos." },
  preparando:       { titulo: "Preparándose para viajar", frase: "Llegó a nuestro centro de envíos y se alista para viajar a Ecuador." },
  en_camino:        { titulo: "En camino a Ecuador",      frase: "Está viajando. Te avisamos aquí cuando llegue." },
  aduana:           { titulo: "En proceso de aduana",     frase: "Es un trámite normal; a veces toma unos días sin novedades." },
  en_camino_tienda: { titulo: "En camino a la tienda",    frase: "El proveedor ya lo despachó hacia SUPER GEEK." },
  llego:            { titulo: "¡Llegó a la tienda!",      frase: "Ya está en SUPER GEEK, listo para que lo retires." },
  entregado:        { titulo: "Entregado",                frase: "¡Gracias por tu compra!" },
};

export const RUTAS: Record<Ruta, ClaveHito[]> = {
  extranjero: ["confirmado", "comprado", "enviado", "preparando", "en_camino", "aduana", "llego", "entregado"],
  local: ["confirmado", "comprado", "en_camino_tienda", "llego", "entregado"],
};

/** Pasos que el empleado puede marcar con "Siguiente" (los demás los dice el sistema). */
export const HITOS_MANUALES: ReadonlySet<ClaveHito> = new Set(["enviado", "preparando", "en_camino", "aduana", "en_camino_tienda"]);

export const AVISO_HABLAR = "Necesitamos hablar contigo";
export const AVISO_RETRASO = "Con un poco de retraso";

/** Lo que Shipping V2 dice de UN artículo del pedido. */
export type SenalArticulo = {
  /** Comprado: fecha de compra (de la solicitud o del registro del artículo). */
  compradoEn: string | null;
  /** Tiene rastreo hacia el casillero / directo, o va "En tránsito". */
  enviado: boolean;
  /** Llegó al casillero: está en una caja o "Pendiente de packing". */
  enCasillero: boolean;
  /** Rastreo Miami → Ecuador (artículo o caja) o flete a Ecuador pagado. */
  haciaEcuador: boolean;
  /** Fecha del pago del flete a Ecuador, si la hay. */
  fleteEn: string | null;
  /** Recepción "Recibido": fecha de recepción (o "" si recibido sin fecha). */
  recibidoEn: string | null;
};

/** Lo que el portal guarda en "Seguimiento del pedido" (JSON). */
export type SeguimientoGuardado = {
  /** Fecha en que el sistema VIO por primera vez un paso que Shipping no fecha. */
  vistos?: Partial<Record<ClaveHito, string>>;
  /** Pasos marcados a mano con "Siguiente". */
  manuales?: Partial<Record<ClaveHito, { fecha: string; por: string }>>;
  /** Llegada estimada corregida por el empleado (YYYY-MM-DD). */
  llegada?: { desde: string; hasta: string; por: string } | null;
  /** "Necesitamos hablar contigo" (la nota NUNCA va al cliente). */
  aviso?: { nota: string; por: string; fecha: string } | null;
};

export function leerGuardado(json: string | null | undefined): SeguimientoGuardado {
  try {
    const g = JSON.parse(json || "{}") as SeguimientoGuardado;
    return g && typeof g === "object" ? g : {};
  } catch {
    return {};
  }
}

// ─── Llegada estimada ────────────────────────────────────────────────────────

/**
 * "2 a 3 semanas" → [14, 21] días. Entiende los valores del catálogo
 * ("24 horas", "2 a 3 días", "1 semana", "2 a 3 semanas", "1 mes") y texto
 * libre como "12–15 días" o "5-7 días". "Por confirmar" o vacío → null.
 */
export function diasDeTiempo(texto: string | null | undefined): [number, number] | null {
  const t = (texto ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  if (!t) return null;
  const m = /(\d+)\s*(?:a|-|–|—|al|hasta)?\s*(\d+)?\s*(hora|dia|semana|mes)/.exec(t);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  const factor = m[3] === "hora" ? 1 / 24 : m[3] === "dia" ? 1 : m[3] === "semana" ? 7 : 30;
  const desde = Math.max(1, Math.ceil(Math.min(a, b) * factor));
  const hasta = Math.max(desde, Math.ceil(Math.max(a, b) * factor));
  return [desde, hasta];
}

const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-11-18" (fecha de Ecuador) desde un instante. */
export function fechaEcuador(iso: string | Date): string {
  const t = typeof iso === "string" ? Date.parse(iso) : iso.getTime();
  return new Date(t - 5 * 3_600_000).toISOString().slice(0, 10);
}

function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T12:00:00Z`) + dias * DIA).toISOString().slice(0, 10);
}

/** "mié 18-nov" */
export function textoDia(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  return `${DIAS_CORTOS[d.getUTCDay()]} ${d.getUTCDate()}-${MESES[d.getUTCMonth()]}`;
}

/** "mié 18 – vie 20 nov" (o "mié 18-nov" si es un solo día). */
export function textoRango(desde: string, hasta: string): string {
  if (desde === hasta) return textoDia(desde);
  const a = new Date(`${desde}T12:00:00Z`), b = new Date(`${hasta}T12:00:00Z`);
  const mismoMes = a.getUTCMonth() === b.getUTCMonth();
  return mismoMes
    ? `${DIAS_CORTOS[a.getUTCDay()]} ${a.getUTCDate()} – ${DIAS_CORTOS[b.getUTCDay()]} ${b.getUTCDate()} ${MESES[b.getUTCMonth()]}`
    : `${textoDia(desde)} – ${textoDia(hasta)}`;
}

export function llegadaEstimada(input: {
  confirmadoEn: string | null;
  tiempos: readonly string[];
  corregida?: SeguimientoGuardado["llegada"];
}): { desde: string; hasta: string; corregida: boolean } | null {
  if (input.corregida?.desde && input.corregida?.hasta) {
    return { desde: input.corregida.desde, hasta: input.corregida.hasta, corregida: true };
  }
  if (!input.confirmadoEn) return null;
  const rangos = input.tiempos.map(diasDeTiempo).filter((r): r is [number, number] => !!r);
  if (!rangos.length) return null;
  // El pedido llega cuando llega lo más lento.
  const desdeDias = Math.max(...rangos.map((r) => r[0]));
  const hastaDias = Math.max(...rangos.map((r) => r[1]));
  const base = fechaEcuador(input.confirmadoEn);
  return { desde: sumarDias(base, desdeDias), hasta: sumarDias(base, hastaDias), corregida: false };
}

// ─── Hitos ───────────────────────────────────────────────────────────────────

export type EstadoHito = "hecho" | "actual" | "pendiente";

export type HitoVista = {
  clave: ClaveHito;
  titulo: string;
  frase: string;
  estado: EstadoHito;
  /** Fecha del paso (ISO) o "". */
  fecha: string;
  manual: boolean;
};

export type SeguimientoVista = {
  ruta: Ruta;
  hitos: HitoVista[];
  /** El último paso hecho (null si el pedido aún no se confirma). */
  actual: HitoVista | null;
  /** El siguiente paso que el empleado puede marcar a mano (null = lo dice el sistema). */
  siguienteManual: { clave: ClaveHito; titulo: string } | null;
  llegada: { desde: string; hasta: string; texto: string; corregida: boolean } | null;
  retraso: boolean;
  /** Para el CLIENTE: título del aviso (sin la nota). */
  aviso: string | null;
  /** Para el EMPLEADO: la nota del aviso. */
  avisoInterno: { nota: string; por: string; fecha: string } | null;
  /** Pasos que el sistema vio hoy por primera vez: se guardan con esta fecha. */
  nuevosVistos: Partial<Record<ClaveHito, string>>;
};

/**
 * ¿Cuál es el paso más avanzado que alcanzó UN artículo? (índice en la ruta).
 * Cada señal implica las anteriores: si ya llegó, ya se compró y se envió.
 */
function nivelArticulo(a: SenalArticulo, ruta: Ruta): number {
  const orden = RUTAS[ruta];
  const idx = (c: ClaveHito) => orden.indexOf(c);
  if (a.recibidoEn !== null) return idx("llego");
  if (ruta === "extranjero") {
    if (a.haciaEcuador) return idx("en_camino");
    if (a.enCasillero) return idx("preparando");
    if (a.enviado) return idx("enviado");
  } else if (a.enviado || a.haciaEcuador || a.enCasillero) {
    return idx("en_camino_tienda");
  }
  if (a.compradoEn) return idx("comprado");
  return idx("confirmado");
}

export function construirSeguimiento(input: {
  estado: string;
  ruta: Ruta;
  confirmadoEn: string | null;
  entregadoEn?: string | null;
  articulos: readonly SenalArticulo[];
  tiempos: readonly string[];
  guardado: SeguimientoGuardado;
  ahora?: Date;
}): SeguimientoVista {
  const ahora = input.ahora ?? new Date();
  const orden = RUTAS[input.ruta];
  const g = input.guardado;
  const confirmado = input.estado === "Aceptado" || input.estado === "Entregado";

  // Nivel automático: el del artículo más atrasado (todos deben alcanzarlo).
  let nivel = -1;
  if (confirmado) {
    nivel = input.articulos.length
      ? Math.min(...input.articulos.map((a) => nivelArticulo(a, input.ruta)))
      : orden.indexOf("confirmado");
  }
  if (input.estado === "Entregado") nivel = orden.indexOf("entregado");
  // Lo marcado a mano solo puede ADELANTAR pasos manuales (nunca "¡Llegó!").
  if (confirmado) {
    for (const [clave] of Object.entries(g.manuales ?? {}) as [ClaveHito, unknown][]) {
      const i = orden.indexOf(clave);
      if (i > nivel && HITOS_MANUALES.has(clave)) nivel = i;
    }
  }

  // Fechas: la real si Shipping la tiene; si no, la de la marca manual o la
  // primera vez que el sistema lo vio (y si es hoy, se guarda).
  const primeraCompra = input.articulos.map((a) => a.compradoEn).filter((x): x is string => !!x).sort().pop() ?? "";
  const ultimaRecepcion = input.articulos.every((a) => a.recibidoEn)
    ? input.articulos.map((a) => a.recibidoEn as string).sort().pop() ?? ""
    : "";
  const ultimoFlete = input.articulos.map((a) => a.fleteEn).filter((x): x is string => !!x).sort().pop() ?? "";
  const fechaFuente: Partial<Record<ClaveHito, string>> = {
    confirmado: input.confirmadoEn ?? "",
    comprado: primeraCompra,
    en_camino: ultimoFlete,
    llego: ultimaRecepcion,
    entregado: input.entregadoEn ?? "",
  };

  const nuevosVistos: Partial<Record<ClaveHito, string>> = {};
  const hitos: HitoVista[] = orden.map((clave, i) => {
    const hecho = i <= nivel;
    const manual = !!g.manuales?.[clave];
    let fecha = "";
    if (hecho) {
      fecha = g.manuales?.[clave]?.fecha || fechaFuente[clave] || g.vistos?.[clave] || "";
      // Solo el paso RECIÉN alcanzado toma la fecha de hoy; uno que se saltó
      // (p. ej. llegó sin que nadie viera el "En camino") queda sin fecha.
      if (!fecha && i === nivel) {
        fecha = ahora.toISOString();
        nuevosVistos[clave] = fecha;
      }
    }
    return { clave, ...HITOS[clave], estado: hecho ? (i === nivel ? "actual" : "hecho") : "pendiente", fecha, manual };
  });
  const actual = nivel >= 0 ? hitos[nivel] : null;

  const sig = confirmado && nivel + 1 < orden.length ? orden[nivel + 1] : null;
  const siguienteManual = sig && HITOS_MANUALES.has(sig) ? { clave: sig, titulo: HITOS[sig].titulo } : null;

  const est = confirmado ? llegadaEstimada({ confirmadoEn: input.confirmadoEn, tiempos: input.tiempos, corregida: g.llegada }) : null;
  const llego = nivel >= orden.indexOf("llego");
  const retraso = !!est && !llego && fechaEcuador(ahora) > est.hasta;

  return {
    ruta: input.ruta,
    hitos,
    actual,
    siguienteManual,
    llegada: est ? { ...est, texto: textoRango(est.desde, est.hasta) } : null,
    retraso,
    aviso: g.aviso ? AVISO_HABLAR : retraso ? AVISO_RETRASO : null,
    avisoInterno: g.aviso ?? null,
    nuevosVistos,
  };
}

/** Lo que se le muestra al CLIENTE: sin notas internas ni "manual". */
export type SeguimientoCliente = {
  hitos: Array<{ titulo: string; frase: string; estado: EstadoHito; fecha: string }>;
  actual: { titulo: string; frase: string } | null;
  llegada: string | null;
  aviso: string | null;
};

export function seguimientoParaCliente(s: SeguimientoVista): SeguimientoCliente {
  return {
    hitos: s.hitos.map((h) => ({ titulo: h.titulo, frase: h.frase, estado: h.estado, fecha: h.estado === "pendiente" ? "" : h.fecha })),
    actual: s.actual ? { titulo: s.actual.titulo, frase: s.actual.frase } : null,
    llegada: s.llegada && !s.hitos.some((h) => h.clave === "llego" && h.estado !== "pendiente") ? s.llegada.texto : null,
    aviso: s.aviso,
  };
}

// ─── Acciones del empleado ───────────────────────────────────────────────────

export function marcarSiguiente(g: SeguimientoGuardado, vista: SeguimientoVista, por: string, ahora: Date = new Date()): SeguimientoGuardado {
  if (!vista.siguienteManual) throw new Error("El siguiente paso lo marca el sistema (compra, rastreo o Recepción).");
  return {
    ...g,
    manuales: { ...(g.manuales ?? {}), [vista.siguienteManual.clave]: { fecha: ahora.toISOString(), por } },
  };
}

export function deshacerUltimoManual(g: SeguimientoGuardado, vista: SeguimientoVista): SeguimientoGuardado {
  const actual = vista.actual;
  if (!actual || !g.manuales?.[actual.clave]) throw new Error("El paso actual no se marcó a mano.");
  const { [actual.clave]: _quitado, ...resto } = g.manuales;
  return { ...g, manuales: resto };
}

export function ponerAviso(g: SeguimientoGuardado, nota: string, por: string, ahora: Date = new Date()): SeguimientoGuardado {
  if (!nota.trim()) throw new Error("Escribe la nota interna (qué hay que hablar con el cliente).");
  return { ...g, aviso: { nota: nota.trim().slice(0, 500), por, fecha: ahora.toISOString() } };
}

export function quitarAviso(g: SeguimientoGuardado): SeguimientoGuardado {
  return { ...g, aviso: null };
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function corregirLlegada(g: SeguimientoGuardado, desde: string, hasta: string, por: string): SeguimientoGuardado {
  if (!FECHA.test(desde) || !FECHA.test(hasta)) throw new Error("Fechas inválidas.");
  if (hasta < desde) throw new Error("La fecha final no puede ser antes de la inicial.");
  return { ...g, llegada: { desde, hasta, por } };
}

export function volverLlegadaAutomatica(g: SeguimientoGuardado): SeguimientoGuardado {
  return { ...g, llegada: null };
}

export function conVistos(g: SeguimientoGuardado, nuevos: Partial<Record<ClaveHito, string>>): SeguimientoGuardado {
  return { ...g, vistos: { ...(g.vistos ?? {}), ...nuevos } };
}
