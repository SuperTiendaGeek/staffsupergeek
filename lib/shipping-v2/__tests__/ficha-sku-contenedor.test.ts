/**
 * Punto 18b (25-oct-2026): la ficha como contenedor del SKU.
 * Ejecutar: npm test ficha-sku-contenedor
 *
 * Protege lo que el dueño decidió:
 * 1. Las existencias del SKU suman solo lo que sigue en el inventario.
 * 2. Nombre, descripción, categoría, marca y modelo se aplican a las demás
 *    unidades del SKU que siguen en inventario (nunca a lo vendido o dado de baja).
 * 3. Las casillas viejas de publicación se leen a nivel de SKU: no se repiten
 *    ni desaparecen al cambiar de unidad, y nunca borran lo que ya había.
 */

import {
  CLAVES_CAMPO_PRODUCTO,
  casillasDelSku,
  existenciasDelSku,
  registrosParaPropagar,
  sigueEnInventario,
} from "../ficha-articulo";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) console.log("✓", msg);
  else {
    fallos += 1;
    console.error("✗", msg);
  }
}

// 1. Existencias
{
  const registros = [
    { estado: "Disponible", cantidad: 1, cantidadReservada: 0 },
    { estado: "Disponible", cantidad: 1, cantidadReservada: 1 },
    { estado: "En inspección", cantidad: 1 },
    { estado: "Vendido", cantidad: 1 },
    { estado: "Dado de baja", cantidad: 1 },
    { estado: "Usado en reparación", cantidad: 1 },
    { estado: "Disponible", cantidad: null },
  ];
  const e = existenciasDelSku(registros);
  assert(e.registros === 7, "Cuenta todos los registros del SKU");
  assert(e.enInventario === 3, "En inventario suma solo lo que no salió");
  assert(e.salieron === 3, "Vendido, dado de baja y usado en reparación ya salieron (con o sin tilde)");
  assert(e.reservadas === 1, "Reservadas se suman");
  assert(e.porEstado[0]?.estado === "Disponible" && e.porEstado[0]?.cantidad === 2, "Por estado, de mayor a menor");
  assert(!e.porEstado.some((p) => p.cantidad === 0), "No se listan estados con 0");
  const lote = existenciasDelSku([{ estado: "Disponible", cantidad: 12 }]);
  assert(lote.enInventario === 12 && lote.registros === 1, "Un lote cuenta su cantidad completa");
}

// 2. Propagación de datos del producto
{
  assert(CLAVES_CAMPO_PRODUCTO.join(",") === "nombre,descripcion,categoria,marca,modelo", "Datos del producto: nombre, descripción, categoría, marca, modelo");
  assert(!(CLAVES_CAMPO_PRODUCTO as readonly string[]).includes("precioVenta"), "El precio no va con los datos del producto (tiene su propia regla)");
  const registros = [
    { id: "recA", estado: "Disponible" },
    { id: "recB", estado: "Disponible" },
    { id: "recC", estado: "Vendido" },
    { id: "recD", estado: "Devuelto a proveedor" },
    { id: "recE", estado: "Reservado" },
  ];
  const ids = registrosParaPropagar(registros, "recA").map((r) => r.id);
  assert(ids.join(",") === "recB,recE", "Se aplica a las otras unidades en inventario, no al origen ni a lo que salió");
  assert(registrosParaPropagar([{ id: "recA", estado: "Disponible" }], "recA").length === 0, "Un SKU de un solo registro no propaga nada");
  assert(sigueEnInventario({ estado: "" }) && sigueEnInventario({ estado: null }), "Sin estado se considera en inventario");
}

// 3. Casillas de publicación a nivel de SKU
{
  const c = casillasDelSku([
    { fechaRegistro: "2026-01-01", casillasPublicacion: { Marketplace: { por: "Ana", fecha: "2026-03-01" } } },
    { fechaRegistro: "2026-02-01", casillasPublicacion: { Marketplace: { por: "Luis", fecha: "2026-02-10" }, Shopify: {} } },
    { fechaRegistro: "2026-02-05" },
  ]);
  assert(c.marketplacePublicado === true && c.marketplacePublicadoPor === "Luis", "Marketplace: la primera vez que se marcó en el SKU");
  assert(c.shopifyPublicado === true && !("shopifyPublicadoPor" in c), "Sin quién ni fecha: se marca pero no se inventa ni se borra nada");
  assert(!("mercadoLibrePublicado" in c) && !("gruposFacebookPublicado" in c), "Canales sin casilla no aparecen");
  assert(Object.keys(casillasDelSku([])).length === 0, "Sin hermanas, nada cambia");
}

if (fallos > 0) {
  console.error(`\n${fallos} assert(s) fallaron.`);
  process.exit(1);
}
console.log("\n✅ ficha-sku-contenedor.test.ts — todos los asserts pasaron");
