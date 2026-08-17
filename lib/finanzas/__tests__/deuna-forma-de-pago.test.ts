/**
 * Test — DeUna como forma de pago de Abonos (rama feat/deuna-forma-de-pago,
 * 2026-08-16).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/deuna-forma-de-pago.test.ts
 *
 * Cubre:
 *   (a) un abono DeUna crea el movimiento con cuenta destino "DeUna" y
 *       estado "Confirmado" — la regla central de esta rama.
 *   (b) un abono Transferencia sigue cayendo en SGINGRESOS, como antes
 *       (no-regresión — verificado manualmente "al revés": cambiar el
 *       mapeo de Transferencia en lib/finanzas/puentes/abonos.ts hace
 *       fallar esta prueba).
 *   (c) sin número de transacción, DeUna y Transferencia se rechazan
 *       (requiereNumeroTransaccion, la fuente que consumen las 2 pantallas
 *       y los 2 endpoints).
 *   (d) sin número de transacción, Efectivo (y el resto) se acepta.
 *   (e) el catálogo centralizado (METODOS_PAGO_ABONO) tiene los mismos 7
 *       métodos de antes, más DeUna, en el mismo orden relativo.
 *
 * Sin red: usa el doble en memoria de Airtable (_airtableDouble.ts), mismo
 * patrón que 20-2.1.idempotencia-abono.test.ts.
 */

import { crearMovimientoParaAbono } from "../puentes/abonos";
import { fetchMovimientoById } from "../movimientos";
import { __resetCacheNombreTablaParaPruebas } from "../table-names";
import {
  activarEnvFalso,
  construirFetchDouble,
  crearCuentaDouble,
  crearEstadoDouble,
  crearRegistroDouble,
  limpiarEnvFalso,
} from "./_airtableDouble";
import { METODOS_PAGO_ABONO, requiereNumeroTransaccion } from "@/types/abonos";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

const fetchOriginal = global.fetch;

async function main() {
  activarEnvFalso();

  // ═══ (a) — DeUna crea el movimiento en la cuenta "DeUna", Confirmado ═══════
  {
    __resetCacheNombreTablaParaPruebas();
    const state = crearEstadoDouble("Movimientos Financieros");
    global.fetch = construirFetchDouble(state) as typeof fetch;

    crearCuentaDouble(state, { nombre: "DeUna", tipo: "Tránsito", saldoInicial: 75, fechaCorte: "2026-08-16" });
    const abonoId = crearRegistroDouble(state, "Abonos", {
      Monto: 20,
      "Método de Pago": "DeUna",
      "Fecha de Abono": "2026-08-16T10:00:00.000Z",
    });

    const resultado = await crearMovimientoParaAbono({
      abonoId,
      monto: 20,
      metodoPago: "DeUna",
      fecha: "2026-08-16T10:00:00.000Z",
      registradoPor: "Test",
      numeroTransaccion: "DEUNA-0001",
    });
    assert(resultado.ok, "(a) DeUna: crearMovimientoParaAbono no lanza");

    if (resultado.ok) {
      const movimiento = await fetchMovimientoById(resultado.movimientoId);
      assert(movimiento !== null, "(a) DeUna: el movimiento existe");
      if (movimiento) {
        const cuentaDeUnaId = [...state.cuentas.entries()].find(([, r]) => r.fields["Nombre"] === "DeUna")?.[0];
        assert(
          movimiento.cuentaDestinoId === cuentaDeUnaId,
          "(a) DeUna: cuenta destino es la cuenta 'DeUna' — LA REGLA CENTRAL de esta rama"
        );
        assert(movimiento.estado === "Confirmado", "(a) DeUna: estado del movimiento es 'Confirmado' (patrón PayPal, no Tarjeta/Pendiente)");
        assert(movimiento.metodo === "DeUna", "(a) DeUna: 'Método' del movimiento queda 'DeUna'");
        assert(movimiento.transaccionId === "DEUNA-0001", "(a) DeUna: el número de transacción se guarda");
      }
    }
  }

  // ═══ (b) — Transferencia sigue en SGINGRESOS (no-regresión) ═══════════════
  {
    __resetCacheNombreTablaParaPruebas();
    const state = crearEstadoDouble("Movimientos Financieros");
    global.fetch = construirFetchDouble(state) as typeof fetch;

    crearCuentaDouble(state, { nombre: "SGINGRESOS", tipo: "Principal", saldoInicial: 0, fechaCorte: "2026-08-16" });
    const abonoId = crearRegistroDouble(state, "Abonos", {
      Monto: 45,
      "Método de Pago": "Transferencia",
      "Fecha de Abono": "2026-08-16T10:00:00.000Z",
    });

    const resultado = await crearMovimientoParaAbono({
      abonoId,
      monto: 45,
      metodoPago: "Transferencia",
      fecha: "2026-08-16T10:00:00.000Z",
      registradoPor: "Test",
      numeroTransaccion: "TRF-0001",
    });
    assert(resultado.ok, "(b) Transferencia: crearMovimientoParaAbono no lanza");

    if (resultado.ok) {
      const movimiento = await fetchMovimientoById(resultado.movimientoId);
      if (movimiento) {
        const cuentaSgIngresosId = [...state.cuentas.entries()].find(([, r]) => r.fields["Nombre"] === "SGINGRESOS")?.[0];
        assert(
          movimiento.cuentaDestinoId === cuentaSgIngresosId,
          "(b) Transferencia: cuenta destino sigue siendo SGINGRESOS — no-regresión (verificado manualmente que falla si se cambia el mapeo)"
        );
        assert(movimiento.estado === "Confirmado", "(b) Transferencia: estado 'Confirmado' — sin cambio");
        assert(movimiento.metodo === "Transferencia bancaria", "(b) Transferencia: 'Método' sigue siendo 'Transferencia bancaria' — sin cambio");
      }
    }
  }

  // ═══ (c) — Sin número de transacción, DeUna y Transferencia se rechazan ═══
  assert(requiereNumeroTransaccion("DeUna"), "(c) requiereNumeroTransaccion('DeUna') = true");
  assert(requiereNumeroTransaccion("Transferencia"), "(c) requiereNumeroTransaccion('Transferencia') = true");

  // ═══ (d) — Sin número de transacción, el resto se acepta ══════════════════
  assert(!requiereNumeroTransaccion("Efectivo"), "(d) requiereNumeroTransaccion('Efectivo') = false");
  assert(!requiereNumeroTransaccion("Tarjeta"), "(d) requiereNumeroTransaccion('Tarjeta') = false");
  assert(!requiereNumeroTransaccion("Depósito"), "(d) requiereNumeroTransaccion('Depósito') = false");
  assert(!requiereNumeroTransaccion("PayPal"), "(d) requiereNumeroTransaccion('PayPal') = false");
  assert(!requiereNumeroTransaccion("PayPhone"), "(d) requiereNumeroTransaccion('PayPhone') = false");
  assert(!requiereNumeroTransaccion("Otro"), "(d) requiereNumeroTransaccion('Otro') = false");
  assert(!requiereNumeroTransaccion(""), "(d) requiereNumeroTransaccion('') = false (valor vacío no exige nada — se rechaza antes por 'método obligatorio', no por número)");
  assert(!requiereNumeroTransaccion("MétodoInventado"), "(d) requiereNumeroTransaccion(valor no reconocido) = false");

  // ═══ (e) — El catálogo centralizado tiene los 7 métodos de antes + DeUna ══
  const METODOS_ANTES_DE_ESTA_RAMA = ["Efectivo", "Transferencia", "Tarjeta", "Depósito", "PayPal", "PayPhone", "Otro"];
  assert(
    METODOS_ANTES_DE_ESTA_RAMA.every((m) => (METODOS_PAGO_ABONO as readonly string[]).includes(m)),
    "(e) Los 7 métodos que existían antes siguen todos presentes"
  );
  assert(
    JSON.stringify(METODOS_PAGO_ABONO.filter((m) => m !== "DeUna")) === JSON.stringify(METODOS_ANTES_DE_ESTA_RAMA),
    "(e) Quitando 'DeUna', el orden relativo de los 7 métodos originales no cambió"
  );
  assert(METODOS_PAGO_ABONO.includes("DeUna"), "(e) 'DeUna' está en el catálogo centralizado");
  assert(METODOS_PAGO_ABONO.length === METODOS_ANTES_DE_ESTA_RAMA.length + 1, "(e) El catálogo tiene exactamente un método más que antes (8 en total)");

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n❌ deuna-forma-de-pago.test.ts — ${fallos} aserción(es) fallida(s)`);
    process.exit(1);
  }
  console.log("\n✅ deuna-forma-de-pago.test.ts — todos los asserts pasaron");
}

main();
