/**
 * Ajuste de datos — auditoría Técnicos y Operaciones, Fase 0 de los puntos 2,
 * 3 y 5 (27-oct-2026). Reproduce con los datos reales de hoy.
 * Ejecutar: npm test ajuste-auditoria-ops-fase0
 */
import {
  CASO_OR000432, CASO_OR000517, MARCA_FASE0, OPERACIONES_COLGADAS,
  planOperacionColgada, planOR000432, planOR000517,
  type LecturaArticulo, type LecturaOperacionColgada, type LecturaProductoDigital,
} from "../ajuste-auditoria-ops-fase0";

let fallos = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { fallos++; console.error("✗", msg); } else console.log("✓", msg);
}

// ── Punto 2: operaciones colgadas ──
{
  assert(OPERACIONES_COLGADAS.length === 4, "Son las 4 operaciones de la auditoría (100, 102, 103, 109)");
  const c = OPERACIONES_COLGADAS[1]; // OP-102 / OR000504 / REC-000073
  const hoy: LecturaOperacionColgada = {
    operacion: { existe: true, estado: "Pedido", ordenIds: [c.ordenId], reciboIds: [], observacion: "" },
    recibo: { existe: true, estado: "Vigente", ordenIds: [c.ordenId] },
    articulo: { existe: true, estado: "Vendido", operacionIds: [c.operacionId] },
  };
  const plan = planOperacionColgada(c, hoy);
  const a = plan.acciones[0];
  assert(plan.estado === "aplicar" && a?.tipo === "operacion", "OP-2026-000102: hay que cerrarla");
  assert(a?.tipo === "operacion" && a.campos["Estado"] === "Entregado", "Pasa de Pedido a Entregado");
  assert(a?.tipo === "operacion" && JSON.stringify(a.campos["Recibos"]) === JSON.stringify([c.reciboId]), "Queda enlazada al recibo de su orden (REC-000073)");
  assert(a?.tipo === "operacion" && String(a.campos["Observación Interna"]).includes(MARCA_FASE0), "Deja constancia en la observación interna");

  const yaAplicado = planOperacionColgada(c, { ...hoy, operacion: { ...hoy.operacion, estado: "Entregado", reciboIds: [c.reciboId] } });
  assert(yaAplicado.estado === "ya-aplicado", "Si ya está Entregada y enlazada → 0 cambios");
  assert(planOperacionColgada(c, { ...hoy, recibo: { ...hoy.recibo, estado: "Anulado" } }).estado === "bloqueado", "Recibo anulado → NO se cierra la operación");
  assert(planOperacionColgada(c, { ...hoy, articulo: { ...hoy.articulo, estado: "Reservado" } }).estado === "bloqueado", "Artículo sin vender → NO se cierra");
  assert(planOperacionColgada(c, { ...hoy, operacion: { ...hoy.operacion, estado: "Rechazado" } }).estado === "bloqueado", "Operación en otro estado → bloqueado");
}

// ── Punto 3: la tapa de OR000432 ──
const articulo = (p: Partial<LecturaArticulo>): LecturaArticulo => ({
  existe: true, sku: "", estado: "Disponible", recibido: true, cantidad: 1, cantidadReservada: 0, reservado: false,
  operacionIds: [], presupuestoIds: [], ordenStockIds: [], facturaIds: [], pagoIds: [], ordenCompraIds: [], ...p,
});
{
  const c = CASO_OR000432;
  const hoy = {
    real: articulo({ sku: "REP-000038" }),
    fantasma: articulo({ sku: "REP-000103", estado: "Registrado", recibido: false, reservado: true, cantidadReservada: 1, operacionIds: [c.operacionId], presupuestoIds: [c.lineaId] }),
    operacion: { existe: true, estado: "Pedido", articuloIds: [c.fantasma.id] },
    linea: { existe: true, articuloIds: [c.fantasma.id], historial: "[2026-10-07 16:14] Maritza Moreno: Pedido al proveedor (REP-000103)." },
    revision: { existe: true, estado: "Abierto", articuloIds: [c.real.id, c.fantasma.id] },
  };
  const plan = planOR000432(hoy);
  assert(plan.estado === "aplicar", "OR000432: hay que aplicar");
  const real = plan.acciones.find((a) => a.tipo === "articulo" && a.id === c.real.id);
  assert(real?.tipo === "articulo" && real.campos["Estado Item"] === "Reservado" && real.campos["Cantidad Reservada"] === 1 && real.campos["Disponible para venta"] === false,
    "REP-000038 queda apartado (Reservado, 1 unidad, ya no se puede vender a otro)");
  assert(real?.tipo === "articulo" && JSON.stringify(real.campos["Operación Comercial"]) === JSON.stringify([c.operacionId]) && JSON.stringify(real.campos["Presupuesto por Orden"]) === JSON.stringify([c.lineaId]),
    "REP-000038 pasa a ser el artículo de OP-2026-000097 y de la línea del presupuesto");
  const soltar = plan.acciones.findIndex((a) => a.tipo === "articulo" && a.id === c.fantasma.id);
  const eliminar = plan.acciones.findIndex((a) => a.tipo === "eliminar-articulo");
  assert(soltar >= 0 && eliminar > soltar, "REP-000103 primero se suelta de la operación y luego se elimina (la regla de Shipping V2 no deja borrar algo vinculado)");
  assert(plan.acciones.some((a) => a.tipo === "evento-articulo"), "Queda constancia en Shipping Eventos");
  assert(plan.acciones.some((a) => a.tipo === "linea-presupuesto"), "Queda constancia en el historial de la línea");
  const rev = plan.acciones.findIndex((a) => a.tipo === "revision");
  const revAccion = plan.acciones[rev];
  assert(rev >= 0 && rev < eliminar && revAccion?.tipo === "revision" && JSON.stringify(revAccion.campos["Artículo"]) === JSON.stringify([c.real.id]) && revAccion.campos["Estado"] === "Resuelto",
    "El asunto 'Posible duplicado' de Revisión se cierra y suelta a REP-000103 ANTES de eliminarlo");

  assert(planOR000432({ ...hoy, fantasma: { ...hoy.fantasma, pagoIds: ["recPago"] } }).estado === "bloqueado", "Si REP-000103 ya tuviera un pago al proveedor → bloqueado (revisar a mano)");
  assert(planOR000432({ ...hoy, real: { ...hoy.real, estado: "Vendido", cantidad: 0 } }).estado === "bloqueado", "Si REP-000038 ya se vendió a otro → bloqueado");
  assert(planOR000432({ ...hoy, real: { ...hoy.real, cantidadReservada: 1, reservado: true } }).estado === "bloqueado", "Si REP-000038 ya estaba apartado para otro → bloqueado");

  const despues = planOR000432({
    real: { ...hoy.real, estado: "Reservado", reservado: true, cantidadReservada: 1, operacionIds: [c.operacionId], presupuestoIds: [c.lineaId] },
    fantasma: articulo({ existe: false }),
    operacion: { existe: true, estado: "Pedido", articuloIds: [c.real.id] },
    linea: { existe: true, articuloIds: [c.real.id], historial: `${hoy.linea.historial}\n[2026-10-27] ${MARCA_FASE0}: …` },
    revision: { existe: true, estado: "Resuelto", articuloIds: [c.real.id] },
  });
  assert(despues.estado === "ya-aplicado", "Ya aplicado → 0 cambios");
}

// ── Punto 5: la licencia de OR000517 ──
const digital = (p: Partial<LecturaProductoDigital>): LecturaProductoDigital => ({
  existe: true, estado: "Disponible", ordenIds: [], lineaIds: [], facturaIds: [], reciboIds: [], observaciones: "", ...p,
});
{
  const c = CASO_OR000517;
  const hoy = {
    entregada: digital({ observaciones: "Password original: … Order number: 92000167735655" }),
    liberar: digital({ ordenIds: [c.ordenId], lineaIds: [c.lineaId] }),
  };
  const plan = planOR000517(hoy);
  assert(plan.estado === "aplicar" && plan.acciones.length === 2, "OR000517: asignar una y liberar la otra");
  const ji = plan.acciones.find((a) => a.tipo === "producto-digital" && a.id === c.entregada.id);
  assert(ji?.tipo === "producto-digital" && JSON.stringify(ji.campos["Orden de Reparación"]) === JSON.stringify([c.ordenId]) && JSON.stringify(ji.campos["Presupuesto por Orden"]) === JSON.stringify([c.lineaId]),
    "ji41416 queda en la orden y en su línea → ya no aparece libre para venderse");
  assert(ji?.tipo === "producto-digital" && String(ji.campos["Observaciones Internas"]).startsWith("Password original"), "Se conservan sus observaciones (contraseña y número de pedido)");
  const e4 = plan.acciones.find((a) => a.tipo === "producto-digital" && a.id === c.liberar.id);
  assert(e4?.tipo === "producto-digital" && JSON.stringify(e4.campos["Orden de Reparación"]) === "[]" && e4.campos["Estado"] === "Disponible", "e4099 queda libre (nunca se le entregó a nadie)");

  assert(planOR000517({ ...hoy, liberar: { ...hoy.liberar, estado: "Usado" } }).estado === "bloqueado", "Si e4099 ya se hubiera vendido → no se libera");
  assert(planOR000517({ ...hoy, entregada: { ...hoy.entregada, ordenIds: ["recOtraOrden"] } }).estado === "bloqueado", "Si ji41416 estuviera en otra orden → bloqueado");
  assert(planOR000517({
    entregada: { ...hoy.entregada, ordenIds: [c.ordenId], lineaIds: [c.lineaId] },
    liberar: digital({}),
  }).estado === "ya-aplicado", "Ya aplicado → 0 cambios");
}

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1); }
console.log("\nTodas las pruebas pasaron.");
