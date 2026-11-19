import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mock } from "node:test";
import { obtenerFirmaActiva, _resetCacheFirmaActiva } from "../firma/resolverFirmaActiva";
import { assertPruebaConRedPermitida, SALIDA_PRUEBA_OMITIDA } from "./_guardaRed";
import { documentosFijos, firmarCongelado, verificarFirmaNativa, validarXmlFirmado, sha256 } from "./_firmaHuella";

const ARCHIVO = path.join(os.homedir(), "Proyectos/respaldos-staffsupergeek",
  "auditoria-npm-2026-11/huella-firma-real.json");

/** El resolvedor materializa normalmente en /tmp. Aquí se intercepta en memoria.
 * Además se desactiva su fallback ANTES de llamarlo: nunca abre el .p12 local. */
async function firmarSoloConAirtable(xmlSinFirmar: string): Promise<string | null> {
  const variables = ["SRI_FIRMA_PATH", "SRI_FIRMA_P12_BASE64", "SRI_FIRMA_PASSWORD"] as const;
  const anteriores = variables.map(k => process.env[k]);
  for (const k of variables) delete process.env[k];
  const memoria = new Map<string, Buffer>();
  const lecturaOriginal = fs.readFileSync;
  const existeOriginal = fs.existsSync;
  const esP12 = (p: unknown) => /\.p12$/i.test(String(p));
  const mocks = [
    mock.method(fs, "existsSync", (p: fs.PathLike) => esP12(p) ? memoria.has(String(p)) : existeOriginal(p)),
    mock.method(fs, "writeFileSync", (p: fs.PathOrFileDescriptor, datos: string | NodeJS.ArrayBufferView) => {
      assert.match(String(p), /[/\\]sri-firma-[0-9a-f]{16}\.p12$/, "Solo materialización virtual de Airtable");
      assert(Buffer.isBuffer(datos), "El certificado debe llegar como Buffer");
      memoria.set(String(p), Buffer.from(datos));
    }),
    mock.method(fs, "readFileSync", ((p: fs.PathOrFileDescriptor, opciones?: unknown) => {
      if (esP12(p)) {
        const contenido = memoria.get(String(p));
        assert(contenido && opciones === undefined, "Bloqueada la lectura de cualquier .p12 del disco");
        return Buffer.from(contenido);
      }
      return lecturaOriginal(p, opciones as BufferEncoding);
    }) as typeof fs.readFileSync),
    // El resolvedor registra errores de fallback. Nunca propagar objetos de
    // errores de red/descifrado que puedan incluir datos del registro remoto.
    mock.method(console, "error", () => {}),
  ];
  _resetCacheFirmaActiva();
  try {
    let firma;
    try {
      firma = await obtenerFirmaActiva();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("No hay ninguna firma electrónica configurada.")) return null;
      throw error;
    }
    if (firma.origen !== "airtable") return null;
    return await firmarCongelado(xmlSinFirmar, firma.p12Path, firma.password, "factura");
  } finally {
    _resetCacheFirmaActiva();
    for (const contenido of memoria.values()) contenido.fill(0);
    memoria.clear();
    for (const m of mocks.reverse()) m.mock.restore();
    variables.forEach((k, i) => {
      if (anteriores[i] === undefined) delete process.env[k];
      else process.env[k] = anteriores[i];
    });
  }
}

let etapa = "cargar el entorno";
(async () => {
  if (fs.existsSync(path.join(process.cwd(), ".env.local"))) process.loadEnvFile(".env.local");
  assertPruebaConRedPermitida("firma.huellaReal");
  etapa = "resolver y firmar con Airtable";
  const xml = await firmarSoloConAirtable(documentosFijos().factura);
  if (xml === null) {
    console.log("Omitida: el resolvedor no devolvió la firma activa de Airtable; el fallback local está bloqueado y no se usó.");
    process.exitCode = SALIDA_PRUEBA_OMITIDA;
    return;
  }
  etapa = "verificar SignatureValue con crypto nativo";
  verificarFirmaNativa(xml);
  etapa = "validar el XML contra el XSD";
  validarXmlFirmado(xml, "factura");
  const huella = sha256(xml);
  etapa = "guardar o comparar la huella";
  if (process.env.HUELLA_GUARDAR === "1") {
    // La ruta es fija, fuera del repo, y solo se persiste el resumen SHA-256.
    fs.mkdirSync(path.dirname(ARCHIVO), { recursive: true, mode: 0o700 });
    fs.writeFileSync(ARCHIVO, JSON.stringify({ version: 1, sha256: huella }, null, 2) + "\n", { mode: 0o600 });
  } else {
    assert(fs.existsSync(ARCHIVO), "Falta la huella real; primero captúrala con HUELLA_GUARDAR=1");
    const guardada = JSON.parse(fs.readFileSync(ARCHIVO, "utf8")) as { version?: number; sha256?: string };
    assert(guardada.version === 1 && /^[0-9a-f]{64}$/.test(guardada.sha256 ?? ""), "Formato de huella real inválido");
    assert.equal(huella, guardada.sha256, "Cambió el SHA-256 del XML firmado con Airtable; revisar antes de aceptar una nueva huella");
  }
  console.log(`Firma activa de Airtable: ${huella} · crypto nativo y XSD válidos`);
})().catch(() => {
  console.error(`Falló firma.huellaReal al ${etapa}. No se muestran certificados, claves ni XML.`);
  process.exitCode = 1;
});
