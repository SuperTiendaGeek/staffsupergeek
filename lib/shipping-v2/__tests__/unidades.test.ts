/**
 * F-42 — comprometer una unidad no debe congelar las demás.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/shipping-v2/__tests__/unidades.test.ts
 *
 * Caso real que motiva el arreglo: REP-000017 tiene 52 unidades y estaba
 * marcado `Reservado = true`. Con el modelo viejo, apartar 1 unidad dejaba
 * las 52 invendibles: ni otra orden de reparación, ni una reserva de cliente,
 * ni una venta podían tocarlas.
 */

import {
  comprometerUnidades, liberarUnidades, normalizarUnidades,
  totalmenteReservado, unidadesLibres, unidadesReservadas,
} from "../unidades";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

function main(): void {
  // ── El caso REP-000017 ─────────────────────────────────────────────────────
  const rep17 = { cantidad: 52, cantidadReservada: 1 };
  assert(unidadesLibres(rep17) === 51, `Con 52 unidades y 1 comprometida quedan 51 libres (vino ${unidadesLibres(rep17)})`);
  assert(!totalmenteReservado(rep17), "El registro NO está totalmente reservado");

  const c1 = comprometerUnidades(rep17, 1);
  assert(c1.ok && c1.cantidadReservada === 2, "Comprometer otra unidad sube el contador a 2");
  assert(c1.ok && c1.disponibleVenta === true, "Sigue disponible para venta: quedan 50 libres");
  assert(c1.ok && c1.reservado === false, "La bandera 'Reservado' NO se enciende mientras queden libres");

  // ── Solo al agotarse se cierra el registro ─────────────────────────────────
  const casiLleno = { cantidad: 3, cantidadReservada: 2 };
  const c2 = comprometerUnidades(casiLleno, 1);
  assert(c2.ok && c2.cantidadReservada === 3, "Se compromete la última unidad");
  assert(c2.ok && c2.reservado === true, "Ahora sí se enciende 'Reservado': no quedan libres");
  assert(c2.ok && c2.disponibleVenta === false, "Y sale de la venta");

  // ── No se puede comprometer de más ─────────────────────────────────────────
  const agotado = { cantidad: 2, cantidadReservada: 2 };
  const c3 = comprometerUnidades(agotado, 1);
  assert(!c3.ok, "No se puede comprometer si no quedan unidades libres");
  assert(!c3.ok && c3.motivo.includes("ya están comprometidas"), "El mensaje lo explica en lenguaje claro");

  const c4 = comprometerUnidades({ cantidad: 5, cantidadReservada: 3 }, 4);
  assert(!c4.ok, "Pedir 4 cuando solo quedan 2 libres falla");
  assert(!c4.ok && c4.motivo.includes("Solo quedan 2"), `El mensaje dice cuántas quedan (vino: ${!c4.ok ? c4.motivo : ""})`);

  const c5 = comprometerUnidades({ cantidad: 0 }, 1);
  assert(!c5.ok, "Un artículo sin stock no se puede comprometer");

  // ── Compatibilidad con los datos de hoy (sin el campo nuevo) ───────────────
  const legacy = { cantidad: 52, reservado: true };
  assert(unidadesReservadas(legacy) === 1, "Dato viejo: 'Reservado' encendido se lee como 1 unidad, no como todas");
  assert(unidadesLibres(legacy) === 51, `Así REP-000017 recupera 51 unidades vendibles (vino ${unidadesLibres(legacy)})`);

  const legacyLibre = { cantidad: 4, reservado: false };
  assert(unidadesLibres(legacyLibre) === 4, "Dato viejo sin reservar: las 4 unidades están libres");

  // ── Liberar ────────────────────────────────────────────────────────────────
  const l1 = liberarUnidades({ cantidad: 3, cantidadReservada: 3 }, 1);
  assert(l1.cantidadReservada === 2, "Liberar baja el contador");
  assert(l1.disponibleVenta === true, "Y devuelve el registro a la venta");
  assert(l1.reservado === false, "Y apaga 'Reservado'");

  const l2 = liberarUnidades({ cantidad: 3, cantidadReservada: 1 }, 5);
  assert(l2.cantidadReservada === 0, "Liberar de más deja el contador en 0, no en negativo");

  const l3 = liberarUnidades({ cantidad: 3, cantidadReservada: 0 }, 1);
  assert(l3.cantidadReservada === 0, "Liberar algo ya libre es idempotente, no falla");

  // ── Datos sucios ───────────────────────────────────────────────────────────
  assert(normalizarUnidades("7") === 7, "Un número en texto se entiende");
  assert(normalizarUnidades(2.7) === 2, "Un decimal se trunca: no existen media unidades físicas");
  assert(normalizarUnidades(-3) === 0, "Un negativo se lee como 0");
  assert(normalizarUnidades(null) === 0, "Vacío se lee como 0");
  assert(unidadesLibres({ cantidad: 2, cantidadReservada: 5 }) === 0, "Descuadre (más reservadas que existentes) → 0 libres, nunca negativo");

  if (fallos > 0) { console.error(`\n${fallos} assert(s) fallaron.`); process.exit(1); }
  console.log("\n✅ unidades.test.ts — todos los asserts pasaron");
}

main();
