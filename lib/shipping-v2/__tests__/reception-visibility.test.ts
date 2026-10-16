/**
 * Regla de visibilidad de Shipping V2 Recepción.
 * Ejecutar: npx tsx lib/shipping-v2/__tests__/reception-visibility.test.ts
 */

import { formulaRecepcionAirtable, shouldShowShippingV2ReceptionItem } from "../reception-visibility";

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

// 15-oct-2026: lo vendido, agotado o dado de baja ya no espera nada de
// Recepción, aunque conserve una marca vieja de revisión (eran 139 artículos).
oculto("Vendido con revisión Faltante sale de Recepción", { estadoRevision: "Faltante" });
oculto("Vendido recibido correctamente sale de Recepción", { estadoRevision: "Recibido correctamente" });
oculto("Vendido con «Recibido pendiente de revisión» sale de Recepción", { estadoRevision: "Recibido pendiente de revisión" });
oculto("Agotado con revisión sale de Recepción", { estado: "Agotado", estadoRevision: "Recibido correctamente" });
oculto("Perdido en tienda sale de Recepción", { estado: "Perdido en tienda", estadoRevision: "Faltante" });
visible("Reservado con revisión pendiente sigue en Recepción", { estado: "Reservado", estadoRevision: "Recibido pendiente de revisión", recibido: true });
oculto("Vendido sin estado de revisión de Recepción no reaparece por defecto", {});
visible("Disponible con publicación pendiente sigue en Recepción", { estado: "Disponible", fotosTomadas: false });
visible("Disponible sin Facebook Super Geek sigue en Recepción", { estado: "Disponible", facebookSuperGeek: false });
oculto("Disponible completamente publicado sale de Recepción", { estado: "Disponible" });

// Pedidos de clientes que llegan directo (caso REP-000020 / REP-000022 / REP-000026):
// "Compra ya pagada" en estado "Pagado", sin estado de revisión.
const pedidoDirecto = { estado: "Pagado", estadoRevision: "", operacionComercialId: "recOP", modoLogistico: "Tracking directo", recibido: false };
// Desde oct-2026 (punto 2) lo que todavía no llega vive en Logística, no en la lista de bodega.
oculto("Pedido directo sin recibir ya no está en la lista de bodega: está en Logística", pedidoDirecto);
oculto("Artículo en tránsito con revisión Pendiente de recepción espera en Logística", { estado: "En tránsito", estadoRevision: "Pendiente de recepción", recibido: false });
visible("Caja recibida: sus artículos aparecen para confirmarse uno por uno", { estado: "Recibido", estadoRevision: "Pendiente de recepción", recibido: false });
oculto("El mismo pedido ya recibido y vendido no reaparece", { ...pedidoDirecto, estado: "Vendido", recibido: true });
oculto("Pedido vendido (aunque nunca se marcó recibido) no reaparece", { ...pedidoDirecto, estado: "Vendido" });
oculto("Compra propia (sin operación) en Pagado no se mete en Recepción", { ...pedidoDirecto, operacionComercialId: undefined });
oculto("Pedido que llega en packing espera a su packing", { ...pedidoDirecto, modoLogistico: "Pendiente de packing" });

// La misma regla como condición de Airtable (para leer solo lo que se ve).
const formula = formulaRecepcionAirtable(
  {
    estado: "Estado Item",
    revision: "Estado de revisión",
    recibido: "Recibido",
    operacionComercial: "Operación Comercial",
    modoLogistico: "Modo logístico",
    publicaciones: ["Fotos tomadas", "Shopify publicado"],
  },
  {
    estados: ["Registrado", "En tránsito", "Recibido", "En revisión", "Disponible", "Reservado", "Vendido", "Con novedad", "Agotado", "Dado de baja"],
    revisiones: ["No aplica", "Pendiente de recepción", "Recibido correctamente", "Dañado"],
    modos: ["Tracking directo", "Pendiente de packing"],
  }
);
assert(formula.startsWith("AND(NOT(OR({Estado Item}='Vendido',{Estado Item}='Agotado',{Estado Item}='Dado de baja'))"), "excluye lo vendido, agotado y dado de baja");
assert(formula.includes("NOT(AND(NOT({Recibido}),OR({Estado Item}='Registrado',{Estado Item}='En tránsito')))"), "lo que aún no llega (con su tilde exacta)");
assert(formula.includes("OR({Estado Item}='Recibido',{Estado Item}='En revisión',{Estado Item}='Con novedad')"), "estados de trabajo de bodega");
assert(formula.includes("{Estado de revisión}='Dañado'") && !formula.includes("'No aplica'"), "revisiones que mantienen el artículo en Recepción");
assert(formula.includes("AND(OR({Estado Item}='Disponible'),OR(NOT({Fotos tomadas}),NOT({Shopify publicado})))"), "disponible con fotos o publicaciones pendientes");
assert(formula.includes("LEN(ARRAYJOIN({Operación Comercial}))>0") && formula.includes("{Modo logístico}='Tracking directo'"), "pedido directo por recibir");

if (fallos > 0) {
  console.error(`\n${fallos} assert(s) fallaron.`);
  process.exit(1);
}

console.log("\n✅ reception-visibility.test.ts — todos los asserts pasaron");
