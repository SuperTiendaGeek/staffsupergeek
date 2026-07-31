import {
  calculateShippingV2PackingProviderCostSummary,
  calculateShippingV2PackingProviderItemSubtotal,
  formatShippingV2PackingItemsUnitsSummary,
  withShippingV2PackingProviderItemSubtotal,
} from "../packing-calculations";

let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

function assertMoney(actual: number, expected: number, msg: string) {
  assert(actual === expected, `${msg} (${actual} === ${expected})`);
}

const item50 = { id: "recITEM50", sku: "ITEM-50", cantidad: 1, costoProveedor: 50 };
const acc39 = { id: "recACC39", sku: "ACC-000039", cantidad: 2, costoProveedor: 10 };

assertMoney(
  calculateShippingV2PackingProviderItemSubtotal(item50),
  50,
  "Cantidad 1 x costo proveedor 50 = 50"
);
assertMoney(
  calculateShippingV2PackingProviderItemSubtotal(acc39),
  20,
  "Cantidad 2 x costo proveedor 10 = 20"
);

const resumenAceptacion = calculateShippingV2PackingProviderCostSummary([item50, acc39]);
assertMoney(resumenAceptacion.costoTotalProveedorItems, 70, "Dos items juntos suman 70");
assert(resumenAceptacion.referenciasIncluidas === 2, "Referencias incluidas cuentan registros");
assert(resumenAceptacion.unidadesTotales === 3, "Unidades totales suman cantidades físicas");
assert(
  formatShippingV2PackingItemsUnitsSummary(calculateShippingV2PackingProviderCostSummary([{ sku: "UNO", cantidad: 1, costoProveedor: 10 }])) === "1 ítem · 1 unidad",
  "Resumen visual: 1 registro con Cantidad 1"
);
assert(
  formatShippingV2PackingItemsUnitsSummary(calculateShippingV2PackingProviderCostSummary([{ sku: "DOS", cantidad: 2, costoProveedor: 10 }])) === "1 ítem · 2 unidades",
  "Resumen visual: 1 registro con Cantidad 2"
);
assert(
  formatShippingV2PackingItemsUnitsSummary(resumenAceptacion) === "2 ítems · 3 unidades",
  "Resumen visual: 2 registros con cantidades 1 y 2"
);

const resumenTresItems = calculateShippingV2PackingProviderCostSummary([
  { sku: "QTY-2", cantidad: 2, costoProveedor: 5 },
  { sku: "QTY-3", cantidad: 3, costoProveedor: 7.5 },
  { sku: "QTY-1", cantidad: 1, costoProveedor: 2.25 },
]);
assertMoney(resumenTresItems.costoTotalProveedorItems, 34.75, "Tres items con cantidades distintas suman correctamente");

assertMoney(
  calculateShippingV2PackingProviderItemSubtotal({ sku: "SIN-COSTO", cantidad: 4, costoProveedor: null }),
  0,
  "Costo vacío genera subtotal 0"
);
assertMoney(
  calculateShippingV2PackingProviderItemSubtotal({ sku: "COSTO-CERO", cantidad: 4, costoProveedor: 0 }),
  0,
  "Costo 0 genera subtotal 0"
);

const regalo = { sku: "REGALO", cantidad: 4, costoProveedor: null, esRegalo: true };
const regaloConSubtotal = withShippingV2PackingProviderItemSubtotal(regalo);
assertMoney(regaloConSubtotal.subtotalProveedorPacking, 0, "Regalo no suma subtotal proveedor");
assert(regaloConSubtotal.costoProveedor === null, "Regalo no recibe costo artificial");

const acc39ConSubtotal = withShippingV2PackingProviderItemSubtotal(acc39);
assertMoney(acc39ConSubtotal.subtotalProveedorPacking, 20, "La UI recibe subtotal proveedor correcto por item");

const sumaUnitariaPorRegistro = (item50.costoProveedor ?? 0) + (acc39.costoProveedor ?? 0);
assert(sumaUnitariaPorRegistro === 60, "El escenario evidencia que sumar costo unitario por registro daría 60");
assertMoney(
  resumenAceptacion.costoTotalProveedorItems,
  70,
  "El total del packing no usa costo unitario una sola vez por registro"
);

const resumenConCostosAsignados = calculateShippingV2PackingProviderCostSummary([
  { ...item50, costoFleteAsignado: 999, costoArancelAsignado: 999, otrosCostosAsignados: 999 },
  { ...acc39, costoFleteAsignado: 999, costoArancelAsignado: 999, otrosCostosAsignados: 999 },
]);
assertMoney(
  resumenConCostosAsignados.costoTotalProveedorItems,
  70,
  "No se modifica la distribución de flete/arancel/otros costos en esta fase"
);

if (fallos > 0) {
  console.error(`Fallaron ${fallos} comprobaciones.`);
  process.exit(1);
}

console.log("Contrato de costos proveedor en Packings V2 multiunidad: OK");
