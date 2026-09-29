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

// Pedidos de clientes que llegan directo (caso REP-000020 / REP-000022 / REP-000026):
// "Compra ya pagada" en estado "Pagado", sin estado de revisión.
const pedidoDirecto = { estado: "Pagado", estadoRevision: "", operacionComercialId: "recOP", modoLogistico: "Tracking directo", recibido: false };
visible("Pedido de operación con tracking directo sin recibir aparece para recibirse", pedidoDirecto);
oculto("El mismo pedido ya recibido y vendido no reaparece", { ...pedidoDirecto, estado: "Vendido", recibido: true });
oculto("Pedido vendido (aunque nunca se marcó recibido) no reaparece", { ...pedidoDirecto, estado: "Vendido" });
oculto("Compra propia (sin operación) en Pagado no se mete en Recepción", { ...pedidoDirecto, operacionComercialId: undefined });
oculto("Pedido que llega en packing espera a su packing", { ...pedidoDirecto, modoLogistico: "Pendiente de packing" });

if (fallos > 0) {
  console.error(`\n${fallos} assert(s) fallaron.`);
  process.exit(1);
}

console.log("\n✅ reception-visibility.test.ts — todos los asserts pasaron");
