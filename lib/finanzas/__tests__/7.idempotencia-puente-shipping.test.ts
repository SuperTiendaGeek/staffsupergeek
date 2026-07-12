/**
 * Test §9 #7 — Idempotencia del puente Shipping: llamar dos veces al flujo
 * de markShippingV2PagoAsPaid sobre el mismo pago crea un solo movimiento
 * financiero (el guard existente por movimientoFinanzasIds.length sigue
 * funcionando igual tras adaptar createFinanceMovementForPago a
 * lib/finanzas/movimientos.ts).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/7.idempotencia-puente-shipping.test.ts
 *
 * global.fetch reemplazado por un doble combinado: Shipping Pagos/
 * Proveedores/Items (estado mutable, simula PATCH real) + el doble de
 * Cuentas/Movimientos Financieros de _airtableDouble.ts. Nunca toca
 * Airtable real.
 */

import { markShippingV2PagoAsPaid } from "../../shipping-v2/airtable";
import { __resetCacheNombreTablaParaPruebas } from "../table-names";
import { activarEnvFalso, construirFetchDouble, crearCuentaDouble, crearEstadoDouble, limpiarEnvFalso } from "./_airtableDouble";

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
  activarEnvFalso();
  __resetCacheNombreTablaParaPruebas();

  const finanzasState = crearEstadoDouble("Movimientos Financieros");
  crearCuentaDouble(finanzasState, { nombre: "Caja Registradora", tipo: "Temporal", saldoInicial: 1000, fechaCorte: "2026-01-01" });

  const PAGO_ID = "recPAGO00000001";
  let pagoFields: Record<string, unknown> = {
    "Pago ID": "PAY-20260715-00001",
    "Estado Pago": "Pendiente",
    "Total a pagar": 300,
    "Items relacionados": [],
    "Regalos incluidos": [],
    "Shipping Finanzas Movimientos": [],
  };

  const finanzasFetch = construirFetchDouble(finanzasState);

  const fetchDoble = (async (url: string | URL, init?: RequestInit) => {
    const urlStr = String(url);
    const method = (init?.method ?? "GET").toUpperCase();

    if (urlStr.includes("Shipping%20Proveedores")) {
      return { ok: true, json: async () => ({ records: [] }) } as Response;
    }
    if (urlStr.includes("Shipping%20Items")) {
      return { ok: true, json: async () => ({ records: [] }) } as Response;
    }
    if (urlStr.includes("Shipping%20Pagos")) {
      if (method === "GET") {
        return { ok: true, json: async () => ({ id: PAGO_ID, fields: pagoFields }) } as Response;
      }
      if (method === "PATCH") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { records: Array<{ id: string; fields: Record<string, unknown> }> };
        pagoFields = { ...pagoFields, ...body.records[0].fields };
        return { ok: true, json: async () => ({ records: [{ id: PAGO_ID, fields: pagoFields }] }) } as Response;
      }
    }
    // Cuentas Financieras / Movimientos Financieros (o su nombre viejo) — delega al doble de finanzas.
    return finanzasFetch(url, init);
  }) as typeof fetch;

  global.fetch = fetchDoble;

  const input = {
    fechaPagoReal: "2026-07-15T21:05:00.000Z",
    metodoPago: "PayPal",
    cuentaOrigen: "PayPal", // sin mapeo a Cuentas Financieras a propósito — ejercita permitirCuentaFaltante también
    transaccionId: "TX-001",
    observacion: "Pago de prueba",
  };

  const primeraLlamada = await markShippingV2PagoAsPaid(PAGO_ID, input, { registradoPor: "Test" });
  assert(primeraLlamada.movimientoFinanzasIds.length === 1, "Primera llamada crea exactamente 1 movimiento vinculado al pago");
  assert(finanzasState.movimientos.size === 1, "El store de movimientos financieros tiene exactamente 1 registro tras la primera llamada");

  const segundaLlamada = await markShippingV2PagoAsPaid(PAGO_ID, input, { registradoPor: "Test" });
  assert(finanzasState.movimientos.size === 1, "El store sigue teniendo exactamente 1 registro tras la segunda llamada — no se duplicó");
  assert(
    segundaLlamada.movimientoFinanzasIds[0] === primeraLlamada.movimientoFinanzasIds[0],
    "La segunda llamada devuelve el mismo movimiento vinculado (guard de idempotencia intacto)"
  );

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — idempotencia del puente Shipping tras la adaptación a lib/finanzas.");
}

const fetchOriginal = global.fetch;
main();
