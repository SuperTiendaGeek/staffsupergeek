/**
 * Test — configuración de la pasarela y aislamiento del modo Prueba (punto 23 / 10D).
 * Ejecutar: npm test pagos-en-linea
 */
import { configPasarela, pasarelaDisponible } from "../config";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

function con(env: Record<string, string>, fn: () => void) {
  const antes = { ...process.env };
  for (const k of ["PAYPHONE_ACTIVO", "PAYPHONE_TOKEN", "PAYPHONE_STORE_ID", "PAYPHONE_AMBIENTE", "PAYPHONE_PEDIDOS_PRUEBA"]) delete process.env[k];
  Object.assign(process.env, env);
  try { fn(); } finally { process.env = antes; }
}

con({}, () => {
  const c = configPasarela("PayPhone");
  assert(!c.activa && c.ambiente === "Prueba", "sin variables: apagado y en Prueba");
  assert(!pasarelaDisponible(c, "OP-2026-000150"), "apagado: nadie ve el botón");
});

con({ PAYPHONE_ACTIVO: "1", PAYPHONE_TOKEN: "x", PAYPHONE_STORE_ID: "y" }, () => {
  const c = configPasarela("PayPhone");
  assert(c.activa && c.ambiente === "Prueba", "encendido sin ambiente: Prueba por defecto");
  assert(!pasarelaDisponible(c, "OP-2026-000150"), "Prueba sin lista: un cliente real no ve la cajita");
});

con({ PAYPHONE_ACTIVO: "1", PAYPHONE_TOKEN: "x", PAYPHONE_STORE_ID: "y", PAYPHONE_PEDIDOS_PRUEBA: "op-2026-000150, OP-2026-000151" }, () => {
  const c = configPasarela("PayPhone");
  assert(pasarelaDisponible(c, "OP-2026-000150") && pasarelaDisponible(c, "OP-2026-000151"), "Prueba: solo los pedidos de prueba (sin importar mayúsculas)");
  assert(!pasarelaDisponible(c, "OP-2026-000142"), "Prueba: otro pedido no ve el botón");
});

con({ PAYPHONE_ACTIVO: "1", PAYPHONE_TOKEN: "x", PAYPHONE_STORE_ID: "", PAYPHONE_AMBIENTE: "Producción" }, () => {
  assert(!configPasarela("PayPhone").activa, "sin StoreId: apagado aunque diga ACTIVO=1");
});

con({ PAYPHONE_ACTIVO: "1", PAYPHONE_TOKEN: "x", PAYPHONE_STORE_ID: "y", PAYPHONE_AMBIENTE: "Produccion" }, () => {
  const c = configPasarela("PayPhone");
  assert(c.ambiente === "Producción" && pasarelaDisponible(c, "OP-2026-000142"), "Producción: todos los pedidos");
});

assert(!configPasarela("DeUna").activa, "DeUna: todavía apagado");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo bien.");
