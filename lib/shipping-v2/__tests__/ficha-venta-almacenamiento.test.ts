// La ficha de venta tiene que mostrar las DOS unidades de almacenamiento.
// Ejecutar: npx tsx lib/shipping-v2/__tests__/ficha-venta-almacenamiento.test.ts

import { buildFichaVentaData, type FichaVentaTechnicalOptionSets } from "../ficha-venta-data";
import type { ShippingV2Item } from "@/types/shipping-v2";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const CATALOGOS: FichaVentaTechnicalOptionSets = { connectivity: [], ports: [], extraFeatures: [] };

// Solo hace falta un item mínimo: lo que se prueba es la línea de almacenamiento.
const item = { id: "rec1", sku: "SG-1", nombre: "Equipo", technicalSheet: {} } as unknown as ShippingV2Item;

const linea = (sheet: Record<string, unknown>) =>
  buildFichaVentaData(item, CATALOGOS, { sheet: sheet as never }).almacenamiento;

assert(
  linea({ almacenamientoPrincipal: "512GB", almacenamientoTipo: "SSD" }) === "512GB SSD",
  "una sola unidad se imprime como siempre"
);

// El caso que se perdía: SSD de arranque + HDD de datos.
assert(
  linea({
    almacenamientoPrincipal: "256GB", almacenamientoTipo: "SSD",
    almacenamiento2: "1TB", almacenamiento2Tipo: "HDD",
  }) === "256GB SSD + 1TB HDD",
  "las dos unidades salen juntas"
);

assert(
  linea({ almacenamientoPrincipal: "256GB", almacenamientoTipo: "SSD", almacenamiento2: "", almacenamiento2Tipo: "" }) === "256GB SSD",
  "una segunda unidad vacía no deja un ' + ' colgando"
);

assert(
  linea({ almacenamiento2: "1TB", almacenamiento2Tipo: "HDD" }) === "1TB HDD",
  "si solo hay segunda unidad, igual se imprime"
);

assert(linea({}) === null, "sin datos, no hay línea de almacenamiento");

assert(
  linea({ almacenamientoPrincipal: "256GB", almacenamientoTipo: "SSD", almacenamiento2: "No aplica" }) === "256GB SSD",
  '"No aplica" no ensucia la ficha del cliente'
);

console.log(fallos ? `\n${fallos} fallo(s)` : "\n✅ ficha-venta-almacenamiento.test.ts — todos los asserts pasaron");
process.exit(fallos ? 1 : 0);
