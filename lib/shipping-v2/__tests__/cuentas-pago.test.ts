/**
 * Test — catálogo único de cuentas de pago a proveedores (Fase 2B, 2-nov-2026).
 * Ejecutar: npm test cuentas-pago
 */
import fs from "fs";
import { CUENTAS_PAGO_VIGENTES, cuentaPago, etiquetaCuentaPago, valorCuentaPagoVigente } from "../cuentas-pago";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

assert(cuentaPago("Transferencia SGINGRESOS")?.cuentaFinanzas === "SGINGRESOS", "transferencia desde SGINGRESOS ahora se puede elegir");
assert(cuentaPago("Tarjeta C. Produbanco")?.cuentaFinanzas === "PRODUBANCO MASTERCARD", "la Mastercard de Produbanco es PRODUBANCO MASTERCARD (antes quedaba sin cuenta)");
assert(cuentaPago("Tarjeta D. Supe Geek")?.cuentaFinanzas === "SGINGRESOS", "la débito Visa SUPER GEEK sale de SGINGRESOS (con o sin espacio final)");
assert(valorCuentaPagoVigente("Tarjeta D. Supe Geek") === "Tarjeta D. Supe Geek ", "se guarda el valor exacto de la opción vieja (con su espacio)");
assert(cuentaPago("Caja")?.cuentaFinanzas === "Caja Registradora", "Caja → Caja Registradora");
assert(cuentaPago("Tarjeta C. Pichincha")?.cuentaFinanzas === null, "Tarjeta C. Pichincha: pendiente de confirmar (sin cuenta)");
assert(valorCuentaPagoVigente("Banco Pichincha") === null, "la opción vieja del select de Finanzas no se ofrece");
assert(valorCuentaPagoVigente("No aplica") === null && valorCuentaPagoVigente("") === null, "'No aplica' o vacío: inválida");
assert(etiquetaCuentaPago("Tarjeta C. Pacificard") === "Crédito Pacificard", "etiqueta legible");
assert(new Set(CUENTAS_PAGO_VIGENTES.map((c) => c.valor.trim())).size === CUENTAS_PAGO_VIGENTES.length, "sin opciones repetidas");

const ship = fs.readFileSync("lib/shipping-v2/airtable.ts", "utf8");
assert(ship.includes("valorCuentaPagoVigente(cuentaOrigen)"), "el servidor valida la cuenta contra el catálogo");
assert(/const delCatalogo = cuentaPago\(cuentaOrigenTexto\)\?\.cuentaFinanzas;/.test(ship), "el egreso en Finanzas sale de la cuenta del catálogo");
for (const f of ["app/shipping-v2/items/nuevo/ShippingV2NewItemForm.tsx", "app/shipping-v2/pagos/ordenes/[id]/OrdenCompraClient.tsx", "app/shipping-v2/pagos/ShippingV2PagosClient.tsx", "components/shipping-v2/CostosTraerlo.tsx"]) {
  const s = fs.readFileSync(f, "utf8");
  assert(s.includes("CUENTAS_PAGO_VIGENTES") && !s.includes("SHIPPING_V2_PAYMENT_SELECT_OPTIONS.cuentaOrigen"), `${f.split("/").pop()} ofrece las cuentas del catálogo`);
}

if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo OK");
