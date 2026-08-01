/**
 * Test §9 #13-#15 del diseño de Fase 20.5 — resolveCuentaFinancieraLegacy
 * (Corrección 1), probado indirectamente vía markShippingV2PagoAsPaid (no
 * está exportada — mismo criterio que el resto de la suite de idempotencia
 * del puente): (a) resuelve por comparación normalizada (trim +
 * case-insensitive) el caso real detectado — espacio final del select de
 * Shipping vs. el Nombre limpio de la Cuenta Financiera; (b) solo considera
 * cuentas activas; (c) sin ninguna coincidencia, no bloquea el pago (mismo
 * comportamiento ya aprobado desde 20.1).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-5.7.resolver-cuenta-legacy.test.ts
 */

import { markShippingV2PagoAsPaid } from "../../shipping-v2/airtable";
import { systemShippingV2Access } from "../../shipping-v2/access";
import { fetchCuentaPorNombreNormalizado } from "../cuentas";
import { MOVIMIENTOS_FIELDS } from "../movimientos-fields";
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

function construirFetchShipping(finanzasState: ReturnType<typeof crearEstadoDouble>, pagoId: string, pagoFieldsRef: { current: Record<string, unknown> }) {
  const finanzasFetch = construirFetchDouble(finanzasState);
  return (async (url: string | URL, init?: RequestInit) => {
    const urlStr = String(url);
    const method = (init?.method ?? "GET").toUpperCase();
    if (urlStr.includes("Shipping%20Proveedores")) return { ok: true, json: async () => ({ records: [] }) } as Response;
    if (urlStr.includes("Shipping%20Items")) return { ok: true, json: async () => ({ records: [] }) } as Response;
    if (urlStr.includes("Shipping%20Pagos")) {
      if (method === "GET") return { ok: true, json: async () => ({ id: pagoId, fields: pagoFieldsRef.current }) } as Response;
      if (method === "PATCH") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { records: Array<{ id: string; fields: Record<string, unknown> }> };
        pagoFieldsRef.current = { ...pagoFieldsRef.current, ...body.records[0].fields };
        return { ok: true, json: async () => ({ records: [{ id: pagoId, fields: pagoFieldsRef.current }] }) } as Response;
      }
    }
    return finanzasFetch(url, init);
  }) as typeof fetch;
}

async function pagarConCuentaOrigen(cuentaOrigenTexto: string, finanzasState: ReturnType<typeof crearEstadoDouble>) {
  const PAGO_ID = "recPAGOTEST0001";
  const pagoFieldsRef = { current: {
    "Pago ID": "PAY-20260715-00099",
    "Estado Pago": "Pendiente",
    "Total a pagar": 200,
    "Items relacionados": [],
    "Regalos incluidos": [],
    "Shipping Finanzas Movimientos": [],
  } as Record<string, unknown> };

  global.fetch = construirFetchShipping(finanzasState, PAGO_ID, pagoFieldsRef);

  const resultado = await markShippingV2PagoAsPaid(
    PAGO_ID,
    {
      fechaPagoReal: "2026-07-15T21:05:00.000Z",
      metodoPago: "Tarjeta",
      cuentaOrigen: cuentaOrigenTexto,
      transaccionId: "TX-TARJETA-001",
      observacion: "Pago de prueba con tarjeta",
    },
    { registradoPor: "Test", access: systemShippingV2Access() }
  );
  const movimientoId = resultado.movimientoFinanzasIds[0];
  const movimiento = finanzasState.movimientos.get(movimientoId)!;
  return movimiento.fields[MOVIMIENTOS_FIELDS.cuentaOrigen] as string[] | undefined;
}

async function main() {
  activarEnvFalso();

  // --- #13a: prueba directa de fetchCuentaPorNombreNormalizado con un
  // espacio final real (sin pasar por la capa de normalización de Shipping,
  // que ya trimea antes — esta es la prueba fiel al caso reportado). ---
  {
    __resetCacheNombreTablaParaPruebas();
    const state = crearEstadoDouble("Movimientos Financieros");
    global.fetch = construirFetchDouble(state) as typeof fetch;
    const tarjetaId = crearCuentaDouble(state, { nombre: "Tarjeta D. Supe Geek", tipo: "Tarjeta de Crédito", fechaCorte: "2026-07-01T00:00:00.000Z" });

    const resuelta = await fetchCuentaPorNombreNormalizado("Tarjeta D. Supe Geek "); // con espacio final, como en Airtable real
    assert(resuelta?.id === tarjetaId, "fetchCuentaPorNombreNormalizado resuelve un nombre con espacio final de más");

    const resueltaMayus = await fetchCuentaPorNombreNormalizado("TARJETA d. supe GEEK");
    assert(resueltaMayus?.id === tarjetaId, "fetchCuentaPorNombreNormalizado resuelve sin importar mayúsculas/minúsculas");
  }

  // --- #13b: el mismo caso, de punta a punta a través del puente Shipping ---
  {
    __resetCacheNombreTablaParaPruebas();
    const finanzasState = crearEstadoDouble("Movimientos Financieros");
    const tarjetaId = crearCuentaDouble(finanzasState, {
      nombre: "tarjeta d. supe geek", // minúsculas, sin espacio final
      tipo: "Tarjeta de Crédito",
      fechaCorte: "2026-07-01T00:00:00.000Z",
    });

    const cuentaOrigenResuelta = await pagarConCuentaOrigen("Tarjeta D. Supe Geek ", finanzasState); // con espacio final, como en el select real
    assert(
      Array.isArray(cuentaOrigenResuelta) && cuentaOrigenResuelta[0] === tarjetaId,
      "El puente Shipping resuelve la tarjeta pese al espacio final y la diferencia de mayúsculas"
    );
  }

  // --- #14: solo cuentas activas — una coincidencia de nombre inactiva no resuelve ---
  {
    __resetCacheNombreTablaParaPruebas();
    const finanzasState = crearEstadoDouble("Movimientos Financieros");
    crearCuentaDouble(finanzasState, {
      nombre: "Tarjeta C. Pacificard",
      tipo: "Tarjeta de Crédito",
      activa: false, // inactiva a propósito
      fechaCorte: "2026-07-01T00:00:00.000Z",
    });

    const cuentaOrigenResuelta = await pagarConCuentaOrigen("Tarjeta C. Pacificard", finanzasState);
    assert(
      cuentaOrigenResuelta === undefined || cuentaOrigenResuelta.length === 0,
      "Una Cuenta Financiera inactiva con el nombre correcto NO resuelve — el movimiento se crea sin Cuenta Origen"
    );
  }

  // --- #15: sin ninguna coincidencia, no bloquea el pago (comportamiento ya aprobado desde 20.1) ---
  {
    __resetCacheNombreTablaParaPruebas();
    const finanzasState = crearEstadoDouble("Movimientos Financieros");
    // Sin ninguna Cuenta Financiera creada que coincida con "Otra".

    const cuentaOrigenResuelta = await pagarConCuentaOrigen("Otra", finanzasState);
    assert(
      cuentaOrigenResuelta === undefined || cuentaOrigenResuelta.length === 0,
      "Sin ninguna Cuenta Financiera coincidente, el movimiento se crea igual sin Cuenta Origen (nunca bloquea el pago)"
    );
    assert(finanzasState.movimientos.size === 1, "El pago se registró de todas formas (1 movimiento en el store)");
  }

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — resolución de tarjeta desde el puente Shipping: normalizada, solo activas, y nunca bloquea.");
}

const fetchOriginal = global.fetch;
main();
