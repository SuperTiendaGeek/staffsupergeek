// Contrato: una transición de packing solo AVANZA artículos, nunca retrocede.
// Escenario base: el incidente real de PK-20260610-47604 (2026-09-14).
//
// Ejecutar: npx tsx lib/shipping-v2/__tests__/packing-item-sync.test.ts

import {
  decideShippingV2PackingItemSync,
  getShippingV2ItemFlowRank,
  planShippingV2PackingItemSync,
} from "../packing-item-sync";

let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

// ─── Orden del recorrido ─────────────────────────────────────────────────────

assert(getShippingV2ItemFlowRank("En packing")! < getShippingV2ItemFlowRank("En tránsito")!, "En packing va antes que En tránsito");
assert(getShippingV2ItemFlowRank("En tránsito")! < getShippingV2ItemFlowRank("Recibido")!, "En tránsito va antes que Recibido");
assert(getShippingV2ItemFlowRank("Recibido")! < getShippingV2ItemFlowRank("En revisión")!, "Recibido va antes que En revisión");
assert(getShippingV2ItemFlowRank("En revisión")! < getShippingV2ItemFlowRank("Disponible")!, "En revisión va antes que Disponible");
assert(getShippingV2ItemFlowRank("Disponible")! < getShippingV2ItemFlowRank("Vendido")!, "Disponible va antes que Vendido");
assert(getShippingV2ItemFlowRank("en transito") === getShippingV2ItemFlowRank("En tránsito"), "Tolera estados sin tilde");
assert(getShippingV2ItemFlowRank("Estado inventado") === null, "Un estado desconocido no tiene nivel");

// ─── Avanzar sí, retroceder no ───────────────────────────────────────────────

assert(
  decideShippingV2PackingItemSync({ sku: "LAP-1", estado: "En tránsito" }, "Recibido").aplicar,
  "Marcar recibido SÍ avanza un artículo en tránsito"
);
assert(
  decideShippingV2PackingItemSync({ sku: "LAP-2", estado: "Recibido" }, "En revisión").aplicar,
  "Iniciar revisión SÍ avanza un artículo recibido"
);
assert(
  !decideShippingV2PackingItemSync({ sku: "LAP-3", estado: "Recibido" }, "Recibido").aplicar,
  "No se reescribe un artículo que ya está en el estado destino"
);

// El incidente exacto: PK-20260610-47604 pasó a "En revisión" con 9 artículos
// "Disponible" y 1 "Vendido".
const disponible = decideShippingV2PackingItemSync({ sku: "LAP-000008", estado: "Disponible" }, "En revisión");
assert(!disponible.aplicar, "Iniciar revisión NO toca un artículo que ya está Disponible a la venta");
assert(disponible.motivo.includes("no se retrocede"), "El motivo explica que no se retrocede");

const vendido = decideShippingV2PackingItemSync({ sku: "LAP-000013", estado: "Vendido" }, "En revisión");
assert(!vendido.aplicar, "Iniciar revisión NO toca un artículo Vendido");

assert(
  !decideShippingV2PackingItemSync({ sku: "REP-1", estado: "Repuesto" }, "Recibido").aplicar,
  "Marcar recibido NO devuelve a Recibido un repuesto ya clasificado"
);
assert(
  !decideShippingV2PackingItemSync({ sku: "USO-1", estado: "Uso local" }, "En revisión").aplicar,
  "Iniciar revisión NO toca un artículo ya destinado a uso local"
);
assert(
  !decideShippingV2PackingItemSync({ sku: "RES-1", estado: "Reservado" }, "En revisión").aplicar,
  "Iniciar revisión NO libera un artículo Reservado para un cliente"
);

// Ante la duda, no se toca.
const desconocido = decideShippingV2PackingItemSync({ sku: "RARO", estado: "Estado que no existe" }, "Recibido");
assert(!desconocido.aplicar, "Un estado desconocido se deja intacto en vez de pisarse");
assert(desconocido.motivo.includes("no reconocido"), "El motivo dice que el estado no se reconoce");

const sinEstado = decideShippingV2PackingItemSync({ sku: "VACIO" }, "Recibido");
assert(!sinEstado.aplicar, "Un artículo sin estado se deja intacto");

// ─── Plan completo sobre el packing real ─────────────────────────────────────

const itemsPK47604 = [
  { id: "recgawXSHTHe3kOAF", sku: "LAP-000008", estado: "Disponible" },
  { id: "recjFnh6s9xSfodsK", sku: "LAP-000009", estado: "Disponible" },
  { id: "recGpQZEiBvc5ZwUq", sku: "LAP-000010", estado: "Disponible" },
  { id: "recPNAYpRH4neXPqk", sku: "LAP-000011", estado: "Disponible" },
  { id: "recI0OPRCL6qitUtP", sku: "LAP-000012", estado: "Disponible" },
  { id: "recS6S3rP67lU2QkH", sku: "LAP-000013", estado: "Vendido" },
  { id: "recujHfHxioUM9wGT", sku: "LAP-000014", estado: "Disponible" },
  { id: "recxaaFVDxu3L1BsE", sku: "LAP-000015", estado: "Disponible" },
  { id: "recn6LCQZhyJ6CvpT", sku: "ACC-000002", estado: "Disponible" },
  { id: "recwTbzcofEjAQwb6", sku: "ACC-000001", estado: "Disponible" },
];

const plan = planShippingV2PackingItemSync(itemsPK47604, "En revisión");
assert(plan.aplicar.length === 0, "PK-20260610-47604: iniciar revisión no habría tocado NINGÚN artículo");
assert(plan.omitidos.length === 10, "PK-20260610-47604: los 10 artículos quedan registrados como omitidos");
assert(plan.resumen.includes("10"), "El resumen dice cuántos se dejaron intactos");

// Un packing normal recién llegado sí avanza entero.
const enTransito = Array.from({ length: 5 }, (_, i) => ({ id: `rec${i}`, sku: `LAP-${i}`, estado: "En tránsito" }));
const planNormal = planShippingV2PackingItemSync(enTransito, "Recibido");
assert(planNormal.aplicar.length === 5 && planNormal.omitidos.length === 0, "Un packing en tránsito sí avanza sus 5 artículos a Recibido");

// Packing mixto: solo avanzan los que van atrasados.
const planMixto = planShippingV2PackingItemSync(
  [
    { id: "a", sku: "A", estado: "Recibido" },
    { id: "b", sku: "B", estado: "Disponible" },
    { id: "c", sku: "C", estado: "Recibido" },
  ],
  "En revisión"
);
assert(planMixto.aplicar.length === 2, "Packing mixto: avanzan solo los 2 que estaban en Recibido");
assert(planMixto.omitidos[0].item.sku === "B", "Packing mixto: el que ya estaba Disponible queda fuera");

assert(planShippingV2PackingItemSync([], "Recibido").aplicar.length === 0, "Packing sin artículos no revienta");

if (fallos > 0) {
  console.error(`Fallaron ${fallos} comprobaciones.`);
  process.exit(1);
}

console.log("✅ packing-item-sync.test.ts — todos los asserts pasaron");
