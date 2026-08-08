/**
 * Test — corregir y reenviar una factura rechazada.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/correccion.test.ts
 *
 * Reglas puras: sin red, sin Airtable.
 *
 * La regla que protege, en una línea:
 *
 *     Factura 123 → NO AUTORIZADA → corregir → reenviar la MISMA 123
 *
 * y NUNCA:
 *
 *     Factura 123 rechazada → quemar 123 → crear 124 como reemplazo
 *
 * Un secuencial pertenece a su operación comercial para siempre. Que el SRI la
 * rechace no lo libera para otra venta.
 */

import {
  evaluarCorreccion,
  permiteCorregir,
  esMismoDia,
  describirCambios,
  CAMPOS_BLOQUEADOS,
  CAMPOS_EDITABLES,
} from "../reglas/correccion";
import {
  agregarIntento,
  contarIntentos,
  formatearIntento,
  recortarSiHaceFalta,
  SEPARADOR,
} from "../historialIntentos";

let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); }
  else       { console.log("✓", msg); }
}

const HOY  = new Date(2026, 7, 8, 15, 30);           // 8-ago-2026, 15:30
const AYER = new Date(2026, 7, 7, 9, 0);             // 7-ago-2026

// ═══════════════════════════════════════════════════════════════════════════
// 1. ¿Cuándo se puede corregir?
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── el mismo día se reenvía LA MISMA factura ──");

for (const estado of ["DEVUELTA", "NO AUTORIZADO"]) {
  const e = evaluarCorreccion({ estado, fechaEmision: new Date(2026, 7, 8, 9, 0), ahora: HOY });
  assert(e.modo === "reenviar-misma",
    `${estado} emitida hoy → se corrige y se reenvía conservando número y clave`);
}

assert(esMismoDia(new Date(2026, 7, 8, 0, 1), new Date(2026, 7, 8, 23, 59)),
  "El mismo día son las 00:01 y las 23:59 — se compara el día, no la hora");
assert(!esMismoDia(new Date(2026, 7, 8, 23, 59), new Date(2026, 7, 9, 0, 1)),
  "Dos minutos después, pero otro día: ya no es el mismo día");

console.log("\n── pasado el día, hay que emitir una nueva ──");

const deAyer = evaluarCorreccion({ estado: "NO AUTORIZADO", fechaEmision: AYER, ahora: HOY });
assert(deAyer.modo === "emitir-nueva",
  "Una factura rechazada de ayer NO se puede reenviar tal cual");
assert(deAyer.motivo.includes("clave de acceso lleva esa fecha"),
  "…y el mensaje explica por qué: la clave lleva la fecha dentro");
assert(deAyer.motivo.includes("no se reutiliza"),
  "…y recuerda que el número viejo queda registrado, nunca reutilizado");

console.log("\n── lo que nunca se puede corregir ──");

const autorizada = evaluarCorreccion({ estado: "AUTORIZADO", fechaEmision: new Date(2026, 7, 8), ahora: HOY });
assert(autorizada.modo === "bloqueado",
  "Una factura AUTORIZADA está cerrada: no se edita ni se reenvía");
assert(autorizada.motivo.includes("nota de crédito"),
  "…y el mensaje manda al camino correcto: nota de crédito o anulación");

assert(evaluarCorreccion({ estado: "ANULADA", fechaEmision: new Date(2026, 7, 8), ahora: HOY }).modo === "bloqueado",
  "Una factura anulada tampoco");

for (const estado of ["PENDIENTE", "RECIBIDA", "EN PROCESAMIENTO"]) {
  const e = evaluarCorreccion({ estado, fechaEmision: new Date(2026, 7, 8), ahora: HOY });
  assert(e.modo === "bloqueado",
    `${estado}: el SRI aún no resolvió — no se corrige ni se emite otra por esta venta`);
  assert(e.motivo.includes("Consultar estado"),
    `${estado}: se le dice qué hacer en su lugar`);
}

const borrador = evaluarCorreccion({ estado: "BORRADOR", fechaEmision: new Date(2026, 7, 8), ahora: HOY });
assert(borrador.modo === "bloqueado", "Un borrador no se 'corrige': todavía no tiene número");

assert(permiteCorregir({ estado: "DEVUELTA", fechaEmision: new Date(2026, 7, 8), ahora: HOY }),
  "permiteCorregir() dice que sí en el caso corregible");
assert(!permiteCorregir({ estado: "AUTORIZADO", fechaEmision: new Date(2026, 7, 8), ahora: HOY }),
  "…y que no en el bloqueado");

// ═══════════════════════════════════════════════════════════════════════════
// 2. La identidad del comprobante
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── qué queda bloqueado y qué se puede tocar ──");

for (const campo of ["secuencial", "claveAcceso", "numeroFactura", "fechaEmision", "origen"]) {
  assert((CAMPOS_BLOQUEADOS as readonly string[]).includes(campo),
    `"${campo}" está bloqueado — es identidad del comprobante`);
}
assert((CAMPOS_BLOQUEADOS as readonly string[]).includes("establecimiento") &&
       (CAMPOS_BLOQUEADOS as readonly string[]).includes("puntoEmision"),
  "Establecimiento y punto de emisión también");

for (const campo of ["identificacionComprador", "razonSocialComprador", "detalles"]) {
  assert((CAMPOS_EDITABLES as readonly string[]).includes(campo),
    `"${campo}" sí se puede corregir — es lo que provoca los rechazos`);
}

const solapan = (CAMPOS_EDITABLES as readonly string[]).filter(
  (c) => (CAMPOS_BLOQUEADOS as readonly string[]).includes(c)
);
assert(solapan.length === 0, "Ningún campo está a la vez bloqueado y editable");

// ═══════════════════════════════════════════════════════════════════════════
// 3. El rastro de lo que cambió
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── se anota qué se corrigió ──");

// El caso del ejemplo: un dígito de la cédula.
const cedula = describirCambios(
  { identificacionComprador: "1001234568", razonSocialComprador: "JUAN PEREZ", importeTotal: 340 },
  { identificacionComprador: "1001234567", razonSocialComprador: "JUAN PEREZ", importeTotal: 340 }
);
assert(cedula.length === 1, "Solo se anota lo que de verdad cambió");
assert(cedula[0].includes("1001234568") && cedula[0].includes("1001234567"),
  "Se guarda el antes y el después, no solo el valor nuevo");

assert(describirCambios(
  { identificacionComprador: "1001234567", importeTotal: 340 },
  { identificacionComprador: "1001234567", importeTotal: 340 }
).length === 0, "Si no cambió nada, no se anota nada");

// El caso que nunca puede pasar desapercibido.
const cambioTotal = describirCambios(
  { identificacionComprador: "1001234567", importeTotal: 340 },
  { identificacionComprador: "1001234567", importeTotal: 890 }
);
assert(cambioTotal.length === 1, "Un cambio de importe se anota");
assert(cambioTotal[0].includes("⚠"),
  "El cambio de IMPORTE TOTAL se marca — es la señal de que se tocó la operación comercial, no un dato");
assert(cambioTotal[0].includes("340.00") && cambioTotal[0].includes("890.00"),
  "Con las dos cifras, para poder auditarlo");

// ═══════════════════════════════════════════════════════════════════════════
// 4. El historial de intentos
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── el historial no se sobreescribe ──");

assert(contarIntentos("") === 0, "Un historial vacío tiene 0 intentos");

const i1 = agregarIntento("", {
  fecha: new Date(2026, 7, 8, 9, 30),
  estado: "NO AUTORIZADO",
  mensajes: ["[69] ERROR: IDENTIFICACION INCORRECTA"],
});
assert(contarIntentos(i1) === 1, "El primer intento queda registrado");
assert(i1.includes("08/08 09:30"), "Con su fecha y hora");
assert(i1.includes("NO AUTORIZADO"), "Y su resultado");

const i2 = agregarIntento(i1, {
  fecha: new Date(2026, 7, 8, 9, 36),
  estado: "AUTORIZADO",
  cambios: ['Identificación: "1001234568" → "1001234567"'],
  usuario: "Alexis Bolaños",
  numeroAutorizacion: "0808202601...",
});
assert(contarIntentos(i2) === 2, "El segundo se suma al primero");
assert(i2.includes("IDENTIFICACION INCORRECTA"),
  "El motivo del PRIMER intento sigue ahí — esto es lo que antes se perdía");
assert(i2.includes("1001234568") && i2.includes("1001234567"),
  "Y queda escrito qué se corrigió entre un intento y otro");
assert(i2.includes("Alexis Bolaños"), "Y quién lo hizo");
assert(i2.indexOf("09:30") < i2.indexOf("09:36"), "En orden cronológico");

// Facturas anteriores a este formato: el texto suelto no se pierde.
const heredado = agregarIntento("[39] ERROR: FIRMA INVALIDA", {
  fecha: new Date(2026, 7, 8, 10, 0),
  estado: "AUTORIZADO",
});
assert(heredado.includes("FIRMA INVALIDA"),
  "El mensaje suelto de una factura vieja se conserva");
assert(heredado.includes("anterior al registro de intentos"),
  "…y se marca como tal, para no confundirlo con un intento registrado");
assert(contarIntentos(heredado) === 2, "Y cuenta como intento 1, con el nuevo de segundo");

console.log("\n── el historial no puede desbordar el campo ──");

const largo = Array.from({ length: 600 }, (_, n) =>
  formatearIntento({ fecha: new Date(2026, 7, 8), estado: "DEVUELTA", mensajes: ["x".repeat(200)] }, n + 1)
).join("\n\n");
const recortado = recortarSiHaceFalta(largo, 5_000);
assert(recortado.length <= 5_000, "Se recorta al límite indicado");
assert(recortado.includes("se recortaron"), "Avisa de que se recortó");
assert(recortado.includes("Intento 600"),
  "Conserva los intentos MÁS RECIENTES, que son los que explican el estado actual");
assert(recortado.indexOf(SEPARADOR) <= recortado.indexOf("Intento"),
  "Y corta en un límite de intento, no a mitad de una línea");

assert(recortarSiHaceFalta("corto", 5_000) === "corto",
  "Si cabe, no se toca");

// ─────────────────────────────────────────────────────────────────────────────

if (fallos > 0) {
  console.error(`\n❌ correccion.test.ts — ${fallos} aserción(es) fallida(s)`);
  process.exit(1);
}
console.log("\n✅ correccion.test.ts — todos los asserts pasaron");
