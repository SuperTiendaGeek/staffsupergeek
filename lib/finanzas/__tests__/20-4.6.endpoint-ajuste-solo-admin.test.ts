/**
 * Test §7 #6 (Fase 20.4) — POST /api/finanzas/cuadres/[id]/ajuste: solo
 * admin. El route handler depende de sesión (cookies) y no se puede invocar
 * en un script plano sin ese contexto (mismo límite documentado en el test
 * 20-3.15 de la Fase 20.3). Se verifica a nivel de código fuente: el guard
 * de isAdministratorRole con 403 está presente y se ejecuta ANTES de llamar
 * a registrarAjusteDeCuadre.
 * Ejecutar: npx tsx lib/finanzas/__tests__/20-4.6.endpoint-ajuste-solo-admin.test.ts
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

const RUTA_ARCHIVO = path.join(process.cwd(), "app/api/finanzas/cuadres/[id]/ajuste/route.ts");

function main() {
  const fuente = fs.readFileSync(RUTA_ARCHIVO, "utf8");

  assert(fuente.includes("isAdministratorRole"), "El endpoint verifica isAdministratorRole");
  assert(fuente.includes("status: 403"), "Responde 403 cuando el chequeo de admin falla");

  const indiceCheckAdmin = fuente.indexOf("isAdministratorRole");
  const indiceLlamada = fuente.indexOf("registrarAjusteDeCuadre(");
  assert(
    indiceCheckAdmin !== -1 && indiceLlamada !== -1 && indiceCheckAdmin < indiceLlamada,
    "El chequeo de admin ocurre ANTES de llamar a registrarAjusteDeCuadre"
  );

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — el endpoint de ajuste exige permiso admin antes de tocar el cuadre.");
}

main();
