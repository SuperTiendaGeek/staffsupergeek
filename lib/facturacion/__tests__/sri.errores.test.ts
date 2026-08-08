/**
 * Test — traducción de los mensajes del SRI.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/sri.errores.test.ts
 *
 * Puro: sin red, sin Airtable.
 *
 * Lo que protege: cuando el SRI rechaza una factura real, quien está detrás
 * del mostrador tiene que entender en dos segundos si el problema se arregla
 * pidiéndole la cédula al cliente o si hay que llamar a soporte. Un código
 * "[69]" no le dice nada a nadie.
 */

import {
  explicarMensajeSri,
  explicarMensajesSri,
  hayAlgoCorregible,
} from "../sri/errores";

let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); }
  else       { console.log("✓", msg); }
}

// ═══════════════════════════════════════════════════════════════════════════
// Casos reales, tomados de las facturas de prueba de SUPER GEEK
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── el caso que más va a pasar en el mostrador ──");

// Este mensaje está tal cual en una de las facturas de prueba en Airtable.
const consumidorFinal = explicarMensajeSri({
  identificador: "69",
  tipo: "ERROR",
  mensaje: "ERROR EN LA IDENTIFICACION DEL RECEPTOR",
  informacionAdicional: "La factura supera los 50 USD de importe total por cuanto no puede ser emitida a nombre del CONSUMIDOR FINAL",
});

assert(consumidorFinal.codigo === "69", "Conserva el código para poder rastrearlo");
assert(consumidorFinal.queSignifica.includes("CONSUMIDOR FINAL"),
  "Explica que el problema es el consumidor final");
assert(consumidorFinal.queHacer.toLowerCase().includes("cédula") || consumidorFinal.queHacer.toLowerCase().includes("ruc"),
  "Dice la acción concreta: pedir cédula o RUC");
assert(consumidorFinal.corregible === true,
  "Lo marca como corregible — se arregla y se vuelve a emitir");
assert(consumidorFinal.original.includes("50 USD"),
  "Conserva el mensaje original íntegro, sin perder el detalle del SRI");

console.log("\n── firma vencida ──");

const firma = explicarMensajeSri({ identificador: "39", tipo: "ERROR", mensaje: "FIRMA INVALIDA" });
assert(firma.queSignifica.toLowerCase().includes("venc"),
  "Apunta a la causa real y más frecuente: el certificado venció");
assert(firma.queHacer.includes("Firma electrónica"),
  "Manda a la pantalla donde se resuelve");
assert(firma.corregible === true, "Es corregible: se carga la firma nueva y se reemite");

console.log("\n── número ya registrado: no hay nada que corregir ──");

for (const codigo of ["43", "45"]) {
  const m = explicarMensajeSri({ identificador: codigo, tipo: "ERROR", mensaje: "REGISTRADO" });
  assert(m.corregible === false,
    `[${codigo}] NO se marca como corregible — el sistema ya avanza solo al siguiente número`);
}
assert(explicarMensajeSri({ identificador: "45", tipo: "ERROR", mensaje: "x" }).queHacer.includes("sistema viejo"),
  "[45] avisa de la causa que de verdad importa el día del corte: los dos sistemas emitiendo a la vez");

console.log("\n── en procesamiento: lo más importante es que NO reemita ──");

const enProceso = explicarMensajeSri({ identificador: "EN-PROCESO", tipo: "INFORMATIVO", mensaje: "" });
assert(enProceso.queHacer.toLowerCase().includes("no emitas otra"),
  "Dice explícitamente que NO emita otra factura — es el error que duplica un documento real");
assert(enProceso.queHacer.includes("Consultar estado"),
  "Y le dice qué botón usar en su lugar");
assert(enProceso.corregible === false, "No hay nada que corregir: solo esperar");

console.log("\n── fecha extemporánea ──");

const fecha = explicarMensajeSri({ identificador: "65", tipo: "ERROR", mensaje: "FECHA EMISION EXTEMPORANEA" });
assert(fecha.corregible === false,
  "No es corregible: esa factura ya no se autoriza con esa fecha");
assert(fecha.queHacer.includes("no se reutiliza"),
  "Recuerda la regla de integridad: el número viejo queda registrado, nunca se reutiliza");

console.log("\n── un código desconocido no se inventa ──");

const raro = explicarMensajeSri({
  identificador: "999",
  tipo: "ERROR",
  mensaje: "ALGO QUE NADIE HA VISTO ANTES",
});
assert(raro.codigo === "999", "Conserva el código");
assert(raro.queSignifica.includes("ALGO QUE NADIE HA VISTO ANTES"),
  "Muestra el mensaje del SRI tal cual en vez de inventar una explicación");
assert(raro.corregible === false,
  "Ante la duda no promete que sea corregible (fail closed)");
assert(raro.queHacer.includes("soporte"), "Y dice a quién acudir");

const sinNada = explicarMensajeSri({});
assert(sinNada.codigo === "SIN-CODIGO", "Un mensaje vacío no revienta");
assert(sinNada.queSignifica.length > 0, "…y aun así dice algo útil");

// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── varios mensajes a la vez ──");

const varios = explicarMensajesSri([
  { identificador: "69", tipo: "ERROR", mensaje: "IDENTIFICACION" },
  { identificador: "43", tipo: "ERROR", mensaje: "CLAVE REGISTRADA" },
]);
assert(varios.length === 2, "Traduce todos los mensajes, no solo el primero");
assert(hayAlgoCorregible([{ identificador: "69" }]) === true,
  "Detecta que hay algo que el usuario puede arreglar");
assert(hayAlgoCorregible([{ identificador: "43" }, { identificador: "45" }]) === false,
  "Y detecta cuándo no hay nada que arreglar a mano");
assert(hayAlgoCorregible([]) === false, "Sin mensajes, nada que corregir");

// ─────────────────────────────────────────────────────────────────────────────

if (fallos > 0) {
  console.error(`\n❌ sri.errores.test.ts — ${fallos} aserción(es) fallida(s)`);
  process.exit(1);
}
console.log("\n✅ sri.errores.test.ts — todos los asserts pasaron");
