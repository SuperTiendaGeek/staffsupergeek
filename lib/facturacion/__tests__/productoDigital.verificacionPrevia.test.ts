/**
 * Test — verificación previa de productos digitales antes de emitir
 * (lib/facturacion/reglas/productosDigitalesDisponibles.ts).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/productoDigital.verificacionPrevia.test.ts
 *
 * Cubre:
 *   (d) la verificación previa bloquea si el producto dejó de estar
 *       Disponible (o quedó vinculado a una orden) entre que se armó la
 *       factura y se pulsó emitir — releyendo Airtable, no confiando en lo
 *       que vio el formulario.
 *
 * calcularProductosDigitalesNoDisponibles() es pura (sin red). El wrapper
 * async verificarProductosDigitalesDisponibles() se prueba aparte con
 * global.fetch reemplazado por un doble — nunca toca Airtable real.
 *
 * Lanza en la primera falla y sale con código distinto de 0.
 */

import {
  calcularProductosDigitalesNoDisponibles,
  verificarProductosDigitalesDisponibles,
  mensajeProductosDigitalesNoDisponibles,
} from "../reglas/productosDigitalesDisponibles";
import type { DetalleFactura } from "../types/factura";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

function lineaProductoDigital(productoDigitalId: string, descripcion = "Windows 11 Pro"): DetalleFactura {
  return {
    descripcion, cantidad: 1, precioUnitario: 21.74, descuento: 0, precioTotalSinImpuesto: 21.74,
    impuestos: [{ codigo: "2", codigoPorcentaje: "4", tarifa: 15, baseImponible: 21.74, valor: 3.26 }],
    tipo: "productoDigital", productoDigitalId,
  };
}

// ─── calcularProductosDigitalesNoDisponibles — parte pura ────────────────────

{
  const estadoActual = new Map([["recPD1", { estado: "Disponible", tieneOrden: false }]]);
  const noDisponibles = calcularProductosDigitalesNoDisponibles([lineaProductoDigital("recPD1")], estadoActual);
  assert(noDisponibles.length === 0, "Disponible y sin orden → no bloquea");
}
{
  // (d) — el caso central: alguien lo vendió (o lo vinculó a una orden) en
  // otra pestaña entre que se armó la factura y se pulsó "Emitir".
  const estadoActual = new Map([["recPD1", { estado: "Usado", tieneOrden: false }]]);
  const noDisponibles = calcularProductosDigitalesNoDisponibles([lineaProductoDigital("recPD1")], estadoActual);
  assert(noDisponibles[0]?.motivo === "NO_DISPONIBLE", "(d) Estado ya no es Disponible → bloquea con NO_DISPONIBLE");
}
{
  const estadoActual = new Map([["recPD1", { estado: "Disponible", tieneOrden: true }]]);
  const noDisponibles = calcularProductosDigitalesNoDisponibles([lineaProductoDigital("recPD1")], estadoActual);
  assert(noDisponibles[0]?.motivo === "YA_VINCULADO_A_ORDEN", "(d) Quedó vinculado a una orden mientras tanto → bloquea con YA_VINCULADO_A_ORDEN");
}
{
  // Fail-closed: no encontrado (borrado, o id inválido) también bloquea.
  const noDisponibles = calcularProductosDigitalesNoDisponibles([lineaProductoDigital("recFANTASMA")], new Map());
  assert(noDisponibles[0]?.motivo === "NO_ENCONTRADO", "Producto que no existe → bloquea con NO_ENCONTRADO (fail-closed)");
}
{
  // Prioridad: vinculado a orden Y ya no Disponible a la vez reporta el
  // motivo más específico (la vinculación, que es el foco de este trabajo).
  const estadoActual = new Map([["recPD1", { estado: "Usado", tieneOrden: true }]]);
  const noDisponibles = calcularProductosDigitalesNoDisponibles([lineaProductoDigital("recPD1")], estadoActual);
  assert(noDisponibles[0]?.motivo === "YA_VINCULADO_A_ORDEN", "Con ambos problemas a la vez, prioriza YA_VINCULADO_A_ORDEN");
}
{
  // Líneas que no son de producto digital se ignoran por completo.
  const lineaServicio: DetalleFactura = {
    descripcion: "Diagnóstico", cantidad: 1, precioUnitario: 20, descuento: 0, precioTotalSinImpuesto: 20,
    impuestos: [{ codigo: "2", codigoPorcentaje: "4", tarifa: 15, baseImponible: 20, valor: 3 }],
    tipo: "servicio",
  };
  const noDisponibles = calcularProductosDigitalesNoDisponibles([lineaServicio], new Map());
  assert(noDisponibles.length === 0, "Una línea de servicio nunca entra a esta verificación");
}
{
  const mensaje = mensajeProductosDigitalesNoDisponibles([
    { productoDigitalId: "recPD1", descripcion: "Windows 11 Pro", motivo: "YA_VINCULADO_A_ORDEN" },
  ]);
  assert(mensaje.includes("Windows 11 Pro"), "El mensaje identifica el producto por su nombre");
  assert(mensaje.includes("orden de reparación"), "El mensaje en español explica por qué (vinculado a una orden)");
}

// ─── verificarProductosDigitalesDisponibles — con doble de fetch ────────────

const fetchOriginal = global.fetch;
function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

async function testAsync(): Promise<void> {
  process.env.AIRTABLE_API_KEY = "fake-token-para-test";
  process.env.AIRTABLE_BASE_ID = "appFAKE0000000003";

  try {
    // (d) end-to-end: la línea llegó al formulario como "Disponible", pero
    // Airtable, releído justo antes de emitir, dice que ya no lo está.
    global.fetch = ((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (decodeURIComponent(url).includes("/Productos Digitales")) {
        return Promise.resolve(json({
          records: [{ id: "recPD1", fields: { "Estado": "Usado", "Orden de Reparación": [] } }],
        }));
      }
      throw new Error(`fetch inesperado: ${url}`);
    }) as unknown as typeof fetch;

    const noDisponibles = await verificarProductosDigitalesDisponibles([lineaProductoDigital("recPD1")]);
    assert(noDisponibles.length === 1, "(d) end-to-end: releído justo antes de emitir, bloquea 1 producto");
    assert(noDisponibles[0]?.motivo === "NO_DISPONIBLE", "(d) end-to-end: motivo NO_DISPONIBLE");

    // Sin líneas de producto digital: cero llamadas a Airtable.
    global.fetch = (() => { throw new Error("no debería llamar a fetch"); }) as unknown as typeof fetch;
    const vacio = await verificarProductosDigitalesDisponibles([]);
    assert(vacio.length === 0, "Sin líneas de producto digital, no hay nada que verificar (y no toca red)");
  } finally {
    global.fetch = fetchOriginal;
    delete process.env.AIRTABLE_API_KEY;
    delete process.env.AIRTABLE_BASE_ID;
  }
}

testAsync().then(() => {
  if (fallos > 0) {
    console.error(`\n❌ productoDigital.verificacionPrevia.test.ts — ${fallos} aserción(es) fallida(s)`);
    process.exit(1);
  }
  console.log("\n✅ productoDigital.verificacionPrevia.test.ts — todos los asserts pasaron");
});
