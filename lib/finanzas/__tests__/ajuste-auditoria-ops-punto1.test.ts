/**
 * Ajuste de datos — auditoría Técnicos y Operaciones, punto 1 (27-oct-2026).
 * Reproduce con los datos reales los 7 casos en que el cobro al emitir no
 * quedó como abono y verifica que el plan deja cada orden en $0 sin crear
 * ingresos nuevos.
 * Ejecutar: npm test ajuste-auditoria-ops-punto1
 */
import {
  CASOS_PUNTO1, MARCA_AJUSTE, SIN_NUMERO, planificarCaso,
  type CasoPunto1, type LecturaCaso, type LecturaMovimiento, type Accion,
} from "../ajuste-auditoria-ops-punto1";

let fallos = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { fallos++; console.error("✗", msg); } else console.log("✓", msg);
}

const CUENTAS = { SGINGRESOS: "recWTVoYaMzk5li3u", "Caja Registradora": "recQyTpXTgMLWHCBv" } as const;
const caso = (orden: string): CasoPunto1 => {
  const c = CASOS_PUNTO1.find((x) => x.orden === orden);
  if (!c) throw new Error(`Falta el caso ${orden}`);
  return c;
};
const mov = (p: Partial<LecturaMovimiento> & { id: string; monto: number }): LecturaMovimiento => ({
  estado: "Confirmado", abonoIds: [], cuadreIds: [], cuentaDestino: null, metodo: null, transaccionId: null, observacion: "", ...p,
});
const lectura = (p: { totalAPagar: number; totalAbonado?: number; movimiento?: LecturaMovimiento | null } & Partial<LecturaCaso>): LecturaCaso => ({
  orden: { existe: true, totalAPagar: p.totalAPagar, totalAbonado: p.totalAbonado ?? 0, servicios: [], abonos: [] },
  movimiento: p.movimiento,
  movimientosDeLaFactura: p.movimientosDeLaFactura ?? [],
  abonoExistente: p.abonoExistente ?? null,
  cuentas: { ...CUENTAS },
  ...(p.orden ? { orden: p.orden } : {}),
});
const de = <T extends Accion["tipo"]>(acciones: Accion[], tipo: T) =>
  acciones.filter((a): a is Extract<Accion, { tipo: T }> => a.tipo === tipo);

// ── OR000510: el caso de la auditoría (recibo $25 por transferencia, sin cuenta) ──
{
  const plan = planificarCaso(caso("OR000510"), lectura({
    totalAPagar: 25,
    movimiento: mov({ id: "receMv9FK9UVoETMb", monto: 25, observacion: "Recibo interno REC-000067 — saldo cobrado al emitir" }),
  }));
  assert(plan.estado === "aplicar", "OR000510: hay que aplicar");
  const [abono] = de(plan.acciones, "crear-abono");
  assert(abono?.monto === 25 && abono.metodo === "Transferencia" && abono.numero === "86139113", "OR000510: abono $25 por transferencia n.º 86139113");
  assert(abono?.movimientoId === "receMv9FK9UVoETMb", "OR000510: el abono se enlaza al movimiento que YA existe (no ingreso nuevo)");
  const [m] = de(plan.acciones, "actualizar-movimiento");
  assert(m?.cuentaDestinoId === CUENTAS.SGINGRESOS && m.metodo === "Transferencia bancaria", "OR000510: el movimiento pasa a SGINGRESOS");
  assert(m?.monto === undefined, "OR000510: el monto del movimiento no cambia");
  assert(m?.observacion.startsWith("Recibo interno REC-000067") === true && m.observacion.includes(MARCA_AJUSTE), "OR000510: la observación anterior se conserva y se agrega la constancia");
  assert(de(plan.acciones, "crear-movimiento-venta-adicional").length === 0, "OR000510: no se crea ningún movimiento");
  assert(plan.saldoDespues === 0, "OR000510: la orden queda en $0");
}

// ── OR000498: efectivo, el movimiento ya está en Caja ──
{
  const plan = planificarCaso(caso("OR000498"), lectura({
    totalAPagar: 35,
    movimiento: mov({ id: "recejZzGNd6lnDebP", monto: 35, cuentaDestino: "Caja Registradora", metodo: "Efectivo" }),
  }));
  assert(de(plan.acciones, "crear-abono")[0]?.metodo === "Efectivo", "OR000498: abono en efectivo");
  const [m] = de(plan.acciones, "actualizar-movimiento");
  assert(m?.cuentaDestinoId === CUENTAS["Caja Registradora"], "OR000498: el movimiento sigue en Caja (solo recibe la constancia)");
  assert(plan.saldoDespues === 0, "OR000498: la orden queda en $0");
}

// ── OR000383: el recibo dijo efectivo pero fue transferencia ──
{
  const plan = planificarCaso(caso("OR000383"), lectura({
    totalAPagar: 90,
    orden: { existe: true, totalAPagar: 90, totalAbonado: 0, servicios: [], abonos: [{ id: "rechatJOXPugJVLRo", monto: 90, estado: "Anulado", observacion: "" }] },
    movimiento: mov({ id: "recfBLYjN7coFegAx", monto: 90, cuentaDestino: "Caja Registradora", metodo: "Efectivo" }),
  }));
  const [abono] = de(plan.acciones, "crear-abono");
  assert(abono?.numero === "18842654" && abono.fechaISO.startsWith("2026-07-21"), "OR000383: usa el número y la fecha de la transferencia original");
  const [m] = de(plan.acciones, "actualizar-movimiento");
  assert(m?.cuentaDestinoId === CUENTAS.SGINGRESOS && m.metodo === "Transferencia bancaria", "OR000383: los $90 salen de Caja y pasan a SGINGRESOS");
  assert(plan.estado === "aplicar", "OR000383: el abono anulado anterior no estorba");
}

// ── OR000331: el pago ya existe en la operación ──
{
  const plan = planificarCaso(caso("OR000331"), lectura({
    totalAPagar: 240,
    abonoExistente: { existe: true, monto: 240, estado: "Registrado", ordenIds: [], observacion: "" },
  }));
  assert(plan.acciones.length === 1 && plan.acciones[0].tipo === "enlazar-abono-a-orden", "OR000331: solo se enlaza el abono existente a la orden");
  assert(de(plan.acciones, "crear-abono").length === 0, "OR000331: NO se crea un abono nuevo (sería cobrar dos veces)");
  assert(plan.saldoDespues === 0, "OR000331: la orden queda en $0");
}

// ── OR000423: descuento no autorizado de $20 en el SSD ──
{
  const plan = planificarCaso(caso("OR000423"), lectura({
    totalAPagar: 130,
    movimiento: mov({ id: "recnhLtOFMfV3pEUj", monto: 110, cuentaDestino: "Caja Registradora", metodo: "Efectivo" }),
  }));
  const [linea] = de(plan.acciones, "crear-linea-orden");
  assert(linea?.costo === -20 && linea.observacion.includes("sin autorización"), "OR000423: descuento −$20 con su motivo");
  assert(de(plan.acciones, "crear-abono")[0]?.monto === 110, "OR000423: abono $110 (lo que pagó)");
  assert(plan.saldoDespues === 0, "OR000423: $130 − $20 − $110 = $0");
}

// ── OR000430: servicio extra de $25 que va a la orden ──
{
  const plan = planificarCaso(caso("OR000430"), lectura({
    totalAPagar: 211,
    movimiento: mov({ id: "recpPCpotxxZexqAS", monto: 236 }),
  }));
  assert(de(plan.acciones, "crear-linea-orden")[0]?.costo === 25, "OR000430: el servicio de $25 se agrega a la orden");
  const [abono] = de(plan.acciones, "crear-abono");
  assert(abono?.monto === 236 && abono.numero === SIN_NUMERO, "OR000430: abono $236 por transferencia, sin número");
  assert(de(plan.acciones, "crear-movimiento-venta-adicional").length === 0, "OR000430: no hay venta adicional");
  assert(plan.saldoDespues === 0, "OR000430: $211 + $25 − $236 = $0");
}

// ── OR000431: venta adicional de $21 se separa del movimiento ──
{
  const plan = planificarCaso(caso("OR000431"), lectura({
    totalAPagar: 95,
    movimiento: mov({ id: "recVLFN5zGF471ghs", monto: 116 }),
  }));
  assert(de(plan.acciones, "crear-abono")[0]?.monto === 95, "OR000431: abono $95, solo lo de la orden");
  const [m] = de(plan.acciones, "actualizar-movimiento");
  assert(m?.monto === 95 && m.cuentaDestinoId === CUENTAS.SGINGRESOS, "OR000431: el movimiento original baja a $95 y pasa a SGINGRESOS");
  const [v] = de(plan.acciones, "crear-movimiento-venta-adicional");
  assert(v?.monto === 21 && v.facturaId === "recZ9WdYcEijDT6ja" && v.cuentaDestinoId === CUENTAS.SGINGRESOS, "OR000431: movimiento nuevo $21 de venta adicional, enlazado a la factura");
  assert((m?.monto ?? 0) + (v?.monto ?? 0) === 116, "OR000431: el ingreso total sigue siendo $116");
  assert(de(plan.acciones, "crear-linea-orden").length === 0, "OR000431: la orden NO recibe el mouse ni la entrega");
  assert(plan.saldoDespues === 0, "OR000431: la orden queda en $0");
}

// ── Protecciones ──
{
  const anulado = planificarCaso(caso("OR000510"), lectura({ totalAPagar: 25, movimiento: mov({ id: "receMv9FK9UVoETMb", monto: 25, estado: "Anulado" }) }));
  assert(anulado.estado === "bloqueado" && anulado.acciones.length === 0, "Movimiento anulado → no se toca nada");

  const enCuadre = planificarCaso(caso("OR000383"), lectura({ totalAPagar: 90, movimiento: mov({ id: "recfBLYjN7coFegAx", monto: 90, cuadreIds: ["recCuadre"] }) }));
  assert(enCuadre.estado === "bloqueado", "Movimiento dentro de un cuadre de caja → bloqueado");

  const montoDistinto = planificarCaso(caso("OR000510"), lectura({ totalAPagar: 25, movimiento: mov({ id: "receMv9FK9UVoETMb", monto: 30 }) }));
  assert(montoDistinto.estado === "bloqueado", "El movimiento cambió de monto → bloqueado");

  const otroAbono = planificarCaso(caso("OR000498"), lectura({ totalAPagar: 35, movimiento: mov({ id: "recejZzGNd6lnDebP", monto: 35, abonoIds: ["recOtro"] }) }));
  assert(otroAbono.estado === "bloqueado", "El movimiento ya pertenece a otro abono → bloqueado");

  const noCuadra = planificarCaso(caso("OR000498"), lectura({ totalAPagar: 50, movimiento: mov({ id: "recejZzGNd6lnDebP", monto: 35 }) }));
  assert(noCuadra.estado === "bloqueado" && noCuadra.bloqueos.some((b) => b.includes("no queda en $0")), "Si la orden no quedara en $0 → no se aplica");

  const sinCuenta = planificarCaso(caso("OR000510"), { ...lectura({ totalAPagar: 25, movimiento: mov({ id: "receMv9FK9UVoETMb", monto: 25 }) }), cuentas: {} });
  assert(sinCuenta.estado === "bloqueado", "Sin la cuenta SGINGRESOS → bloqueado");

  const abonoAnulado = planificarCaso(caso("OR000331"), lectura({ totalAPagar: 240, abonoExistente: { existe: true, monto: 240, estado: "Anulado", ordenIds: [], observacion: "" } }));
  assert(abonoAnulado.estado === "bloqueado", "OR000331 con el abono anulado → bloqueado");
}

// ── Correr dos veces no duplica nada ──
{
  const abonoNuestro = { id: "recNuevo", monto: 95, estado: "Registrado", observacion: `${MARCA_AJUSTE} …` };
  const plan = planificarCaso(caso("OR000431"), lectura({
    totalAPagar: 95,
    totalAbonado: 95,
    orden: { existe: true, totalAPagar: 95, totalAbonado: 95, servicios: [], abonos: [abonoNuestro] },
    movimiento: mov({ id: "recVLFN5zGF471ghs", monto: 95, abonoIds: ["recNuevo"], cuentaDestino: "SGINGRESOS", metodo: "Transferencia bancaria", observacion: `… ${MARCA_AJUSTE} …` }),
    movimientosDeLaFactura: [{ monto: 21, estado: "Confirmado", observacion: `${MARCA_AJUSTE} venta adicional` }],
  }));
  assert(plan.estado === "ya-aplicado" && plan.acciones.length === 0, "Ya aplicado → la vista previa dice 0 cambios");

  const p430 = planificarCaso(caso("OR000430"), lectura({
    totalAPagar: 236, totalAbonado: 236,
    orden: { existe: true, totalAPagar: 236, totalAbonado: 236, servicios: [{ nombre: "Intervención técnica por atasco de papel", observacion: MARCA_AJUSTE }], abonos: [{ id: "recA", monto: 236, estado: "Registrado", observacion: MARCA_AJUSTE }] },
    movimiento: mov({ id: "recpPCpotxxZexqAS", monto: 236, abonoIds: ["recA"], cuentaDestino: "SGINGRESOS", metodo: "Transferencia bancaria", observacion: MARCA_AJUSTE }),
  }));
  assert(p430.estado === "ya-aplicado", "OR000430 ya aplicado → no vuelve a agregar el servicio");

  const p331 = planificarCaso(caso("OR000331"), lectura({ totalAPagar: 240, totalAbonado: 240, abonoExistente: { existe: true, monto: 240, estado: "Registrado", ordenIds: ["recI1f7k5wg0Cptpj"], observacion: MARCA_AJUSTE } }));
  assert(p331.estado === "ya-aplicado", "OR000331 ya enlazado → 0 cambios");
}

// ── El plan completo ──
assert(CASOS_PUNTO1.length === 7, "Son exactamente los 7 casos de la auditoría");
assert(CASOS_PUNTO1.filter((c) => c.ventaAdicional).length === 1, "Solo OR000431 tiene venta adicional");

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1); }
console.log("\nTodas las pruebas pasaron.");
