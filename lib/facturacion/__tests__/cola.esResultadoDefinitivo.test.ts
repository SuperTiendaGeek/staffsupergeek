/**
 * Test — esResultadoDefinitivo() (fix/ride-autorizacion).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/cola.esResultadoDefinitivo.test.ts
 *
 * Puro, sin red: no toca Airtable ni el SRI. Cubre el bug real observado en
 * producción (facturas 001-002-666 y 001-002-667, ambiente PRUEBAS): el RIDE
 * salió con "NÚMERO DE AUTORIZACIÓN" en blanco y "FECHA Y HORA DE
 * AUTORIZACIÓN" en NaN/NaN/NaN NaN:NaN:NaN porque esperarAutorizacion()
 * aceptaba un AUTORIZADO con esos dos campos todavía vacíos como definitivo.
 *
 * Lanza en la primera falla y sale con código distinto de 0.
 */

import { esResultadoDefinitivo } from "../sri/cola";
import type { ResultadoAutorizacion } from "../sri/autorizacion";

let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

// ─── Fixtures ──────────────────────────────────────────────────────────────

const enProcesamiento: ResultadoAutorizacion = {
  estado: "EN PROCESAMIENTO",
  _rawSoap: "<soap/>",
};

const noAutorizado: ResultadoAutorizacion = {
  estado: "NO AUTORIZADO",
  mensajes: [],
  _rawSoap: "<soap/>",
};

function autorizado(
  overrides: Partial<{ numeroAutorizacion: string; fechaAutorizacion: string }> = {}
): ResultadoAutorizacion {
  return {
    estado: "AUTORIZADO",
    numeroAutorizacion: "0807202601100371027200110010020000006671598078819",
    fechaAutorizacion: "2026-07-08T09:13:14-05:00",
    ambiente: "PRUEBAS",
    xmlAutorizado: "<factura/>",
    mensajes: [],
    _rawSoap: "<soap/>",
    ...overrides,
  };
}

// ─── Casos ─────────────────────────────────────────────────────────────────

assert(esResultadoDefinitivo(enProcesamiento) === false, "EN PROCESAMIENTO nunca es definitivo");
assert(esResultadoDefinitivo(noAutorizado) === true, "NO AUTORIZADO es definitivo tal cual");

assert(
  esResultadoDefinitivo(autorizado()) === true,
  "AUTORIZADO con numeroAutorizacion y fechaAutorizacion completos es definitivo"
);

// El bug real: exactamente estos dos casos son los que rompían el RIDE.
assert(
  esResultadoDefinitivo(autorizado({ numeroAutorizacion: "" })) === false,
  "AUTORIZADO con numeroAutorizacion vacío NO es definitivo (bug de facturas 666/667)"
);
assert(
  esResultadoDefinitivo(autorizado({ fechaAutorizacion: "" })) === false,
  "AUTORIZADO con fechaAutorizacion vacío NO es definitivo (bug de facturas 666/667)"
);
assert(
  esResultadoDefinitivo(autorizado({ numeroAutorizacion: "", fechaAutorizacion: "" })) === false,
  "AUTORIZADO con ambos campos vacíos NO es definitivo"
);

if (fallos > 0) {
  console.error(`\n❌ cola.esResultadoDefinitivo.test.ts — ${fallos} aserción(es) fallida(s)`);
  process.exit(1);
}
console.log("\n✅ cola.esResultadoDefinitivo.test.ts — todos los asserts pasaron");
