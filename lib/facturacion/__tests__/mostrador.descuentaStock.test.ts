/**
 * Test — una venta de mostrador también descuenta inventario.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/mostrador.descuentaStock.test.ts
 *
 * Puro: sin red, sin Airtable, sin SRI.
 *
 * ─── Qué protege ─────────────────────────────────────────────────────────────
 *
 * El 14 de agosto de 2026, la PRIMERA factura real de producción
 * (001-002-000000674) vendió un Cable HDMI elegido del buscador y no descontó
 * ni una unidad del stock.
 *
 * La causa: el endpoint de emisión exigía `body.origen` para disparar el
 * descuento. Ese campo solo lo traen las facturas que nacen de una orden de
 * reparación o de una operación comercial. Una venta de mostrador no lo tiene.
 *
 * Lo peligroso era la contradicción: la verificación PREVIA de stock sí corría
 * para el mostrador (lib/facturacion/reglas/stock.ts), así que el sistema
 * confirmaba que había existencias, autorizaba la venta ante el SRI, y después
 * dejaba el inventario intacto. Se vendía sin descontar, en silencio, y con un
 * documento tributario ya emitido que no se puede deshacer.
 *
 * Estas aserciones existen para que la condición del disparo no vuelva a
 * depender del origen.
 */

import { debeIntentarPostEmision } from "../gancho/postEmision";

let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); }
  else       { console.log("✓", msg); }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. El caso que falló en producción
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── una venta de mostrador descuenta igual que una del gancho ──");

// Mostrador: sin `origen`. Es exactamente la forma del resultado de la 674.
assert(
  debeIntentarPostEmision({ estado: "AUTORIZADO", recordId: "recCable674" }) === true,
  "Mostrador (sin origen) AUTORIZADO → sí se intenta el descuento"
);

// Gancho: lo mismo. El origen no entra en la decisión, y por eso ni siquiera
// es un campo que esta función mire.
assert(
  debeIntentarPostEmision({ estado: "AUTORIZADO", recordId: "recOrden001" }) === true,
  "Gancho AUTORIZADO → sí se intenta el descuento"
);

// ═══════════════════════════════════════════════════════════════════════════
// 2. Lo que NO debe disparar el descuento
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── sin factura real no se toca el inventario ──");

assert(
  debeIntentarPostEmision({ estado: "DEVUELTA", recordId: "recX" }) === false,
  "DEVUELTA → no se descuenta: el SRI la rechazó, no hubo venta"
);
assert(
  debeIntentarPostEmision({ estado: "NO AUTORIZADO", recordId: "recX" }) === false,
  "NO AUTORIZADO → no se descuenta"
);
assert(
  debeIntentarPostEmision({ estado: "EN PROCESAMIENTO", recordId: "recX" }) === false,
  "EN PROCESAMIENTO → todavía no se sabe; se descontará al sincronizar"
);
assert(
  debeIntentarPostEmision({ estado: "AUTORIZADO", recordId: undefined }) === false,
  "Sin recordId no hay dónde anotar la sincronización: no se intenta"
);
assert(
  debeIntentarPostEmision({ estado: "AUTORIZADO", recordId: "" }) === false,
  "Un recordId vacío cuenta como ausente"
);

// ═══════════════════════════════════════════════════════════════════════════
// 3. La regla no mira el origen
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── el origen no cambia la decisión ──");

const conOrigen    = { estado: "AUTORIZADO", recordId: "rec1", origen: { tipo: "orden", id: "recOrd" } };
const sinOrigen    = { estado: "AUTORIZADO", recordId: "rec1" };
assert(
  debeIntentarPostEmision(conOrigen) === debeIntentarPostEmision(sinOrigen),
  "Con origen y sin origen dan el mismo resultado — era justo lo que estaba mal"
);

// ─────────────────────────────────────────────────────────────────────────────

if (fallos > 0) {
  console.error(`\n❌ mostrador.descuentaStock.test.ts — ${fallos} aserción(es) fallida(s)`);
  process.exit(1);
}
console.log("\n✅ mostrador.descuentaStock.test.ts — todos los asserts pasaron");
