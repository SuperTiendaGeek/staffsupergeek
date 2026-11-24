/**
 * Test del ritmo de llamadas a Airtable.
 *  - 23-nov: 429 «Rate limit exceeded» en la lista de órdenes (fila + reintentos).
 *  - 24-nov: incidente de lentitud: la fila de 4/s compartida por instancia frenaba a todos
 *    (docs/incidentes/2026-11-24-lentitud.md). Ahora: fila de 8/s, reintento a los 30 s,
 *    interruptor AIRTABLE_RITMO y resumen por minuto.
 * Ejecutar: npm test __tests__/airtable-ritmo
 */
import { RITMO, conRitmo, crearTurnos, esAirtable, generacionEscrituras, instalarRitmoAirtable, leerRitmo } from "../airtable-ritmo";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// Reloj de mentira: dormir avanza el tiempo sin esperar de verdad.
function reloj() {
  let t = 0;
  return { ahora: () => t, dormir: async (ms: number) => { t += ms; }, avanzar: (ms: number) => { t += ms; }, get t() { return t; } };
}
const ok = () => new Response("{}", { status: 200 });
const URL_AT = "https://api.airtable.com/v0/appX/Shipping%20Items?filterByFormula=%7BCliente%7D%3D%27Juan%27";

async function main() {
  assert(esAirtable("https://api.airtable.com/v0/app/T") && !esAirtable("https://api.anthropic.com/v1/messages") && !esAirtable("https://content.airtable.com/x"),
    "solo se toca lo que va a api.airtable.com");

  // ── Valores por defecto e interruptor ───────────────────────────────────
  assert(RITMO.porSegundo === 8 && RITMO.esperas.join(",") === "1500,4000,30000", "por defecto: fila de 8/s y reintentos a los 1,5 s, 4 s y 30 s");
  {
    const a = leerRitmo(undefined), b = leerRitmo("0"), c = leerRitmo("4"), d = leerRitmo("abc"), e = leerRitmo("50");
    assert(a.fila && a.porSegundo === 8 && !b.fila && c.fila && c.porSegundo === 4 && d.porSegundo === 8 && !!d.aviso && e.porSegundo === 8 && !!e.aviso,
      "AIRTABLE_RITMO: sin variable 8/s, 0 = sin fila, 4 = como el 23-nov, valores raros -> 8/s con aviso");
  }

  // ── Sin fila (AIRTABLE_RITMO=0) ─────────────────────────────────────────
  {
    const r = reloj();
    const inicios: number[] = [];
    const falso = (async () => { inicios.push(r.t); return ok(); }) as unknown as typeof fetch;
    const f = conRitmo(falso, { ...RITMO, fila: false }, r, () => {});
    await Promise.all(Array.from({ length: 12 }, () => f("https://api.airtable.com/v0/app/T")));
    assert(inicios.length === 12 && inicios.every((t) => t === 0), "sin fila: 12 llamadas a la vez salen todas enseguida (nadie espera a nadie)");
  }

  {
    // El incidente en miniatura: 30 cargas de «Por comprar» (101 llamadas c/u) en la misma instancia.
    const medir = async (fila: boolean, porSegundo: number) => {
      const r = reloj();
      const falso = (async () => ok()) as unknown as typeof fetch;
      const f = conRitmo(falso, { ...RITMO, fila, porSegundo, rafaga: porSegundo }, r, () => {});
      await Promise.all(Array.from({ length: 30 }, async () => { for (let i = 0; i < 101; i++) await f("https://api.airtable.com/v0/app/T"); }));
      return r.t;
    };
    const conFila4 = await medir(true, 4);
    const conFila8 = await medir(true, 8);
    const sinFila = await medir(false, 8);
    assert(conFila4 >= 700_000, `fila de 4/s (23-nov): 30 cargas de 101 llamadas en una instancia esperan más de 11 minutos (fue ${Math.round(conFila4 / 1000)} s)`);
    assert(conFila8 <= conFila4 / 2 + 1000, `fila de 8/s: la mitad (fue ${Math.round(conFila8 / 1000)} s); lo que evita la cola larga es compartir la lectura (compartir-lectura.test)`);
    assert(sinFila === 0, "sin fila, esas mismas cargas no esperan en ninguna fila");
  }

  {
    const r = reloj();
    let llamadas = 0;
    const falso = (async () => { llamadas++; return new Response("{}", { status: llamadas < 3 ? 429 : 200 }); }) as unknown as typeof fetch;
    const f = conRitmo(falso, { ...RITMO, fila: false }, r, () => {});
    const res = await f("https://api.airtable.com/v0/app/T");
    assert(res.status === 200 && llamadas === 3 && r.t === 5500, "ante un 429 espera y reintenta (1,5 s y 4 s) hasta que pasa");
  }

  {
    const r = reloj();
    let llamadas = 0;
    const avisos: string[] = [];
    const falso = (async () => { llamadas++; return new Response("{}", { status: 429 }); }) as unknown as typeof fetch;
    const f = conRitmo(falso, { ...RITMO, fila: false }, r, (l) => avisos.push(l));
    const res = await f(URL_AT);
    assert(res.status === 429 && llamadas === 4 && r.t === 35500, "el tercer reintento espera 30 s (lo que pide Airtable) y después devuelve el 429");
    assert(avisos.length === 1 && avisos[0].includes("3 reintento(s)") && avisos[0].includes("GET /v0/appX/Shipping Items") && !avisos[0].includes("Juan") && !avisos[0].includes("filterByFormula"),
      "el aviso del 429 dice método y tabla, nunca la consulta (puede llevar datos de clientes)");
  }

  {
    const r = reloj();
    let llamadas = 0;
    const falso = (async () => { llamadas++; return new Response("{}", { status: 429 }); }) as unknown as typeof fetch;
    const f = conRitmo(falso, { ...RITMO, fila: false }, r, () => {});
    await f(new Request("https://api.airtable.com/v0/app/T", { method: "POST", body: "{}" }));
    assert(llamadas === 1 && r.t === 0, "un Request con cuerpo no se repite (no se puede volver a leer)");
  }

  {
    const r = reloj();
    let llamadas = 0;
    const falso = (async () => { llamadas++; return new Response("{}", { status: 429 }); }) as unknown as typeof fetch;
    const f = conRitmo(falso, { ...RITMO, fila: true, porSegundo: 1, rafaga: 1 }, r, () => {});
    await f("https://api.anthropic.com/v1/messages");
    await f("https://api.anthropic.com/v1/messages");
    assert(llamadas === 2 && r.t === 0, "lo que no es Airtable pasa directo, sin esperar ni reintentar");
  }

  // ── Escrituras: cuenta para compartir-lectura ────────────────────────────
  {
    const falso = (async () => ok()) as unknown as typeof fetch;
    const f = conRitmo(falso, { ...RITMO, fila: false }, reloj(), () => {});
    const g0 = generacionEscrituras();
    await f("https://api.airtable.com/v0/app/T");
    await f("https://api.airtable.com/v0/app/T/listRecords", { method: "POST", body: "{}" });
    const g1 = generacionEscrituras();
    await f("https://api.airtable.com/v0/app/T", { method: "PATCH", body: "{}" });
    await f("https://api.airtable.com/v0/app/T", { method: "POST", body: "{}" });
    assert(g1 === g0 && generacionEscrituras() === g0 + 2, "leer (GET o listRecords) no cuenta como escritura; PATCH y POST sí");
  }

  // ── Resumen por minuto ───────────────────────────────────────────────────
  {
    const r = reloj();
    const avisos: string[] = [];
    let n = 0;
    const falso = (async () => { n++; return new Response("{}", { status: n === 2 ? 429 : 200 }); }) as unknown as typeof fetch;
    const f = conRitmo(falso, { ...RITMO, fila: false }, r, (l) => avisos.push(l));
    await f("https://api.airtable.com/v0/app/T");
    await f("https://api.airtable.com/v0/app/T");
    assert(avisos.length === 0, "no anota nada antes del minuto");
    r.avanzar(60_000);
    await f("https://api.airtable.com/v0/app/T");
    assert(avisos.length === 1 && /4 llamadas · 1 respuestas 429 · 1 reintentos · 0 sin éxito/.test(avisos[0]) && avisos[0].includes("(sin fila)"),
      `al pasar el minuto anota una línea con llamadas, 429 y reintentos (${avisos[0] ?? "nada"})`);
  }

  // ── Con fila ─────────────────────────────────────────────────────────────
  {
    const r = reloj();
    const t0 = crearTurnos({ porSegundo: 4, rafaga: 4 }, r);
    for (let i = 0; i < 12; i++) await t0();
    assert(r.t >= 1900 && r.t <= 2100, `con fila: 12 llamadas = 4 seguidas y luego 4 por segundo (≈2 s; fue ${r.t} ms)`);
  }

  {
    const r = reloj();
    const inicios: number[] = [];
    const falso = (async () => { inicios.push(r.t); return ok(); }) as unknown as typeof fetch;
    const f = conRitmo(falso, { ...RITMO, fila: true, esperas: [] }, r, () => {});
    // En serie: el reloj de mentira no sirve para esperas simultáneas.
    for (let i = 0; i < 30; i++) await f("https://api.airtable.com/v0/app/T");
    const maximo = Math.max(...inicios.map((desde) => inicios.filter((t) => t >= desde && t < desde + 1000).length));
    assert(maximo === 8 && r.t >= 2700, `fila de 8/s: ninguna ventana de un segundo supera 8 llamadas (máximo: ${maximo}; 30 llamadas en ${r.t} ms)`);
  }

  // ── Instalación ──────────────────────────────────────────────────────────
  {
    const original = globalThis.fetch;
    const logs: string[] = [];
    const log = console.log;
    console.log = (l: string) => { logs.push(String(l)); };
    try {
      globalThis.fetch = (async () => ok()) as unknown as typeof fetch;
      instalarRitmoAirtable({});
      const instalado = globalThis.fetch as typeof fetch & { conRitmoAirtable?: boolean };
      instalarRitmoAirtable({});
      globalThis.fetch = (async () => ok()) as unknown as typeof fetch;
      instalarRitmoAirtable({ AIRTABLE_RITMO: "0" });
      console.log = log;
      assert(instalado.conRitmoAirtable === true && logs.length === 2, "se instala una sola vez por instancia");
      assert(logs[0].includes("fila de 8 llamadas/s") && logs[1].includes("sin fila"), "sin la variable: fila de 8/s; con AIRTABLE_RITMO=0: sin fila");
    } finally {
      console.log = log;
      globalThis.fetch = original;
    }
  }

  const fs = await import("node:fs");
  const fuente = fs.readFileSync("instrumentation.ts", "utf8");
  assert(fuente.includes("instalarRitmoAirtable()") && fuente.includes('NEXT_RUNTIME !== "nodejs"'), "instrumentation.ts lo instala al arrancar el servidor");
  assert(!/\[[^\]\n\s]*:[^\]\n\s]*\]/.test(fs.readFileSync("lib/airtable-ritmo.ts", "utf8")), "lib/airtable-ritmo.ts sin corchetes con «:» (Tailwind)");

  if (fallos > 0) { console.error(`\n${fallos} fallo(s).`); process.exit(1); }
  console.log("\nTodo bien.");
}
void main();
