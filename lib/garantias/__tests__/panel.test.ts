/**
 * Test — pantalla "Garantías" (auditoría ops, punto 20 · cierre, 5-nov-2026).
 * Todas las garantías en una pantalla: por confirmar arriba, costo del mes,
 * cortesías.
 * Ejecutar: npm test panel
 */
import { armarFilas, estadoDeGarantia, resumenDelMes, PESTANAS_PANEL, type LineaParaPanel } from "../panel";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

function linea(p: Partial<LineaParaPanel> & { id: string }): LineaParaPanel {
  return {
    descripcion: "Pantalla 15.6", tipo: "Repuesto", estado: "Aprobada", cantidad: 1, itemId: null,
    garantia: "Confirmada", ordenId: "recOrd1", historial: "", ...p,
  } as LineaParaPanel;
}

// ─── Estado ─────────────────────────────────────────────────────────────────
assert(estadoDeGarantia({ garantia: "Propuesta", estado: "Propuesta", garantiaEntregada: false }) === "por_confirmar", "propuesta por un técnico → Por confirmar");
assert(estadoDeGarantia({ garantia: "Confirmada", estado: "Aprobada", garantiaEntregada: false }) === "en_curso", "confirmada sin entregar → En curso");
assert(estadoDeGarantia({ garantia: "Confirmada", estado: "Cargada", garantiaEntregada: true }) === "entregada", "entregada → Entregadas");
assert(estadoDeGarantia({ garantia: "Confirmada", estado: "Rechazada", garantiaEntregada: false }) === "quitada", "retirada de la orden → Quitadas (constancia)");
assert(estadoDeGarantia({ garantia: undefined, estado: "Aprobada", garantiaEntregada: false }) === null, "una línea normal no aparece");
assert(PESTANAS_PANEL[0].clave === "por_confirmar" && PESTANAS_PANEL.some((p) => p.clave === "todas"), "pestañas: Por confirmar primero, y Todas");

// ─── Filas ──────────────────────────────────────────────────────────────────
const filas = armarFilas({
  lineas: [
    linea({ id: "l1", itemId: "recItem1", garantiaEntregada: true, fechaEntregaGarantia: "2026-11-03T15:00:00.000Z", garantiaCortesia: true, piezaRetirada: "Se desecha" }),
    linea({ id: "l2", garantia: "Propuesta", estado: "Propuesta", creadoPor: "Luis", historial: "[2026-11-04 10:00] Luis: Garantía propuesta." }),
    linea({ id: "l3", itemId: "recItem2", cantidad: 2, garantiaEntregada: true, fechaEntregaGarantia: "2026-10-20T15:00:00.000Z" }),
    linea({ id: "l4", tipo: "Servicio", descripcion: "Mano de obra", garantiaEntregada: true, fechaEntregaGarantia: "2026-11-02T15:00:00.000Z" }),
    linea({ id: "l5", garantia: undefined }),
    linea({ id: "l6", ordenId: null, fechaAprobacion: "2026-11-01" }),
  ],
  ordenes: new Map([["recOrd1", { codigo: "OR000425", cliente: "Ana Pérez", equipo: "Laptop HP" }]]),
  articulos: new Map([["recItem1", { sku: "REP-000135", costo: 42.5 }], ["recItem2", { sku: "REP-000200", costo: 10 }]]),
});
assert(filas.length === 5, "solo las líneas con garantía (5 de 6)");
assert(filas[0].lineaId === "l2" && filas[0].fecha === "2026-11-04" && filas[0].propuestaPor === "Luis", "la que espera al administrador va arriba, con la fecha del historial");
const f1 = filas.find((f) => f.lineaId === "l1")!;
assert(f1.ordenCodigo === "OR000425" && f1.cliente === "Ana Pérez" && f1.sku === "REP-000135" && f1.costo === 42.5 && f1.cortesia, "trae orden, cliente, SKU, costo y cortesía");
assert(filas.find((f) => f.lineaId === "l3")!.costo === 20, "costo = costo unitario × cantidad");
assert(filas.find((f) => f.lineaId === "l4")!.costo === null, "un servicio no tiene costo de pieza");
assert(filas.find((f) => f.lineaId === "l6")!.ordenCodigo === "" && filas.find((f) => f.lineaId === "l6")!.fecha === "2026-11-01", "sin orden: no falla; usa la fecha de aprobación");
const entregadas = filas.filter((f) => f.estado === "entregada").map((f) => f.lineaId);
assert(entregadas.join(",") === "l1,l4,l3", "entregadas: la más nueva primero");

// ─── Resumen del mes ────────────────────────────────────────────────────────
const r = resumenDelMes(filas, "2026-11");
assert(r.porConfirmar === 1 && r.enCurso === 1, "1 por confirmar, 1 en curso");
assert(r.entregadasMes === 2 && r.costoMes === 42.5 && r.cortesiasMes === 1, "noviembre: 2 entregadas, $42.50 de costo, 1 cortesía (la de octubre no cuenta)");
assert(resumenDelMes([], "2026-11").costoMes === 0, "sin garantías: todo en cero");

if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nPantalla Garantías: todo OK");
