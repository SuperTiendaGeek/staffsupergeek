import fs from "node:fs";
import path from "node:path";
import { mensajePrecioShippingItemInvalido } from "../reglas/preciosShippingItems";

let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

assert(
  mensajePrecioShippingItemInvalido([{ descripcion: "Servicio manual", precioUnitario: 0 }]) === null,
  "La línea manual puede tener precio 0 si se carga explícitamente"
);

assert(
  mensajePrecioShippingItemInvalido([{ descripcion: "Laptop", shippingItemId: "recITEM", precioUnitario: 0 }])?.includes("mayor a 0") === true,
  "Una línea de Shipping Item con precio 0 se rechaza"
);

assert(
  mensajePrecioShippingItemInvalido([{ descripcion: "Laptop", shippingItemId: "recITEM", precioUnitario: 12 }]) === null,
  "Una línea de Shipping Item con precio final positivo es válida"
);

const rutaEmitir = fs.readFileSync(path.join(process.cwd(), "app/api/facturacion/emitir/route.ts"), "utf8");
assert(
  rutaEmitir.includes("mensajePrecioShippingItemInvalido"),
  "La ruta server-side de Facturación llama la regla de precio Shipping Item"
);

const rutaRecibos = fs.readFileSync(path.join(process.cwd(), "app/api/facturacion/recibos/route.ts"), "utf8");
assert(
  rutaRecibos.includes("mensajePrecioShippingItemInvalido"),
  "La ruta server-side de Recibos llama la regla de precio Shipping Item"
);

if (fallos > 0) {
  console.error(`Fallaron ${fallos} comprobaciones.`);
  process.exit(1);
}

console.log("Precios de líneas Shipping Items: OK");
