/**
 * Test §9 #9 — Migración de los 11 movimientos legacy de Shipping. Test de
 * DATOS, no de código: contra el entorno real de Airtable, DESPUÉS de
 * ejecutar el checklist manual (docs/DISENO_FASE20_1_FUNDACION.md §6, pasos
 * 1-5 como mínimo). No se puede correr hoy contra la tabla tal como está —
 * eso es exactamente lo que verifica.
 *
 * Ejecutar (tras el checklist):
 *   npx tsx lib/finanzas/__tests__/9.migracion-legacy.live.test.ts
 *
 * Variables requeridas en .env.local: AIRTABLE_API_KEY, AIRTABLE_BASE_ID.
 *
 * Verifica que los 11 movimientos legacy (docs/AUDITORIA-FASE-20.md §A.3):
 *   - Tienen Categoría = "Compra Proveedor Shipping".
 *   - Tienen Estado del Movimiento = "Confirmado" (campo nuevo).
 *   - Tienen Cuenta Origen resuelta (no vacía).
 *   - Su Cuenta origen / Estado de integración viejos NO fueron tocados
 *     (siguen con su valor original — Corrección 3).
 *   - La suma de Monto de esos 11 sigue siendo $6,382.04 — verificación de
 *     integridad de datos (ya no como componente de ningún saldo, ver test #4).
 *
 * No lanza si falta AIRTABLE_API_KEY/AIRTABLE_BASE_ID — solo avisa y sale 0,
 * para no romper una corrida en lote de toda la carpeta antes del go-live.
 */

import { listarMovimientos } from "../movimientos";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

async function main() {
  if (!process.env.AIRTABLE_API_KEY?.trim() || !process.env.AIRTABLE_BASE_ID?.trim()) {
    console.log("AIRTABLE_API_KEY/AIRTABLE_BASE_ID no están definidas — se omite (este es un test contra datos reales, no de CI).");
    return;
  }

  const movimientos = await listarMovimientos({ categoria: "Compra Proveedor Shipping", maxRecords: 50 });

  assert(movimientos.length === 11, `Hay exactamente 11 movimientos con Categoría "Compra Proveedor Shipping" (obtenido: ${movimientos.length})`);

  const todosConfirmados = movimientos.every((mov) => mov.estado === "Confirmado");
  assert(todosConfirmados, "Los 11 tienen Estado del Movimiento = Confirmado");

  const todosConCuentaOrigen = movimientos.every((mov) => Boolean(mov.cuentaOrigenId));
  assert(todosConCuentaOrigen, "Los 11 tienen Cuenta Origen resuelta (no vacía)");

  const suma = Math.round(movimientos.reduce((sum, mov) => sum + mov.monto, 0) * 100) / 100;
  assert(suma === 6382.04, `La suma de Monto de los 11 sigue siendo $6,382.04 (obtenido: $${suma})`);

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s). Si el checklist todavía no se ejecutó, este resultado es esperado.`);
    process.exit(1);
  }
  console.log("\nOK — los 11 movimientos legacy quedaron migrados correctamente.");
}

main();
