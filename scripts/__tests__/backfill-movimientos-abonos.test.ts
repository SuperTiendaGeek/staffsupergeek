/**
 * Filtro del backfill de movimientos financieros.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx scripts/__tests__/backfill-movimientos-abonos.test.ts
 *
 * Es la única pieza del script con riesgo real: incluir un abono de más
 * significa meter dinero duplicado en /finanzas. Los casos salen de la
 * situación real al 27-jul-2026 (auditoría F-11): 136 abonos activos sin
 * movimiento, de los cuales 83 tienen la fecha ficticia 2026-01-01 que puso la
 * migración y deben quedarse fuera.
 */

import { esCandidatoBackfill } from "../backfill-movimientos-abonos";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

const DESDE = "2026-04-01";

/** Abono típico del backlog: real, sin movimiento, colgado de una orden. */
const base: Record<string, unknown> = {
  "Estado del Abono": "Registrado",
  Monto: 45,
  "Fecha de Abono": "2026-06-19T05:00:00.000Z",
  "Aplicado a: Orden": ["recORD1"],
};

const con = (patch: Record<string, unknown>) => ({ ...base, ...patch });

// ── Sí entran ───────────────────────────────────────────────────────────────
assert(esCandidatoBackfill(base, DESDE), "Abono real de junio colgado de una orden: entra");
assert(
  esCandidatoBackfill(con({ "Aplicado a: Orden": undefined, "Aplicado a: Operación": ["recOPE1"] }), DESDE),
  "Colgado de una operación comercial: entra"
);
assert(
  esCandidatoBackfill(con({ "Aplicado a: Orden": undefined, Reservas: ["recRES1"] }), DESDE),
  "Colgado de una reserva: entra"
);
assert(
  esCandidatoBackfill(con({ "Fecha de Abono": "2026-04-01T00:00:00.000Z" }), DESDE),
  "Justo en la fecha de corte: entra (el corte es inclusivo)"
);
assert(
  esCandidatoBackfill(con({ "Movimiento Financiero": [] }), DESDE),
  "Campo de movimiento presente pero vacío: entra"
);

// ── No entran ───────────────────────────────────────────────────────────────
assert(
  !esCandidatoBackfill(con({ "Fecha de Abono": "2026-01-01T00:00:00.000Z" }), DESDE),
  "Los 83 migrados con fecha ficticia 2026-01-01: NO entran"
);
assert(
  !esCandidatoBackfill(con({ "Movimiento Financiero": ["recMOV1"] }), DESDE),
  "Ya tiene movimiento: NO entra (no se duplica el dinero)"
);
assert(
  !esCandidatoBackfill(con({ "Estado del Abono": "Anulado" }), DESDE),
  "Abono anulado: NO entra"
);
assert(
  !esCandidatoBackfill(con({ "Aplicado a: Orden": undefined }), DESDE),
  "Sin orden, operación ni reserva: NO entra (no se sabría a quién imputarlo)"
);
assert(
  !esCandidatoBackfill(con({ Monto: 0 }), DESDE),
  "Monto cero: NO entra"
);
assert(
  !esCandidatoBackfill(con({ Monto: undefined }), DESDE),
  "Sin monto: NO entra"
);
assert(
  !esCandidatoBackfill(con({ "Fecha de Abono": undefined }), DESDE),
  "Sin fecha: NO entra"
);
assert(
  !esCandidatoBackfill(con({ "Aplicado a: Orden": [] }), DESDE),
  "Link de orden presente pero vacío: NO entra"
);

// ── El corte se puede mover ─────────────────────────────────────────────────
assert(
  !esCandidatoBackfill(base, "2026-07-01"),
  "Con corte en julio, el abono de junio queda fuera"
);
assert(
  esCandidatoBackfill(con({ "Fecha de Abono": "2026-01-01T00:00:00.000Z" }), "2026-01-01"),
  "Bajando el corte a enero, los migrados sí entrarían (si algún día se decide)"
);

if (fallos > 0) {
  console.error(`\n${fallos} assert(s) fallaron.`);
  process.exit(1);
}
console.log("\n✅ backfill-movimientos-abonos.test.ts — todos los asserts pasaron");
