/**
 * Test de las reglas puras de "días sin gestión" / auto-rechazo.
 * Ejecutar: npx tsx lib/operaciones/__tests__/vencimiento.test.ts
 */

import {
  calcularDiasSinGestion,
  resolverAlertaGestion,
  debeAutoRechazarse,
  DIAS_MAXIMO_SIN_GESTION,
} from "../vencimiento";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

const AHORA = new Date("2026-08-28T12:00:00.000Z");
const haceDias = (n: number) => new Date(AHORA.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

// ── calcularDiasSinGestion ──────────────────────────────────────────────────
assert(calcularDiasSinGestion("", AHORA) === 0, "fecha vacía → 0 días (no rompe)");
assert(calcularDiasSinGestion("fecha-invalida", AHORA) === 0, "fecha inválida → 0 días (no rompe)");
assert(calcularDiasSinGestion(haceDias(0), AHORA) === 0, "hace 0 días → 0");
assert(calcularDiasSinGestion(haceDias(2), AHORA) === 2, "hace 2 días → 2");
assert(calcularDiasSinGestion(haceDias(15), AHORA) === 15, "hace 15 días → 15");

// ── resolverAlertaGestion ────────────────────────────────────────────────────
assert(
  resolverAlertaGestion({ estado: "Aprobado", ultimaActualizacion: haceDias(30) }, AHORA) === null,
  "Aprobado nunca alerta: ya tuvo respuesta del cliente"
);
assert(
  resolverAlertaGestion({ estado: "Pedido", ultimaActualizacion: haceDias(30) }, AHORA) === null,
  "Pedido nunca alerta"
);
assert(
  resolverAlertaGestion({ estado: "Entregado", ultimaActualizacion: haceDias(30) }, AHORA) === null,
  "Entregado nunca alerta"
);
assert(
  resolverAlertaGestion({ estado: "Rechazado", ultimaActualizacion: haceDias(30) }, AHORA) === null,
  "Rechazado nunca alerta"
);

const nivel = (estado: string, dias: number) =>
  resolverAlertaGestion({ estado, ultimaActualizacion: haceDias(dias) }, AHORA)?.nivel;

assert(nivel("Cotizado", 0) === "nueva", "Cotizado hace 0 días → nueva (verde)");
assert(nivel("Cotizado", 1) === "nueva", "Cotizado hace 1 día → nueva (verde)");
assert(nivel("Cotizado", 2) === "atencion", "Cotizado hace 2 días → atención (amarillo)");
assert(nivel("Cotizado", 5) === "atencion", "Cotizado hace 5 días → todavía atención (amarillo)");
assert(nivel("Cotizado", 6) === "urgente", "Cotizado hace 6 días → urgente (rojo)");
assert(nivel("Cotizado", 20) === "urgente", "Cotizado hace 20 días → urgente (rojo)");

// Requerimiento sigue las mismas franjas: un registro sin cotizar todavía
// también es "algo que un empleado debe mover", solo que sin auto-rechazo.
assert(nivel("Requerimiento", 0) === "nueva", "Requerimiento hace 0 días → nueva (verde)");
assert(nivel("Requerimiento", 3) === "atencion", "Requerimiento hace 3 días → atención (amarillo)");
assert(nivel("Requerimiento", 10) === "urgente", "Requerimiento hace 10 días → urgente (rojo)");

// ── debeAutoRechazarse ───────────────────────────────────────────────────────
assert(
  debeAutoRechazarse({ estado: "Cotizado", ultimaActualizacion: haceDias(DIAS_MAXIMO_SIN_GESTION - 1) }, AHORA) === false,
  "un día antes del máximo → todavía no se auto-rechaza"
);
assert(
  debeAutoRechazarse({ estado: "Cotizado", ultimaActualizacion: haceDias(DIAS_MAXIMO_SIN_GESTION) }, AHORA) === true,
  "justo en el máximo (15 días) → se auto-rechaza"
);
assert(
  debeAutoRechazarse({ estado: "Cotizado", ultimaActualizacion: haceDias(30) }, AHORA) === true,
  "muy vencida → se auto-rechaza"
);
assert(
  debeAutoRechazarse({ estado: "Aprobado", ultimaActualizacion: haceDias(30) }, AHORA) === false,
  "Aprobado nunca se auto-rechaza aunque esté 'vieja': ya avanzó del estado Cotizado"
);
assert(
  debeAutoRechazarse({ estado: "Pedido", ultimaActualizacion: haceDias(30) }, AHORA) === false,
  "Pedido nunca se auto-rechaza — sería peligroso cancelar una compra ya en curso"
);
assert(
  debeAutoRechazarse({ estado: "Requerimiento", ultimaActualizacion: haceDias(30) }, AHORA) === false,
  "Requerimiento nunca se auto-rechaza — todavía no se le prometió nada al cliente, solo alerta visual"
);

// Reactivación: una cotización auto-rechazada y reactivada a mano resetea su
// "Última Actualización" en ese momento, así que no vuelve a caer de
// inmediato en el auto-rechazo del día siguiente.
assert(
  debeAutoRechazarse({ estado: "Cotizado", ultimaActualizacion: haceDias(0) }, AHORA) === false,
  "recién reactivada (Última Actualización = ahora) → no se auto-rechaza"
);

if (fallos > 0) {
  console.error(`\n${fallos} assert(s) fallaron.`);
  process.exit(1);
}
console.log("\n✅ vencimiento.test.ts — todos los asserts pasaron");
