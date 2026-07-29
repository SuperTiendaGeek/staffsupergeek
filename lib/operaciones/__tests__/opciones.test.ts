/**
 * Validación de una opción de cotización.
 * Ejecutar: npx tsx lib/operaciones/__tests__/opciones.test.ts
 *
 * No se validaba nada al crear una opción. En producción quedaron dos casos:
 * una llamada literalmente "NO ELEGIBLE (ELIMINAR)" con precio $520, y otra
 * ("Listado de items en el pdf adjunto") sin precio.
 *
 * La segunda importa más de lo que parece: desde que el "Total Cotizado" de la
 * operación se deriva de la opción elegida, una opción sin precio deja la
 * operación en total 0 y el tablero dice "Sin cotizar" aunque ya se le haya
 * pasado la propuesta al cliente.
 */

import { validarOpcion } from "../opciones";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

const ok = (input: Parameters<typeof validarOpcion>[0], caso: string) =>
  assert(validarOpcion(input) === null, `${caso} → se acepta`);

const rechaza = (input: Parameters<typeof validarOpcion>[0], fragmento: string, caso: string) => {
  const error = validarOpcion(input);
  assert(
    error !== null && error.toLowerCase().includes(fragmento.toLowerCase()),
    `${caso} → se rechaza con "${fragmento}" (vino: ${error ?? "aceptada"})`
  );
};

// ── Se acepta ───────────────────────────────────────────────────────────────
ok({ productoDescripcion: "BATERIA HP HT03XL INTERNA ORIGINAL", precioVentaCliente: 70, costoProveedor: 44 }, "Opción completa");
ok({ productoDescripcion: "Pantalla IPS FHD", precioVentaCliente: 90 }, "Sin costo de proveedor (aún no se sabe)");
ok({ productoDescripcion: "Cable", precioVentaCliente: 0.5 }, "Precio pequeño pero real");
ok({ productoDescripcion: "Repuesto de regalo", precioVentaCliente: 10, costoProveedor: 0 }, "Costo 0 es válido (regalo del proveedor)");
ok({ productoDescripcion: "Venta a pérdida deliberada", precioVentaCliente: 50, costoProveedor: 80 }, "Vender por debajo del costo no se bloquea: es decisión del negocio");

// ── Descripción ─────────────────────────────────────────────────────────────
rechaza({ productoDescripcion: "", precioVentaCliente: 100 }, "describe el producto", "Descripción vacía");
rechaza({ productoDescripcion: "   ", precioVentaCliente: 100 }, "describe el producto", "Descripción con solo espacios");
rechaza({ productoDescripcion: null, precioVentaCliente: 100 }, "describe el producto", "Descripción nula");
rechaza({ productoDescripcion: "x".repeat(501), precioVentaCliente: 100 }, "500 caracteres", "Descripción larguísima");

// ── Precio de venta ─────────────────────────────────────────────────────────
rechaza(
  { productoDescripcion: "Listado de items en el pdf adjunto" },
  "falta el precio",
  "Caso real OP-2026-000006: opción sin precio"
);
rechaza({ productoDescripcion: "Algo", precioVentaCliente: null }, "falta el precio", "Precio nulo");
rechaza({ productoDescripcion: "Algo", precioVentaCliente: 0 }, "mayor a 0", "Precio cero");
rechaza({ productoDescripcion: "Algo", precioVentaCliente: -50 }, "mayor a 0", "Precio negativo");
rechaza({ productoDescripcion: "Algo", precioVentaCliente: Number.NaN }, "falta el precio", "Precio no numérico");
rechaza({ productoDescripcion: "Algo", precioVentaCliente: Number.POSITIVE_INFINITY }, "falta el precio", "Precio infinito");

// ── Costo del proveedor ─────────────────────────────────────────────────────
rechaza({ productoDescripcion: "Algo", precioVentaCliente: 100, costoProveedor: -1 }, "no puede ser negativo", "Costo negativo");
rechaza({ productoDescripcion: "Algo", precioVentaCliente: 100, costoProveedor: Number.NaN }, "no es un número", "Costo no numérico");

if (fallos > 0) {
  console.error(`\n${fallos} assert(s) fallaron.`);
  process.exit(1);
}
console.log("\n✅ opciones.test.ts — todos los asserts pasaron");
