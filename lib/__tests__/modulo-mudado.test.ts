/**
 * Rutas congeladas de Cotizaciones y Pedidos.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/__tests__/modulo-mudado.test.ts
 *
 * Cotizaciones y Pedidos se fusionaron en Operación Comercial. Sus pantallas ya
 * redirigían, pero sus 14 rutas de API seguían respondiendo y apuntaban a tres
 * tablas de Airtable borradas en esa migración: "Cotizaciones", "Opciones de
 * Cotización" y "Abonos de Cotización".
 *
 * Este test recorre las rutas de verdad —no una copia— y comprueba que todas
 * responden 410 sin tocar Airtable. Si alguien las "revive" sin darse cuenta,
 * esto falla.
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { moduloMudadoAOperaciones } from "../modulo-mudado";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

function rutasEn(dir: string): string[] {
  const encontradas: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) encontradas.push(...rutasEn(ruta));
    else if (entrada === "route.ts") encontradas.push(ruta);
  }
  return encontradas;
}

const METODOS = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;

async function main(): Promise<void> {
  // ── La respuesta en sí ────────────────────────────────────────────────────
  for (const modulo of ["Cotizaciones", "Pedidos"] as const) {
    const res = moduloMudadoAOperaciones(modulo);
    assert(res.status === 410, `${modulo}: responde 410 Gone (el recurso existió y ya no)`);
    const cuerpo = (await res.json()) as { success: boolean; error: string; redirectTo: string };
    assert(cuerpo.success === false, `${modulo}: la respuesta no finge éxito`);
    assert(cuerpo.redirectTo === "/operaciones", `${modulo}: indica a dónde ir`);
    assert(
      cuerpo.error.includes("Operaciones Comerciales"),
      `${modulo}: el mensaje explica el porqué, no da un error críptico de Airtable`
    );
  }

  // ── Todas las rutas de los dos módulos están congeladas ───────────────────
  const rutas = [...rutasEn("app/api/cotizaciones"), ...rutasEn("app/api/pedidos")];
  assert(rutas.length === 14, `Se revisan las 14 rutas de los módulos mudados (encontradas ${rutas.length})`);

  let handlersRevisados = 0;
  for (const ruta of rutas) {
    const modulo = await import(join(process.cwd(), ruta));
    const handlers = METODOS.filter((m) => typeof modulo[m] === "function");
    assert(handlers.length > 0, `${ruta}: expone al menos un método`);

    for (const nombre of handlers) {
      const res: Response = await modulo[nombre]();
      handlersRevisados++;
      assert(res.status === 410, `${ruta} · ${nombre} → 410`);
    }
  }
  assert(handlersRevisados >= 17, `Se probaron todos los métodos (${handlersRevisados})`);

  // ── Que no quede código llamando a Airtable en esas rutas ────────────────
  // Se miran los IMPORTS, no el texto: los comentarios mencionan Airtable a
  // propósito para explicar por qué la ruta está congelada.
  const { readFileSync } = await import("node:fs");
  const conAirtable = rutas.filter((r) =>
    readFileSync(r, "utf8")
      .split("\n")
      .some((linea) => /^\s*import\b/.test(linea) && /airtable|lib\/(cotizaciones|pedidos)/i.test(linea))
  );
  assert(
    conAirtable.length === 0,
    `Ninguna ruta congelada importa Airtable ni los módulos muertos (sospechosas: ${conAirtable.join(", ") || "ninguna"})`
  );

  if (fallos > 0) {
    console.error(`\n${fallos} assert(s) fallaron.`);
    process.exit(1);
  }
  console.log("\n✅ modulo-mudado.test.ts — todos los asserts pasaron");
}

void main();
