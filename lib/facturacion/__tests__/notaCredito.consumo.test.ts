/**
 * Test — consumo del crédito de la NC en facturas de reemplazo (Fase 18 PR2c).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/notaCredito.consumo.test.ts
 *
 * Verifica consumirCreditoNotaCredito con un doble de fetch que simula el
 * registro de la NC en Airtable: descuento correcto, idempotencia por factura,
 * tope por saldo, y monto inválido.
 *
 * Lanza en la primera falla y sale con código distinto de 0.
 */

import { consumirCreditoNotaCredito } from "../notaCredito/airtable";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const fetchOriginal = global.fetch;
const NC_ID = "recNC0001";

// Estado simulado de la NC (mutable para ver el efecto del PATCH).
function crearDoble(estado: { saldo: number; reemplazos: string[] }) {
  const patches: Array<Record<string, unknown>> = [];
  const fetchDoble = async (url: string | URL, init?: RequestInit) => {
    const s = String(url);
    const method = init?.method ?? "GET";
    if (method === "GET") {
      return { ok: true, json: async () => ({ fields: { "Saldo Disponible": estado.saldo, "Facturas de Reemplazo": estado.reemplazos } }) } as Response;
    }
    if (method === "PATCH") {
      const body = JSON.parse(String(init?.body)) as { fields: Record<string, unknown> };
      patches.push(body.fields);
      if (typeof body.fields["Saldo Disponible"] === "number") estado.saldo = body.fields["Saldo Disponible"] as number;
      if (Array.isArray(body.fields["Facturas de Reemplazo"])) estado.reemplazos = body.fields["Facturas de Reemplazo"] as string[];
      return { ok: true, json: async () => ({ id: NC_ID }) } as Response;
    }
    throw new Error(`fetch inesperado: ${method} ${s}`);
  };
  return { fetchDoble, patches };
}

(async () => {
  process.env.AIRTABLE_API_KEY = "fake";
  process.env.AIRTABLE_BASE_ID = "appFAKE";

  // (a) descuento parcial: crédito 340, se aplican 200 → saldo 140
  {
    const estado = { saldo: 340, reemplazos: [] as string[] };
    const { fetchDoble } = crearDoble(estado);
    global.fetch = fetchDoble as unknown as typeof fetch;
    const r = await consumirCreditoNotaCredito(NC_ID, 200, "recFACT_B");
    assert(r.ok && r.saldoRestante === 140, "Descuento parcial: 340 - 200 = 140");
    assert(estado.reemplazos.includes("recFACT_B"), "Descuento: la factura de reemplazo queda enlazada");
  }

  // (b) descuento total exacto: crédito 340, se aplican 340 → saldo 0
  {
    const estado = { saldo: 340, reemplazos: [] as string[] };
    const { fetchDoble } = crearDoble(estado);
    global.fetch = fetchDoble as unknown as typeof fetch;
    const r = await consumirCreditoNotaCredito(NC_ID, 340, "recFACT_B");
    assert(r.ok && r.saldoRestante === 0, "Descuento total: saldo queda en 0");
  }

  // (c) idempotencia: si la factura ya está enlazada, no vuelve a descontar
  {
    const estado = { saldo: 140, reemplazos: ["recFACT_B"] };
    const { fetchDoble, patches } = crearDoble(estado);
    global.fetch = fetchDoble as unknown as typeof fetch;
    const r = await consumirCreditoNotaCredito(NC_ID, 200, "recFACT_B");
    assert(r.ok && r.yaAplicada === true, "Idempotencia: reporta yaAplicada");
    assert(patches.length === 0, "Idempotencia: no hace ningún PATCH (no re-descuenta)");
    assert(estado.saldo === 140, "Idempotencia: el saldo no cambia");
  }

  // (d) tope por saldo: intentar aplicar más que el crédito disponible falla
  {
    const estado = { saldo: 100, reemplazos: [] as string[] };
    const { fetchDoble, patches } = crearDoble(estado);
    global.fetch = fetchDoble as unknown as typeof fetch;
    const r = await consumirCreditoNotaCredito(NC_ID, 150, "recFACT_B");
    assert(!r.ok, "Tope: aplicar más que el saldo disponible falla");
    assert(patches.length === 0, "Tope: no descuenta nada cuando excede");
  }

  // (e) monto inválido
  {
    const estado = { saldo: 100, reemplazos: [] as string[] };
    const { fetchDoble } = crearDoble(estado);
    global.fetch = fetchDoble as unknown as typeof fetch;
    const r = await consumirCreditoNotaCredito(NC_ID, 0, "recFACT_B");
    assert(!r.ok, "Monto 0 falla");
  }

  global.fetch = fetchOriginal;
  delete process.env.AIRTABLE_API_KEY;
  delete process.env.AIRTABLE_BASE_ID;

  if (fallos > 0) {
    console.error(`\n❌ notaCredito.consumo.test.ts — ${fallos} aserción(es) fallida(s)`);
    process.exit(1);
  }
  console.log("\n✅ notaCredito.consumo.test.ts — todos los asserts pasaron");
})();
