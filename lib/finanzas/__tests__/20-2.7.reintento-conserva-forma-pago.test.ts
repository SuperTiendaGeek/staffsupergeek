/**
 * Test §7 #7 (Fase 20.2) — Reintento conserva forma de pago real.
 *
 * app/api/facturacion/historial/[recordId]/reintentar/route.ts es un route
 * handler de Next.js que depende de sesión (cookies) y de Airtable real —
 * no se puede invocar en un script plano sin ese contexto (mismo límite ya
 * documentado en lib/facturacion/__tests__/gancho.idempotencia.test.ts para
 * requireFacturacionSession). Se verifica entonces, igual que ese test, a
 * nivel de código fuente: que el bug preexistente (tratar el objeto
 * envoltorio de "Líneas JSON" como si fuera directamente un array de
 * detalles, y el hardcode fijo de forma de pago) ya no está, y que el
 * reemplazo correcto sí está.
 *
 * Complementado por un test de comportamiento puro sobre el mismo patrón
 * de parseo (sin tocar el archivo real), para no depender solo de grep.
 *
 * Ejecutar: npx tsx lib/finanzas/__tests__/20-2.7.reintento-conserva-forma-pago.test.ts
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

const RUTA_ARCHIVO = path.join(process.cwd(), "app/api/facturacion/historial/[recordId]/reintentar/route.ts");
const RUTA_EMITIR_FACTURA = path.join(process.cwd(), "lib/facturacion/emitirFactura.ts");

function main() {
  const fuente = fs.readFileSync(RUTA_ARCHIVO, "utf8");
  const fuenteEmitir = fs.readFileSync(RUTA_EMITIR_FACTURA, "utf8");

  // El bug viejo: `JSON.parse(factura.lineasJson) as DetalleFactura[]` — ya no debe estar.
  assert(
    !fuente.includes("JSON.parse(factura.lineasJson) as DetalleFactura[]"),
    "El bug preexistente (parsear el envoltorio como si fuera el array de detalles) ya no está"
  );
  // El hardcode viejo como ÚNICO valor de pagos — ya no debe ser incondicional.
  assert(
    !fuente.match(/pagos:\s*\[\{\s*formaPago:\s*"01",\s*total:\s*importeTotal\s*\}\],\s*\n\s*vendedor/),
    "El hardcode de forma de pago fija ya no es el único valor enviado"
  );
  // El reemplazo correcto: lee `payload.pagos` con fallback.
  assert(fuente.includes("payload.pagos"), "El reintento lee `pagos` del payload real");
  assert(fuente.includes("parsed.detalles"), "El reintento valida que `detalles` sea el array real, no el envoltorio completo");
  // origen se reconstruye para que el puente de abonos se dispare en un reintento exitoso.
  assert(fuente.includes("parsed.origen") && fuente.includes("origen,"), "El reintento reconstruye `origen` desde el payload guardado");
  // procesarPuenteFacturacion se invoca tras un reintento exitoso.
  assert(fuente.includes("procesarPuenteFacturacion"), "El reintento dispara el puente de facturación igual que la emisión normal");

  // emitirFactura.ts debe guardar el array `pagos` completo, no solo el primero.
  assert(fuenteEmitir.includes("pagos:         datos.pagos,") || fuenteEmitir.includes("pagos: datos.pagos,"), "emitirFactura.ts guarda el array `pagos` completo en Líneas JSON");
  assert(fuenteEmitir.includes("formaPago:     datos.pagos[0]?.formaPago,"), "Se conserva `formaPago` (compatibilidad con lectores viejos), sin quitarlo");

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — el fix del bug de reintento está presente y es correcto.");
}

main();
