import fs from "node:fs";
import path from "node:path";
import {
  buildShippingItemsProductFilterFormula,
  mapShippingItemProductRecord,
} from "../airtable/productosShippingItems";

let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

const formula = buildShippingItemsProductFilterFormula("laptop");
assert(formula.includes("{Precio venta final}>0"), "El catálogo facturable exige Precio venta final > 0");
assert(!formula.includes("Precio venta sugerido"), "El catálogo facturable no usa Precio venta sugerido en el filtro");
assert(formula.includes("{Recibido}"), "Punto 1: el mostrador solo ofrece artículos que ya llegaron (Recibido)");
assert(
  formula.includes("OR(NOT({Requiere inspección}),{Revisado física/técnicamente})"),
  "Punto 1: si requiere inspección, solo aparece con la ficha firmada"
);
const formulaReserva = buildShippingItemsProductFilterFormula("laptop", { incluirEnCamino: true });
assert(!formulaReserva.includes("{Recibido}"), "Reserva/Proforma: también ofrecen lo que viene en camino");
assert(formulaReserva.includes("{Disponible para venta}"), "Reserva/Proforma: siguen exigiendo que se pueda reservar");

const sinPrecioFinal = mapShippingItemProductRecord({
  id: "recSINFINAL",
  fields: {
    SKU: "IT-0",
    "Nombre del item": "Item solo sugerido",
    "Precio venta sugerido": 99,
    Cantidad: 1,
    Unidad: "Unidad",
  },
});
assert(sinPrecioFinal === null, "Shipping Item sin precio final no aparece como producto facturable");

const precioFinalCero = mapShippingItemProductRecord({
  id: "recFINALCERO",
  fields: {
    SKU: "IT-0B",
    "Nombre del item": "Item con precio final cero",
    "Precio venta final": 0,
    Cantidad: 1,
    Unidad: "Unidad",
  },
});
assert(precioFinalCero === null, "Shipping Item con Precio venta final 0 no aparece como producto facturable");

const conPrecioFinal = mapShippingItemProductRecord({
  id: "recFINAL",
  fields: {
    SKU: "IT-1",
    "Nombre del item": "Item con precio final",
    "Precio venta final": 12,
    "Precio venta sugerido": 99,
    Cantidad: 4,
    Unidad: "Unidad",
  },
});
assert(conPrecioFinal?.precioVenta === 12, "El precio del catálogo sale del Precio venta final");
assert(conPrecioFinal?.cantidadDisponible === 4, "El catálogo conserva la cantidad disponible");
assert(conPrecioFinal !== null, "Al asignar Precio venta final positivo, el item aparece en catálogo facturable");

const rutaProductos = fs.readFileSync(path.join(process.cwd(), "app/api/facturacion/productos/route.ts"), "utf8");
assert(
  rutaProductos.includes("buscarProductos"),
  "La ruta de productos de Facturación usa el catálogo filtrado de Shipping Items"
);

if (fallos > 0) {
  console.error(`Fallaron ${fallos} comprobaciones.`);
  process.exit(1);
}

console.log("Catálogo facturable de Shipping Items: OK");
