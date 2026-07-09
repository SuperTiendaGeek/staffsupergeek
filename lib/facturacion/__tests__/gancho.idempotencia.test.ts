/**
 * Test — buscarFacturaBloqueante() + guard de sesión del endpoint de
 * pre-factura (gancho Fase 16 PR2).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/gancho.idempotencia.test.ts
 *
 * buscarFacturaBloqueante(): global.fetch reemplazado por un doble simple
 * (sin librería, nunca toca Airtable real) — cubre "con factura previa
 * emitida bloquea" y "con solo borradores no bloquea".
 *
 * Guard de sesión: requireFacturacionSession() usa next/headers (cookies()),
 * que no funciona fuera de un request real de Next.js — no se puede invocar
 * el route handler directamente en un script plano. En su lugar se verifica,
 * a nivel de código fuente, que /api/facturacion/prefactura llama al guard
 * como primera línea, igual que los otros 12 endpoints del módulo (mismo
 * patrón que ya usa requireFacturacionSession() en todos ellos).
 *
 * Lanza en la primera falla y sale con código distinto de 0.
 */

import fs   from "fs";
import path from "path";

import { buscarFacturaBloqueante } from "../gancho/idempotencia";
import type { OrigenGancho } from "../emitirFactura";

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

function fetchDoble(registroOrigen: { fields: Record<string, unknown> } | null, facturas: Array<{ id: string; fields: Record<string, unknown> }>) {
  return (url: string | URL) => {
    const urlStr = String(url);
    // fetchOrden/fetchOperacion: GET a .../{table}/{recordId} (sin filterByFormula)
    if (!urlStr.includes("filterByFormula")) {
      if (!registroOrigen) return Promise.resolve({ ok: false } as Response);
      return Promise.resolve({ ok: true, json: async () => ({ id: "recORIGEN", fields: registroOrigen.fields }) } as Response);
    }
    // fetchFacturasVinculadas: GET con filterByFormula OR(RECORD_ID()=...)
    return Promise.resolve({ ok: true, json: async () => ({ records: facturas }) } as Response);
  };
}

(async () => {
  process.env.AIRTABLE_API_KEY = "fake-token-para-test";
  process.env.AIRTABLE_BASE_ID = "appFAKEBASE0001";

  const origen: OrigenGancho = { tipo: "orden", recordId: "recORDEN0001" };

  // 1. Con una factura AUTORIZADA vinculada: bloquea
  {
    global.fetch = fetchDoble(
      { fields: { "Facturas Electrónicas": ["recFACT0001"] } },
      [{ id: "recFACT0001", fields: { "Estado": "AUTORIZADO", "Número de Factura": "001-002-000000700", "Clave de Acceso": "0".repeat(49) } }]
    ) as unknown as typeof fetch;

    const bloqueante = await buscarFacturaBloqueante(origen);
    assert(bloqueante?.recordId === "recFACT0001", "Factura AUTORIZADA vinculada debe bloquear");
    assert(bloqueante?.numeroFactura === "001-002-000000700", "El bloqueo trae el número de la factura existente");
  }

  // 2. Con solo un BORRADOR vinculado: no bloquea
  {
    global.fetch = fetchDoble(
      { fields: { "Facturas Electrónicas": ["recFACT0002"] } },
      [{ id: "recFACT0002", fields: { "Estado": "BORRADOR" } }]
    ) as unknown as typeof fetch;

    const bloqueante = await buscarFacturaBloqueante(origen);
    assert(bloqueante === null, "Solo un BORRADOR vinculado no debe bloquear");
  }

  // 3. Con solo una ANULADA vinculada: no bloquea
  {
    global.fetch = fetchDoble(
      { fields: { "Facturas Electrónicas": ["recFACT0003"] } },
      [{ id: "recFACT0003", fields: { "Estado": "ANULADA" } }]
    ) as unknown as typeof fetch;

    const bloqueante = await buscarFacturaBloqueante(origen);
    assert(bloqueante === null, "Solo una ANULADA vinculada no debe bloquear");
  }

  // 4. Mezcla: un BORRADOR y una DEVUELTA vinculados — la DEVUELTA sí bloquea
  {
    global.fetch = fetchDoble(
      { fields: { "Facturas Electrónicas": ["recFACT0004", "recFACT0005"] } },
      [
        { id: "recFACT0004", fields: { "Estado": "BORRADOR" } },
        { id: "recFACT0005", fields: { "Estado": "DEVUELTA", "Número de Factura": "001-002-000000701" } },
      ]
    ) as unknown as typeof fetch;

    const bloqueante = await buscarFacturaBloqueante(origen);
    assert(bloqueante?.recordId === "recFACT0005", "Entre un BORRADOR y una DEVUELTA, la DEVUELTA bloquea");
  }

  // 5. Sin ninguna factura vinculada: no bloquea
  {
    global.fetch = fetchDoble({ fields: {} }, []) as unknown as typeof fetch;
    const bloqueante = await buscarFacturaBloqueante(origen);
    assert(bloqueante === null, "Sin facturas vinculadas no debe bloquear");
  }

  // 6. Orden/operación inexistente (fetchOrden devuelve null): no bloquea
  {
    global.fetch = fetchDoble(null, []) as unknown as typeof fetch;
    const bloqueante = await buscarFacturaBloqueante(origen);
    assert(bloqueante === null, "Origen inexistente no debe bloquear (no revienta)");
  }

  global.fetch = fetchOriginal;
  delete process.env.AIRTABLE_API_KEY;
  delete process.env.AIRTABLE_BASE_ID;

  // ─── Guard de sesión (verificación a nivel de código fuente) ────────────────
  const rutaEndpoint = path.join(__dirname, "..", "..", "..", "app", "api", "facturacion", "prefactura", "route.ts");
  const codigoFuente = fs.readFileSync(rutaEndpoint, "utf8");
  assert(
    codigoFuente.includes("requireFacturacionSession"),
    "El endpoint de pre-factura debe usar requireFacturacionSession() (mismo guard que el resto del módulo)"
  );
  const posGuard   = codigoFuente.indexOf("requireFacturacionSession()");
  const posBody    = codigoFuente.indexOf("request.url");
  assert(
    posGuard > -1 && posBody > -1 && posGuard < posBody,
    "El guard de sesión debe llamarse ANTES de leer el body/query del request"
  );

  if (fallos > 0) {
    console.error(`\n❌ gancho.idempotencia.test.ts — ${fallos} aserción(es) fallida(s)`);
    process.exit(1);
  }
  console.log("\n✅ gancho.idempotencia.test.ts — todos los asserts pasaron");
})();
