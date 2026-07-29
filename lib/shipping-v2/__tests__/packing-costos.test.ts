/**
 * Reglas de distribución de costos de un packing.
 * Ejecutar: npx tsx lib/shipping-v2/__tests__/packing-costos.test.ts
 *
 * El reparto del flete/arancel entre los artículos lo hacen tres fórmulas de
 * Airtable que deciden leyendo el NOMBRE de la regla:
 *
 *     IF(FIND("cantidad", regla), <por cantidad>,
 *     IF(FIND("costo",    regla), <por costo>, 0))
 *
 * El select ofrece "Por peso", que no contiene ninguna de las dos palabras: al
 * elegirla, el flete y el arancel quedan en $0 para todos los artículos del
 * packing y nada lo indica. "Manual" y "No definida" también dan 0, pero ahí es
 * lo esperado.
 *
 * Verificado contra los 7 packings reales: todos usan "Por costo del item" y el
 * reparto cuadra (p. ej. LAP-000013, costo $454 en un packing de $2.160,50 con
 * $308,17 de flete → $64,76 asignados).
 */

import {
  REGLAS_DISTRIBUCION_AUTOMATICA,
  REGLAS_DISTRIBUCION_NO_IMPLEMENTADAS,
  REGLAS_DISTRIBUCION_SIN_REPARTO,
  reglaReparteAutomaticamente,
  validarReglaDistribucion,
} from "../packing-costos";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

// ── Reglas que sí reparten ──────────────────────────────────────────────────
for (const regla of REGLAS_DISTRIBUCION_AUTOMATICA) {
  assert(validarReglaDistribucion(regla) === null, `"${regla}" se acepta`);
  assert(reglaReparteAutomaticamente(regla), `"${regla}" reparte automáticamente`);
}

// ── Reglas válidas que a propósito no reparten ──────────────────────────────
for (const regla of REGLAS_DISTRIBUCION_SIN_REPARTO) {
  assert(validarReglaDistribucion(regla) === null, `"${regla}" se acepta (no repartir es su intención)`);
  assert(!reglaReparteAutomaticamente(regla), `"${regla}" NO reparte automáticamente`);
}

// ── La regla a medio construir ──────────────────────────────────────────────
for (const regla of REGLAS_DISTRIBUCION_NO_IMPLEMENTADAS) {
  const error = validarReglaDistribucion(regla);
  assert(error !== null, `FIX: "${regla}" se rechaza en vez de dejar los costos en $0 sin avisar`);
  assert(
    (error ?? "").includes("$0"),
    `El mensaje de "${regla}" explica la consecuencia real (vino: ${error})`
  );
  assert(
    (error ?? "").includes("Por costo del item"),
    `El mensaje de "${regla}" propone una alternativa que sí funciona`
  );
}

// ── Sin regla ───────────────────────────────────────────────────────────────
assert(validarReglaDistribucion(null) === null, "Sin regla se acepta: el packing aún no define reparto");
assert(validarReglaDistribucion("") === null, "Cadena vacía se acepta");
assert(validarReglaDistribucion("   ") === null, "Solo espacios se acepta");
assert(!reglaReparteAutomaticamente(null), "Sin regla no hay reparto automático");

// ── Tolerancia de escritura ─────────────────────────────────────────────────
assert(validarReglaDistribucion("por costo del item") === null, "Tolera minúsculas");
assert(validarReglaDistribucion("  Por Cantidad  ") === null, "Tolera espacios y mayúsculas");
assert(reglaReparteAutomaticamente("POR COSTO DEL ITEM"), "Reconoce el reparto en mayúsculas");

// ── Basura ──────────────────────────────────────────────────────────────────
{
  const error = validarReglaDistribucion("Por volumen");
  assert(error !== null && error.includes("no es una regla"), "Una regla inventada se rechaza");
  assert(!reglaReparteAutomaticamente("Por volumen"), "Una regla inventada no reparte");
}

// ── La trampa del FIND: subcadenas ──────────────────────────────────────────
// Las fórmulas buscan "costo"/"cantidad" DENTRO del nombre. Una regla nueva que
// contuviera esas palabras repartiría sin que nadie lo decidiera.
assert(
  validarReglaDistribucion("Por costo y peso") !== null,
  "Una regla que contiene 'costo' pero no está en la lista se rechaza igual"
);

if (fallos > 0) {
  console.error(`\n${fallos} assert(s) fallaron.`);
  process.exit(1);
}
console.log("\n✅ packing-costos.test.ts — todos los asserts pasaron");
