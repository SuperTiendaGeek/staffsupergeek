/**
 * Ajuste de datos del punto 4 (activos de la tienda).
 * Ejecutar: npx tsx lib/shipping-v2/__tests__/ajuste-punto4.test.ts
 */
import { planAjustePunto4, type RegistroAjuste4 } from "../ajuste-punto4";

let fallos = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { fallos++; console.error("✗", msg); } else console.log("✓", msg);
}
const base: RegistroAjuste4 = { id: "rec1", sku: "SSD-000013", tipoOperacion: "Uso local", estado: "Disponible", esUsoLocal: false, recibido: true, origenArticulo: "Ya está en la tienda" };

const ssd = planAjustePunto4(base);
assert(ssd?.fields["Tipo de operación"] === "Reajuste de inventario" && !("Es uso local" in (ssd?.fields ?? {})), "SSD a la venta: pasa a Reajuste y sigue siendo mercadería");
assert(!("Estado Item" in (ssd?.fields ?? {})), "SSD: sigue Disponible");

const cable = planAjustePunto4({ ...base, sku: "OTR-000185", estado: "Uso local", recibido: false });
assert(cable?.fields["Es uso local"] === true && cable?.fields["Recibido"] === true && cable?.fields["Disponible para venta"] === false, "OTR-000185: activo, recibido, no se vende");
assert(cable?.fields["Tipo de operación"] === "Reajuste de inventario", "OTR-000185: tipo Reajuste");

const etiquetaSola = planAjustePunto4({ ...base, tipoOperacion: "Compra a proveedor", estado: "Uso local" });
assert(etiquetaSola?.fields["Es uso local"] === true, "Etiqueta Uso local sin casilla: se marca la casilla");

const casillaDisponible = planAjustePunto4({ ...base, tipoOperacion: "Compra a proveedor", esUsoLocal: true });
assert(casillaDisponible?.fields["Estado Item"] === "Uso local", "Casilla marcada con etiqueta Disponible: pasa a Uso local");

assert(planAjustePunto4({ ...base, tipoOperacion: "Compra a proveedor" }) === null, "Mercadería normal: no se toca");
assert(planAjustePunto4({ ...base, tipoOperacion: "Compra a proveedor", esUsoLocal: true, estado: "Uso local" }) === null, "Activo coherente: no se toca (idempotente)");

if (fallos > 0) { console.error(`\n${fallos} assert(s) fallaron.`); process.exit(1); }
console.log("\n✅ ajuste-punto4.test.ts — todos los asserts pasaron");
