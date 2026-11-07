/**
 * Test — entregar la licencia al entregar, no al aprobar (punto 5B · caso OR000517).
 * Ejecutar: npm test productos-digitales
 */
import { candidatasParaLinea, errorElegir, planReemplazo, unidadLibre, type LineaLicencia, type UnidadLicencia } from "../entrega";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const u = (p: Partial<UnidadLicencia> & { id: string }): UnidadLicencia => ({
  sku: `DIG-${p.id}`, catalogoId: "recEDU", estado: "Disponible", ordenReparacionId: null, fechaCompra: "2026-10-01", numero: 1, tienePdf: false, ...p,
});
const linea: LineaLicencia = { tipo: "Producto digital", estado: "Aprobada", productoCatalogoId: "recEDU", cargoProductoDigitalId: null };

// ─── Candidatas ─────────────────────────────────────────────────────────────
const cand = candidatasParaLinea(linea, [
  u({ id: "nueva", fechaCompra: "2026-10-20", numero: 9 }),
  u({ id: "vieja", fechaCompra: "2026-09-30", numero: 3 }),
  u({ id: "otra", catalogoId: "recOTRO" }),
  u({ id: "deOtraOrden", ordenReparacionId: "recOR2" }),
  u({ id: "usada", estado: "Usado" }),
  u({ id: "sinFecha", fechaCompra: null, numero: 1 }),
]);
assert(cand.map((x) => x.id).join() === "vieja,nueva,sinFecha", "solo libres del mismo producto; la comprada hace más tiempo primero");
assert(!unidadLibre(u({ id: "r", estado: "Reservado" })), "Reservado no está libre");

// ─── Elegir ─────────────────────────────────────────────────────────────────
assert(errorElegir(linea, u({ id: "a" }), "recOR1") === null, "línea aprobada + unidad libre del mismo producto: se entrega");
assert(errorElegir({ ...linea, estado: "Propuesta" }, u({ id: "a" }), "recOR1") === "Primero aprueba la línea.", "sin aprobar no se entrega");
assert(errorElegir({ ...linea, estado: "Cargada", cargoProductoDigitalId: "x" }, u({ id: "a" }), "recOR1")?.includes("Reemplazar") === true, "si ya tiene licencia, se reemplaza (no se elige otra)");
assert(errorElegir(linea, u({ id: "a", catalogoId: "recOTRO" }), "recOR1")?.includes("otro producto") === true, "no se entrega la licencia de otro producto (caso OR000517)");
assert(errorElegir(linea, u({ id: "a", ordenReparacionId: "recOR2", estado: "Reservado" }), "recOR1")?.includes("otra orden") === true, "no se entrega la de otra orden");
assert(errorElegir(linea, u({ id: "a", estado: "Usado" }), "recOR1")?.includes("no está disponible") === true, "no se entrega una ya vendida");
assert(errorElegir(linea, u({ id: "a", estado: "Reservado", ordenReparacionId: "recOR1" }), "recOR1") === null, "reintento: la misma unidad ya apartada para esta orden");

// ─── Reemplazar ─────────────────────────────────────────────────────────────
const cargada: LineaLicencia = { ...linea, estado: "Cargada", cargoProductoDigitalId: "act" };
const actualSinPdf = u({ id: "act", estado: "Reservado", ordenReparacionId: "recOR1" });
let r = planReemplazo({ linea: cargada, actual: actualSinPdf, nueva: u({ id: "nva" }), ordenId: "recOR1", motivo: "Me equivoqué de cuenta" });
assert(r.ok && r.destinoAnterior === "Disponible", "si la anterior nunca se entregó (sin PDF), vuelve al inventario");
r = planReemplazo({ linea: cargada, actual: { ...actualSinPdf, tienePdf: true }, nueva: u({ id: "nva" }), ordenId: "recOR1", motivo: "La clave no activa" });
assert(r.ok && r.destinoAnterior === "Anulado", "si ya se le entregó al cliente (con PDF), queda anulada: no se revende");
assert(!planReemplazo({ linea: cargada, actual: actualSinPdf, nueva: u({ id: "nva" }), ordenId: "recOR1", motivo: " " }).ok, "el motivo es obligatorio");
assert(!planReemplazo({ linea: cargada, actual: { ...actualSinPdf, estado: "Usado" }, nueva: u({ id: "nva" }), ordenId: "recOR1", motivo: "x" }).ok, "si ya se vendió con documento, primero se anula el documento");
assert(!planReemplazo({ linea: cargada, actual: actualSinPdf, nueva: actualSinPdf, ordenId: "recOR1", motivo: "x" }).ok, "la nueva debe ser distinta");
assert(!planReemplazo({ linea: cargada, actual: actualSinPdf, nueva: u({ id: "nva", catalogoId: "recOTRO" }), ordenId: "recOR1", motivo: "x" }).ok, "la nueva debe ser del mismo producto");
assert(!planReemplazo({ linea, actual: actualSinPdf, nueva: u({ id: "nva" }), ordenId: "recOR1", motivo: "x" }).ok, "sin licencia entregada no hay qué reemplazar");

if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nEntrega de licencias: todo OK");
