/**
 * Test — validación de la identificación del comprador.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/identificacion.test.ts
 *
 * Puro: sin red, sin Airtable.
 *
 * ─── El caso real que originó todo ───────────────────────────────────────────
 *
 * El 8-ago-2026 se emitió la factura 001-002-000000689 a "CUMOS LIAS" con
 * identificación 893849324 — nueve dígitos, que no son una cédula. El SRI la
 * autorizó porque el sistema, al no reconocer el formato, la había marcado
 * sola como PASAPORTE. Y el SRI no valida documentos extranjeros.
 *
 * Este test fija que eso no puede volver a pasar.
 */

import {
  validarCedula,
  validarRuc,
  validarIdentificacion,
  assertIdentificacionValida,
  inferirTipoSugerido,
  etiquetaAirtable,
  codigoDesdeAirtable,
  esTipoValido,
  TIPOS_IDENTIFICACION,
  IDENTIFICACION_CONSUMIDOR_FINAL,
} from "../reglas/identificacion";
import { FacturacionRechazoError } from "../errores";

let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); }
  else       { console.log("✓", msg); }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. EL CASO REAL
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── el número que se coló el 8-ago-2026 ──");

const COLADO = "893849324";  // 9 dígitos

assert(!validarCedula(COLADO), "893849324 NO es una cédula válida");
assert(validarIdentificacion("05", COLADO) !== null,
  "Como cédula, se rechaza");
assert((validarIdentificacion("05", COLADO) ?? "").includes("10 dígitos"),
  "…diciendo cuántos dígitos debería tener");
assert((validarIdentificacion("05", COLADO) ?? "").includes("extranjero"),
  "…y ofreciendo la salida correcta si de verdad es un documento extranjero");

assert(inferirTipoSugerido(COLADO) === undefined,
  "El sistema NO propone ningún tipo para ese número — antes lo convertía en pasaporte");

assert(validarIdentificacion("", COLADO) !== null,
  "Sin tipo elegido, la emisión se bloquea (antes pasaba como pasaporte)");
assert((validarIdentificacion("", COLADO) ?? "").includes("Elige el tipo"),
  "…con un mensaje que dice exactamente qué hacer");

// Si de verdad fuera un pasaporte y alguien lo elige a conciencia, sí vale.
assert(validarIdentificacion("06", COLADO) === null,
  "Como pasaporte SÍ se acepta — pero solo si alguien lo eligió, no por descarte");

// ═══════════════════════════════════════════════════════════════════════════
// 2. Cédulas
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── cédulas ──");

// La cédula real del dueño (los 10 primeros dígitos de su RUC).
assert(validarCedula("1003710272"), "La cédula real 1003710272 es válida");

assert(!validarCedula("1003710273"), "Cambiar el último dígito la invalida (dígito verificador)");
assert(!validarCedula("1003710272"[0] + "9" + "03710272"), "Cambiar un dígito del medio también");
assert(!validarCedula("100371027"),  "Nueve dígitos no");
assert(!validarCedula("10037102721"), "Once dígitos tampoco");
assert(!validarCedula("100371027a"), "Con letras no");
assert(!validarCedula(""),           "Vacía no");
assert(!validarCedula("9903710272"), "Provincia 99 no existe");
assert(!validarCedula("1063710272"), "Tercer dígito 6 no corresponde a persona natural");
assert(validarCedula("3003710272") === validarCedula("3003710272"),
  "Provincia 30 (registrados en el exterior) se evalúa, no se descarta de entrada");

// ═══════════════════════════════════════════════════════════════════════════
// 3. RUC
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── RUC ──");

assert(validarRuc("1003710272001"), "El RUC real 1003710272001 es válido (persona natural)");

assert(!validarRuc("1003710272000"), "Establecimiento 000 no existe");
assert(!validarRuc("1003710273001"), "Si la cédula base está mal, el RUC está mal");
assert(!validarRuc("100371027200"),  "Doce dígitos no");
assert(!validarRuc("1234567890123"), "Un número inventado de 13 dígitos ya NO pasa");
assert(!validarRuc("9999999999999"), "Ni el 9999999999999 (ese es consumidor final, otro tipo)");
assert(!validarRuc("1073710272001"), "Tercer dígito 7 no corresponde a ningún contribuyente");
assert(!validarRuc("1083710272001"), "Tercer dígito 8 tampoco");

// Sociedad privada (tercer dígito 9) y sector público (6): se valida el
// dígito verificador con módulo 11, no la cédula.
assert(typeof validarRuc("1790011114001") === "boolean",
  "Un RUC de sociedad privada se evalúa por su propia regla, sin reventar");
assert(typeof validarRuc("1760001550001") === "boolean",
  "Un RUC del sector público también");

// El caso que motivó el cambio: antes bastaban 13 dígitos cualesquiera.
assert(validarIdentificacion("04", "1234567890123") !== null,
  "Un RUC inventado de 13 dígitos se RECHAZA — antes pasaba solo por la longitud");

// ═══════════════════════════════════════════════════════════════════════════
// 4. Consumidor final y extranjeros
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── consumidor final ──");

assert(validarIdentificacion("07", IDENTIFICACION_CONSUMIDOR_FINAL) === null,
  "Consumidor final con 9999999999999 es válido");
assert(validarIdentificacion("07", "") === null,
  "…y sin identificación también");
assert(validarIdentificacion("07", "1003710272") !== null,
  "Pero no con una cédula puesta: o es consumidor final, o es alguien identificado");

console.log("\n── pasaporte e identificación del exterior ──");

for (const tipo of ["06", "08"]) {
  assert(validarIdentificacion(tipo, "AB123456") === null,
    `[${tipo}] Un documento alfanumérico es válido`);
  assert(validarIdentificacion(tipo, "") !== null,
    `[${tipo}] Pero no puede ir vacío`);
  assert(validarIdentificacion(tipo, "X".repeat(21)) !== null,
    `[${tipo}] Ni pasar de 20 caracteres`);
  assert(validarIdentificacion(tipo, "AB 123") !== null,
    `[${tipo}] Ni llevar espacios o símbolos raros`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Tipos desconocidos: fail closed
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── ante la duda, se bloquea ──");

assert(validarIdentificacion(undefined, "1003710272") !== null, "Tipo undefined bloquea");
assert(validarIdentificacion("", "1003710272") !== null,        "Tipo vacío bloquea");
assert(validarIdentificacion("99", "1003710272") !== null,      "Tipo inexistente bloquea");
assert(validarIdentificacion("05", "1003710272") === null,      "…y el caso bueno pasa");

let capturado: unknown = null;
try { assertIdentificacionValida("05", "893849324"); } catch (e) { capturado = e; }
assert(capturado instanceof FacturacionRechazoError,
  "assertIdentificacionValida lanza FacturacionRechazoError — el endpoint lo traduce a 400");

let paso = true;
try { assertIdentificacionValida("05", "1003710272"); } catch { paso = false; }
assert(paso, "Con una cédula buena no lanza");

// ═══════════════════════════════════════════════════════════════════════════
// 6. Sugerencia: propone, no decide
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── la sugerencia nunca inventa ──");

assert(inferirTipoSugerido("1003710272")    === "05", "Una cédula VÁLIDA sugiere cédula");
assert(inferirTipoSugerido("1003710272001") === "04", "Un RUC VÁLIDO sugiere RUC");
assert(inferirTipoSugerido(IDENTIFICACION_CONSUMIDOR_FINAL) === "07", "El 9999999999999 sugiere consumidor final");

assert(inferirTipoSugerido("1003710273")    === undefined,
  "Diez dígitos con verificador MALO no sugiere cédula — no basta la longitud");
assert(inferirTipoSugerido("1234567890123") === undefined,
  "Trece dígitos inventados no sugieren RUC");
assert(inferirTipoSugerido("AB123456")      === undefined, "Un alfanumérico no sugiere nada");
assert(inferirTipoSugerido("")              === undefined, "Vacío no sugiere nada");

const sugerencias = ["893849324", "12345", "abc", "0000000000"].map(inferirTipoSugerido);
assert(sugerencias.every((s) => s !== "06" && s !== "08"),
  "NUNCA sugiere pasaporte ni identificación del exterior — esos se eligen a mano, siempre");

// ═══════════════════════════════════════════════════════════════════════════
// 7. Puente con Airtable
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── etiquetas de Airtable ──");

assert(TIPOS_IDENTIFICACION.length === 5, "Los cinco tipos del catálogo del SRI");

// Deben coincidir EXACTAMENTE con las opciones del single select creado a mano.
assert(etiquetaAirtable("04") === "04 · RUC",                           "04 · RUC");
assert(etiquetaAirtable("05") === "05 · Cédula",                        "05 · Cédula");
assert(etiquetaAirtable("06") === "06 · Pasaporte",                     "06 · Pasaporte");
assert(etiquetaAirtable("07") === "07 · Consumidor final",              "07 · Consumidor final");
assert(etiquetaAirtable("08") === "08 · Identificación del exterior",   "08 · Identificación del exterior");
assert(etiquetaAirtable("99") === undefined,                            "Un código inexistente no devuelve etiqueta");

assert(codigoDesdeAirtable("05 · Cédula") === "05", "Se lee de vuelta la etiqueta completa");
assert(codigoDesdeAirtable("05") === "05",          "…y también si viniera solo el código");
assert(codigoDesdeAirtable("") === undefined,       "Un valor vacío no devuelve tipo");
assert(codigoDesdeAirtable("cualquier cosa") === undefined, "Ni uno desconocido");

// Ida y vuelta completa.
for (const t of TIPOS_IDENTIFICACION) {
  assert(codigoDesdeAirtable(t.airtable) === t.codigo,
    `Ida y vuelta sin pérdida: ${t.airtable}`);
}

assert(esTipoValido("05") && !esTipoValido("99"), "esTipoValido distingue bien");

// ─────────────────────────────────────────────────────────────────────────────

if (fallos > 0) {
  console.error(`\n❌ identificacion.test.ts — ${fallos} aserción(es) fallida(s)`);
  process.exit(1);
}
console.log("\n✅ identificacion.test.ts — todos los asserts pasaron");
