/**
 * Regla de visibilidad de Shipping V2 Recepción.
 * Ejecutar: npx tsx lib/shipping-v2/__tests__/reception-visibility.test.ts
 */

import { shouldShowShippingV2ReceptionItem } from "../reception-visibility";

let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("x", msg);
  } else {
    console.log("✓", msg);
  }
}

type Entrada = Parameters<typeof shouldShowShippingV2ReceptionItem>[0];

const base: Entrada = {
  estado: "Vendido",
  estadoRevision: "No aplica",
  esRepuesto: false,
  fotosTomadas: true,
  shopifyPublicado: true,
  marketplacePublicado: true,
  mercadoLibrePublicado: true,
  gruposFacebookPublicado: true,
  facebookSuperGeek: true,
};

function visible(caso: string, patch: Partial<Entrada>) {
  assert(shouldShowShippingV2ReceptionItem({ ...base, ...patch }) === true, `${caso} -> visible`);
}

function oculto(caso: string, patch: Partial<Entrada>) {
  assert(shouldShowShippingV2ReceptionItem({ ...base, ...patch }) === false, `${caso} -> oculto`);
}

visible("Vendido con revisión Faltante sigue en Recepción", { estadoRevision: "Faltante" });
visible("Vendido recibido correctamente sigue en Recepción", { estadoRevision: "Recibido correctamente" });
oculto("Vendido sin estado de revisión de Recepción no reaparece por defecto", {});
visible("Disponible con publicación pendiente sigue en Recepción", { estado: "Disponible", fotosTomadas: false });
visible("Disponible sin Facebook Super Geek sigue en Recepción", { estado: "Disponible", facebookSuperGeek: false });
oculto("Disponible completamente publicado sale de Recepción", { estado: "Disponible" });

if (fallos > 0) {
  console.error(`\n${fallos} assert(s) fallaron.`);
  process.exit(1);
}

console.log("\n✅ reception-visibility.test.ts — todos los asserts pasaron");
