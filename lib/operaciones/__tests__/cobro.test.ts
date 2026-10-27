/**
 * Test de las reglas puras de cobro de una Operación Comercial.
 * Ejecutar: npx tsx lib/operaciones/__tests__/cobro.test.ts
 *
 * Cada caso "ANTES" documenta lo que el chip del tablero mostraba cuando el
 * cálculo se apoyaba en "Saldo Pendiente" de Airtable ({Total Cotizado} -
 * {Total Abonado}) con "Total Cotizado" vacío en 41 de 46 operaciones.
 * Los montos son los reales de la base al 2026-07-27.
 */

import { calcularTotalCotizado, resolverEstadoCobro, resolverEstadoCobroTablero } from "../cobro";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

function esperar(
  caso: string,
  input: { estado: string; totalCotizado: number | null; totalAbonado: number | null; tieneOpciones?: boolean },
  esperado: { estado: string; monto: number }
) {
  const r = resolverEstadoCobro(input);
  assert(
    r.estado === esperado.estado && Math.abs(r.monto - esperado.monto) < 0.005,
    `${caso} → ${esperado.estado} $${esperado.monto} (vino ${r.estado} $${r.monto})`
  );
}

// ── calcularTotalCotizado ───────────────────────────────────────────────────
const precios = new Map<string, number>([
  ["recOPC_A", 90],
  ["recOPC_B", 185],
]);
assert(calcularTotalCotizado([], precios) === 0, "sin opción elegida → total cotizado 0");
assert(calcularTotalCotizado(["recOPC_A"], precios) === 90, "una opción elegida → su precio");
assert(
  calcularTotalCotizado(["recOPC_A", "recOPC_B"], precios) === 275,
  "'Opción Elegida' es link múltiple: se suman todas (90+185=275)"
);
assert(
  calcularTotalCotizado(["recDESCONOCIDA"], precios) === 0,
  "opción sin precio resuelto no rompe: aporta 0"
);

// ── Casos reales del tablero ────────────────────────────────────────────────

// OP-2026-000048 · Pedido · opción elegida $185 · sin abonos.
// ANTES: "Sin pago" — indistinguible de una operación que aún no se cotiza.
esperar(
  "OP-2026-000048 (Pedido, $185 cotizado, $0 abonado)",
  { estado: "Pedido", totalCotizado: 185, totalAbonado: 0 },
  { estado: "por-cobrar", monto: 185 }
);

// OP-2026-000022 · Entregado · opción elegida $180 · sin abonos.
// ANTES: "Sin pago". Equipo entregado sin cobrar y sin señal.
esperar(
  "OP-2026-000022 (Entregado, $180 cotizado, $0 abonado)",
  { estado: "Entregado", totalCotizado: 180, totalAbonado: 0 },
  { estado: "por-cobrar", monto: 180 }
);

// OP-2026-000011 · Entregado · opción elegida $125 · abonado $20.
// ANTES: "Pagado" (Saldo Pendiente = 0 - 20 = -20 → la rama "<= 0" ganaba).
esperar(
  "OP-2026-000011 (Entregado, $125 cotizado, $20 abonado)",
  { estado: "Entregado", totalCotizado: 125, totalAbonado: 20 },
  { estado: "saldo-parcial", monto: 105 }
);

// OP-2026-000014 · Rechazado · Total Cotizado 1350 (manual, heredado) · $0 vigente.
// ANTES: "Saldo $1350" en una operación rechazada.
esperar(
  "OP-2026-000014 (Rechazado, $1350 cotizado, $0 abonado)",
  { estado: "Rechazado", totalCotizado: 1350, totalAbonado: 0 },
  { estado: "rechazada", monto: 0 }
);

// Rechazada con dinero dentro: hay que devolverlo.
esperar(
  "Rechazada con abono previo",
  { estado: "Rechazado", totalCotizado: 500, totalAbonado: 120 },
  { estado: "rechazada-con-abono", monto: 120 }
);

// OP-2026-000046 · Cotizado pero sin opción elegida todavía y sin ninguna
// opción cargada (caso raro: la operación pasó a "Cotizado" a mano).
esperar(
  "Cotizado sin ninguna opción cargada",
  { estado: "Cotizado", totalCotizado: 0, totalAbonado: 0, tieneOpciones: false },
  { estado: "sin-cotizar", monto: 0 }
);

// OP-2026-000073 · Cotizado, con 2 opciones cargadas y enviadas al cliente,
// pero "Opción Elegida" vacía (se fija recién al pasar a Aprobado). El chip
// mentía "Sin cotizar" cuando en realidad sí se cotizó, solo falta elegir.
esperar(
  "Cotizado con opciones enviadas, sin elegir ninguna",
  { estado: "Cotizado", totalCotizado: 0, totalAbonado: 0, tieneOpciones: true },
  { estado: "opciones-sin-elegir", monto: 0 }
);

// Abonó antes de que se fijara el precio — el dinero no se puede perder de vista.
esperar(
  "Abono recibido antes de elegir opción",
  { estado: "Aprobado", totalCotizado: 0, totalAbonado: 50 },
  { estado: "sin-cotizar-con-abono", monto: 50 }
);

// OP-2026-000010 · opción elegida $540 · abonado $540.
esperar(
  "OP-2026-000010 (Pedido, $540 cotizado, $540 abonado)",
  { estado: "Pedido", totalCotizado: 540, totalAbonado: 540 },
  { estado: "pagado", monto: 0 }
);

// Sobrepago real.
esperar(
  "Cliente abonó de más",
  { estado: "Entregado", totalCotizado: 100, totalAbonado: 130 },
  { estado: "a-favor", monto: 30 }
);

// Redondeo: no debe reportar saldos de centavos.
esperar(
  "Diferencia por debajo de la tolerancia",
  { estado: "Entregado", totalCotizado: 100, totalAbonado: 99.998 },
  { estado: "pagado", monto: 0 }
);

// Nulls (campos vacíos en Airtable) no deben romper nada.
esperar(
  "totalCotizado y totalAbonado nulos",
  { estado: "Requerimiento", totalCotizado: null, totalAbonado: null },
  { estado: "sin-cotizar", monto: 0 }
);

// ── Chip del tablero con la cuenta completa (auditoría ops, punto 4) ─────────
{
  // Pedido de una orden: el cliente pagó todo en la orden ($80 de servicio +
  // $60 del repuesto). Mirando solo el pedido decía "Por cobrar $60".
  const soloPedido = resolverEstadoCobro({ estado: "Pedido", totalCotizado: 60, totalAbonado: 0 });
  assert(soloPedido.estado === "por-cobrar", "ANTES: mirando solo el pedido → Por cobrar $60");
  const conCuenta = resolverEstadoCobroTablero({
    estado: "Pedido", totalCotizado: 60, totalAbonado: 0, tieneOrden: true,
    cuenta: { estadoPago: "pagado", saldo: 0, deLaOrden: true },
  });
  assert(conCuenta.estado === "pagado", "AHORA: la cuenta completa de la orden está pagada → Pagado");

  const parcial = resolverEstadoCobroTablero({
    estado: "Aprobado", totalCotizado: 60, totalAbonado: 0,
    cuenta: { estadoPago: "pago_parcial", saldo: 35, deLaOrden: true },
  });
  assert(parcial.estado === "saldo-parcial" && parcial.monto === 35, "pago parcial de la cuenta → Saldo $35 (lo que falta en toda la cuenta)");

  const aFavor = resolverEstadoCobroTablero({
    estado: "Entregado", totalCotizado: 100, totalAbonado: 130,
    cuenta: { estadoPago: "saldo_a_favor", saldo: -30, deLaOrden: false },
  });
  assert(aFavor.estado === "a-favor" && aFavor.monto === 30, "saldo a favor → A favor $30");

  // OP-2026-000024: pedido suelto, sin artículo, $70 pagados → Pagado.
  const op24 = resolverEstadoCobroTablero({
    estado: "Pedido", totalCotizado: 70, totalAbonado: 70,
    cuenta: { estadoPago: "pagado", saldo: 0, deLaOrden: false },
  });
  assert(op24.estado === "pagado", "OP-2026-000024 → Pagado");

  const cotizado = resolverEstadoCobroTablero({
    estado: "Cotizado", totalCotizado: 0, totalAbonado: 0, tieneOpciones: true,
    cuenta: { estadoPago: "sin_cargos", saldo: 0, deLaOrden: true },
  });
  assert(cotizado.estado === "opciones-sin-elegir", "antes de aprobar el chip sigue mostrando la etapa de la cotización");

  const rechazadaDeOrden = resolverEstadoCobroTablero({ estado: "Rechazado", totalCotizado: 0, totalAbonado: 50, tieneOrden: true });
  assert(rechazadaDeOrden.estado === "rechazada", "pedido rechazado de una orden: el dinero es de la cuenta de la orden, no 'por devolver' aquí");
  const rechazadaSuelta = resolverEstadoCobroTablero({ estado: "Rechazado", totalCotizado: 0, totalAbonado: 50 });
  assert(rechazadaSuelta.estado === "rechazada-con-abono", "pedido suelto rechazado con abono → por devolver (igual que antes)");

  const sinCuenta = resolverEstadoCobroTablero({ estado: "Pedido", totalCotizado: 60, totalAbonado: 20, cuenta: null });
  assert(sinCuenta.estado === "saldo-parcial", "si la cuenta no se pudo leer, cae al cálculo del pedido (el tablero no se rompe)");
}

if (fallos > 0) {
  console.error(`\n${fallos} assert(s) fallaron.`);
  process.exit(1);
}
console.log("\n✅ cobro.test.ts — todos los asserts pasaron");
