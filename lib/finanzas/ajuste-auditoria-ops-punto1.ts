/**
 * Ajuste de datos de UNA SOLA VEZ — auditoría Técnicos y Operaciones
 * (27-oct-2026), punto 1: "el pago que se cobra al emitir factura o recibo no
 * queda registrado como pago".
 *
 * Reglas PURAS (sin Airtable): el script scripts/ajuste-auditoria-ops-punto1.ts
 * lee el estado real, llama a planificarCaso() y solo escribe con --aplicar.
 *
 * Decisiones del dueño (27-oct-2026):
 *   · El cobro al emitir es un abono normal, con cuenta destino.
 *   · Transferencias Banco Pichincha → SGINGRESOS. Efectivo → Caja Registradora.
 *   · La orden solo guarda lo suyo; lo que se vende "de paso" al facturar es
 *     venta adicional del documento (camino A). OR000431: mouse $15 + entrega
 *     $6 son venta adicional → su movimiento se divide en $95 (orden) + $21.
 *   · OR000430: el servicio de $25 agregado al facturar SÍ se registra en la
 *     orden (servicio extra hecho a otro equipo del mismo cliente).
 *   · OR000423: el SSD se facturó a $20 en vez de $40 sin autorización → se
 *     registra un descuento de −$20 en la orden, con su motivo.
 *   · OR000383: la transferencia es la del abono anulado (n.º 18842654, 21-jul).
 *   · OR000430/431 no tienen número de transferencia → "SIN NÚMERO".
 *   · OR000331: el pago ya existe (abono de $240 en OP-2026-000023); solo se
 *     enlaza también a la orden.
 *
 * Nunca se crea un ingreso nuevo por dinero que ya está en Finanzas: el abono
 * nuevo se ENLAZA al movimiento que ya existe. La única creación de
 * movimiento es la división de OR000431, y el total de ingresos no cambia.
 */

export const MARCA_AJUSTE = "Regularización auditoría ops punto 1";
export const SIN_NUMERO = "SIN NÚMERO – regularización auditoría";

export type CuentaFinal = "SGINGRESOS" | "Caja Registradora";
export type MetodoAbonoAjuste = "Efectivo" | "Transferencia";
export type MetodoMovimientoAjuste = "Efectivo" | "Transferencia bancaria";

const METODO_MOVIMIENTO: Record<MetodoAbonoAjuste, MetodoMovimientoAjuste> = {
  Efectivo: "Efectivo",
  Transferencia: "Transferencia bancaria",
};
const CUENTA_POR_METODO: Record<MetodoAbonoAjuste, CuentaFinal> = {
  Efectivo: "Caja Registradora",
  Transferencia: "SGINGRESOS",
};

export type CasoPunto1 = {
  orden: string;
  ordenId: string;
  documento: string;
  /** Línea que se agrega a la orden (servicio extra o descuento). */
  lineaOrden?: { nombre: string; costo: number; motivo: string; fecha: string };
  /** Abono nuevo, enlazado al movimiento que ya existe. */
  abono?: {
    monto: number;
    metodo: MetodoAbonoAjuste;
    numero: string | null;
    fecha: string; // YYYY-MM-DD
    movimientoId: string;
    movimientoCodigo: string;
    /** Monto que el movimiento tiene HOY (si no coincide, se bloquea). */
    montoMovimientoActual: number;
  };
  /** Parte del documento que no es de la orden (solo OR000431). */
  ventaAdicional?: { monto: number; detalle: string; facturaId: string; fecha: string };
  /** Abono que ya existe y solo se enlaza a la orden (solo OR000331). */
  abonoExistente?: { id: string; monto: number; operacion: string };
};

export const CASOS_PUNTO1: CasoPunto1[] = [
  {
    orden: "OR000510", ordenId: "recrTevPcVitw3KAz", documento: "REC-000067",
    abono: { monto: 25, metodo: "Transferencia", numero: "86139113", fecha: "2026-10-10",
      movimientoId: "receMv9FK9UVoETMb", movimientoCodigo: "MOV-20261010-56160", montoMovimientoActual: 25 },
  },
  {
    orden: "OR000498", ordenId: "recNT0aVMeWZqNNdL", documento: "REC-000066",
    abono: { monto: 35, metodo: "Efectivo", numero: null, fecha: "2026-10-10",
      movimientoId: "recejZzGNd6lnDebP", movimientoCodigo: "MOV-20261010-88244", montoMovimientoActual: 35 },
  },
  {
    orden: "OR000383", ordenId: "recx97gQKlA74zQ3S", documento: "REC-000013",
    abono: { monto: 90, metodo: "Transferencia", numero: "18842654", fecha: "2026-07-21",
      movimientoId: "recfBLYjN7coFegAx", movimientoCodigo: "MOV-20260929-75749", montoMovimientoActual: 90 },
  },
  {
    orden: "OR000331", ordenId: "recI1f7k5wg0Cptpj", documento: "REC-000010",
    abonoExistente: { id: "recVit8F2l3cDToSN", monto: 240, operacion: "OP-2026-000023" },
  },
  {
    orden: "OR000423", ordenId: "recKaXWnpsFp6u744", documento: "Factura 001-002-000000683",
    lineaOrden: {
      nombre: "Descuento: SSD REP-000017 facturado a $20 (precio $40)",
      costo: -20,
      motivo: "Precio del SSD cambiado a mano en el formulario de facturación, sin autorización (18-ago-2026). Se registra como descuento para que la orden cuadre con la factura.",
      fecha: "2026-08-18",
    },
    abono: { monto: 110, metodo: "Efectivo", numero: null, fecha: "2026-08-18",
      movimientoId: "recnhLtOFMfV3pEUj", movimientoCodigo: "MOV-20260818-96419", montoMovimientoActual: 110 },
  },
  {
    orden: "OR000430", ordenId: "recCexTm1F3RJ6iMI", documento: "Factura 001-002-000000680",
    lineaOrden: {
      nombre: "Intervención técnica por atasco de papel",
      costo: 25,
      motivo: "Servicio extra hecho a otro equipo del cliente, agregado al facturar (18-ago-2026). Se registra en la orden por decisión del dueño.",
      fecha: "2026-08-18",
    },
    abono: { monto: 236, metodo: "Transferencia", numero: SIN_NUMERO, fecha: "2026-08-18",
      movimientoId: "recpPCpotxxZexqAS", movimientoCodigo: "MOV-20260818-81869", montoMovimientoActual: 236 },
  },
  {
    orden: "OR000431", ordenId: "rec6tgkeFJqbQFNlY", documento: "Factura 001-002-000000682",
    abono: { monto: 95, metodo: "Transferencia", numero: SIN_NUMERO, fecha: "2026-08-18",
      movimientoId: "recVLFN5zGF471ghs", movimientoCodigo: "MOV-20260818-87536", montoMovimientoActual: 116 },
    ventaAdicional: {
      monto: 21,
      detalle: "Mouse Lenovo de cable USB negro $15 + Servicio de Recogida e Instalación (Otavalo) $6",
      facturaId: "recZ9WdYcEijDT6ja",
      fecha: "2026-08-18",
    },
  },
];

// ─── Lo que el script lee de Airtable para cada caso ─────────────────────────

export type LecturaMovimiento = {
  id: string;
  monto: number;
  estado: string;            // "Confirmado" | "Anulado" | …
  abonoIds: string[];
  cuadreIds: string[];
  cuentaDestino: string | null; // nombre de la cuenta, o null
  metodo: string | null;
  transaccionId: string | null;
  observacion: string;
};

export type LecturaCaso = {
  orden: {
    existe: boolean;
    totalAPagar: number;   // "Total a Pagar NV"
    totalAbonado: number;  // "Total Abonado NV"
    servicios: Array<{ nombre: string; observacion: string }>;
    abonos: Array<{ id: string; monto: number; estado: string; observacion: string }>;
  };
  movimiento?: LecturaMovimiento | null;
  /** Movimientos ya enlazados a la factura (para no duplicar la venta adicional). */
  movimientosDeLaFactura?: Array<{ monto: number; estado: string; observacion: string }>;
  abonoExistente?: { existe: boolean; monto: number; estado: string; ordenIds: string[]; observacion: string } | null;
  /** record ids de las cuentas, por nombre. */
  cuentas: Partial<Record<CuentaFinal, string>>;
};

// ─── Acciones ────────────────────────────────────────────────────────────────

export type Accion =
  | { tipo: "crear-linea-orden"; ordenId: string; nombre: string; costo: number; observacion: string; fechaISO: string }
  | {
      tipo: "crear-abono";
      ordenId: string; monto: number; metodo: MetodoAbonoAjuste; numero: string | null;
      fechaISO: string; observacion: string; movimientoId: string;
    }
  | {
      tipo: "actualizar-movimiento";
      movimientoId: string;
      monto?: number;
      cuentaDestinoId: string;
      metodo: MetodoMovimientoAjuste;
      transaccionId?: string;
      observacion: string; // texto COMPLETO nuevo (anterior + agregado)
    }
  | {
      tipo: "crear-movimiento-venta-adicional";
      monto: number; facturaId: string; cuentaDestinoId: string; metodo: MetodoMovimientoAjuste;
      transaccionId?: string; fechaISO: string; observacion: string;
    }
  | { tipo: "enlazar-abono-a-orden"; abonoId: string; ordenId: string; observacion: string };

export type PlanCaso = {
  orden: string;
  estado: "aplicar" | "ya-aplicado" | "bloqueado";
  acciones: Accion[];
  bloqueos: string[];
  /** Saldo NV que quedará en la orden después de aplicar. */
  saldoDespues: number;
  resumen: string[];
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const fechaISO = (fecha: string) => `${fecha}T12:00:00.000-05:00`;
const agregar = (antes: string, nuevo: string) => (antes.trim() ? `${antes.trim()}\n${nuevo}` : nuevo);

export function planificarCaso(caso: CasoPunto1, lectura: LecturaCaso): PlanCaso {
  const acciones: Accion[] = [];
  const bloqueos: string[] = [];
  const resumen: string[] = [];

  if (!lectura.orden.existe) {
    return { orden: caso.orden, estado: "bloqueado", acciones, bloqueos: [`La orden ${caso.orden} no existe.`], saldoDespues: 0, resumen };
  }

  let totalAPagar = lectura.orden.totalAPagar;
  let totalAbonado = lectura.orden.totalAbonado;

  // 1. Línea en la orden (servicio extra o descuento).
  if (caso.lineaOrden) {
    const yaEsta = lectura.orden.servicios.some((s) => s.nombre.trim() === caso.lineaOrden!.nombre);
    if (!yaEsta) {
      acciones.push({
        tipo: "crear-linea-orden",
        ordenId: caso.ordenId,
        nombre: caso.lineaOrden.nombre,
        costo: caso.lineaOrden.costo,
        observacion: `${MARCA_AJUSTE} (autorizado por el dueño, 27-oct-2026). ${caso.lineaOrden.motivo} Documento: ${caso.documento}.`,
        fechaISO: fechaISO(caso.lineaOrden.fecha),
      });
      totalAPagar = round2(totalAPagar + caso.lineaOrden.costo);
      resumen.push(`${caso.lineaOrden.costo < 0 ? "descuento" : "servicio"} "${caso.lineaOrden.nombre}" ${caso.lineaOrden.costo < 0 ? "−" : "+"}$${Math.abs(caso.lineaOrden.costo)}`);
    }
  }

  // 2. Abono nuevo, enlazado al movimiento existente.
  if (caso.abono) {
    const a = caso.abono;
    const cuentaFinal = CUENTA_POR_METODO[a.metodo];
    const cuentaId = lectura.cuentas[cuentaFinal];
    const metodoMov = METODO_MOVIMIENTO[a.metodo];
    const montoFinalMov = round2(a.monto);
    const mov = lectura.movimiento ?? null;

    const abonoYaCreado = lectura.orden.abonos.some((x) => x.estado !== "Anulado" && x.observacion.includes(MARCA_AJUSTE));
    if (!cuentaId) bloqueos.push(`No se encontró la cuenta "${cuentaFinal}".`);
    if (!mov) bloqueos.push(`No se encontró el movimiento ${a.movimientoCodigo}.`);

    if (mov && cuentaId) {
      if (mov.estado === "Anulado") bloqueos.push(`${a.movimientoCodigo} está anulado.`);
      if (mov.cuadreIds.length > 0) bloqueos.push(`${a.movimientoCodigo} ya está dentro de un cuadre de caja: no se mueve de cuenta.`);
      const abonosAjenos = mov.abonoIds.filter((id) => !lectura.orden.abonos.some((x) => x.id === id && x.observacion.includes(MARCA_AJUSTE)));
      if (abonosAjenos.length > 0) bloqueos.push(`${a.movimientoCodigo} ya está enlazado a otro abono (${abonosAjenos.join(", ")}).`);
      const montoOk = mov.monto === a.montoMovimientoActual || (mov.monto === montoFinalMov && mov.observacion.includes(MARCA_AJUSTE));
      if (!montoOk) bloqueos.push(`${a.movimientoCodigo} tiene $${mov.monto}; se esperaba $${a.montoMovimientoActual}.`);

      if (!abonoYaCreado) {
        acciones.push({
          tipo: "crear-abono",
          ordenId: caso.ordenId,
          monto: a.monto,
          metodo: a.metodo,
          numero: a.numero,
          fechaISO: fechaISO(a.fecha),
          movimientoId: mov.id,
          observacion: `${MARCA_AJUSTE} (autorizado por el dueño, 27-oct-2026): cobro al emitir ${caso.documento} que no había quedado registrado como abono. Movimiento ${a.movimientoCodigo}.`,
        });
        totalAbonado = round2(totalAbonado + a.monto);
        resumen.push(`abono $${a.monto} ${a.metodo}${a.numero ? ` n.º ${a.numero}` : ""} (${a.fecha})`);
      }

      const movListo =
        mov.cuentaDestino === cuentaFinal && mov.metodo === metodoMov && mov.monto === montoFinalMov && mov.observacion.includes(MARCA_AJUSTE);
      if (!movListo) {
        const cambios: string[] = [];
        if (mov.cuentaDestino !== cuentaFinal) cambios.push(`cuenta ${mov.cuentaDestino ?? "(sin cuenta)"} → ${cuentaFinal}`);
        if (mov.metodo !== metodoMov) cambios.push(`método ${mov.metodo ?? "(vacío)"} → ${metodoMov}`);
        if (mov.monto !== montoFinalMov) cambios.push(`monto $${mov.monto} → $${montoFinalMov}`);
        acciones.push({
          tipo: "actualizar-movimiento",
          movimientoId: mov.id,
          monto: mov.monto !== montoFinalMov ? montoFinalMov : undefined,
          cuentaDestinoId: cuentaId,
          metodo: metodoMov,
          transaccionId: a.numero ?? undefined,
          observacion: agregar(mov.observacion, `${MARCA_AJUSTE} (27-oct-2026): enlazado al abono de ${caso.orden}. ${cambios.join("; ") || "sin cambios de cuenta"}.`),
        });
        if (cambios.length) resumen.push(`${a.movimientoCodigo}: ${cambios.join(", ")}`);
      }
    }

    // 3. Venta adicional (parte del documento que no es de la orden).
    if (caso.ventaAdicional && cuentaId) {
      const v = caso.ventaAdicional;
      const yaExiste = (lectura.movimientosDeLaFactura ?? []).some(
        (m) => m.estado !== "Anulado" && m.monto === v.monto && m.observacion.includes(MARCA_AJUSTE)
      );
      if (!yaExiste) {
        acciones.push({
          tipo: "crear-movimiento-venta-adicional",
          monto: v.monto,
          facturaId: v.facturaId,
          cuentaDestinoId: cuentaId,
          metodo: metodoMov,
          transaccionId: a.numero ?? undefined,
          fechaISO: fechaISO(v.fecha),
          observacion: `${MARCA_AJUSTE} (autorizado por el dueño, 27-oct-2026): venta adicional de ${caso.documento} (${v.detalle}), separada de ${a.movimientoCodigo}. No es parte de la orden ${caso.orden}.`,
        });
        resumen.push(`movimiento nuevo $${v.monto} por venta adicional (${cuentaFinal})`);
      }
      // Ingresos totales: el movimiento original baja exactamente lo que sube el nuevo.
      if (round2(a.monto + v.monto) !== round2(a.montoMovimientoActual)) {
        bloqueos.push(`La división no conserva el ingreso: $${a.monto} + $${v.monto} ≠ $${a.montoMovimientoActual}.`);
      }
    }
  }

  // 4. Abono que ya existe y solo falta enlazar a la orden.
  if (caso.abonoExistente) {
    const ae = caso.abonoExistente;
    const lect = lectura.abonoExistente;
    if (!lect?.existe) bloqueos.push(`No se encontró el abono ${ae.id}.`);
    else {
      if (lect.estado === "Anulado") bloqueos.push(`El abono ${ae.id} está anulado.`);
      if (lect.monto !== ae.monto) bloqueos.push(`El abono ${ae.id} tiene $${lect.monto}; se esperaba $${ae.monto}.`);
      if (!lect.ordenIds.includes(caso.ordenId)) {
        acciones.push({
          tipo: "enlazar-abono-a-orden",
          abonoId: ae.id,
          ordenId: caso.ordenId,
          observacion: agregar(lect.observacion, `${MARCA_AJUSTE} (27-oct-2026): era el pago de ${caso.orden}; se registró solo en ${ae.operacion}. Se enlaza también a la orden.`),
        });
        totalAbonado = round2(totalAbonado + ae.monto);
        resumen.push(`enlazar abono existente $${ae.monto} (${ae.operacion}) a la orden`);
      }
    }
  }

  const saldoDespues = round2(totalAPagar - totalAbonado);
  if (bloqueos.length === 0 && acciones.length > 0 && Math.abs(saldoDespues) > 0.01) {
    bloqueos.push(`Después del ajuste la orden no queda en $0 (quedaría $${saldoDespues}). No se aplica: revisar.`);
  }

  const estado = bloqueos.length > 0 ? "bloqueado" : acciones.length === 0 ? "ya-aplicado" : "aplicar";
  return { orden: caso.orden, estado, acciones: estado === "bloqueado" ? [] : acciones, bloqueos, saldoDespues, resumen };
}
