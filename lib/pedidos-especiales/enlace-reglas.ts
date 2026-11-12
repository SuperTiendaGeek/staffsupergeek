// Enlace del cliente para su PEDIDO ESPECIAL — reglas PURAS (punto 10A-3, 12-nov-2026).
// Sin Airtable ni React: con prueba en __tests__/enlace-reglas.test.ts.
//
// Decisiones del dueño (12-nov), claude/Diseno_Fase3_Pedidos.md:
//   - El enlace es la página del pedido: existe siempre (no vence); lo que
//     vence es el PRECIO (la cotización).
//   - "Acepto" en el enlace NO acepta el pedido: el cliente elige su opción y
//     lo siguiente es pagar (transferencia; PayPhone cuando esté). El pedido
//     pasa a "Aceptado" solo cuando el pago cubre lo que pide la regla de
//     tramos (todo hasta $100, la mitad si pasa).
//
// Ejemplo (Camila, monitor):
//   Opción 1 LG $420, Opción 2 Dell $390, se suma Cable $20.
//   Camila toca "Acepto la opción 1" → queda su ELECCIÓN (LG + cable = $440,
//   para confirmar $220). Transfiere $220; el empleado registra el abono →
//   el sistema ve la elección + el pago → el pedido pasa a "Aceptado".

import { anticipoRequerido, estadoComercial, textoFechaHora, vigencia, type EstadoPedido } from "./reglas";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const usd = (n: number) => `$${r2(n).toFixed(2).replace(/\.00$/, "")}`;

/** Mismo formato que el token del Presupuesto: 24 bytes aleatorios en base64url. */
export const TOKEN_PEDIDO_REGEX = /^[A-Za-z0-9_-]{32}$/;

export type LineaCliente = {
  id: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  estado: string;
  grupoAlternativas?: string;
  tiempoEstimado?: string;
  notaCliente?: string;
};

/**
 * Huella de lo que el cliente VE de una línea. Si el empleado cambia precio,
 * cantidad, descripción, nota o el grupo, la huella cambia: una elección
 * hecha sobre la versión anterior ya no vale.
 */
export function huellaLineaCliente(l: LineaCliente): string {
  const base = [l.descripcion.trim(), l.cantidad || 1, r2(l.precioUnitario), (l.grupoAlternativas ?? "").trim(), (l.notaCliente ?? "").trim(), (l.tiempoEstimado ?? "").trim()].join("|");
  let h = 5381;
  for (let i = 0; i < base.length; i++) h = ((h << 5) + h + base.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

const esAlternativa = (l: LineaCliente) => !!(l.grupoAlternativas ?? "").trim();
const subtotal = (l: LineaCliente) => r2(l.precioUnitario * (l.cantidad || 1));
const propuestas = (lineas: readonly LineaCliente[]) => lineas.filter((l) => l.estado === "Propuesta");

/**
 * Lo que queda elegido si el cliente toca una opción: la alternativa + todo
 * lo que "se suma". Sin alternativas, solo lo que se suma. Error si la
 * opción no es válida.
 */
export function elegidasDeOpcion(lineas: readonly LineaCliente[], opcionId: string | null): { ok: true; elegidas: string[] } | { ok: false; error: string } {
  const vivas = propuestas(lineas);
  const alternativas = vivas.filter(esAlternativa);
  const extras = vivas.filter((l) => !esAlternativa(l)).map((l) => l.id);
  if (alternativas.length === 0) {
    if (extras.length === 0) return { ok: false, error: "Esta cotización no tiene nada para elegir." };
    return { ok: true, elegidas: extras };
  }
  const id = opcionId ?? (alternativas.length === 1 ? alternativas[0].id : null);
  if (!id) return { ok: false, error: "Elige una opción." };
  if (!alternativas.some((a) => a.id === id)) return { ok: false, error: "Esa opción ya no está disponible. Revisa la cotización." };
  return { ok: true, elegidas: [id, ...extras] };
}

// ─── Elección guardada ───────────────────────────────────────────────────────

/** Lo que el cliente eligió en el enlace (se guarda en "Presupuesto Respuestas"). */
export type EleccionCliente = {
  fecha: string;
  elegidas: string[];
  /** lineaId → huella al momento de elegir. */
  huellas: Record<string, string>;
};

/** Detalle que se guarda en la respuesta (versión 3 = elección de un pedido). */
export type DetalleEleccion = {
  version: 3;
  tipo: "eleccion_pedido";
  elegidas: Array<{ lineaId: string; descripcion: string; cantidad: number; precioUnitario: number; huella: string }>;
  total: number;
  paraConfirmar: number;
};

export function detalleEleccion(lineas: readonly LineaCliente[], elegidas: readonly string[]): DetalleEleccion {
  const set = new Set(elegidas);
  const sel = lineas.filter((l) => set.has(l.id));
  const total = r2(sel.reduce((s, l) => s + subtotal(l), 0));
  return {
    version: 3,
    tipo: "eleccion_pedido",
    elegidas: sel.map((l) => ({ lineaId: l.id, descripcion: l.descripcion, cantidad: l.cantidad || 1, precioUnitario: r2(l.precioUnitario), huella: huellaLineaCliente(l) })),
    total,
    paraConfirmar: anticipoRequerido(total),
  };
}

/** Lee la elección desde el "Detalle" guardado (null si no es una elección). */
export function leerEleccion(fecha: string, detalleJson: string): EleccionCliente | null {
  try {
    const d = JSON.parse(detalleJson || "{}") as Partial<DetalleEleccion>;
    if (d.version !== 3 || d.tipo !== "eleccion_pedido" || !Array.isArray(d.elegidas) || d.elegidas.length === 0) return null;
    return {
      fecha,
      elegidas: d.elegidas.map((e) => String(e.lineaId)),
      huellas: Object.fromEntries(d.elegidas.map((e) => [String(e.lineaId), String(e.huella)])),
    };
  } catch {
    return null;
  }
}

/** La elección más reciente que todavía vale (todas sus líneas siguen igual y propuestas). */
export function eleccionVigente(elecciones: readonly EleccionCliente[], lineas: readonly LineaCliente[]): EleccionCliente | null {
  const ultima = [...elecciones].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  if (!ultima) return null;
  const porId = new Map(lineas.map((l) => [l.id, l]));
  for (const id of ultima.elegidas) {
    const l = porId.get(id);
    if (!l || l.estado !== "Propuesta" || huellaLineaCliente(l) !== ultima.huellas[id]) return null;
  }
  // Si después de elegir el empleado agregó algo que "se suma", la elección
  // ya no cubre todo el pedido: el cliente debe volver a elegir.
  const set = new Set(ultima.elegidas);
  if (propuestas(lineas).some((l) => !esAlternativa(l) && !set.has(l.id))) return null;
  return ultima;
}

// ─── Validar una elección del cliente ────────────────────────────────────────

export type ErrorEleccion = { codigo: "NO_LISTA" | "CERRADO" | "VENCIDA" | "CAMBIO" | "OPCION"; error: string };

export function errorEleccion(input: {
  estado: string;
  vence: string | null | undefined;
  lineas: readonly LineaCliente[];
  opcionId: string | null;
  /** lineaId → huella que el cliente tenía en pantalla. */
  huellasVistas: Record<string, string>;
  ahora?: Date;
}): ErrorEleccion | null {
  const e = estadoComercial(input.estado);
  if (e === "Aceptado" || e === "Entregado") return { codigo: "CERRADO", error: "Tu pedido ya está confirmado." };
  if (e === "Cancelado") return { codigo: "CERRADO", error: "Este pedido fue cancelado. Escríbenos si necesitas ayuda." };
  if (e === "Cotizando") return { codigo: "NO_LISTA", error: "Tu cotización todavía no está lista." };
  if (vigencia(input.vence, input.ahora) === "vencida") return { codigo: "VENCIDA", error: "Esta cotización venció. Escríbenos y la actualizamos." };
  for (const l of propuestas(input.lineas)) {
    if (input.huellasVistas[l.id] !== huellaLineaCliente(l)) {
      return { codigo: "CAMBIO", error: "La cotización cambió hace un momento. Revísala de nuevo." };
    }
  }
  const r = elegidasDeOpcion(input.lineas, input.opcionId);
  if (!r.ok) return { codigo: "OPCION", error: r.error };
  return null;
}

/**
 * ¿La elección + lo pagado ya confirman el pedido? Devuelve qué aceptar, o
 * null. Solo mientras el pedido espera al cliente.
 */
export function confirmacionPorPago(input: {
  estado: string;
  eleccion: EleccionCliente | null;
  lineas: readonly LineaCliente[];
  pagado: number;
}): { elegidas: string[]; total: number; paraConfirmar: number } | null {
  const e = estadoComercial(input.estado);
  if (e !== "Esperando al cliente" && e !== "Cotizando") return null;
  if (!input.eleccion) return null;
  const set = new Set(input.eleccion.elegidas);
  const total = r2(input.lineas.filter((l) => set.has(l.id)).reduce((s, l) => s + subtotal(l), 0));
  if (!(total > 0)) return null;
  const paraConfirmar = anticipoRequerido(total);
  if (r2(input.pagado || 0) + 0.009 < paraConfirmar) return null;
  return { elegidas: input.eleccion.elegidas, total, paraConfirmar };
}

// ─── Vista del cliente ───────────────────────────────────────────────────────

export type FaseCliente = "preparando" | "cotizacion" | "vencida" | "por_pagar" | "confirmado" | "entregado" | "cancelado";

export type OpcionCliente = {
  id: string;
  n: number;
  descripcion: string;
  cantidad: number;
  subtotal: number;
  tiempo: string;
  nota: string;
  /** Con lo que se suma incluido. */
  total: number;
  paraConfirmar: number;
  alRetirar: number;
};

export type ExtraCliente = { id: string; descripcion: string; cantidad: number; subtotal: number; nota: string };

export type VistaCliente = {
  fase: FaseCliente;
  codigo: string;
  nombre: string;
  vence: string;
  textoVence: string;
  opciones: OpcionCliente[];
  extras: ExtraCliente[];
  /** lineaId → huella (el cliente la devuelve al elegir). */
  huellas: Record<string, string>;
  /** Lo elegido (por pagar) o lo aceptado (confirmado / entregado). */
  elegido: { opcionId: string | null; items: ExtraCliente[]; total: number } | null;
  pago: { total: number; pagado: number; paraConfirmar: number; faltaParaConfirmar: number; faltaTotal: number };
};

export function construirVistaCliente(input: {
  codigo: string;
  clienteNombre: string;
  estado: string;
  vence: string | null | undefined;
  lineas: readonly LineaCliente[];
  elecciones: readonly EleccionCliente[];
  pagado: number;
  ahora?: Date;
}): VistaCliente {
  const estado: EstadoPedido = estadoComercial(input.estado);
  const vivas = propuestas(input.lineas);
  const alternativas = vivas.filter(esAlternativa);
  const extrasVivos = vivas.filter((l) => !esAlternativa(l));
  const sumaExtras = r2(extrasVivos.reduce((s, l) => s + subtotal(l), 0));
  const aItem = (l: LineaCliente): ExtraCliente => ({ id: l.id, descripcion: l.descripcion, cantidad: l.cantidad || 1, subtotal: subtotal(l), nota: (l.notaCliente ?? "").trim() });

  const opciones: OpcionCliente[] = alternativas.map((l, i) => {
    const total = r2(subtotal(l) + sumaExtras);
    const paraConfirmar = anticipoRequerido(total);
    return {
      id: l.id, n: i + 1, descripcion: l.descripcion, cantidad: l.cantidad || 1, subtotal: subtotal(l),
      tiempo: (l.tiempoEstimado ?? "").trim(), nota: (l.notaCliente ?? "").trim(),
      total, paraConfirmar, alRetirar: r2(total - paraConfirmar),
    };
  });

  const pagado = r2(Math.max(0, input.pagado || 0));
  const eleccion = eleccionVigente(input.elecciones, input.lineas);
  const vig = vigencia(input.vence, input.ahora);

  let fase: FaseCliente;
  if (estado === "Cancelado") fase = "cancelado";
  else if (estado === "Entregado") fase = "entregado";
  else if (estado === "Aceptado") fase = "confirmado";
  else if (estado === "Cotizando" || vivas.length === 0) fase = "preparando";
  // La elección hecha con el precio vigente se respeta aunque después venza:
  // el cliente ya eligió y solo le falta pagar.
  else if (eleccion) fase = "por_pagar";
  else if (vig === "vencida") fase = "vencida";
  else fase = "cotizacion";

  let elegido: VistaCliente["elegido"] = null;
  if (fase === "por_pagar" && eleccion) {
    const set = new Set(eleccion.elegidas);
    const items = input.lineas.filter((l) => set.has(l.id)).map(aItem);
    elegido = { opcionId: alternativas.find((a) => set.has(a.id))?.id ?? null, items, total: r2(items.reduce((s, x) => s + x.subtotal, 0)) };
  } else if (fase === "confirmado" || fase === "entregado") {
    const items = input.lineas.filter((l) => l.estado === "Aprobada" || l.estado === "Cargada").map(aItem);
    elegido = { opcionId: null, items, total: r2(items.reduce((s, x) => s + x.subtotal, 0)) };
  }

  const total = elegido?.total ?? 0;
  const paraConfirmar = anticipoRequerido(total);
  return {
    fase,
    codigo: input.codigo,
    nombre: (input.clienteNombre ?? "").trim().split(/\s+/)[0] ?? "",
    vence: input.vence ?? "",
    textoVence: input.vence && vig !== "sin_fecha" ? textoFechaHora(input.vence) : "",
    opciones,
    extras: extrasVivos.map(aItem),
    huellas: Object.fromEntries(vivas.map((l) => [l.id, huellaLineaCliente(l)])),
    elegido,
    pago: {
      total,
      pagado,
      paraConfirmar,
      faltaParaConfirmar: r2(Math.max(0, paraConfirmar - pagado)),
      faltaTotal: r2(Math.max(0, total - pagado)),
    },
  };
}

// ─── Mensajes a la tienda (WhatsApp del cliente) ─────────────────────────────

export function mensajeConsulta(input: { nombre: string; codigo: string; producto: string }): string {
  const quien = input.nombre.trim() ? `Hola, soy ${input.nombre.trim()}.` : "Hola.";
  const prod = input.producto.trim() ? ` (${input.producto.trim()})` : "";
  return `${quien} Mi pedido es el N° ${input.codigo}${prod}. Tengo una consulta: `;
}

export function mensajeComprobante(input: { nombre: string; codigo: string; monto: number }): string {
  const quien = input.nombre.trim() ? `Hola, soy ${input.nombre.trim()}.` : "Hola.";
  return `${quien} Te envío el comprobante de pago de mi pedido N° ${input.codigo} por ${usd(input.monto)}.`;
}
