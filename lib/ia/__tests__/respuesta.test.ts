/**
 * Test — motor único de IA, parte pura (punto 11B · 21-nov-2026).
 * Ejecutar: npm test respuesta
 */
import fs from "fs";
import path from "path";
import {
  DOMINIOS_TECNICO, contarBusquedas, dominioDe, extraerFuentes, extraerJson, extraerTexto, listaDe,
  mensajeErrorIA, textoDe, type BloqueRespuesta,
} from "../respuesta";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// ── Texto y fuentes de una respuesta con búsqueda ───────────────────────────
const bloques: BloqueRespuesta[] = [
  { type: "text", text: "Voy a buscar. " },
  { type: "server_tool_use", name: "web_search", input: { query: "elitebook 840 g3 keyboard not working" } },
  {
    type: "web_search_tool_result",
    content: [
      { type: "web_search_result", url: "https://support.hp.com/a", title: "HP Support A" },
      { type: "web_search_result", url: "https://www.ifixit.com/b", title: "iFixit B" },
    ],
  },
  { type: "text", text: '{"respuesta": "Desactiva ', citations: [{ type: "web_search_result_location", url: "https://support.hp.com/a", title: "HP Support A" }] },
  { type: "text", text: 'el inicio rápido"}', citations: [{ type: "web_search_result_location", url: "https://support.hp.com/a", title: "HP Support A" }] },
];
assert(extraerTexto(bloques) === 'Voy a buscar. {"respuesta": "Desactiva el inicio rápido"}', "une el texto partido por las citas");
const f1 = extraerFuentes(bloques);
assert(f1.length === 1 && f1[0].url === "https://support.hp.com/a", "usa primero las fuentes CITADAS, sin repetir");
const f2 = extraerFuentes(bloques.filter((b) => !b.citations));
assert(f2.length === 2 && f2[1].titulo === "iFixit B", "sin citas, muestra los resultados de la búsqueda");
assert(extraerFuentes(bloques.filter((b) => !b.citations), 1).length === 1, "respeta el máximo de fuentes");
assert(contarBusquedas(bloques) === 1, "cuenta las búsquedas hechas");
assert(dominioDe("https://www.ifixit.com/Guide/x") === "ifixit.com", "dominio corto sin www");

// ── El JSON que pedimos ─────────────────────────────────────────────────────
assert(extraerJson('{"a": 1}')?.a === 1, "JSON limpio");
assert(extraerJson(extraerTexto(bloques))?.respuesta === "Desactiva el inicio rápido", "JSON después de un texto previo");
assert(extraerJson('```json\n{"mensaje": "Hola {cliente}"}\n```')?.mensaje === "Hola {cliente}", "JSON en bloque de código, con llaves dentro de un texto");
assert(extraerJson('{"a": 1} y luego {"b": 2}')?.b === 2, "se queda con el último objeto válido");
assert(extraerJson("sin json aquí") === null, "null si no hay JSON");
assert(extraerJson('{"roto": ') === null, "null si el JSON está cortado");
assert(extraerJson('{"c": "comillas \\" y } dentro"}')?.c === 'comillas " y } dentro', "respeta comillas escapadas");

assert(textoDe("  hola \r\n mundo ") === "hola \n mundo", "texto limpio");
assert(textoDe(5) === "" && textoDe(null) === "", "lo que no es texto queda vacío");
assert(textoDe("x".repeat(20), 10).length === 10, "recorta lo muy largo");
assert(listaDe(["a", "", 3, " b "]).join("|") === "a|b", "lista sin vacíos ni lo que no es texto");

// ── Errores para el personal ────────────────────────────────────────────────
assert(mensajeErrorIA(401).includes("clave"), "401 → clave inválida");
assert(mensajeErrorIA(429).includes("ocupada"), "429 → ocupada");
assert(mensajeErrorIA(400, "Your credit balance is too low").includes("saldo"), "sin crédito → revisar Billing");
assert(mensajeErrorIA(500).includes("Intenta"), "otro error → intentar de nuevo");

// ── Sitios de confianza aprobados por el dueño (21-nov) ─────────────────────
assert(
  [...DOMINIOS_TECNICO].sort().join(",") === ["acer.com", "apple.com", "asus.com", "dell.com", "hp.com", "ifixit.com", "lenovo.com"].join(","),
  "el técnico experto busca solo en HP, Lenovo, Dell, Asus, Acer, Apple e iFixit",
);

// ── Un solo motor: nadie más llama a la API de Claude ───────────────────────
function archivos(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" || e.name === "__tests__" ? [] : archivos(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}
const llamanALaApi = [...archivos("lib"), ...archivos("app"), ...archivos("components")]
  .filter((p) => fs.readFileSync(p, "utf8").includes("api.anthropic.com"));
assert(llamanALaApi.length === 1 && llamanALaApi[0].replace(/\\/g, "/") === "lib/ia/claude.ts", "solo lib/ia/claude.ts habla con la API de Claude");
const sugerir = fs.readFileSync("lib/shipping-v2/ia-anuncios-servidor.ts", "utf8");
assert(sugerir.includes("llamarClaude("), "✨ Sugerir usa el motor único");
const motor = fs.readFileSync("lib/ia/claude.ts", "utf8");
assert(motor.includes("allowed_domains") && motor.includes("pause_turn"), "el motor limita los dominios y continúa una búsqueda en pausa");
assert(!/airtable/i.test(motor.replace(/Nunca escribe en Airtable/, "")), "el motor no toca Airtable");

if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo OK");
