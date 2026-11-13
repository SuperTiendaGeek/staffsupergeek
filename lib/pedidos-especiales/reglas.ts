// Pedido especial de cliente — reglas PURAS (auditoría ops, punto 10 · 10-nov-2026).
// Sin Airtable ni React: con prueba en __tests__/reglas.test.ts.
//
// Un "pedido especial" es una Operación Comercial cuya cotización vive en las
// líneas del MISMO Presupuesto de las órdenes (enlace "Pedido"). Decisiones
// del dueño (10-nov), ver claude/Diseno_Fase3_Pedidos.md:
//   1. Anticipo: pago completo hasta $100; 50 % sobre $100 (sobre el total).
//   2. La cotización vale 72 h por defecto (1 a 7 días), con fecha y hora
//      exactas; aviso interno 24 h antes; vencida se "Renueva".
//   3. En tienda se acepta en UN paso (aceptar + anticipo).
//   8. Cancelar antes de pedir al proveedor: se devuelve el dinero o, si el
//      cliente quiere, pasa a saldo a favor. Después: solo saldo a favor y la
//      pieza queda para la tienda.

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ─── Estados (comerciales) ───────────────────────────────────────────────────
// Lo logístico (comprado, en camino, llegó) lo dice Shipping V2 y lo del
// dinero la cuenta: el estado del pedido es solo comercial.

export const ESTADOS_PEDIDO = ["Cotizando", "Esperando al cliente", "Aceptado", "Entregado", "Cancelado"] as const;
export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

/** Estados del Operaciones viejo → el estado comercial equivalente (lectura y migración). */
const DESDE_VIEJO: Record<string, EstadoPedido> = {
  Requerimiento: "Cotizando",
  Cotizado: "Esperando al cliente",
  Aprobado: "Aceptado",
  Pedido: "Aceptado",
  Entregado: "Entregado",
  Rechazado: "Cancelado",
};

export function estadoComercial(estado: string | null | undefined): EstadoPedido {
  const e = (estado ?? "").trim();
  if ((ESTADOS_PEDIDO as readonly string[]).includes(e)) return e as EstadoPedido;
  return DESDE_VIEJO[e] ?? "Cotizando";
}

/**
 * ¿Es un pedido especial (modelo nuevo)? Si tiene líneas o si su estado es
 * uno de los nuevos. Las operaciones viejas (Requerimiento, Cotizado,
 * Aprobado, Pedido, Rechazado) siguen con sus Opciones hasta que se migren.
 */
export function esPedidoEspecial(estado: string, lineaIds: readonly string[]): boolean {
  if (lineaIds.length > 0) return true;
  return (ESTADOS_PEDIDO as readonly string[]).includes(estado) && estado !== "Entregado";
}

/** ¿El pedido ya tiene un precio aceptado por el cliente? (suma en la cuenta) */
export function pedidoAceptado(estado: string | null | undefined): boolean {
  const e = estadoComercial(estado);
  return e === "Aceptado" || e === "Entregado";
}

// ─── Anticipo por tramos ─────────────────────────────────────────────────────

export const UMBRAL_ANTICIPO_PARCIAL = 100;
export const PORCENTAJE_ANTICIPO = 0.5;

/** Lo que el cliente paga al aceptar: todo hasta $100; la mitad si pasa de $100. */
export function anticipoRequerido(total: number): number {
  const t = Number.isFinite(total) && total > 0 ? r2(total) : 0;
  return t <= UMBRAL_ANTICIPO_PARCIAL ? t : r2(t * PORCENTAJE_ANTICIPO);
}

export type ResumenAnticipo = {
  total: number;
  anticipo: number;
  /** Lo que ya pagó (abonos vigentes). */
  pagado: number;
  /** Lo que falta para completar el anticipo (0 si ya lo cubrió). */
  faltaAnticipo: number;
  /** Lo que falta para saldar todo el pedido. */
  faltaTotal: number;
  /** "Hoy" y "Al retirar", como se le muestra al cliente. */
  hoy: number;
  alRetirar: number;
  cubierto: boolean;
};

export function resumenAnticipo(total: number, pagado: number): ResumenAnticipo {
  const t = Number.isFinite(total) && total > 0 ? r2(total) : 0;
  const p = Number.isFinite(pagado) && pagado > 0 ? r2(pagado) : 0;
  const anticipo = anticipoRequerido(t);
  const faltaAnticipo = r2(Math.max(0, anticipo - p));
  const faltaTotal = r2(Math.max(0, t - p));
  return { total: t, anticipo, pagado: p, faltaAnticipo, faltaTotal, hoy: faltaAnticipo, alRetirar: r2(faltaTotal - faltaAnticipo), cubierto: faltaAnticipo <= 0.009 };
}

const usd = (n: number) => `$${r2(n).toFixed(2).replace(/\.00$/, "")}`;

/** "Hoy $225 · Al retirar $225" (o "Pago completo: $80" hasta $100). */
export function textoAnticipo(total: number): string {
  const t = r2(Math.max(0, total || 0));
  const a = anticipoRequerido(t);
  if (a >= t) return `Pago completo: ${usd(t)}`;
  return `Hoy ${usd(a)} · Al retirar ${usd(r2(t - a))}`;
}

// ─── Vigencia de la cotización ───────────────────────────────────────────────

export const VIGENCIA_HORAS_DEFECTO = 72;
export const VIGENCIA_DIAS_MIN = 1;
export const VIGENCIA_DIAS_MAX = 7;
/** Horas antes del vencimiento en que el empleado recibe el aviso interno. */
export const AVISO_HORAS_ANTES = 24;

const HORA = 3_600_000;

/** Horas de vigencia elegidas (por defecto 72); fuera de 1–7 días → error. */
export function horasDeVigencia(dias?: number | null): number {
  if (dias === undefined || dias === null) return VIGENCIA_HORAS_DEFECTO;
  if (!Number.isInteger(dias) || dias < VIGENCIA_DIAS_MIN || dias > VIGENCIA_DIAS_MAX) {
    throw new Error(`La cotización vale de ${VIGENCIA_DIAS_MIN} a ${VIGENCIA_DIAS_MAX} días.`);
  }
  return dias * 24;
}

/** Fecha y hora en que vence una cotización enviada (o renovada) en `desde`. */
export function venceCotizacion(desde: Date, dias?: number | null): string {
  return new Date(desde.getTime() + horasDeVigencia(dias) * HORA).toISOString();
}

export type Vigencia = "sin_fecha" | "vigente" | "por_vencer" | "vencida";

export function vigencia(vence: string | null | undefined, ahora: Date = new Date()): Vigencia {
  const t = vence ? Date.parse(vence) : NaN;
  if (!Number.isFinite(t)) return "sin_fecha";
  const falta = t - ahora.getTime();
  if (falta <= 0) return "vencida";
  return falta <= AVISO_HORAS_ANTES * HORA ? "por_vencer" : "vigente";
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "viernes 13-nov, 18:00" en hora de Ecuador (UTC-5, sin horario de verano). */
export function textoFechaHora(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t - 5 * HORA);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()}-${MESES[d.getUTCMonth()]}, ${hh}:${mm}`;
}

/** Texto para el cliente: "Precio válido hasta el viernes 13-nov, 18:00". */
export function textoVigencia(vence: string | null | undefined, ahora: Date = new Date()): string {
  const v = vigencia(vence, ahora);
  if (v === "sin_fecha") return "";
  if (v === "vencida") return "Esta cotización venció. Escríbenos y la actualizamos.";
  return `Precio válido hasta el ${textoFechaHora(vence!)}`;
}

// ─── Aceptar ─────────────────────────────────────────────────────────────────

export type LineaParaAceptar = {
  id: string;
  descripcion: string;
  estado: string;
  precioUnitario: number;
  cantidad: number;
  grupoAlternativas?: string;
};

/**
 * ¿Se puede aceptar? (null = sí). Vale igual en tienda que por el enlace:
 * el pedido debe estar cotizándose o esperando al cliente, la cotización
 * vigente, y lo elegido con precio y sin dos alternativas del mismo grupo.
 */
export function errorAceptar(input: {
  estado: string;
  vence: string | null | undefined;
  lineas: readonly LineaParaAceptar[];
  elegidas: readonly string[];
  ahora?: Date;
}): string | null {
  const e = estadoComercial(input.estado);
  if (e === "Aceptado" || e === "Entregado") return "El pedido ya fue aceptado.";
  if (e === "Cancelado") return "El pedido está cancelado.";
  if (vigencia(input.vence, input.ahora) === "vencida") return "La cotización venció: renuévala antes de aceptar.";
  if (input.elegidas.length === 0) return "Elige al menos una opción.";
  const porId = new Map(input.lineas.map((l) => [l.id, l]));
  const grupos = new Set<string>();
  for (const id of input.elegidas) {
    const l = porId.get(id);
    if (!l) return "Una de las opciones elegidas ya no existe.";
    if (l.estado !== "Propuesta") return `"${l.descripcion}" ya no está disponible para aceptar.`;
    if (!(l.precioUnitario > 0)) return `"${l.descripcion}" no tiene precio.`;
    const g = (l.grupoAlternativas ?? "").trim();
    if (g) {
      if (grupos.has(g)) return "Solo se puede elegir una de las alternativas.";
      grupos.add(g);
    }
  }
  return null;
}

/**
 * Antes de ENVIAR la cotización (10A-3b): cada opción propuesta necesita
 * proveedor y categoría, porque al aceptarla nace su solicitud de compra.
 * El error se evita donde nace: no se envía lo que después no se puede comprar.
 */
export function faltanDatosParaEnviar(lineas: ReadonlyArray<{ descripcion: string; estado: string; proveedorId: string | null; categoria: string }>): string | null {
  for (const l of lineas) {
    if (l.estado !== "Propuesta") continue;
    if (!l.proveedorId) return `Falta el proveedor de "${l.descripcion}".`;
    if (!l.categoria.trim()) return `Falta la categoría de "${l.descripcion}".`;
  }
  return null;
}

/** Total de lo elegido (precio × cantidad). */
export function totalElegido(lineas: readonly LineaParaAceptar[], elegidas: readonly string[]): number {
  const set = new Set(elegidas);
  return r2(lineas.filter((l) => set.has(l.id)).reduce((s, l) => s + l.precioUnitario * (l.cantidad || 1), 0));
}

// ─── Cancelar ────────────────────────────────────────────────────────────────

// Cancelar: ver ./cancelacion.ts (decisión 19 del dueño, punto 10C-3a).

// ─── Cuenta ──────────────────────────────────────────────────────────────────

/**
 * Unidades que se le cobran al cliente por un artículo de su pedido: la
 * cantidad de la línea del pedido de la que nació (si la hay), si no la de
 * la opción vieja, si no 1. Las unidades compradas de más para stock no se cobran.
 */
export function unidadesDelCliente(cantidadLinea: number | null | undefined, cantidadOpcion: number | null | undefined): number {
  for (const c of [cantidadLinea, cantidadOpcion]) {
    if (typeof c === "number" && Number.isInteger(c) && c > 0) return c;
  }
  return 1;
}

// ─── Lo que el cliente paga para confirmar cada opción ───────────────────────
// Pedido del dueño (12-nov): la información va "masticada". El sistema aplica
// la regla de tramos y le dice al cliente cuánto pagar, opción por opción.
// Una "Alternativa" es excluyente (el cliente elige UNA: Dell o Lenovo); un
// "Adicional" se suma a lo que elija (el mouse). Por eso cada alternativa se
// evalúa con los adicionales incluidos.

export type LineaParaConfirmar = { id: string; cantidad: number; precioUnitario: number; esAlternativa: boolean };

export type Confirmacion = {
  /** La alternativa (null = el pedido no tiene alternativas: solo adicionales). */
  lineaId: string | null;
  total: number;
  /** Lo mínimo para confirmar. */
  paraConfirmar: number;
  alRetirar: number;
  pagoCompleto: boolean;
  texto: string;
};

export function confirmacionesPorOpcion(lineas: readonly LineaParaConfirmar[]): Confirmacion[] {
  const sub = (l: LineaParaConfirmar) => r2(l.precioUnitario * (l.cantidad || 1));
  const extras = r2(lineas.filter((l) => !l.esAlternativa).reduce((s, l) => s + sub(l), 0));
  const alternativas = lineas.filter((l) => l.esAlternativa);
  const una = (lineaId: string | null, total: number): Confirmacion => {
    const paraConfirmar = anticipoRequerido(total);
    const pagoCompleto = paraConfirmar >= total;
    const alRetirar = r2(total - paraConfirmar);
    return {
      lineaId, total, paraConfirmar, alRetirar, pagoCompleto,
      texto: pagoCompleto
        ? `Se paga completo para confirmar: ${usd(total)}.`
        : `Para confirmar: ${usd(paraConfirmar)} ahora y ${usd(alRetirar)} al retirar.`,
    };
  };
  if (alternativas.length === 0) return extras > 0 ? [una(null, extras)] : [];
  return alternativas.map((a) => una(a.id, r2(sub(a) + extras)));
}

// ─── Mensaje de la cotización (WhatsApp) ─────────────────────────────────────
// El resumen de la cotización para WhatsApp, con el enlace del pedido al
// final (10A-3). Sin proveedor, costo ni URL del proveedor.

export type LineaParaMensaje = { descripcion: string; cantidad: number; precioUnitario: number; esAlternativa: boolean; notaCliente?: string };

export function mensajeCotizacion(input: {
  cliente: string;
  codigo: string;
  lineas: readonly LineaParaMensaje[];
  vence: string | null | undefined;
  /** Enlace del pedido (10A-3): ahí el cliente ve todo, elige y paga. */
  enlace?: string;
  ahora?: Date;
}): string {
  const nombre = input.cliente.trim().split(/\s+/)[0] ?? "";
  const linea = (l: LineaParaMensaje) => {
    const total = r2(l.precioUnitario * (l.cantidad || 1));
    const cant = l.cantidad > 1 ? ` ×${l.cantidad}` : "";
    const nota = l.notaCliente?.trim() ? ` (${l.notaCliente.trim()})` : "";
    return `${l.descripcion.trim()}${cant}: ${usd(total)}${nota}`;
  };
  const conId = input.lineas.map((l, i) => ({ ...l, id: String(i) }));
  const conf = new Map(confirmacionesPorOpcion(conId).map((c) => [c.lineaId, c]));
  const alternativas = conId.filter((l) => l.esAlternativa);
  const adicionales = conId.filter((l) => !l.esAlternativa);
  const hayExtras = adicionales.length > 0;
  const textoPago = (c: Confirmacion | undefined) => c ? (hayExtras ? `Total ${usd(c.total)}. ${c.texto}` : c.texto) : "";

  const partes: string[] = [`Hola${nombre ? ` ${nombre}` : ""}, esta es la cotización de tu pedido ${input.codigo}:`, ""];
  if (alternativas.length > 1) {
    partes.push("Elige una opción:");
    alternativas.forEach((l, i) => partes.push(`${i + 1}. ${linea(l)}`));
  } else {
    alternativas.forEach((l) => partes.push(`• ${linea(l)}`));
  }
  if (hayExtras) {
    if (alternativas.length) partes.push("", alternativas.length > 1 ? "Además (se suma a la opción que elijas):" : "Además:");
    adicionales.forEach((l) => partes.push(`• ${linea(l)}`));
  }
  partes.push("");
  if (alternativas.length > 1) {
    alternativas.forEach((l, i) => partes.push(`Opción ${i + 1} → ${textoPago(conf.get(l.id))}`));
  } else {
    const c = alternativas.length ? conf.get(alternativas[0].id) : conf.get(null);
    if (c) partes.push(textoPago(c));
  }
  const vig = textoVigencia(input.vence, input.ahora);
  if (vig) partes.push(`${vig} (los precios del proveedor cambian rápido).`);
  if (input.enlace) partes.push("", `Revisa, elige y confirma aquí: ${input.enlace}`);
  partes.push("", "SUPER GEEK");
  return partes.join("\n");
}
