/**
 * "Tipo de proveedor" de selección múltiple (4-oct-2026). Ejecutar: npm test provider-types
 */
import { esProveedorLogistico, proveeMercaderia, tiposDeProveedor } from "../provider-types";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

assert(esProveedorLogistico({ tiposProveedor: ["Logístico"] }), "Laarbox (Logístico) es logístico");
assert(!proveeMercaderia({ tiposProveedor: ["Logístico"] }), "…y no puede ser proveedor de compra");
assert(proveeMercaderia({ tiposProveedor: ["Hardware"] }) && !esProveedorLogistico({ tiposProveedor: ["Hardware"] }), "eBay (Hardware) vende y no es logístico");
assert(proveeMercaderia({ tiposProveedor: ["Hardware", "Software"] }), "Mercado Libre (Hardware + Software) vende");
assert(proveeMercaderia({ tiposProveedor: ["Hardware", "Logístico"] }) && esProveedorLogistico({ tiposProveedor: ["Hardware", "Logístico"] }), "Un proveedor que vende y también transporta sirve para ambas cosas");
assert(proveeMercaderia({ tiposProveedor: [] }), "Sin tipo indicado → no se le impide ser proveedor de compra (como antes)");
assert(esProveedorLogistico({ tipoProveedor: "Logistico" }), "Compatibilidad: texto suelto sin tilde");
assert(tiposDeProveedor({ tipoProveedor: "Hardware, Software" }).length === 2, "Texto con coma se separa en tipos");

if (fallos > 0) { console.error(`\n${fallos} assert(s) fallaron.`); process.exit(1); }
console.log("\n✅ provider-types.test.ts — todos los asserts pasaron");
