/**
 * Ajuste de datos del punto 9b (12-oct-2026).
 * Ejecutar: npx tsx lib/shipping-v2/__tests__/ajuste-punto9b.test.ts
 */
import { planAjustePunto9b, unidadesCompradasEstimadas, type RegistroAjuste9b } from "../ajuste-punto9b";

let fallos = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { fallos++; console.error("✗", msg); } else console.log("✓", msg);
}

const base: RegistroAjuste9b = {
  id: "rec1", sku: "LAP-000091", estado: "En tránsito", tipoOperacion: "Compra a proveedor", requierePago: true, esRegalo: false,
  recibido: false, costoProveedor: 110, cantidad: 1, unidadesEnPacking: null, unidadesDadasDeBaja: null, unidadesCompradas: null, pagosVivos: 0,
};

const llavero = planAjustePunto9b({ ...base, sku: "ACC-000026", costoProveedor: 0, cantidad: 107, estado: "Disponible", recibido: true });
assert(llavero?.fields["Es regalo"] === true && llavero.fields["Requiere pago"] === false && llavero.fields["Tipo de operación"] === "Regalo de proveedor", "Llaveros de Roberto con costo $0 → regalo");
assert(!("Unidades compradas" in (llavero?.fields ?? {})), "Un regalo no necesita unidades compradas");
assert(planAjustePunto9b({ ...base, sku: "ACC-000026", costoProveedor: 5 })?.fields["Es regalo"] === undefined, "Si tuviera costo no se convierte (no se adivina)");

assert(planAjustePunto9b(base)?.fields["Unidades compradas"] === 1, "Compra de 1 unidad → compradas 1");
assert(planAjustePunto9b({ ...base, cantidad: 2, unidadesEnPacking: 3 })?.fields["Unidades compradas"] === 3, "Vendió 1 de 3 que viajaron en caja → 3");
assert(planAjustePunto9b({ ...base, cantidad: 4, unidadesDadasDeBaja: 1 })?.fields["Unidades compradas"] === 5, "Cantidad + dadas de baja");
const vendido = planAjustePunto9b({ ...base, cantidad: 0, estado: "Vendido" });
assert(vendido?.fields["Unidades compradas"] === 1 && vendido.supuesto === true, "Vendido sin caja → 1 (supuesto, se informa)");
assert(planAjustePunto9b({ ...base, unidadesCompradas: 2 }) === null, "Ya tiene unidades compradas → sin cambios");
assert(unidadesCompradasEstimadas({ cantidad: 0, unidadesEnPacking: 2, unidadesDadasDeBaja: 0 }).unidades === 2, "Vendido que viajó en caja → lo que viajó");

assert(planAjustePunto9b({ ...base, sku: "REP-000103", estado: "Pendiente de pago", unidadesCompradas: 1 })?.fields["Estado Item"] === "Registrado", "Pendiente de pago sin llegar → Registrado");
assert(planAjustePunto9b({ ...base, estado: "Pagado", recibido: true, unidadesCompradas: 1 }) === null, "'Pagado' que ya llegó: no se toca aquí");
const reajuste = planAjustePunto9b({ ...base, sku: "LAP-000079", tipoOperacion: "Reajuste de inventario", estado: "Vendido", cantidad: 0 });
assert(reajuste?.fields["Requiere pago"] === false && !("Unidades compradas" in reajuste.fields), "Reajuste: deja de requerir pago");
assert(planAjustePunto9b({ ...base, sku: "LAP-000110", estado: "Pendiente de pago" }) === null, "Artículo de prueba: no se toca");
assert(planAjustePunto9b({ ...base, requierePago: false, tipoOperacion: "Reajuste de inventario" }) === null, "Lo que no se paga no recibe unidades compradas");

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1); }
console.log("\nTodas las pruebas pasaron.");
