/**
 * Test — camposLineaDesdeProducto() (lib/facturacion/lineaDesdeProductoCatalogo.ts)
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/productoDigital.lineaDesdeProducto.test.ts
 *
 * Puro, sin red — nada de Airtable, nada de componente (este proyecto no
 * tiene arnés de pruebas de React; ver el comentario del propio módulo).
 * Cubre:
 *   (c) elegir un producto digital del buscador produce una línea
 *       tipo="productoDigital" con productoDigitalId y SIN shippingItemId
 *       — y, en espejo, un producto de Shipping Items produce
 *       tipo="producto" con shippingItemId y SIN productoDigitalId.
 *
 * Lanza en la primera falla y sale con código distinto de 0.
 */

import { camposLineaDesdeProducto } from "../lineaDesdeProductoCatalogo";
import type { ProductoCatalogo } from "../airtable/productosShippingItems";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

const productoDigital: ProductoCatalogo = {
  id: "recPD1",
  sku: "",
  nombre: "Windows 11 Pro",
  descripcion: "",
  precioVenta: 25,
  unidad: "UNIDAD",
  cantidadDisponible: 1,
  fuente: "productoDigital",
};

const shippingItem: ProductoCatalogo = {
  id: "recITEM1",
  sku: "IT-001",
  nombre: "Mouse inalámbrico",
  descripcion: "Mouse óptico",
  precioVenta: 12,
  unidad: "UNIDAD",
  cantidadDisponible: 4,
  fuente: "shippingItem",
};

{
  const linea = camposLineaDesdeProducto(productoDigital);
  assert(linea.tipo === "productoDigital", "(c) fuente 'productoDigital' → tipo de línea 'productoDigital'");
  assert(linea.productoDigitalId === "recPD1", "(c) productoDigitalId presente y es el id del producto elegido");
  assert(linea.shippingItemId === undefined, "(c) SIN shippingItemId — un producto digital no es un Shipping Item");
  assert(linea.cantidad === 1, "(c) cantidad siempre 1 para un producto digital");
  assert(linea.descripcion === "Windows 11 Pro", "(c) descripción = nombre limpio del producto");
  assert(linea.precioUnitario === 25, "(c) precioUnitario = precioVenta del producto elegido");
  assert(linea.codigoPrincipal === "recPD1", "(c) codigoPrincipal usa el id (Productos Digitales no tiene SKU)");
  assert(linea.stockDisponible === undefined, "(c) sin stockDisponible — un producto digital no tiene cantidad que validar");
}

{
  // Espejo: una línea de Shipping Items sigue exactamente como antes de
  // este trabajo — nada cambió para esa fuente.
  const linea = camposLineaDesdeProducto(shippingItem);
  assert(linea.tipo === "producto", "Espejo: fuente 'shippingItem' → tipo de línea 'producto'");
  assert(linea.shippingItemId === "recITEM1", "Espejo: shippingItemId presente");
  assert(linea.productoDigitalId === undefined, "Espejo: SIN productoDigitalId");
  assert(linea.codigoPrincipal === "IT-001", "Espejo: codigoPrincipal = SKU cuando existe");
  assert(linea.stockDisponible === 4, "Espejo: stockDisponible = cantidadDisponible del producto");
  assert(linea.unidadMedida === "UNIDAD", "Espejo: unidadMedida viene del producto, no de un default fijo");
}

if (fallos > 0) {
  console.error(`\n❌ productoDigital.lineaDesdeProducto.test.ts — ${fallos} aserción(es) fallida(s)`);
  process.exit(1);
}
console.log("\n✅ productoDigital.lineaDesdeProducto.test.ts — todos los asserts pasaron");
