/**
 * Test — el puente contable de la nota de crédito.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/notaCredito.puenteContable.test.ts
 *
 * Sin red: se sustituye global.fetch por un doble que además FALLA si alguien
 * intenta crear un movimiento cuando no debería.
 *
 * ─── Qué protege ─────────────────────────────────────────────────────────────
 *
 * Este puente escribe en la contabilidad. Los dos errores que costarían dinero
 * de verdad son:
 *
 *   · que se dispare en ambiente de pruebas y ensucie los libros reales
 *     (ya pasó con el inventario en julio de 2026: probar el botón de emitir
 *      en pruebas marcó repuestos reales como vendidos, REP-000010/000011)
 *   · que se ejecute dos veces y reste el mismo importe dos veces
 *
 * Por eso las aserciones no miran solo lo que devuelve, sino que NO haya
 * llamadas de escritura.
 */

import { procesarPuenteNotaCredito } from "../../finanzas/puentes/notaCredito";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const fetchOriginal = global.fetch;
process.env.AIRTABLE_API_KEY ||= "test";
process.env.AIRTABLE_BASE_ID ||= "appTEST";

type CamposNC = Record<string, unknown>;

/** Doble de Airtable: sirve una NC y anota todo intento de escritura. */
function doble(camposNC: CamposNC) {
  const escrituras: Array<{ metodo: string; url: string }> = [];
  global.fetch = (async (url: string | URL, init?: RequestInit) => {
    const s = String(url);
    const metodo = init?.method ?? "GET";
    if (metodo !== "GET") escrituras.push({ metodo, url: s });
    if (metodo === "GET") {
      return { ok: true, status: 200, json: async () => ({ id: "recNC", fields: camposNC }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ id: "recX", fields: {} }) } as Response;
  }) as typeof fetch;
  return escrituras;
}

const NC_AUTORIZADA: CamposNC = {
  "Número de Nota de Crédito": "001-002-000000002",
  "Estado":                    "AUTORIZADO",
  "Total":                     5,
  "Saldo Disponible":          5,
  "Fecha de Autorización":     "2026-08-14T12:27:21-05:00",
};

(async () => {
  // ═════════════════════════════════════════════════════════════════════════
  // 1. El guardián de ambiente
  // ═════════════════════════════════════════════════════════════════════════

  console.log("\n── en pruebas no se toca la contabilidad real ──");

  for (const [ambiente, etiqueta] of [
    ["1",       "ambiente pruebas"],
    [undefined, "ambiente sin definir"],
    ["",        "ambiente vacío"],
    ["2 ",      "ambiente con un espacio de más"],
  ] as Array<[string | undefined, string]>) {
    const escrituras = doble(NC_AUTORIZADA);
    const r = await procesarPuenteNotaCredito({
      notaCreditoRecordId: "recNC",
      ambiente,
      registradoPor: "Alex",
    });
    assert(r.estado === "OMITIDO", `${etiqueta}: se omite`);
    assert(escrituras.length === 0, `${etiqueta}: CERO escrituras — fail closed`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 2. Idempotencia
  // ═════════════════════════════════════════════════════════════════════════

  console.log("\n── correrlo dos veces no duplica el asiento ──");

  {
    // La API REST de Airtable devuelve los enlaces como ids sueltos
    // (["recXXX"]), no como objetos. Escribirlo mal aquí hacía que el doble
    // pareciera una NC sin asiento previo y la prueba de idempotencia fallaba
    // sin que el código tuviera nada malo.
    const escrituras = doble({ ...NC_AUTORIZADA, "Movimiento Reversa": ["recMOVYA"] });
    const r = await procesarPuenteNotaCredito({
      notaCreditoRecordId: "recNC",
      ambiente: "2",
      registradoPor: "Alex",
    });
    assert(r.estado === "OK", "Si el asiento ya existe, responde OK");
    assert(r.estado === "OK" && r.movimientoId === "recMOVYA", "…y señala el movimiento que ya estaba");
    assert(escrituras.length === 0, "…sin escribir NADA: el ingreso no se revierte dos veces");
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 3. Lo que no da lugar a asiento
  // ═════════════════════════════════════════════════════════════════════════

  console.log("\n── sin nota de crédito real no hay asiento ──");

  {
    const escrituras = doble({ ...NC_AUTORIZADA, "Estado": "DEVUELTA" });
    const r = await procesarPuenteNotaCredito({ notaCreditoRecordId: "recNC", ambiente: "2", registradoPor: "Alex" });
    assert(r.estado === "OMITIDO", "Una NC DEVUELTA por el SRI no genera reversa");
    assert(escrituras.length === 0, "…y no escribe nada");
  }

  {
    const escrituras = doble({ ...NC_AUTORIZADA, "Total": 0 });
    const r = await procesarPuenteNotaCredito({ notaCreditoRecordId: "recNC", ambiente: "2", registradoPor: "Alex" });
    assert(r.estado === "OMITIDO", "Total 0: no hay nada que revertir");
    assert(escrituras.length === 0, "…y no escribe nada");
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 4. Nunca lanza
  // ═════════════════════════════════════════════════════════════════════════

  console.log("\n── un fallo contable jamás rompe una NC ya autorizada ──");

  {
    global.fetch = (async () => { throw new Error("Airtable caído"); }) as typeof fetch;
    let lanzo = false;
    let r: Awaited<ReturnType<typeof procesarPuenteNotaCredito>> | null = null;
    try {
      r = await procesarPuenteNotaCredito({ notaCreditoRecordId: "recNC", ambiente: "2", registradoPor: "Alex" });
    } catch { lanzo = true; }
    assert(!lanzo, "Con Airtable caído NO lanza: la NC ya es un documento real ante el SRI");
    assert(r?.estado === "ERROR", "…pero lo reporta como ERROR para que quede en el log");
  }

  global.fetch = fetchOriginal;

  if (fallos > 0) {
    console.error(`\n❌ notaCredito.puenteContable.test.ts — ${fallos} aserción(es) fallida(s)`);
    process.exit(1);
  }
  console.log("\n✅ notaCredito.puenteContable.test.ts — todos los asserts pasaron");
})();
