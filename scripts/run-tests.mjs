#!/usr/bin/env node
/**
 * Corredor de las pruebas del proyecto.
 *
 * Las pruebas son scripts sueltos con assert() (sin framework) que se ejecutan
 * con tsx. Todas necesitan NODE_OPTIONS="--conditions react-server": sin esa
 * bandera, cualquier módulo que importe lib/shipping-v2/airtable.ts revienta en
 * el import "server-only". Ese detalle vivía solo en la memoria de quien lo
 * descubrió, y por eso seis suites parecían "rotas" cuando en realidad estaban
 * mal invocadas. Este script existe para que nadie tenga que recordarlo.
 *
 *   npm test                      -> todas las suites (menos las .live)
 *   npm test pagos                -> solo las suites cuya ruta contenga "pagos"
 *   npm test -- --live            -> incluye las .live.test.ts (necesitan red)
 *   npm test -- --serial          -> una a la vez (útil para depurar)
 *   npm test -- --jobs=8          -> cambia cuántas corren en paralelo
 *   PRUEBAS_CON_RED=1 npm test    -> también las que hablan con Airtable/SRI
 *
 * Dos excepciones que el corredor resuelve solo, para que nadie las descubra
 * a los golpes:
 *   - Las pruebas de facturación que tocan la base real salen con código 78
 *     (ver lib/facturacion/__tests__/_guardaRed.ts). Se cuentan como OMITIDAS,
 *     no como fallos.
 *   - Un puñado de suites importa componentes de cliente y NO soporta la
 *     bandera. Si fallan por eso, se reintentan sin ella automáticamente.
 *
 * Cada suite corre en su propio proceso, así que no se pisan entre ellas
 * aunque varias reemplacen global.fetch.
 */
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CARPETAS = ["lib", "app", "scripts", "components", "types"];
const IGNORAR = new Set(["node_modules", ".next", ".git", ".vercel", "dist", "build"]);

const argv = process.argv.slice(2);
const incluirLive = argv.includes("--live") || process.env.PRUEBAS_CON_RED === "1";
const serial = argv.includes("--serial");
const jobsArg = argv.find((a) => a.startsWith("--jobs="));
const filtros = argv.filter((a) => !a.startsWith("--"));
const jobs = serial ? 1 : Math.max(1, Number(jobsArg?.split("=")[1]) || Math.min(6, os.cpus().length || 4));

async function buscarSuites(dir) {
  let entradas;
  try {
    entradas = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const encontradas = [];
  for (const entrada of entradas) {
    if (IGNORAR.has(entrada.name)) continue;
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      encontradas.push(...(await buscarSuites(completo)));
    } else if (/\.test\.tsx?$/.test(entrada.name)) {
      encontradas.push(path.relative(RAIZ, completo));
    }
  }
  return encontradas;
}

// Código con el que _guardaRed.ts marca "omitida por falta de PRUEBAS_CON_RED".
const SALIDA_OMITIDA = 78;

// Señal de que la suite NO puede correr con --conditions react-server: importa
// componentes de cliente y React resuelve a su build de servidor, donde
// createContext no existe. Son pocas, así que en vez de mantener una lista a
// mano el corredor reintenta sin la bandera cuando ve este error.
const NECESITA_REACT_CLIENTE = /createContext is not a function|react-server.*is not a function/;

function correr(suite, { conBandera = true } = {}) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    if (conBandera) {
      env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ""} --conditions react-server`.trim();
    }
    const hijo = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["tsx", suite],
      { cwd: RAIZ, env }
    );
    let salida = "";
    hijo.stdout.on("data", (d) => { salida += d; });
    hijo.stderr.on("data", (d) => { salida += d; });
    hijo.on("error", (error) => resolve({ suite, codigo: 1, salida: `${salida}\n${error.message}` }));
    hijo.on("close", (codigo) => resolve({ suite, codigo: codigo ?? 1, salida, conBandera }));
  });
}

async function correrConReintento(suite) {
  const primero = await correr(suite, { conBandera: true });
  if (primero.codigo === 0 || primero.codigo === SALIDA_OMITIDA) return primero;
  if (!NECESITA_REACT_CLIENTE.test(primero.salida)) return primero;
  return correr(suite, { conBandera: false });
}

const todas = (await Promise.all(CARPETAS.map((c) => buscarSuites(path.join(RAIZ, c)))))
  .flat()
  .sort();

const suites = todas
  .filter((s) => incluirLive || !s.includes(".live."))
  .filter((s) => filtros.length === 0 || filtros.some((f) => s.toLowerCase().includes(f.toLowerCase())));

// Solo cuenta las .live que el filtro habría alcanzado; si no, `npm test pagos`
// avisaba de suites que ni siquiera estaba buscando.
const omitidasLive = incluirLive
  ? 0
  : todas.filter(
      (s) => s.includes(".live.") &&
        (filtros.length === 0 || filtros.some((f) => s.toLowerCase().includes(f.toLowerCase())))
    ).length;

if (suites.length === 0) {
  console.error(filtros.length ? `Ninguna suite coincide con: ${filtros.join(", ")}` : "No se encontraron suites.");
  process.exit(1);
}

console.log(`Corriendo ${suites.length} suite(s) con ${jobs} proceso(s) en paralelo.`);
if (omitidasLive) console.log(`(${omitidasLive} suite(s) .live omitidas; usa --live para incluirlas)`);
console.log("");

const inicio = Date.now();
const fallidas = [];
const omitidas = [];
let hechas = 0;
const pendientes = [...suites];

async function trabajador() {
  for (;;) {
    const suite = pendientes.shift();
    if (!suite) return;
    const resultado = await correrConReintento(suite);
    hechas++;
    const marca = resultado.codigo === 0 ? "✓" : resultado.codigo === SALIDA_OMITIDA ? "–" : "✗";
    const nota = resultado.codigo === SALIDA_OMITIDA
      ? "  (omitida: necesita PRUEBAS_CON_RED=1)"
      : resultado.codigo === 0 && resultado.conBandera === false
        ? "  (sin --conditions react-server)"
        : "";
    console.log(`${marca} [${hechas}/${suites.length}] ${suite}${nota}`);
    if (resultado.codigo === SALIDA_OMITIDA) omitidas.push(resultado);
    else if (resultado.codigo !== 0) fallidas.push(resultado);
    else if (suites.length === 1) console.log(resultado.salida);
  }
}

await Promise.all(Array.from({ length: Math.min(jobs, suites.length) }, trabajador));

const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
console.log("");

const resumenOmitidas = omitidas.length ? `, ${omitidas.length} omitida(s) por red` : "";

if (fallidas.length === 0) {
  console.log(`Todas las suites pasaron (${suites.length - omitidas.length} en ${segundos}s${resumenOmitidas}).`);
  process.exit(0);
}

for (const fallo of fallidas) {
  console.log("".padEnd(72, "─"));
  console.log(`FALLÓ: ${fallo.suite}`);
  console.log("".padEnd(72, "─"));
  console.log(fallo.salida.trimEnd());
  console.log("");
}

console.error(`${fallidas.length} de ${suites.length} suite(s) fallaron (${segundos}s${resumenOmitidas}):`);
for (const fallo of fallidas) console.error(`  - ${fallo.suite}`);
process.exit(1);
