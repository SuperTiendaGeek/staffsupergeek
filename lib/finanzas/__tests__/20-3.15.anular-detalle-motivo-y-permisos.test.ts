/**
 * Test §9 #15 y #16 (Fase 20.3) — POST /api/finanzas/movimientos/[id]/anular:
 * motivo obligatorio y permisos admin-only.
 *
 * El route handler depende de sesión (cookies) y no se puede invocar en un
 * script plano sin ese contexto (mismo límite ya documentado en
 * lib/facturacion/__tests__/gancho.idempotencia.test.ts y en el test 20-2.7
 * de la Fase 20.2). Se verifica entonces a nivel de código fuente: que el
 * guard de `isAdministratorRole` con 403 y el guard de `motivo` vacío con
 * 400 están presentes y se ejecutan ANTES de llamar a `anularMovimiento`.
 * Ejecutar: npx tsx lib/finanzas/__tests__/20-3.15.anular-detalle-motivo-y-permisos.test.ts
 */

import fs from "fs";
import path from "path";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

const RUTA_ARCHIVO = path.join(process.cwd(), "app/api/finanzas/movimientos/[id]/anular/route.ts");

function main() {
  const fuente = fs.readFileSync(RUTA_ARCHIVO, "utf8");

  // Permisos — admin-only, 403 si no.
  assert(fuente.includes("isAdministratorRole"), "El endpoint verifica isAdministratorRole");
  assert(fuente.includes("status: 403"), "Responde 403 cuando el chequeo de admin falla");

  const indiceCheckAdmin = fuente.indexOf("isAdministratorRole");
  const indiceLlamadaAnular = fuente.indexOf("anularMovimiento(id, motivo)");
  assert(indiceCheckAdmin !== -1 && indiceLlamadaAnular !== -1 && indiceCheckAdmin < indiceLlamadaAnular, "El chequeo de admin ocurre ANTES de llamar a anularMovimiento");

  // Motivo obligatorio — 400 si viene vacío tras trim().
  assert(fuente.includes(".trim()"), "El motivo se normaliza con trim()");
  assert(fuente.includes("status: 400"), "Responde 400 cuando el motivo viene vacío");

  const indiceCheckMotivo = fuente.indexOf("if (!motivo)");
  assert(indiceCheckMotivo !== -1 && indiceCheckMotivo < indiceLlamadaAnular, "El chequeo de motivo vacío ocurre ANTES de llamar a anularMovimiento");

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — el endpoint de anular exige motivo y permiso admin antes de tocar el movimiento.");
}

main();
