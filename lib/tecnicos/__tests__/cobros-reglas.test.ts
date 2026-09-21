/**
 * Test — reglas del panel "Cobros y documentos" (/tecnicos/ordenes).
 *
 * Casos tomados de datos reales (20-sep-2026) para que la regla que sostiene
 * cada contador quede fija:
 *   · OR000430: factura emitida, $211, cero abonos. Antes aparecía con
 *     "Saldo pendiente $211" aunque se cobró al facturar. Un documento
 *     emitido SALDA la cuenta.
 *   · OR000453: entregada, $55, abono de $25, sin documento → debe $30.
 *   · OR000477: recibo vigente → documentada.
 *
 * Ejecutar: npm test cobros-reglas
 */

import { clasificarOrden, resumirCobros, CATEGORIAS, type OrdenCobroInput, type OrdenCobro } from "../cobros/reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const base = (o: Partial<OrdenCobroInput>): OrdenCobroInput => ({
  recordId: "rec00000000000000", idVisible: "OR", cliente: "", equipo: "", estado: "Completado",
  fechaIngreso: "2026-09-01", totalCuenta: 0, abonos: [], facturas: [], recibos: [], ...o,
});
const en = (cat: keyof typeof CATEGORIAS, o: OrdenCobro) => CATEGORIAS[cat].pertenece(o);

// 1. Factura emitida sin abonos: documentada, nada por cobrar.
const or430 = clasificarOrden(base({
  idVisible: "OR000430", estado: "Finalizado Entregado", totalCuenta: 211,
  facturas: [{ tipo: "factura", recordId: "recF", numero: "001-002-000000680", estado: "AUTORIZADO" }],
}));
assert(or430.estadoCobro === "documentada", "Factura AUTORIZADA → documentada");
assert(or430.porCobrar === 0, `Con documento no queda nada por cobrar (obtenido: $${or430.porCobrar})`);
assert(or430.saldo === 211, "El saldo informativo sigue siendo total − abonos (no se inventan abonos)");
assert(!en("entregadas_por_cobrar", or430) && !en("entregadas_sin_documento", or430),
  "Una entregada con factura NO aparece como entregada con saldo ni sin documento");
assert(en("con_documento", or430), "Cuenta en 'Con documento'");

// 2. Entregada con abono parcial y sin documento.
const or453 = clasificarOrden(base({
  idVisible: "OR000453", estado: "Finalizado Entregado", totalCuenta: 55,
  abonos: [{ id: "a1", monto: 25, estado: "Registrado" }],
}));
assert(or453.estadoCobro === "abono_parcial", "Abono de $25 sobre $55 → abono parcial");
assert(or453.porCobrar === 30, `Falta cobrar $30 (obtenido: $${or453.porCobrar})`);
assert(en("entregadas_por_cobrar", or453) && en("entregadas_sin_documento", or453) && en("por_cobrar_parcial", or453),
  "Aparece en 'Entregadas con saldo', 'Entregadas sin documento' y 'Con abonos parciales'");
assert(!en("por_cobrar_sin_abonos", or453), "No aparece en 'Sin ningún abono'");

// 3. Recibo vigente.
const or477 = clasificarOrden(base({
  estado: "Finalizado Entregado", totalCuenta: 115, abonos: [{ id: "a", monto: 115, estado: "Registrado" }],
  recibos: [{ tipo: "recibo", recordId: "recR", numero: "REC-000005", estado: "Vigente" }],
}));
assert(or477.estadoCobro === "documentada" && or477.documento?.numero === "REC-000005", "Recibo vigente → documentada");

// 4. Recibo anulado y factura en BORRADOR NO cuentan como documento.
const noDoc = clasificarOrden(base({
  totalCuenta: 60,
  facturas: [{ tipo: "factura", recordId: "recB", numero: "", estado: "BORRADOR" }],
  recibos:  [{ tipo: "recibo", recordId: "recA", numero: "REC-000009", estado: "Anulado" }],
}));
assert(noDoc.documento === null, "Borrador y recibo anulado no son documento emitido");
assert(noDoc.documentoNoEmitido?.estado === "BORRADOR", "El borrador se informa como intento no emitido");
assert(noDoc.estadoCobro === "sin_abonos" && en("por_cobrar_sin_abonos", noDoc), "Sin abonos → 'Sin ningún abono'");

// 5. Factura DEVUELTA por el SRI no cuenta como emitida.
const devuelta = clasificarOrden(base({
  totalCuenta: 40, facturas: [{ tipo: "factura", recordId: "recD", numero: "", estado: "DEVUELTA" }],
}));
assert(devuelta.documento === null && en("sin_documento", devuelta), "Factura DEVUELTA → sigue sin documento");

// 6. Abonos anulados no cuentan.
const anulado = clasificarOrden(base({
  totalCuenta: 50,
  abonos: [{ id: "x", monto: 50, estado: "Anulado" }, { id: "y", monto: 20, estado: "Registrado" }],
}));
assert(anulado.totalAbonado === 20 && anulado.porCobrar === 30, "Un abono anulado no se suma");

// 7. Pagada por abonos pero sin documento: no debe dinero, sí falta documento.
const pagada = clasificarOrden(base({
  estado: "Finalizado Entregado", totalCuenta: 80, abonos: [{ id: "p", monto: 80, estado: "Registrado" }],
}));
assert(pagada.estadoCobro === "pagada", "Abonos = total → pagada");
assert(en("entregadas_sin_documento", pagada) && !en("entregadas_por_cobrar", pagada),
  "Pagada sin documento: aparece en 'sin documento' pero NO en 'con saldo'");

// 8. Sin cargos: fuera de todas las categorías.
const vacia = clasificarOrden(base({ estado: "Finalizado Entregado", totalCuenta: 0 }));
assert(vacia.estadoCobro === "sin_cargos", "Cuenta en $0 → sin cargos");
assert(Object.values(CATEGORIAS).every((c) => !c.pertenece(vacia)), "Una orden sin cargos no entra en ningún contador");

// 8b. Abonos sin cargos (OR000432: $100 abonados, cuenta en $0).
const anticipo = clasificarOrden(base({ estado: "Pendiente", totalCuenta: 0, abonos: [{ id: "q", monto: 100, estado: "Registrado" }] }));
assert(anticipo.estadoCobro === "saldo_a_favor", "Abonos sobre una cuenta en $0 → saldo a favor, no 'sin cargos'");
assert(en("abonos_sin_respaldo", anticipo), "Aparece en 'Abonos sin cargos o de más'");
const deMas = clasificarOrden(base({ totalCuenta: 25, abonos: [{ id: "m1", monto: 50, estado: "Registrado" }, { id: "m2", monto: 10, estado: "Registrado" }] }));
assert(en("abonos_sin_respaldo", deMas) && deMas.porCobrar === 0, "Abonos de $60 sobre $25 → de más, nada por cobrar");
assert(resumirCobros([anticipo, deMas]).categorias.abonos_sin_respaldo.monto === 135, "El monto es el excedente abonado ($100 + $35)");

// 8c. Presupuesto aprobado sin cargos todavía (repuesto esperando stock):
//     cuenta como aprobada; un presupuesto propuesto entra en "sin respuesta".
const aprobadaSinCargos = clasificarOrden(base({ totalCuenta: 0, estadoPresupuesto: "aprobado" }));
assert(aprobadaSinCargos.aprobada, "Presupuesto aprobado → la orden cuenta como aprobada aunque aún no tenga cargos");
const propuesto = clasificarOrden(base({ totalCuenta: 0, estadoPresupuesto: "propuesto" }));
assert(en("presupuesto_sin_respuesta", propuesto) && !propuesto.aprobada, "Presupuesto propuesto → 'sin respuesta', no aprobada");

// 9. Resumen.
const r = resumirCobros([or430, or453, or477, noDoc, devuelta, anulado, pagada, vacia]);
assert(r.totalOrdenes === 8 && r.conCargos === 7, "El resumen cuenta órdenes y órdenes con cargos");
assert(r.categorias.con_documento.cantidad === 2, `Con documento: 2 (obtenido: ${r.categorias.con_documento.cantidad})`);
assert(r.categorias.sin_documento.cantidad === 5, `Sin documento: 5 (obtenido: ${r.categorias.sin_documento.cantidad})`);
assert(r.categorias.entregadas_por_cobrar.cantidad === 1 && r.categorias.entregadas_por_cobrar.monto === 30,
  "Entregadas con saldo: 1 orden por $30");
assert(r.categorias.por_cobrar.monto === 30 + 60 + 40 + 30, `Monto por cobrar = suma de lo que falta (obtenido: $${r.categorias.por_cobrar.monto})`);

if (fallos > 0) { console.error(`\n${fallos} fallo(s).`); process.exit(1); }
console.log("\nOK — reglas de cobros y documentos.");
