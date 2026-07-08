/**
 * Test — resolverArchivoFactura() (fix/ride-fallback).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/resolverArchivo.test.ts
 *
 * Cubre los tres casos del "visor": disco, fallback a Airtable, y ninguno
 * de los dos. global.fetch se reemplaza por un doble simple (sin librería
 * de mocking); nunca toca Airtable ni el SRI reales.
 *
 * Lanza en la primera falla y sale con código distinto de 0.
 */

import fs   from "fs";
import path from "path";

import { resolverArchivoFactura } from "../almacenamiento/resolverArchivo";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

// Clave real usada como fixture en el resto de la suite (008/07/2026 → aaaa=2026, mm=07)
const CLAVE = "0807202601100371027200110010020000006671598078819";
const AAAA  = "2026";
const MM    = "07";

const fetchOriginal = global.fetch;

function fetchDoble(respuestaAirtable: { records: unknown[] }, bytesAdjunto?: Buffer) {
  return (url: string | URL) => {
    const urlStr = String(url);
    if (urlStr.startsWith("https://api.airtable.com/")) {
      return Promise.resolve({ ok: true, json: async () => respuestaAirtable } as Response);
    }
    if (urlStr === "https://fake-airtable-cdn.test/adjunto") {
      if (!bytesAdjunto) return Promise.resolve({ ok: false } as Response);
      return Promise.resolve({
        ok: true,
        arrayBuffer: async () => bytesAdjunto.buffer.slice(bytesAdjunto.byteOffset, bytesAdjunto.byteOffset + bytesAdjunto.byteLength),
      } as Response);
    }
    throw new Error(`fetch inesperado en el test hacia: ${urlStr}`);
  };
}

(async () => {
  process.env.AIRTABLE_API_KEY = "fake-token-para-test";
  process.env.AIRTABLE_BASE_ID = "appFAKEBASE0001";

  // ─── 1. Disco: el archivo está en la ruta esperada ─────────────────────────
  {
    const dirRelativo = `.tmp-test-resolver-disco-${Date.now()}`;
    process.env.FACTURAS_DIR = dirRelativo;
    const dirCompleto = path.join(process.cwd(), dirRelativo, AAAA, MM);
    fs.mkdirSync(dirCompleto, { recursive: true });
    fs.writeFileSync(path.join(dirCompleto, `${CLAVE}.pdf`), "contenido-pdf-en-disco");

    const resultado = await resolverArchivoFactura(CLAVE, "ride", { escanearAnio: true });
    assert(resultado?.origen === "disco", "Con el archivo en disco, debe resolver desde disco (no llamar a Airtable)");
    assert(resultado?.buffer.toString("utf8") === "contenido-pdf-en-disco", "El contenido debe ser el del disco");

    fs.rmSync(path.join(process.cwd(), dirRelativo), { recursive: true, force: true });
    delete process.env.FACTURAS_DIR;
  }

  // ─── 2. Sin disco, con fallback a Airtable ──────────────────────────────────
  {
    const dirRelativo = `.tmp-test-resolver-vacio-${Date.now()}`;
    process.env.FACTURAS_DIR = dirRelativo; // existe pero está vacío → miss en disco

    global.fetch = fetchDoble(
      {
        records: [{
          id: "recTEST0002",
          fields: {
            "RIDE PDF": [{ url: "https://fake-airtable-cdn.test/adjunto", filename: `${CLAVE}.pdf` }],
          },
        }],
      },
      Buffer.from("contenido-pdf-desde-airtable")
    ) as unknown as typeof fetch;

    let resultado;
    try {
      resultado = await resolverArchivoFactura(CLAVE, "ride", { escanearAnio: true });
    } finally {
      global.fetch = fetchOriginal;
    }

    assert(resultado?.origen === "airtable", "Sin el archivo en disco, debe caer al fallback de Airtable");
    assert(resultado?.buffer.toString("utf8") === "contenido-pdf-desde-airtable", "El contenido debe ser el del adjunto de Airtable");
    assert(resultado?.filename === `${CLAVE}.pdf`, "El filename debe venir del adjunto de Airtable");

    delete process.env.FACTURAS_DIR;
  }

  // ─── 3. Sin disco y sin adjunto en Airtable: null ───────────────────────────
  {
    const dirRelativo = `.tmp-test-resolver-ninguno-${Date.now()}`;
    process.env.FACTURAS_DIR = dirRelativo;

    global.fetch = fetchDoble({ records: [] }) as unknown as typeof fetch;

    let resultado;
    try {
      resultado = await resolverArchivoFactura(CLAVE, "ride", { escanearAnio: true });
    } finally {
      global.fetch = fetchOriginal;
    }

    assert(resultado === null, "Sin disco y sin registro en Airtable, debe devolver null (no lanzar)");

    delete process.env.FACTURAS_DIR;
  }

  // ─── 4. Sin disco, registro en Airtable pero sin adjunto: null ──────────────
  {
    const dirRelativo = `.tmp-test-resolver-sinadjunto-${Date.now()}`;
    process.env.FACTURAS_DIR = dirRelativo;

    global.fetch = fetchDoble({
      records: [{ id: "recTEST0003", fields: {} }], // existe el registro, sin campo "RIDE PDF"
    }) as unknown as typeof fetch;

    let resultado;
    try {
      resultado = await resolverArchivoFactura(CLAVE, "ride", { escanearAnio: true });
    } finally {
      global.fetch = fetchOriginal;
    }

    assert(resultado === null, "Registro en Airtable sin adjunto también debe devolver null");

    delete process.env.FACTURAS_DIR;
  }

  delete process.env.AIRTABLE_API_KEY;
  delete process.env.AIRTABLE_BASE_ID;

  if (fallos > 0) {
    console.error(`\n❌ resolverArchivo.test.ts — ${fallos} aserción(es) fallida(s)`);
    process.exit(1);
  }
  console.log("\n✅ resolverArchivo.test.ts — todos los asserts pasaron");
})();
