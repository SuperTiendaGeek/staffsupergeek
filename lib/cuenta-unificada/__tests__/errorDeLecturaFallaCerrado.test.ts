/**
 * Un error de Airtable (503, 429…) al leer la cuenta NO puede convertirse en
 * "no hay nada": la cuenta falla en voz alta y quien la usa decide. El gancho
 * de facturación falla cerrado (no emite).
 * Ejecutar: npm test errorDeLecturaFallaCerrado
 *
 * Revisión de Claude Code (fase 3b): desde una OPERACIÓN, si leer su orden
 * vinculada daba 503, la cuenta seguía como si no hubiera orden → la lista de
 * "aprobado sin artículo" quedaba vacía y la factura/recibo pasaban.
 */

import fs from "fs";
import { getCuentaUnificada } from "../index";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const fetchOriginal = global.fetch;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const OPERACION = { id: "recOPE1", fields: { "Código Operación": "OP-1", "Orden de Reparación": ["recORD1"], "Artículo físico": [], Abonos: [] } };
const ORDEN = { id: "recORD1", fields: { ID: "OR000001", "Operaciones Comerciales": ["recOPE1"], "Abonos (Operación)": ["recAB1"], "Costo Total Servicios NV": 0, "Total Productos Digitales": 0 } };

function fake(opciones: { orden503?: boolean; operaciones503?: boolean; abonos503?: boolean }) {
  return (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const d = decodeURIComponent(url);
    if (d.includes("/Operación Comercial/recOPE1")) return Promise.resolve(json(OPERACION));
    if (d.includes("/Órdenes de Reparación/recORD1")) return Promise.resolve(opciones.orden503 ? json({ error: "x" }, 503) : json(ORDEN));
    if (d.includes("/Operación Comercial")) return Promise.resolve(opciones.operaciones503 ? json({ error: "x" }, 503) : json({ records: [OPERACION] }));
    if (d.includes("/Abonos")) return Promise.resolve(opciones.abonos503 ? json({ error: "x" }, 503) : json({ records: [] }));
    return Promise.resolve(json({ records: [] }));
  };
}

async function rechaza(p: Promise<unknown>): Promise<boolean> {
  try { await p; return false; } catch { return true; }
}

async function main(): Promise<void> {
  process.env.AIRTABLE_API_KEY = "fake-token-para-test";
  process.env.AIRTABLE_BASE_ID = "appFAKE0000000000";
  try {
    global.fetch = fake({ orden503: true }) as unknown as typeof global.fetch;
    assert(await rechaza(getCuentaUnificada({ operacionId: "recOPE1" })), "desde una operación: si su orden da 503, la cuenta FALLA (no sigue como si no hubiera orden)");

    global.fetch = fake({ operaciones503: true }) as unknown as typeof global.fetch;
    assert(await rechaza(getCuentaUnificada({ ordenId: "recORD1" })), "desde la orden: si sus operaciones dan 503, la cuenta FALLA (no las da por vacías)");

    global.fetch = fake({ abonos503: true }) as unknown as typeof global.fetch;
    assert(await rechaza(getCuentaUnificada({ ordenId: "recORD1" })), "si los abonos dan 503, la cuenta FALLA (no los da por inexistentes) — revisión de Claude Code");

    global.fetch = fake({}) as unknown as typeof global.fetch;
    const c = await getCuentaUnificada({ operacionId: "recOPE1" });
    assert(c.ordenId === "recORD1", "sin errores, la operación resuelve su orden como siempre");
  } finally {
    global.fetch = fetchOriginal;
  }
  // Guardia de código: ninguna lectura de la cuenta puede volver a tragarse un
  // error HTTP (el patrón "if (!res.ok) return [] / null").
  const cuenta = fs.readFileSync("lib/cuenta-unificada/index.ts", "utf8");
  assert(!/if \(!res\.ok\) return/.test(cuenta), "lib/cuenta-unificada/index.ts no convierte errores HTTP en vacío");
  const tec = fs.readFileSync("lib/tecnicos/airtable/index.ts", "utf8");
  const bloqueAbonos = tec.slice(tec.indexOf("const fetchRecordsByIds = async ("), tec.indexOf("const compareByFechaAbonoDesc"));
  assert(bloqueAbonos.length > 0 && !/if \(!res\.ok\) return/.test(bloqueAbonos), "la lectura de abonos (fetchRecordsByIds de técnicos) no convierte errores en vacío");

  if (fallos > 0) { console.error(`\n${fallos} assert(s) fallaron.`); process.exit(1); }
  console.log("\n✅ errorDeLecturaFallaCerrado.test.ts — todos los asserts pasaron");
}

void main();
