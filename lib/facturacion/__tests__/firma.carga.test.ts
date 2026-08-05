/**
 * Test — reglas de aceptación de un certificado nuevo (PR2).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/firma.carga.test.ts
 *
 * Cubre `evaluarCargaFirma()`, que es el guard que decide si un .p12 se puede
 * activar. Funciones puras: sin red, sin Airtable, sin variables de entorno.
 *
 * Por qué importa tanto: cargar la firma equivocada no se nota hasta que ya se
 * emitió un documento tributario con la identidad de otra persona. El guard
 * tiene que ser fail-closed y los mensajes tienen que decir qué pasó.
 */

import { evaluarCargaFirma, avisoAlCargar } from "../firma/validarCarga";
import type { MetadatosFirma } from "../firma/inspeccionar";

let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); }
  else       { console.log("✓", msg); }
}

const RUC = "1003710272001";
const HOY = new Date(2026, 7, 5); // 5-ago-2026

function enDias(n: number): Date {
  const d = new Date(2026, 7, 5);
  d.setDate(d.getDate() + n);
  return d;
}

function meta(over: Partial<MetadatosFirma> = {}): MetadatosFirma {
  return {
    titular:        "ALEXIS RUBEN BOLANOS FLORES",
    emisor:         "SECURITY DATA S.A. 2",
    identificacion: "1003710272",
    validoDesde:    enDias(-100),
    validoHasta:    enDias(300),
    ...over,
  };
}

function evaluar(over: Partial<MetadatosFirma> = {}, huellaYaExiste = false) {
  return evaluarCargaFirma({ metadatos: meta(over), ruc: RUC, ahora: HOY, huellaYaExiste });
}

// ─── Caso feliz ──────────────────────────────────────────────────────────────

console.log("\n── acepta lo que debe aceptar ──");

assert(evaluar() === null,
  "Un certificado del titular correcto, vigente y nuevo se acepta");

assert(evaluar({ identificacion: "1003710272001" }) === null,
  "También se acepta si el certificado trae el RUC completo en vez de la cédula");

assert(evaluar({ validoHasta: HOY }) === null,
  "Un certificado que vence hoy todavía se acepta — hoy aún sirve para firmar");

assert(evaluar({ validoDesde: HOY }) === null,
  "Un certificado que empieza a ser válido hoy se acepta");

// ─── Titular equivocado ──────────────────────────────────────────────────────

console.log("\n── rechaza el certificado de otra persona ──");

const otroTitular = evaluar({ identificacion: "1799999999", titular: "OTRA PERSONA" });
assert(otroTitular !== null,
  "Un certificado de otra identificación se RECHAZA");
assert(otroTitular?.motivo.includes("OTRA PERSONA") === true,
  "El mensaje dice de quién es el certificado que se intentó cargar");
assert(otroTitular?.motivo.includes(RUC) === true,
  "El mensaje dice cuál es el RUC configurado, para poder comparar");

assert(evaluar({ identificacion: "" }) !== null,
  "Si no se pudo leer la identificación, se rechaza (fail closed)");

assert(
  evaluarCargaFirma({ metadatos: meta(), ruc: "", ahora: HOY, huellaYaExiste: false }) !== null,
  "Sin SRI_RUC configurado se rechaza — no se da por bueno sin poder comparar"
);

// ─── Vigencia ────────────────────────────────────────────────────────────────

console.log("\n── rechaza por vigencia ──");

const vencido = evaluar({ validoHasta: enDias(-1) });
assert(vencido !== null,
  "Un certificado vencido ayer se RECHAZA");
assert(vencido?.motivo.includes("venció") === true,
  "El mensaje del vencido dice que venció");
assert(vencido?.motivo.includes("SRI") === true,
  "El mensaje explica la consecuencia: el SRI rechaza lo firmado con él");

const futuro = evaluar({ validoDesde: enDias(5) });
assert(futuro !== null,
  "Un certificado que todavía no entra en vigencia se RECHAZA");
assert(futuro?.motivo.includes("todavía no está vigente") === true,
  "El mensaje del futuro explica que hay que esperar a su fecha de inicio");

// El orden importa: si es de otra persona Y está vencido, el mensaje útil es
// el del titular — es el error que el usuario no vería solo.
const dobleProblema = evaluar({ identificacion: "1799999999", validoHasta: enDias(-1) });
assert(dobleProblema?.motivo.includes("no corresponde al RUC") === true,
  "Con dos problemas a la vez, se reporta primero el del titular equivocado");

// ─── Duplicado ───────────────────────────────────────────────────────────────

console.log("\n── rechaza el duplicado ──");

const duplicado = evaluar({}, true);
assert(duplicado !== null,
  "Subir el mismo certificado que ya está cargado se RECHAZA");
assert(duplicado?.motivo.includes("ya está cargado") === true,
  "El mensaje del duplicado sugiere revisar si se subió el archivo equivocado");

// Un certificado ajeno duplicado se rechaza igual, y por el motivo correcto.
assert(
  evaluar({ identificacion: "1799999999" }, true)?.motivo.includes("no corresponde al RUC") === true,
  "El chequeo de titular manda sobre el de duplicado"
);

// ─── Aviso no bloqueante ─────────────────────────────────────────────────────

console.log("\n── aviso al cargar una firma que ya nace corta ──");

assert(avisoAlCargar(meta({ validoHasta: enDias(300) }), HOY) === null,
  "Con 300 días por delante no se muestra ningún aviso");

assert(avisoAlCargar(meta({ validoHasta: enDias(31) }), HOY) === null,
  "Con 31 días tampoco (justo por encima del umbral crítico)");

const avisoCorto = avisoAlCargar(meta({ validoHasta: enDias(20) }), HOY);
assert(avisoCorto !== null,
  "Con 20 días sí se avisa: sirve, pero nace corto");
assert(avisoCorto?.includes("20 días") === true,
  "El aviso dice cuántos días quedan");

assert(avisoAlCargar(meta({ validoHasta: enDias(1) }), HOY)?.includes("1 día") === true,
  "Singular correcto en el aviso: '1 día'");

// El aviso NO bloquea: el mismo certificado que dispara aviso se acepta.
assert(evaluar({ validoHasta: enDias(20) }) === null,
  "El aviso es informativo — ese certificado se acepta igual");

// ─── Caso real de SUPER GEEK ─────────────────────────────────────────────────

console.log("\n── caso real ──");

// La firma actual: Security Data, vence el 2-sep-2026. Al 5-ago quedan 28 días.
const firmaActual = meta({ validoDesde: new Date(2025, 8, 2), validoHasta: new Date(2026, 8, 2) });

assert(evaluarCargaFirma({ metadatos: firmaActual, ruc: RUC, ahora: HOY, huellaYaExiste: false }) === null,
  "La firma real de hoy se aceptaría si se cargara por pantalla");
assert(avisoAlCargar(firmaActual, HOY)?.includes("28 días") === true,
  "…pero avisaría que le quedan 28 días, para que nadie crea que quedó resuelto por un año");

// ─────────────────────────────────────────────────────────────────────────────

if (fallos > 0) {
  console.error(`\n❌ firma.carga.test.ts — ${fallos} aserción(es) fallida(s)`);
  process.exit(1);
}
console.log("\n✅ firma.carga.test.ts — todos los asserts pasaron");
