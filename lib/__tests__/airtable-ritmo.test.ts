/**
 * Test del ritmo de llamadas a Airtable (429 «Rate limit exceeded» en la lista de órdenes, 23-nov).
 * Ejecutar: npm test __tests__/airtable-ritmo
 */
import { conRitmo, crearTurnos, esAirtable } from "../airtable-ritmo";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// Reloj de mentira: dormir avanza el tiempo sin esperar de verdad.
function reloj() {
  let t = 0;
  return { ahora: () => t, dormir: async (ms: number) => { t += ms; }, get t() { return t; } };
}

async function main() {
  assert(esAirtable("https://api.airtable.com/v0/app/T") && !esAirtable("https://api.anthropic.com/v1/messages") && !esAirtable("https://content.airtable.com/x"),
    "solo se ordena lo que va a api.airtable.com");

  {
    const r = reloj();
    const turno = crearTurnos({ porSegundo: 4, rafaga: 4 }, r);
    for (let i = 0; i < 12; i++) await turno();
    assert(r.t >= 1900 && r.t <= 2100, `12 llamadas: 4 seguidas y luego 4 por segundo (≈2 s; fue ${r.t} ms)`);
  }

  {
    const r = reloj();
    const inicios: number[] = [];
    const falso = (async () => {
      inicios.push(r.t);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const f = conRitmo(falso, { porSegundo: 4, rafaga: 4, esperas: [] }, r);
    for (let i = 0; i < 12; i++) await f("https://api.airtable.com/v0/app/T");
    const maximo = Math.max(...inicios.map((desde) => inicios.filter((t) => t >= desde && t < desde + 1000).length));
    assert(maximo <= 4, `ninguna ventana de un segundo supera 4 llamadas (máximo: ${maximo})`);
  }

  {
    const r = reloj();
    let llamadas = 0;
    const falso = (async () => { llamadas++; return new Response("{}", { status: llamadas < 3 ? 429 : 200 }); }) as unknown as typeof fetch;
    const f = conRitmo(falso, { porSegundo: 100, rafaga: 100, esperas: [1500, 4000] }, r);
    const res = await f("https://api.airtable.com/v0/app/T");
    assert(res.status === 200 && llamadas === 3 && r.t >= 5500, "ante un 429 espera y reintenta (1,5 s y 4 s) hasta que pasa");
  }

  {
    const r = reloj();
    let llamadas = 0;
    const falso = (async () => { llamadas++; return new Response("{}", { status: 429 }); }) as unknown as typeof fetch;
    const f = conRitmo(falso, { porSegundo: 100, rafaga: 100, esperas: [1500, 4000] }, r);
    const res = await f("https://api.airtable.com/v0/app/T");
    assert(res.status === 429 && llamadas === 3, "no reintenta para siempre: después de 2 reintentos devuelve el 429");
  }

  {
    const r = reloj();
    let llamadas = 0;
    const falso = (async () => { llamadas++; return new Response("{}", { status: 429 }); }) as unknown as typeof fetch;
    const f = conRitmo(falso, { porSegundo: 1, rafaga: 1, esperas: [1500] }, r);
    await f("https://api.anthropic.com/v1/messages");
    await f("https://api.anthropic.com/v1/messages");
    assert(llamadas === 2 && r.t === 0, "lo que no es Airtable pasa directo, sin esperar ni reintentar");
  }

  const fuente = (await import("node:fs")).readFileSync("instrumentation.ts", "utf8");
  assert(fuente.includes("instalarRitmoAirtable()") && fuente.includes('NEXT_RUNTIME !== "nodejs"'), "instrumentation.ts lo instala al arrancar el servidor");
  assert(!/\[[^\]\n\s]*:[^\]\n\s]*\]/.test((await import("node:fs")).readFileSync("lib/airtable-ritmo.ts", "utf8")), "lib/airtable-ritmo.ts sin corchetes con «:» (Tailwind)");

  if (fallos > 0) { console.error(`\n${fallos} fallo(s).`); process.exit(1); }
  console.log("\nTodo bien.");
}
void main();
