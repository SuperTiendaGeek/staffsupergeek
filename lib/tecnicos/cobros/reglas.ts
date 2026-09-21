// Control de cobros y documentos de las órdenes de reparación — reglas PURAS.
//
// Responde las preguntas que la lista de órdenes no podía contestar:
//   · ¿Cuántas órdenes con cargos ya tienen documento emitido y cuántas no?
//   · ¿Cuántas tienen el presupuesto aprobado y todavía deben dinero?
//   · ¿Cuántas están "Finalizado Entregado" sin documento?
//
// Sin dependencias de servidor ni de Airtable: recibe datos ya leídos y
// devuelve la clasificación. La carga vive en ./airtable.ts. Así las reglas se
// prueban sin red y el panel y la pantalla de la orden usan exactamente la
// misma cuenta.
//
// DECISIÓN CLAVE — un documento emitido salda la cuenta.
// El saldo de la cuenta unificada es "total − abonos". Pero cuando se factura
// (o se emite recibo) el dinero que faltaba se cobra EN ese momento y se
// registra como movimiento del documento, no como abono. Por eso una orden
// facturada seguía mostrando "Saldo pendiente: $211" aunque ya estuviera
// cobrada (OR000430, OR000431, OR000423, OR000368 — verificado en datos
// reales). Aquí, si hay documento emitido, la orden cuenta como cobrada: la
// factura exige que sus formas de pago sumen el total (reglas/pagos.ts), y el
// recibo registra el saldo al emitirse.

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const TOLERANCIA = 0.01;

export const ESTADO_ENTREGADA = "Finalizado Entregado";

// Estados de factura que cuentan como EMITIDA. BORRADOR nunca salió; ANULADA
// ya no vale; DEVUELTA y NO AUTORIZADO son intentos que el SRI rechazó.
// PENDIENTE / RECIBIDA / EN PROCESAMIENTO sí salieron: el SRI los tiene y
// solo falta su respuesta.
const ESTADOS_FACTURA_EMITIDA = new Set(["AUTORIZADO", "PENDIENTE", "RECIBIDA", "EN PROCESAMIENTO"]);
const ESTADO_RECIBO_VIGENTE = "Vigente";

export type DocumentoOrigen = {
  tipo: "factura" | "recibo";
  recordId: string;
  numero: string;
  estado: string;
};

export type OrdenCobroInput = {
  recordId:     string;
  idVisible:    string;
  cliente:      string;
  equipo:       string;
  estado:       string;
  fechaIngreso: string;
  /** Total de la cuenta (servicios + repuestos + productos digitales). */
  totalCuenta:  number;
  /** Abonos de la orden Y de sus operaciones, ya deduplicados por id. */
  abonos:       Array<{ id: string; monto: number; estado: string }>;
  facturas:     DocumentoOrigen[];
  recibos:      DocumentoOrigen[];
  /** Estado del presupuesto (tarjeta Presupuesto de la orden), derivado de
   *  sus líneas. Una orden sin presupuesto usa "tener cargos" como señal de
   *  aprobación: así se trabajó siempre, los cargos se agregan cuando el
   *  cliente acepta. */
  estadoPresupuesto?: "sin_presupuesto" | "propuesto" | "aprobado" | "rechazado";
  /** Lo que el cliente aprobó en el presupuesto y todavía NO está en la
   *  cuenta (repuesto bajo pedido aún sin pedir, repuesto sin stock). Un
   *  abono adelantado por eso no es "dinero de más". */
  comprometidoPresupuesto?: number;
};

export type EstadoCobro =
  | "sin_cargos"      // la cuenta está en $0: todavía no hay nada que cobrar
  | "documentada"     // tiene factura o recibo emitido: cobrada y documentada
  | "pagada"          // los abonos cubren el total, pero falta el documento
  | "abono_parcial"   // hay abonos y todavía falta dinero
  | "sin_abonos"      // hay cargos y no se ha registrado ningún pago
  | "saldo_a_favor";  // los abonos superan el total (revisar)

export type OrdenCobro = {
  recordId:      string;
  idVisible:     string;
  cliente:       string;
  equipo:        string;
  estado:        string;
  fechaIngreso:  string;
  totalCuenta:   number;
  totalAbonado:  number;
  /** total − abonos. Informativo: si hay documento, NO es deuda real. */
  saldo:         number;
  /** Lo que de verdad falta cobrar: 0 si hay documento emitido. */
  porCobrar:     number;
  conCargos:     boolean;
  aprobada:      boolean;
  estadoPresupuesto: "sin_presupuesto" | "propuesto" | "aprobado" | "rechazado";
  entregada:     boolean;
  documento:     DocumentoOrigen | null;
  /** Borrador o factura rechazada por el SRI: se intentó pero no salió. */
  documentoNoEmitido: DocumentoOrigen | null;
  estadoCobro:   EstadoCobro;
  comprometido:  number;
};

export function documentoEmitido(facturas: DocumentoOrigen[], recibos: DocumentoOrigen[]): DocumentoOrigen | null {
  // La factura primero: es el documento tributario y el que manda si hubiera
  // ambos (el bloqueo cruzado ya no lo permite, pero puede haber históricos).
  return (
    facturas.find((f) => ESTADOS_FACTURA_EMITIDA.has(f.estado)) ??
    recibos.find((r) => r.estado === ESTADO_RECIBO_VIGENTE) ??
    null
  );
}

export function clasificarOrden(o: OrdenCobroInput): OrdenCobro {
  const totalCuenta  = round2(o.totalCuenta || 0);
  const totalAbonado = round2(o.abonos.filter((a) => a.estado !== "Anulado").reduce((s, a) => s + (a.monto || 0), 0));
  const saldo        = round2(totalCuenta - totalAbonado);
  const conCargos    = totalCuenta > TOLERANCIA;
  const documento    = documentoEmitido(o.facturas, o.recibos);
  const documentoNoEmitido = documento
    ? null
    : (o.facturas.find((f) => f.estado && f.estado !== "ANULADA") ?? null);

  let estadoCobro: EstadoCobro;
  // Abonos sobre una cuenta en $0 (OR000432: $100 abonados, sin cargos) es
  // dinero recibido sin nada cargado — casi siempre un anticipo de un
  // presupuesto que todavía no se pasó a la orden. No es "sin cargos".
  if (!conCargos && totalAbonado > TOLERANCIA) estadoCobro = "saldo_a_favor";
  else if (!conCargos)          estadoCobro = "sin_cargos";
  else if (documento)           estadoCobro = "documentada";
  else if (saldo < -TOLERANCIA) estadoCobro = "saldo_a_favor";
  else if (saldo <= TOLERANCIA) estadoCobro = "pagada";
  else if (totalAbonado > 0)    estadoCobro = "abono_parcial";
  else                          estadoCobro = "sin_abonos";

  return {
    recordId: o.recordId, idVisible: o.idVisible, cliente: o.cliente, equipo: o.equipo,
    estado: o.estado, fechaIngreso: o.fechaIngreso,
    totalCuenta, totalAbonado, saldo,
    porCobrar: documento ? 0 : Math.max(0, saldo),
    conCargos,
    aprobada: o.estadoPresupuesto === "aprobado" || conCargos,
    estadoPresupuesto: o.estadoPresupuesto ?? "sin_presupuesto",
    entregada: o.estado === ESTADO_ENTREGADA,
    documento, documentoNoEmitido, estadoCobro,
    comprometido: round2(o.comprometidoPresupuesto ?? 0),
  };
}

// ─── Categorías del panel ────────────────────────────────────────────────────
// Cada una es un filtro que responde una pregunta concreta. Se definen aquí,
// una sola vez, para que el contador y la lista filtrada nunca discrepen.

export type CategoriaCobro =
  | "con_documento"
  | "sin_documento"
  | "por_cobrar"
  | "por_cobrar_parcial"
  | "por_cobrar_sin_abonos"
  | "entregadas_sin_documento"
  | "entregadas_por_cobrar"
  | "abonos_sin_respaldo"
  | "presupuesto_sin_respuesta";

export const CATEGORIAS: Record<CategoriaCobro, { titulo: string; ayuda: string; pertenece: (o: OrdenCobro) => boolean }> = {
  con_documento: {
    titulo: "Con documento",
    ayuda: "Tienen cargos y ya se emitió su factura o recibo.",
    pertenece: (o) => o.conCargos && !!o.documento,
  },
  sin_documento: {
    titulo: "Sin documento",
    ayuda: "Tienen cargos y todavía no se emitió factura ni recibo.",
    pertenece: (o) => o.conCargos && !o.documento,
  },
  por_cobrar: {
    titulo: "Aprobadas con saldo pendiente",
    ayuda: "Presupuesto aprobado y todavía falta cobrar parte o todo.",
    pertenece: (o) => o.aprobada && o.porCobrar > TOLERANCIA,
  },
  por_cobrar_parcial: {
    titulo: "Con abonos parciales",
    ayuda: "Ya pagaron una parte; falta el resto.",
    pertenece: (o) => o.aprobada && o.porCobrar > TOLERANCIA && o.totalAbonado > 0,
  },
  por_cobrar_sin_abonos: {
    titulo: "Sin ningún abono",
    ayuda: "Tienen cargos y no se ha registrado ningún pago.",
    pertenece: (o) => o.aprobada && o.porCobrar > TOLERANCIA && o.totalAbonado <= 0,
  },
  entregadas_sin_documento: {
    titulo: "Entregadas sin documento",
    ayuda: "\"Finalizado Entregado\" con cargos y sin factura ni recibo.",
    pertenece: (o) => o.entregada && o.conCargos && !o.documento,
  },
  entregadas_por_cobrar: {
    titulo: "Entregadas con saldo",
    ayuda: "Se entregó el equipo y todavía falta dinero por cobrar.",
    pertenece: (o) => o.entregada && o.porCobrar > TOLERANCIA,
  },
  abonos_sin_respaldo: {
    titulo: "Abonos sin cargos o de más",
    ayuda: "Lo abonado supera lo cargado: falta cargar el trabajo, o hay que devolver o reasignar dinero.",
    pertenece: (o) => o.totalAbonado > o.totalCuenta + o.comprometido + TOLERANCIA,
  },
  presupuesto_sin_respuesta: {
    titulo: "Presupuestos sin respuesta",
    ayuda: "Tienen presupuesto propuesto y el cliente todavía no aprueba ni rechaza.",
    pertenece: (o) => o.estadoPresupuesto === "propuesto",
  },
};

export type ResumenCobros = {
  totalOrdenes: number;
  conCargos:    number;
  categorias:   Record<CategoriaCobro, { cantidad: number; monto: number }>;
};

export function resumirCobros(ordenes: OrdenCobro[]): ResumenCobros {
  const categorias = {} as ResumenCobros["categorias"];
  for (const [clave, def] of Object.entries(CATEGORIAS) as Array<[CategoriaCobro, (typeof CATEGORIAS)[CategoriaCobro]]>) {
    const miembros = ordenes.filter(def.pertenece);
    // El monto de cada categoría es lo que la hace accionable: en las de
    // cobro es lo que falta cobrar; en las de documento, lo que falta (o ya
    // se) documentó.
    const monto = clave.startsWith("por_cobrar") || clave === "entregadas_por_cobrar"
      ? miembros.reduce((s, o) => s + o.porCobrar, 0)
      : clave === "abonos_sin_respaldo"
      ? miembros.reduce((s, o) => s + (o.totalAbonado - o.totalCuenta - o.comprometido), 0)
      : miembros.reduce((s, o) => s + o.totalCuenta, 0);
    categorias[clave] = { cantidad: miembros.length, monto: round2(monto) };
  }
  return {
    totalOrdenes: ordenes.length,
    conCargos: ordenes.filter((o) => o.conCargos).length,
    categorias,
  };
}
