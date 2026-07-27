/**
 * Reglas de "listo para vender" de un Shipping Item.
 * Ejecutar: npx tsx lib/shipping-v2/__tests__/item-availability.test.ts
 *
 * Contexto: antes NO existía forma de que un item llegara a "Disponible".
 * El flujo automático terminaba en "En revisión" y el cambio manual estaba
 * bloqueado por un guard que exigía "una acción controlada" inexistente.
 * De 86 items en producción, 22 estaban estancados en "En revisión".
 */

import { evaluarPublicacionItem } from "../item-availability";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

type Entrada = Parameters<typeof evaluarPublicacionItem>[0];

const base: Entrada = {
  estado: "En revisión",
  estadoRevision: "Recibido correctamente",
  revisadoFisicamente: true,
  novedadesAbiertas: 0,
};

function puede(caso: string, patch: Partial<Entrada>) {
  const r = evaluarPublicacionItem({ ...base, ...patch });
  assert(r.puede === true, `${caso} → se puede publicar${r.puede ? "" : ` (vino: ${r.motivo})`}`);
}

function noPuede(caso: string, patch: Partial<Entrada>, motivo: string) {
  const r = evaluarPublicacionItem({ ...base, ...patch });
  assert(
    r.puede === false && r.motivo === motivo,
    `${caso} → bloqueado por "${motivo}" (vino: ${r.puede ? "permitido" : r.motivo})`
  );
}

// ── Camino feliz ────────────────────────────────────────────────────────────
puede("Recibido, revisado, sin novedades", { estado: "Recibido" });
puede("En revisión, revisado, sin novedades", { estado: "En revisión" });
puede("Acepta el estado sin tilde", { estado: "En revision" });
puede("Revisión aceptada con observación", { estadoRevision: "Aceptado con observación" });

// ── Estado del item ─────────────────────────────────────────────────────────
noPuede("Ya está disponible (idempotente, no es error)", { estado: "Disponible" }, "ya-disponible");
noPuede("Todavía en tránsito", { estado: "En tránsito" }, "estado-no-apto");
noPuede("Ni siquiera se ha pagado", { estado: "Pendiente de pago" }, "estado-no-apto");
noPuede("Ya se vendió", { estado: "Vendido" }, "estado-no-apto");
noPuede("Marcado con novedad", { estado: "Con novedad" }, "estado-no-apto");
noPuede("Destinado a partes", { estado: "Destinado a partes" }, "estado-no-apto");

// ── Revisión física ─────────────────────────────────────────────────────────
noPuede("Nadie lo ha revisado", { revisadoFisicamente: false }, "sin-revisar");
noPuede("Revisión sin marcar (null)", { revisadoFisicamente: null }, "sin-revisar");

// ── Resultado de la revisión ────────────────────────────────────────────────
noPuede("Llegó dañado", { estadoRevision: "Dañado" }, "revision-con-novedad");
noPuede("Llegó incompleto", { estadoRevision: "Incompleto" }, "revision-con-novedad");
noPuede("Falta", { estadoRevision: "Faltante" }, "revision-con-novedad");
noPuede("No es lo que se compró", { estadoRevision: "Diferente al comprado" }, "revision-con-novedad");
noPuede("Está en garantía con el proveedor", { estadoRevision: "En garantía con proveedor" }, "revision-con-novedad");

// ── Novedades abiertas ──────────────────────────────────────────────────────
noPuede("Tiene una novedad sin resolver", { novedadesAbiertas: 1 }, "novedades-abiertas");
noPuede("Tiene varias novedades sin resolver", { novedadesAbiertas: 3 }, "novedades-abiertas");

// ── Orden de precedencia: el motivo más informativo primero ─────────────────
noPuede(
  "Sin revisar Y con novedad: primero avisa que falta revisar",
  { revisadoFisicamente: false, novedadesAbiertas: 2 },
  "sin-revisar"
);
noPuede(
  "Estado no apto manda sobre todo lo demás",
  { estado: "En tránsito", revisadoFisicamente: false },
  "estado-no-apto"
);

if (fallos > 0) {
  console.error(`\n${fallos} assert(s) fallaron.`);
  process.exit(1);
}
console.log("\n✅ item-availability.test.ts — todos los asserts pasaron");
