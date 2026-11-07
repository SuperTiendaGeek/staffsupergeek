// Entregar al cliente — regla PURA (auditoría ops, punto 6 · 6-nov-2026).
//
// Como el "checkout" de RepairDesk y Lightspeed: entregar el equipo ES cerrar
// la cuenta. Decisiones del dueño (6-nov):
//   1. Sin crédito: no se entrega debiendo.
//   2. Siempre con documento: factura o recibo si hubo cobro; si la cuenta
//      es solo garantía, el comprobante GAR (punto 20); si no hubo nada que
//      cobrar, el "Comprobante de entrega" ENT-<orden> con su motivo.
//   3. Nada aprobado queda colgando (caso OR000517): lo que no llegó o el
//      pedido abierto se CANCELA o se ESPERA. "Pasar a pedido aparte" llega
//      con el punto 10.
//   4. Nadie se salta la revisión, ni un administrador: la exige el servidor.

export const ESTADO_ENTREGADA = "Finalizado Entregado";
const ESTADOS_SIN_ENTREGA = new Set(["Finalizado Entregado", "Enviado a Reciclaje"]);
const TOLERANCIA = 0.01;

export const MOTIVOS_SIN_COBRO = [
  "Diagnóstico sin costo",
  "No se pudo reparar",
  "El cliente no aprobó la reparación",
  "Otro",
] as const;
export type MotivoSinCobro = (typeof MOTIVOS_SIN_COBRO)[number];

export function normalizarMotivoSinCobro(v: unknown): MotivoSinCobro | null {
  return MOTIVOS_SIN_COBRO.find((m) => m === v) ?? null;
}

// ─── Lo pendiente ────────────────────────────────────────────────────────────

/** Algo aprobado que todavía no se entregó. */
export type Pendiente = {
  clave: string;
  /** "linea": se resuelve en la tarjeta Presupuesto. "pedido": en su Operación Comercial. */
  tipo: "linea" | "pedido";
  /** Id de la línea del presupuesto o de la operación. */
  refId: string;
  texto: string;
  /** Por qué está pendiente ("Falta pedir", "En camino · …", "Pedido en Aprobado"…). */
  detalle: string;
};

export type SolicitudParaEntrega = {
  lineaId: string | null;
  operacionId: string | null;
  descripcion: string;
  /** Clave del chip de compras (lib/compras/reglas.ts). */
  clave: string;
  texto: string;
};

export type OperacionParaEntrega = { id: string; codigo: string; estado: string; producto: string };

/** Estados del chip de compras que significan "todavía no está para entregar". */
const SOLICITUD_PENDIENTE = new Set(["esperando_pago", "falta_pedir", "falta_pagar_proveedor", "en_camino"]);
const OPERACION_CERRADA = new Set(["Entregado", "Rechazado"]);

export function armarPendientes(input: {
  /** cuenta.aprobadoSinArticulo (líneas del presupuesto y pedidos sin artículo). */
  aprobadoSinArticulo: ReadonlyArray<{ id: string; nombre: string }>;
  /** Ids de las líneas del presupuesto de la orden (para saber qué es línea y qué pedido). */
  lineaIds: ReadonlySet<string>;
  solicitudes: readonly SolicitudParaEntrega[];
  operaciones: readonly OperacionParaEntrega[];
}): Pendiente[] {
  const out: Pendiente[] = [];
  const vistos = new Set<string>();
  const agregar = (p: Pendiente) => {
    if (vistos.has(p.refId)) return;
    vistos.add(p.refId);
    out.push(p);
  };
  // 1. Lo que tiene solicitud de compra viva: su chip dice exactamente qué falta.
  for (const s of input.solicitudes) {
    if (!SOLICITUD_PENDIENTE.has(s.clave)) continue;
    if (s.lineaId && input.lineaIds.has(s.lineaId)) agregar({ clave: `linea:${s.lineaId}`, tipo: "linea", refId: s.lineaId, texto: s.descripcion, detalle: s.texto });
    else if (s.operacionId) agregar({ clave: `pedido:${s.operacionId}`, tipo: "pedido", refId: s.operacionId, texto: s.descripcion, detalle: s.texto });
  }
  // 2. Aprobado sin artículo (lo mismo que bloquea la factura).
  for (const a of input.aprobadoSinArticulo) {
    const esLinea = input.lineaIds.has(a.id);
    agregar({ clave: `${esLinea ? "linea" : "pedido"}:${a.id}`, tipo: esLinea ? "linea" : "pedido", refId: a.id, texto: a.nombre || "Sin descripción", detalle: "Aprobado, sin artículo" });
  }
  // 3. Pedidos de la cuenta que siguen abiertos.
  for (const o of input.operaciones) {
    if (OPERACION_CERRADA.has(o.estado)) continue;
    agregar({ clave: `pedido:${o.id}`, tipo: "pedido", refId: o.id, texto: `${o.codigo}${o.producto ? ` · ${o.producto}` : ""}`, detalle: `Pedido en "${o.estado || "Requerimiento"}"` });
  }
  return out;
}

// ─── La revisión ─────────────────────────────────────────────────────────────

export type DocumentoDeEntrega = { tipo: "factura" | "recibo"; numero: string };

export type DatosEntrega = {
  retiradoPor: string;
  accesoriosDevueltos?: string;
  estadoAlEntregar?: string;
  motivoSinCobro?: string | null;
  detalleSinCobro?: string;
};

/** Con qué se respalda la entrega. */
export type TipoComprobanteEntrega = "venta" | "garantia" | "sin-cobro";

export type Revision = { clave: "pendientes" | "cobro" | "documento" | "licencias"; ok: boolean; texto: string };

export type EvaluacionEntrega = {
  revisiones: Revision[];
  pendientes: Pendiente[];
  comprobante: TipoComprobanteEntrega;
  /** Lo que todavía impide entregar (vacío = se puede). Incluye datos del formulario. */
  faltas: string[];
  puedeEntregar: boolean;
};

const dinero = (n: number) => `$${Math.abs(n).toFixed(2)}`;

export function evaluarEntrega(input: {
  estadoOrden: string;
  /** cuenta.saldo: + falta cobrar · − sobra. */
  saldo: number;
  /** Total que se cobra (sin lo que va en garantía). */
  totalCobrable: number;
  /** Líneas confirmadas en garantía en la cuenta. */
  enGarantia: number;
  documento: DocumentoDeEntrega | null;
  pendientes: readonly Pendiente[];
  /** Punto 5B: licencias de la orden; cada una debe tener su PDF (lo que se le entrega al cliente). */
  licencias?: ReadonlyArray<{ sku: string; tienePdf: boolean }>;
  /** Sin datos = solo se revisa (al abrir el panel). */
  datos?: DatosEntrega | null;
}): EvaluacionEntrega {
  const faltas: string[] = [];
  if (ESTADOS_SIN_ENTREGA.has(input.estadoOrden)) {
    faltas.push(input.estadoOrden === ESTADO_ENTREGADA ? "La orden ya está entregada." : `La orden está "${input.estadoOrden}": no se entrega.`);
  }

  const comprobante: TipoComprobanteEntrega = input.totalCobrable > TOLERANCIA ? "venta" : input.enGarantia > 0 ? "garantia" : "sin-cobro";
  const revisiones: Revision[] = [];

  const n = input.pendientes.length;
  revisiones.push(n
    ? { clave: "pendientes", ok: false, texto: `${n} ${n === 1 ? "cosa aprobada sin entregar" : "cosas aprobadas sin entregar"}: cancélala o espera` }
    : { clave: "pendientes", ok: true, texto: "Nada pendiente" });

  const saldo = Math.round(input.saldo * 100) / 100;
  revisiones.push(saldo > TOLERANCIA
    ? { clave: "cobro", ok: false, texto: `Falta cobrar ${dinero(saldo)}` }
    : saldo < -TOLERANCIA
      ? { clave: "cobro", ok: false, texto: `Sobran ${dinero(saldo)}: pásalo a saldo a favor o devuélvelo` }
      : { clave: "cobro", ok: true, texto: comprobante === "venta" ? "Cuenta pagada" : "Sin nada que cobrar" });

  if (comprobante === "venta") {
    revisiones.push(input.documento
      ? { clave: "documento", ok: true, texto: `${input.documento.tipo === "factura" ? "Factura" : "Recibo"} ${input.documento.numero}` }
      : { clave: "documento", ok: false, texto: "Falta emitir la factura o el recibo" });
  } else if (comprobante === "garantia") {
    revisiones.push({ clave: "documento", ok: true, texto: "Comprobante de garantía (GAR)" });
  } else {
    revisiones.push({ clave: "documento", ok: true, texto: "Comprobante de entrega (ENT)" });
  }

  const lic = input.licencias ?? [];
  if (lic.length) {
    const sinPdf = lic.filter((l) => !l.tienePdf).map((l) => l.sku);
    revisiones.push(sinPdf.length
      ? { clave: "licencias", ok: false, texto: `Falta generar el PDF de ${sinPdf.join(", ")}` }
      : { clave: "licencias", ok: true, texto: lic.length === 1 ? "Licencia con su PDF" : `${lic.length} licencias con su PDF` });
  }

  for (const r of revisiones) if (!r.ok) faltas.push(r.texto);

  const d = input.datos;
  if (d) {
    if (!d.retiradoPor.trim()) faltas.push("Escribe quién retira el equipo.");
    if (comprobante === "sin-cobro") {
      const motivo = normalizarMotivoSinCobro(d.motivoSinCobro);
      if (!motivo) faltas.push("Elige el motivo sin cobro.");
      else if (motivo === "Otro" && !(d.detalleSinCobro ?? "").trim()) faltas.push("Escribe el detalle del motivo \"Otro\".");
    }
  }

  return { revisiones, pendientes: [...input.pendientes], comprobante, faltas, puedeEntregar: faltas.length === 0 };
}

/** Campos de la orden al entregar (nombres reales de Airtable). */
export function camposDeEntrega(input: {
  datos: DatosEntrega;
  comprobante: TipoComprobanteEntrega;
  entregadoPor: string;
  ahora: string;
}): Record<string, unknown> {
  const d = input.datos;
  const sinCobro = input.comprobante === "sin-cobro";
  return {
    "Fecha de entrega": input.ahora,
    "Entregado por": input.entregadoPor,
    "Retirado por": d.retiradoPor.trim(),
    "Accesorios devueltos": (d.accesoriosDevueltos ?? "").trim(),
    "Estado al entregar": (d.estadoAlEntregar ?? "").trim(),
    // Solo una entrega sin cobro lleva motivo; si no, se limpia (una reentrega con cobro no arrastra el motivo viejo).
    "Motivo sin cobro": sinCobro ? normalizarMotivoSinCobro(d.motivoSinCobro) : null,
    "Detalle sin cobro": sinCobro ? (d.detalleSinCobro ?? "").trim() : "",
  };
}
