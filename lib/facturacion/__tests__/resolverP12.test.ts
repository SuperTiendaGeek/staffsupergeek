/**
 * Test — resolverRutaP12() (feat/firma-runtime).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/resolverP12.test.ts
 *
 * Puro, sin red y sin depender de ningún .p12 real: genera un certificado
 * autofirmado de juguete con node-forge dentro del propio test, lo empaqueta
 * en PKCS#12 y lo pasa como SRI_FIRMA_P12_BASE64 simulado.
 *
 * Lanza en la primera falla y sale con código distinto de 0.
 */

import fs   from "fs";
import os   from "os";
import forge from "node-forge";

import { resolverRutaP12, _resetCacheParaTests } from "../firma/resolverP12";

let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

// ─── Generar un .p12 de juguete (autofirmado, no el certificado real) ────────

const PASSWORD = "clave-de-juguete-123";

function generarP12Base64(password: string): string {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

  const attrs = [
    { name: "commonName", value: "Test Emisor Facturación" },
    { name: "countryName", value: "EC" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, cert, password);
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  return forge.util.encode64(p12Der);
}

// ─── Interceptar console para verificar que nunca se logea el secreto ────────

const logsCapturados: string[] = [];
const originales = { log: console.log, error: console.error, warn: console.warn };
function interceptarConsola() {
  const capturar = (...args: unknown[]) => { logsCapturados.push(args.map(String).join(" ")); };
  console.log = capturar;
  console.error = capturar;
  console.warn = capturar;
}
function restaurarConsola() {
  console.log = originales.log;
  console.error = originales.error;
  console.warn = originales.warn;
}

// ─── Casos ─────────────────────────────────────────────────────────────────

const p12Base64 = generarP12Base64(PASSWORD);

// 1. Sin p12Base64: se comporta igual que antes (devuelve firmaPathLocal tal cual)
_resetCacheParaTests();
{
  const ruta = resolverRutaP12({ firmaPathLocal: "/ruta/local/certificado.p12", password: PASSWORD });
  assert(ruta === "/ruta/local/certificado.p12", "Sin p12Base64, devuelve firmaPathLocal sin tocar nada");
}

// 2. Sin p12Base64 y sin firmaPathLocal: error claro, mismo formato que getRequired()
_resetCacheParaTests();
{
  let error: Error | undefined;
  try {
    resolverRutaP12({ password: PASSWORD });
  } catch (e) {
    error = e as Error;
  }
  assert(!!error, "Sin p12Base64 ni firmaPathLocal debe lanzar");
  assert(
    error?.message === "Variable de entorno requerida no configurada: SRI_FIRMA_PATH",
    "El mensaje debe coincidir con el formato de variable requerida"
  );
}

// 3. Con p12Base64 válido + password correcto: materializa en /tmp y el archivo es el .p12 real
_resetCacheParaTests();
{
  const ruta = resolverRutaP12({ p12Base64, password: PASSWORD });
  assert(ruta.startsWith(os.tmpdir()), "La ruta resuelta debe estar dentro de os.tmpdir()");
  assert(fs.existsSync(ruta), "El archivo materializado debe existir en disco");

  const escritoBuffer = fs.readFileSync(ruta);
  const esperadoBuffer = Buffer.from(p12Base64, "base64");
  assert(escritoBuffer.equals(esperadoBuffer), "El contenido escrito debe coincidir exactamente con el .p12 decodificado");

  // El propio node-forge debe poder abrir el archivo escrito con la password
  const reDecodificado = forge.util.decode64(escritoBuffer.toString("base64"));
  let abreOk = true;
  try {
    forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(reDecodificado), PASSWORD);
  } catch {
    abreOk = false;
  }
  assert(abreOk, "El .p12 materializado debe ser abrible con la password original");
}

// 4. Cache: una segunda llamada con el mismo input devuelve la misma ruta
//    y NO vuelve a escribir el archivo (verificado borrándolo y confirmando
//    que la segunda llamada no lo recrea).
_resetCacheParaTests();
{
  const ruta1 = resolverRutaP12({ p12Base64, password: PASSWORD });
  fs.unlinkSync(ruta1);
  assert(!fs.existsSync(ruta1), "Precondición: el archivo se borró manualmente");

  const ruta2 = resolverRutaP12({ p12Base64, password: PASSWORD });
  assert(ruta2 === ruta1, "La segunda llamada debe devolver la misma ruta cacheada");
  assert(!fs.existsSync(ruta2), "La segunda llamada NO debe reescribir el archivo (una sola vez por arranque)");
}

// 5. base64 inválido (no decodifica a DER): error claro y temprano, no un fallo críptico
_resetCacheParaTests();
{
  let error: Error | undefined;
  try {
    resolverRutaP12({ p12Base64: forge.util.encode64("esto no es un pkcs12"), password: PASSWORD });
  } catch (e) {
    error = e as Error;
  }
  assert(!!error, "base64 que no decodifica a un PKCS#12 válido debe lanzar");
  assert(
    !!error?.message.includes("PKCS#12") || !!error?.message.includes("base64"),
    "El mensaje debe ser descriptivo sobre el problema del .p12, no un stacktrace críptico de node-forge"
  );
}

// 6. Password incorrecta: error claro, no un fallo críptico al firmar
_resetCacheParaTests();
{
  let error: Error | undefined;
  try {
    resolverRutaP12({ p12Base64, password: "password-incorrecta" });
  } catch (e) {
    error = e as Error;
  }
  assert(!!error, "Password incorrecta debe lanzar");
  assert(
    !!error?.message.includes("SRI_FIRMA_PASSWORD"),
    "El mensaje debe mencionar SRI_FIRMA_PASSWORD, no un error interno de node-forge"
  );
}

// 7. Nunca se logea el contenido del certificado ni la contraseña, ni siquiera en los casos de error
_resetCacheParaTests();
interceptarConsola();
try {
  resolverRutaP12({ p12Base64, password: PASSWORD });
  try { resolverRutaP12({ p12Base64, password: "password-incorrecta" }); } catch { /* esperado */ }
  try { resolverRutaP12({ p12Base64: "no-es-base64-valido!!", password: PASSWORD }); } catch { /* esperado */ }
} finally {
  restaurarConsola();
}
{
  const salidaCompleta = logsCapturados.join("\n");
  assert(logsCapturados.length === 0, "resolverRutaP12 no debe escribir nada en console.* en ningún caso");
  assert(!salidaCompleta.includes(PASSWORD), "La contraseña real nunca debe aparecer en logs");
  assert(!salidaCompleta.includes(p12Base64), "El contenido base64 del certificado nunca debe aparecer en logs");
}

_resetCacheParaTests();

if (fallos > 0) {
  console.error(`\n❌ resolverP12.test.ts — ${fallos} aserción(es) fallida(s)`);
  process.exit(1);
}
console.log("\n✅ resolverP12.test.ts — todos los asserts pasaron");
