/**
 * F-30 — el formulario avisa lo mismo que exige el servidor.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/shipping-v2/__tests__/item-requisitos.test.ts
 *
 * El hueco concreto: "Este flujo requiere proveedor de compra" se mostraba en
 * pantalla pero el envío no lo bloqueaba, así que el item viajaba al servidor
 * solo para volver con el mismo error.
 */

import { itemListoParaGuardar, requisitosFaltantesItem } from "../item-requisitos";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const compraValida = {
  categoria: "SSD",
  cantidad: 2,
  esCompraProveedor: true,
  requierePago: true,
  proveedorId: "recPROV1",
  costoProveedor: 45,
};

function campos(input: Parameters<typeof requisitosFaltantesItem>[0]): string[] {
  return requisitosFaltantesItem(input).map((r) => r.campo);
}

function main(): void {
  // ── Camino feliz ───────────────────────────────────────────────────────────
  assert(itemListoParaGuardar(compraValida), "Una compra completa se puede guardar");
  assert(requisitosFaltantesItem(compraValida).length === 0, "…y no reporta nada faltante");

  // ── El hueco que motivó el arreglo ─────────────────────────────────────────
  const sinProveedor = { ...compraValida, proveedorId: "" };
  assert(campos(sinProveedor).includes("proveedorId"), "F-30: sin proveedor en una compra, el envío se bloquea");
  assert(
    requisitosFaltantesItem(sinProveedor)[0].mensaje === "Proveedor de compra es obligatorio para compras a proveedor.",
    "…con el MISMO texto que devolvería el servidor"
  );

  // La otra vía: no es compra, pero el flujo implica pagar.
  const pagoSinProveedor = { categoria: "RAM", cantidad: 1, requierePago: true, proveedorId: null };
  assert(
    requisitosFaltantesItem(pagoSinProveedor).some((r) => r.mensaje.includes("cuando el item requiere pago")),
    "Sin ser compra, si el flujo requiere pago también exige proveedor (con su propio mensaje)"
  );

  // Sin pago ni compra, el proveedor NO es obligatorio.
  const sinPago = { categoria: "RAM", cantidad: 1, requierePago: false, proveedorId: "" };
  assert(!campos(sinPago).includes("proveedorId"), "Si el flujo no requiere pago, el proveedor no es obligatorio");

  // ── Se informa TODO lo que falta, no solo lo primero ───────────────────────
  const vacioTotal = { categoria: "", cantidad: null, esCompraProveedor: true, proveedorId: "", costoProveedor: null };
  const faltantes = campos(vacioTotal);
  assert(faltantes.length === 4, `Se reportan los 4 problemas a la vez, no uno por envío (vino ${faltantes.length})`);
  assert(
    ["categoria", "cantidad", "proveedorId", "costoProveedor"].every((c) => faltantes.includes(c)),
    "…y son exactamente los cuatro campos esperados"
  );

  // ── Cantidad ───────────────────────────────────────────────────────────────
  assert(campos({ ...compraValida, cantidad: 0 }).includes("cantidad"), "Cantidad 0 no se acepta");
  assert(campos({ ...compraValida, cantidad: -1 }).includes("cantidad"), "Cantidad negativa no se acepta");
  assert(campos({ ...compraValida, cantidad: 2.5 }).includes("cantidad"), "Cantidad decimal no se acepta: no hay media unidad física");

  // ── Regalo de proveedor ────────────────────────────────────────────────────
  const regaloOk = { categoria: "Cable", cantidad: 3, esRegaloProveedor: true, costoProveedor: 0 };
  assert(itemListoParaGuardar(regaloOk), "Un regalo con costo 0 es válido");
  const regaloSinCosto = { categoria: "Cable", cantidad: 3, esRegaloProveedor: true, costoProveedor: null };
  assert(itemListoParaGuardar(regaloSinCosto), "Un regalo con el costo vacío también es válido");
  const regaloConCosto = { ...regaloOk, costoProveedor: 12 };
  assert(campos(regaloConCosto).includes("costoProveedor"), "Un regalo con costo mayor a 0 es una contradicción y se bloquea");

  // ── Precio venta final ─────────────────────────────────────────────────────
  assert(itemListoParaGuardar({ ...compraValida, precioVentaFinal: null }),
    "Precio final vacío es válido: significa 'sin precio asignado' y el item no entra a facturación");
  assert(itemListoParaGuardar({ ...compraValida, precioVentaFinal: 0 }),
    "Precio final 0 también es válido (sin precio asignado)");
  assert(campos({ ...compraValida, precioVentaFinal: -5 }).includes("precioVentaFinal"),
    "Precio final negativo se bloquea");

  if (fallos > 0) { console.error(`\n${fallos} assert(s) fallaron.`); process.exit(1); }
  console.log("\n✅ item-requisitos.test.ts — todos los asserts pasaron");
}

main();
