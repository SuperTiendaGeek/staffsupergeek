/**
 * Test — respaldo en disco best-effort (fix/archivo-no-fatal).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/almacenamiento.respaldoDisco.test.ts
 *
 * Puro en la parte de intentarGuardarEnDisco() (solo filesystem, sin red).
 * Para persistirAutorizado() se reemplaza global.fetch por un doble simple
 * (sin librería de mocking) que capta el request y nunca toca Airtable ni
 * el SRI de verdad.
 *
 * Nota: directorioRespaldo() hace path.join(process.cwd(), FACTURAS_DIR, …) —
 * path.join NO resetea en un segundo argumento absoluto (a diferencia de
 * path.resolve), así que FACTURAS_DIR se usa aquí como ruta RELATIVA al
 * cwd del repo, igual que en el código real. Todo lo creado se limpia al
 * final de cada caso.
 *
 * Lanza en la primera falla y sale con código distinto de 0.
 */

import fs   from "fs";
import path from "path";

import { intentarGuardarEnDisco, persistirAutorizado } from "../almacenamiento/repositorio";
import type { DatosComprobanteOk } from "../almacenamiento/repositorio";

let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

const CLAVE = "0807202601100371027200110010020000006671598078819";
const FECHA = new Date(2026, 6, 8); // 08/07/2026

// ─── Parte 1: intentarGuardarEnDisco() — solo filesystem, sin red ────────────

// 1a. Éxito: sigue funcionando exactamente igual — el archivo queda escrito
{
  const dirRelativo = `.tmp-test-facturas-ok-${Date.now()}`;
  process.env.FACTURAS_DIR = dirRelativo;

  const resultado = intentarGuardarEnDisco(CLAVE, FECHA, "<factura/>");
  assert(resultado === undefined, "Guardado exitoso: no debe devolver mensajes de advertencia");

  const xmlPath = path.join(process.cwd(), dirRelativo, "2026", "07", `${CLAVE}.xml`);
  assert(fs.existsSync(xmlPath), "Guardado exitoso: el XML debe existir en disco");
  assert(fs.readFileSync(xmlPath, "utf8") === "<factura/>", "Guardado exitoso: el contenido debe ser exacto");

  fs.rmSync(path.join(process.cwd(), dirRelativo), { recursive: true, force: true });
  delete process.env.FACTURAS_DIR;
}

// 1b. Fallo: directorio no creable (bloqueado por un archivo regular en su
//     lugar — ENOTDIR, la misma familia de error que el ENOENT visto en
//     Vercel: la escritura es imposible sin importar el errno exacto).
{
  const nombreBloqueador = `.tmp-test-bloqueador-${Date.now()}`;
  fs.writeFileSync(path.join(process.cwd(), nombreBloqueador), "soy un archivo, no un directorio");
  process.env.FACTURAS_DIR = nombreBloqueador;

  let lanzo = false;
  let resultado: ReturnType<typeof intentarGuardarEnDisco>;
  try {
    resultado = intentarGuardarEnDisco(CLAVE, FECHA, "<factura/>");
  } catch {
    lanzo = true;
  }

  assert(!lanzo, "Directorio no escribible: intentarGuardarEnDisco NUNCA debe lanzar");
  assert(Array.isArray(resultado), "Directorio no escribible: debe devolver un array de mensajes");
  assert(resultado?.[0]?.identificador === "RESPALDO_DISCO", "El mensaje debe identificarse como RESPALDO_DISCO");
  assert(resultado?.[0]?.tipo === "ADVERTENCIA", "El tipo debe ser ADVERTENCIA, no ERROR (la factura sigue siendo válida)");
  assert(!!resultado?.[0]?.informacionAdicional, "Debe incluir el detalle del error original para diagnóstico");

  fs.unlinkSync(path.join(process.cwd(), nombreBloqueador));
  delete process.env.FACTURAS_DIR;
}

// ─── Parte 2: persistirAutorizado() — disco falla, Airtable "responde" bien ──
// (fetch reemplazado por un doble simple; nunca toca Airtable ni el SRI)

const capturas: { url: string; method: string; body: unknown }[] = [];
const fetchOriginal = global.fetch;

function fetchDoble(url: string | URL, init?: RequestInit) {
  const urlStr = String(url);
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  capturas.push({ url: urlStr, method: init?.method ?? "GET", body });

  if (urlStr.startsWith("https://content.airtable.com/")) {
    // Subida de adjunto (XML Autorizado) — éxito simulado, sin body relevante.
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
  }
  if (urlStr.startsWith("https://api.airtable.com/")) {
    // Creación del registro en "Facturas Electrónicas" — éxito simulado.
    return Promise.resolve({ ok: true, json: async () => ({ id: "recTEST0001" }) } as Response);
  }
  throw new Error(`fetch inesperado en el test hacia: ${urlStr}`);
}

async function correrConFetchDoble<T>(fn: () => Promise<T>): Promise<T> {
  global.fetch = fetchDoble as unknown as typeof fetch;
  try {
    return await fn();
  } finally {
    global.fetch = fetchOriginal;
  }
}

(async () => {
  process.env.AIRTABLE_API_KEY = "fake-token-para-test";
  process.env.AIRTABLE_BASE_ID = "appFAKEBASE0001";

  const nombreBloqueador = `.tmp-test-bloqueador-persistir-${Date.now()}`;
  fs.writeFileSync(path.join(process.cwd(), nombreBloqueador), "soy un archivo, no un directorio");
  process.env.FACTURAS_DIR = nombreBloqueador;

  const datos: DatosComprobanteOk = {
    claveAcceso:        CLAVE,
    numeroFactura:      "001-002-000000667",
    secuencial:         "000000667",
    numeroAutorizacion: CLAVE,
    fechaAutorizacion:  "2026-07-08T09:13:14-05:00",
    fechaEmision:       FECHA,
    ambiente:           "1",
    cliente:            { nombre: "CONSUMIDOR FINAL", identificacion: "9999999999999" },
    subtotal:           40,
    iva:                6,
    total:              46,
    xmlAutorizado:      "<factura/>",
    // sin ridePdf — evita necesitar un segundo endpoint de adjunto en el doble
  };

  let lanzo = false;
  let recordId = "";
  try {
    recordId = await correrConFetchDoble(() => persistirAutorizado(datos));
  } catch {
    lanzo = true;
  }

  assert(!lanzo, "persistirAutorizado con disco no escribible NUNCA debe lanzar");
  assert(recordId === "recTEST0001", "Debe devolver el recordId creado en Airtable con normalidad");

  const creacion = capturas.find((c) => c.url.startsWith("https://api.airtable.com/") && c.method === "POST");
  assert(!!creacion, "Debe haberse llamado a crear el registro en Airtable");

  const fields = (creacion?.body as { fields?: Record<string, unknown> })?.fields ?? {};
  assert(fields["Estado"] === "AUTORIZADO", "El registro debe quedar como AUTORIZADO (no cambia por el fallo de disco)");
  assert(
    typeof fields["Mensajes SRI"] === "string" &&
      (fields["Mensajes SRI"] as string).includes("RESPALDO_DISCO"),
    "El campo Mensajes SRI debe traer la marca del respaldo fallido"
  );

  fs.unlinkSync(path.join(process.cwd(), nombreBloqueador));
  delete process.env.FACTURAS_DIR;
  delete process.env.AIRTABLE_API_KEY;
  delete process.env.AIRTABLE_BASE_ID;

  if (fallos > 0) {
    console.error(`\n❌ almacenamiento.respaldoDisco.test.ts — ${fallos} aserción(es) fallida(s)`);
    process.exit(1);
  }
  console.log("\n✅ almacenamiento.respaldoDisco.test.ts — todos los asserts pasaron");
})();
