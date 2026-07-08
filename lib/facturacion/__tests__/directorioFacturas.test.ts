/**
 * Test — directorioBaseFacturas() (fix/ride-fallback).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/directorioFacturas.test.ts
 *
 * Puro, sin red. Cubre el bug reportado en producción: FACTURAS_DIR
 * absoluta (p.ej. "/tmp/facturas-autorizadas" en Vercel) se estaba
 * concatenando con process.cwd() en vez de usarse tal cual, porque
 * path.join no resetea en un segundo argumento absoluto (a diferencia de
 * path.resolve).
 *
 * Lanza en la primera falla y sale con código distinto de 0.
 */

import path from "path";
import { directorioBaseFacturas } from "../almacenamiento/directorioFacturas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

const FACTURAS_DIR_ORIGINAL = process.env.FACTURAS_DIR;

// 1. Ruta absoluta: se usa tal cual, sin concatenar con process.cwd()
{
  process.env.FACTURAS_DIR = "/tmp/facturas-autorizadas";
  const resultado = directorioBaseFacturas();
  assert(resultado === "/tmp/facturas-autorizadas", "Ruta absoluta debe usarse tal cual, no concatenada con cwd");
  assert(!resultado.includes(process.cwd()), "La ruta absoluta no debe llevar el cwd del proyecto pegado adelante");
}

// 2. Ruta relativa: comportamiento actual — se une a process.cwd()
{
  process.env.FACTURAS_DIR = "mi-carpeta-relativa";
  const resultado = directorioBaseFacturas();
  assert(
    resultado === path.join(process.cwd(), "mi-carpeta-relativa"),
    "Ruta relativa debe unirse a process.cwd(), igual que antes"
  );
}

// 3. Sin FACTURAS_DIR: default "facturas-autorizadas", relativo a cwd
{
  delete process.env.FACTURAS_DIR;
  const resultado = directorioBaseFacturas();
  assert(
    resultado === path.join(process.cwd(), "facturas-autorizadas"),
    "Sin FACTURAS_DIR debe usar el default relativo de siempre"
  );
}

// 4. Ruta absoluta con separadores anidados (caso real de producción)
{
  process.env.FACTURAS_DIR = "/var/data/facturas/2026";
  const resultado = directorioBaseFacturas();
  assert(resultado === "/var/data/facturas/2026", "Ruta absoluta anidada también se usa tal cual");
}

if (FACTURAS_DIR_ORIGINAL === undefined) {
  delete process.env.FACTURAS_DIR;
} else {
  process.env.FACTURAS_DIR = FACTURAS_DIR_ORIGINAL;
}

if (fallos > 0) {
  console.error(`\n❌ directorioFacturas.test.ts — ${fallos} aserción(es) fallida(s)`);
  process.exit(1);
}
console.log("\n✅ directorioFacturas.test.ts — todos los asserts pasaron");
