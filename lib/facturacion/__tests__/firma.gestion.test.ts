/**
 * Test — gestión de la firma electrónica (PR1).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/firma.gestion.test.ts
 *
 * Cubre las tres piezas puras del PR1, sin red y sin Airtable:
 *   · cripto.ts        — cifrado AES-256-GCM de ida y vuelta
 *   · vigencia.ts      — días restantes, semáforo y días de aviso
 *   · inspeccionar.ts  — lectura de metadatos de un .p12 real (el fixture)
 *
 * El certificado usado es el mismo de juguete que ya usa firmar.test.ts:
 * __fixtures__/test-cert.p12, autofirmado, sin ningún dato real.
 *
 * Lanza en la primera falla y sale con código distinto de 0.
 */

import fs   from "fs";
import path from "path";
import forge from "node-forge";

import { cifrar, descifrar, huellaSha256, obtenerLlaveMaestra, FirmaCriptoError } from "../firma/cripto";
import {
  diasRestantes,
  nivelVigencia,
  requiereAviso,
  tocaNotificar,
  mensajeVigencia,
} from "../firma/vigencia";
import {
  inspeccionarP12,
  extraerIdentificacion,
  identificacionCoincideConRuc,
  FirmaInvalidaError,
} from "../firma/inspeccionar";

let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); }
  else       { console.log("✓", msg); }
}

function assertLanza(fn: () => unknown, msg: string): void {
  try { fn(); assert(false, msg); }
  catch { assert(true, msg); }
}

const FIXTURES  = path.join(__dirname, "__fixtures__");
const P12_PATH  = path.join(FIXTURES, "test-cert.p12");
const P12_CLAVE = "testclave123";

// ═══════════════════════════════════════════════════════════════════════════
// 1. cripto.ts
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── cripto.ts ──");

// Llave de juguete fija: 32 bytes. No se toca process.env para no contaminar
// el resto del proceso — todas las funciones aceptan la llave por parámetro.
const LLAVE     = Buffer.alloc(32, 7);
const OTRA_LLAVE = Buffer.alloc(32, 9);

const SECRETO = "contraseña-del-p12-áéíóú-ñ-😀";
const cifrado = cifrar(SECRETO, LLAVE);

assert(cifrado.startsWith("v1:"),                        "El cifrado lleva prefijo de versión v1");
assert(cifrado.split(":").length === 4,                  "El formato es v1:iv:tag:datos (4 partes)");
assert(!cifrado.includes(SECRETO),                       "El texto original no aparece en claro dentro del cifrado");
assert(descifrar(cifrado, LLAVE) === SECRETO,            "Descifrar devuelve exactamente el texto original (incluye tildes y emoji)");

// Cada cifrado usa un IV nuevo: dos cifrados del mismo texto no coinciden.
assert(cifrar(SECRETO, LLAVE) !== cifrar(SECRETO, LLAVE), "Dos cifrados del mismo texto son distintos (IV aleatorio)");

assertLanza(() => descifrar(cifrado, OTRA_LLAVE),        "Descifrar con otra llave falla (no devuelve basura)");
assertLanza(() => descifrar("no-tiene-formato", LLAVE),  "Un payload con formato inválido falla");
assertLanza(() => descifrar("v2:a:b:c", LLAVE),          "Una versión desconocida falla");

// GCM autentica: alterar un byte del texto cifrado debe romper el descifrado.
const partes = cifrado.split(":");
const datos  = Buffer.from(partes[3], "base64");
datos[0] ^= 0xff;
partes[3] = datos.toString("base64");
assertLanza(() => descifrar(partes.join(":"), LLAVE),    "Alterar el texto cifrado hace fallar el descifrado (GCM autentica)");

// Un .p12 entero, pasado por base64, sobrevive el viaje completo.
const p12Buf = fs.readFileSync(P12_PATH);
const p12Ida = Buffer.from(descifrar(cifrar(p12Buf.toString("base64"), LLAVE), LLAVE), "base64");
assert(p12Ida.equals(p12Buf),                            "Un .p12 completo sobrevive cifrado → descifrado sin perder un byte");

// La huella es estable y distingue archivos distintos.
assert(huellaSha256(p12Buf) === huellaSha256(p12Buf),    "La huella del mismo archivo es estable");
assert(huellaSha256(p12Buf) !== huellaSha256(Buffer.from("otra cosa")), "Archivos distintos tienen huellas distintas");
assert(/^[0-9a-f]{64}$/.test(huellaSha256(p12Buf)),      "La huella es un SHA-256 en hex");

// obtenerLlaveMaestra: valida el tamaño y acepta base64 y hex.
const envPrevio = process.env.FIRMA_MASTER_KEY;
try {
  delete process.env.FIRMA_MASTER_KEY;
  assertLanza(() => obtenerLlaveMaestra(),               "Sin FIRMA_MASTER_KEY lanza un error explícito");

  process.env.FIRMA_MASTER_KEY = "demasiado-corta";
  assertLanza(() => obtenerLlaveMaestra(),               "Una FIRMA_MASTER_KEY que no son 32 bytes lanza");

  process.env.FIRMA_MASTER_KEY = LLAVE.toString("base64");
  assert(obtenerLlaveMaestra().equals(LLAVE),            "FIRMA_MASTER_KEY en base64 se lee correctamente");

  process.env.FIRMA_MASTER_KEY = LLAVE.toString("hex");
  assert(obtenerLlaveMaestra().equals(LLAVE),            "FIRMA_MASTER_KEY en hex se lee correctamente");
} finally {
  if (envPrevio === undefined) delete process.env.FIRMA_MASTER_KEY;
  else process.env.FIRMA_MASTER_KEY = envPrevio;
}

assert(new FirmaCriptoError("x") instanceof Error,       "FirmaCriptoError es un Error");

// ═══════════════════════════════════════════════════════════════════════════
// 2. vigencia.ts
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── vigencia.ts ──");

// Constructor local a propósito (igual que claveAcceso.test.ts): evita el
// corrimiento de un día que introduce UTC según la zona horaria del servidor.
const HOY = new Date(2026, 7, 5);  // 5-ago-2026

function enDias(n: number): Date {
  const d = new Date(2026, 7, 5);
  d.setDate(d.getDate() + n);
  return d;
}

assert(diasRestantes(enDias(29), HOY) === 29,            "29 días restantes se calculan bien");
assert(diasRestantes(HOY, HOY) === 0,                    "Vence hoy → 0 días");
assert(diasRestantes(enDias(-1), HOY) === -1,            "Venció ayer → -1");

// La hora del día no debe mover la cuenta: se comparan días completos.
const mismoDiaTarde = new Date(2026, 7, 5, 23, 59, 0);
assert(diasRestantes(mismoDiaTarde, HOY) === 0,          "La hora del día no altera el conteo de días");

assert(nivelVigencia(enDias(90),  HOY) === "vigente",    "90 días → vigente");
assert(nivelVigencia(enDias(61),  HOY) === "vigente",    "61 días → vigente (justo por encima del umbral)");
assert(nivelVigencia(enDias(60),  HOY) === "por-vencer", "60 días → por-vencer (umbral exacto)");
assert(nivelVigencia(enDias(31),  HOY) === "por-vencer", "31 días → por-vencer");
assert(nivelVigencia(enDias(30),  HOY) === "critica",    "30 días → crítica (umbral exacto)");
assert(nivelVigencia(enDias(1),   HOY) === "critica",    "1 día → crítica");
assert(nivelVigencia(HOY,         HOY) === "critica",    "Vence hoy → crítica, todavía se puede firmar");
assert(nivelVigencia(enDias(-1),  HOY) === "vencida",    "Venció ayer → vencida");

// El caso real que motivó todo esto: la firma vence el 2-sep-2026.
const FIRMA_REAL = new Date(2026, 8, 2);
assert(diasRestantes(FIRMA_REAL, HOY) === 28,            "Caso real: al 5-ago-2026 quedan 28 días para el 2-sep-2026");
assert(nivelVigencia(FIRMA_REAL, HOY) === "critica",     "Caso real: el 5-ago-2026 la firma ya está en nivel crítico");

assert(requiereAviso(enDias(90), HOY) === false,         "Con 90 días no se muestra aviso");
assert(requiereAviso(enDias(45), HOY) === true,          "Con 45 días sí se muestra aviso");
assert(requiereAviso(enDias(-5), HOY) === true,          "Vencida siempre muestra aviso");

assert(tocaNotificar(enDias(60), HOY) === true,          "Se notifica a los 60 días");
assert(tocaNotificar(enDias(30), HOY) === true,          "Se notifica a los 30 días");
assert(tocaNotificar(enDias(15), HOY) === true,          "Se notifica a los 15 días");
assert(tocaNotificar(enDias(7),  HOY) === true,          "Se notifica a los 7 días");
assert(tocaNotificar(enDias(1),  HOY) === true,          "Se notifica a 1 día");
assert(tocaNotificar(enDias(29), HOY) === false,         "No se notifica en días intermedios (29)");
assert(tocaNotificar(enDias(-1), HOY) === false,         "No se re-notifica una vez vencida");

const msgVencida = mensajeVigencia(enDias(-1), HOY);
assert(msgVencida.includes("venció"),                    "El mensaje de vencida dice que venció");
assert(msgVencida.includes("Firma electrónica"),         "El mensaje de vencida indica dónde cargar la nueva");
assert(mensajeVigencia(HOY, HOY).includes("HOY"),        "El mensaje de 'vence hoy' lo dice en mayúsculas");
assert(mensajeVigencia(enDias(1), HOY).includes("1 día") &&
       !mensajeVigencia(enDias(1), HOY).includes("1 días"), "Singular correcto: '1 día', no '1 días'");
assert(mensajeVigencia(enDias(28), HOY).includes("28 días"), "Plural correcto: '28 días'");

// ═══════════════════════════════════════════════════════════════════════════
// 3. inspeccionar.ts
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── inspeccionar.ts ──");

const meta = inspeccionarP12(p12Buf, P12_CLAVE);

assert(typeof meta.titular === "string" && meta.titular.length > 0, "Se lee el titular del certificado");
assert(typeof meta.emisor === "string" && meta.emisor.length > 0,   "Se lee el emisor del certificado");
assert(meta.validoDesde instanceof Date && !Number.isNaN(meta.validoDesde.getTime()), "Se lee 'válido desde' como fecha");
assert(meta.validoHasta instanceof Date && !Number.isNaN(meta.validoHasta.getTime()), "Se lee 'válido hasta' como fecha");
assert(meta.validoHasta.getTime() > meta.validoDesde.getTime(),     "'Válido hasta' es posterior a 'válido desde'");

assertLanza(() => inspeccionarP12(p12Buf, "clave-equivocada"),      "Una contraseña incorrecta lanza FirmaInvalidaError");
assertLanza(() => inspeccionarP12(Buffer.from("esto no es un p12"), P12_CLAVE), "Un archivo que no es .p12 lanza FirmaInvalidaError");

try {
  inspeccionarP12(p12Buf, "clave-equivocada");
} catch (e) {
  assert(e instanceof FirmaInvalidaError,                           "El error de contraseña es un FirmaInvalidaError");
  assert((e as Error).message.includes("contraseña"),               "El mensaje de error menciona la contraseña, en español");
}

// ── Extracción de la identificación ─────────────────────────────────────────
// Las entidades certificadoras ecuatorianas la ponen en sitios distintos.

assert(extraerIdentificacion("1003710272-020925140013") === "1003710272",
  "Security Data: cédula al inicio del serialNumber, ignorando la serie del dispositivo");
assert(extraerIdentificacion("", "ALEXIS BOLAÑOS 1003710272") === "1003710272",
  "Si el serialNumber viene vacío, se busca en el CN");
assert(extraerIdentificacion("CI-1003710272") === "1003710272",
  "Se ignoran prefijos tipo 'CI-'");
assert(extraerIdentificacion("1003710272001") === "1003710272001",
  "Un RUC de 13 dígitos se detecta completo, no se parte en 10");
assert(extraerIdentificacion("sin numeros aqui") === "",
  "Sin dígitos devuelve cadena vacía en vez de romper");

// ── Coincidencia con el RUC del emisor ──────────────────────────────────────
// En Ecuador el RUC de persona natural es cédula + "001"; el certificado suele
// traer solo la cédula. Por eso se comparan los 10 primeros dígitos.

assert(identificacionCoincideConRuc("1003710272", "1003710272001") === true,
  "Cédula del certificado coincide con el RUC del emisor");
assert(identificacionCoincideConRuc("1003710272001", "1003710272001") === true,
  "RUC completo también coincide");
assert(identificacionCoincideConRuc("1799999999", "1003710272001") === false,
  "La firma de OTRA persona NO coincide — es el chequeo que evita cargar el certificado equivocado");
assert(identificacionCoincideConRuc("", "1003710272001") === false,
  "Sin identificación no se da por bueno (fail closed)");
assert(identificacionCoincideConRuc("1003710272", "") === false,
  "Sin RUC configurado no se da por bueno (fail closed)");

// ── El .p12 de juguete es realmente abrible por node-forge ──────────────────
// Control positivo: si esto fallara, los asserts de arriba estarían midiendo
// otra cosa.
const asn1Ok = forge.asn1.fromDer(p12Buf.toString("binary"));
assert(!!forge.pkcs12.pkcs12FromAsn1(asn1Ok, P12_CLAVE),
  "Control positivo: el fixture se abre con node-forge y la clave conocida");

// ═══════════════════════════════════════════════════════════════════════════

if (fallos > 0) {
  console.error(`\n❌ firma.gestion.test.ts — ${fallos} aserción(es) fallida(s)`);
  process.exit(1);
}
console.log("\n✅ firma.gestion.test.ts — todos los asserts pasaron");
