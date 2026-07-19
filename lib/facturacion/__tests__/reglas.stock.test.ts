/**
 * Test — calcularFaltantes() (Fase 17.b, lib/facturacion/reglas/stock.ts)
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/reglas.stock.test.ts
 *
 * Cubre la parte pura del pre-chequeo de stock (sin red): agrupación de
 * líneas por item, comparación contra disponible, fail-closed para items
 * desconocidos, y el formato del mensaje de alerta.
 *
 * Lanza en la primera falla y sale con código distinto de 0.
 */

import { calcularFaltantes, mensajeFaltantes } from "../reglas/stock";
import type { DetalleFactura } from "../types/factura";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

function linea(shippingItemId: string | undefined, cantidad: number, descripcion = "Producto"): DetalleFactura {
  return {
    descripcion,
    cantidad,
    precioUnitario: 10,
    descuento: 0,
    precioTotalSinImpuesto: 10 * cantidad,
    impuestos: [{ codigo: "2", codigoPorcentaje: "4", tarifa: 15, baseImponible: 10 * cantidad, valor: 1.5 * cantidad }],
    ...(shippingItemId ? { tipo: "producto" as const, shippingItemId } : {}),
  };
}

// ─── 1. Stock suficiente: sin faltantes ─────────────────────────────────────
{
  const faltantes = calcularFaltantes(
    [linea("recA", 2), linea("recB", 1)],
    new Map([["recA", 5], ["recB", 1]])
  );
  assert(faltantes.length === 0, "Stock suficiente: cero faltantes");
}

// ─── 2. Stock insuficiente: reporta solicitado vs disponible ────────────────
{
  const faltantes = calcularFaltantes(
    [linea("recA", 3, "RAM Hynix")],
    new Map([["recA", 2]])
  );
  assert(faltantes.length === 1, "Insuficiente: un faltante");
  assert(faltantes[0].solicitado === 3 && faltantes[0].disponible === 2, "Insuficiente: números correctos");
}

// ─── 3. Varias líneas del mismo item SE SUMAN ───────────────────────────────
{
  const faltantes = calcularFaltantes(
    [linea("recA", 2), linea("recA", 2)],
    new Map([["recA", 3]])
  );
  assert(faltantes.length === 1, "Suma por item: 2+2=4 > 3 debe faltar");
  assert(faltantes[0].solicitado === 4, "Suma por item: solicitado agregado es 4");
}

// ─── 4. Item desconocido (no está en Airtable): fail-closed, disponible 0 ───
{
  const faltantes = calcularFaltantes([linea("recFANTASMA", 1)], new Map());
  assert(faltantes.length === 1 && faltantes[0].disponible === 0, "Item desconocido: fail-closed con disponible 0");
}

// ─── 5. Líneas sin shippingItemId (manuales/servicios) no se verifican ──────
{
  const faltantes = calcularFaltantes(
    [linea(undefined, 99, "Línea manual sin inventario")],
    new Map()
  );
  assert(faltantes.length === 0, "Línea manual: nunca genera faltante");
}

// ─── 6. Mensaje: distingue "sin stock" de "stock insuficiente" ──────────────
{
  const msg = mensajeFaltantes([
    { shippingItemId: "recA", descripcion: "Item agotado", solicitado: 1, disponible: 0 },
    { shippingItemId: "recB", descripcion: "Item corto", solicitado: 3, disponible: 2 },
  ]);
  assert(msg.includes("no tiene stock disponible"), "Mensaje: caso disponible 0 usa 'sin stock disponible'");
  assert(msg.includes("solicitado: 3, disponible: 2"), "Mensaje: caso parcial incluye los números");
}

if (fallos > 0) {
  console.error(`\n❌ reglas.stock.test.ts — ${fallos} aserción(es) fallida(s)`);
  process.exit(1);
}
console.log("\n✅ reglas.stock.test.ts — todos los asserts pasaron");
