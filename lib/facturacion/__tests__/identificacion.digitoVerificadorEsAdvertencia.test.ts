/**
 * Test — hotfix urgente (2026-08-17): el dígito verificador de cédula/RUC
 * pasa a ser ADVERTENCIA, no bloqueo. Ver el comentario de cabecera de
 * lib/facturacion/reglas/identificacion.ts para el porqué completo.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/identificacion.digitoVerificadorEsAdvertencia.test.ts
 *
 * Cubre:
 *   (a) RUC 1091797592001 (SALUDSÍ EC S.A.S., caso real) → advertencia, SIN
 *       error, la emisión no se bloquea ← la central.
 *   (b) cédula 893849324 → ERROR DURO (largo), sigue bloqueada ← protege el
 *       agujero original (bitácora §4.4). Verificado que esta prueba falla
 *       si (b) se convierte por error en advertencia.
 *   (c) vacío → error duro.
 *   (d) tipo "99" → error duro.
 *   (e) RUC 1003710272001 y cédula válida → ni error ni advertencia.
 *
 * Puro, sin red.
 */

import { revisarIdentificacion, assertIdentificacionValida } from "../reglas/identificacion";
import { FacturacionRechazoError } from "../errores";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

// ═══ (a) — SALUDSÍ EC S.A.S.: advertencia, SIN error, no bloquea ═════════════
{
  const r = revisarIdentificacion("04", "1091797592001");
  assert(r.error === null, "(a) SALUDSÍ: sin error — LA REGLA CENTRAL de este hotfix");
  assert(r.advertencia !== null, "(a) SALUDSÍ: con advertencia — no desaparece sin avisar");
  assert(
    /dígito verificador/i.test(r.advertencia ?? ""),
    "(a) SALUDSÍ: la advertencia explica que es el dígito verificador"
  );

  // La emisión NO se bloquea: assertIdentificacionValida() no lanza.
  let lanzo = false;
  try {
    assertIdentificacionValida("04", "1091797592001");
  } catch {
    lanzo = true;
  }
  assert(!lanzo, "(a) SALUDSÍ: assertIdentificacionValida() NO lanza — emitirFactura.ts no bloquea la emisión");
}

// ═══ (b) — 893849324: ERROR DURO (largo), sigue bloqueada ═══════════════════
// La cédula que originó el módulo entero (bitácora §4.4). Se rechaza por
// LARGO ("tiene 9 dígitos, no 10"), no por dígito verificador — por eso
// relajar el dígito verificador no la afecta.
{
  const r = revisarIdentificacion("05", "893849324");
  assert(r.error !== null, "(b) 893849324: sigue con ERROR duro — protege el agujero original");
  assert(r.advertencia === null, "(b) 893849324: no es 'solo advertencia' — es bloqueo real");
  assert(/tiene 9/.test(r.error ?? ""), "(b) 893849324: el error explica que el largo está mal (9, no 10)");

  let lanzo = false;
  let mensaje = "";
  try {
    assertIdentificacionValida("05", "893849324");
  } catch (e) {
    lanzo = true;
    mensaje = e instanceof FacturacionRechazoError ? e.message : String(e);
  }
  assert(lanzo, "(b) 893849324: assertIdentificacionValida() SIGUE LANZANDO — la factura 001-002-000000689 no puede repetirse");
  assert(/tiene 9/.test(mensaje), "(b) 893849324: el mensaje lanzado es el de largo, no el de dígito verificador");
}

// ═══ (c) — Vacío → error duro ════════════════════════════════════════════════
{
  const r = revisarIdentificacion("05", "");
  assert(r.error !== null, "(c) identificación vacía: error duro");
  assert(r.advertencia === null, "(c) identificación vacía: sin advertencia — es bloqueo, no aviso");
}

// ═══ (d) — Tipo "99" → error duro ═════════════════════════════════════════════
{
  const r = revisarIdentificacion("99", "1234567890");
  assert(r.error !== null, "(d) tipo '99' (inexistente): error duro");
  assert(r.advertencia === null, "(d) tipo '99': sin advertencia — es bloqueo, no aviso");
}

// ═══ (e) — RUC y cédula VÁLIDOS de verdad → ni error ni advertencia ═════════
{
  const ruc = revisarIdentificacion("04", "1003710272001");
  assert(ruc.error === null, "(e) RUC 1003710272001 (válido de verdad): sin error");
  assert(ruc.advertencia === null, "(e) RUC 1003710272001: sin advertencia tampoco — no hay nada que avisar");

  const cedula = revisarIdentificacion("05", "1003710272");
  assert(cedula.error === null, "(e) cédula 1003710272 (válida de verdad): sin error");
  assert(cedula.advertencia === null, "(e) cédula 1003710272: sin advertencia tampoco");
}

if (fallos > 0) {
  console.error(`\n❌ identificacion.digitoVerificadorEsAdvertencia.test.ts — ${fallos} aserción(es) fallida(s)`);
  process.exit(1);
}
console.log("\n✅ identificacion.digitoVerificadorEsAdvertencia.test.ts — todos los asserts pasaron");
