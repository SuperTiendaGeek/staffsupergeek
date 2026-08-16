/**
 * Test — verificación previa de productos digitales antes de emitir
 * (lib/facturacion/reglas/productosDigitalesDisponibles.ts).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/productoDigital.verificacionPrevia.test.ts
 *
 * La regla depende del ORIGEN de la factura — un producto digital facturado
 * desde SU PROPIA orden está, a la vez, "Disponible" (vincular ya no marca
 * "Usado", commit 8a6ca33) Y vinculado a esa orden: es el camino normal, no
 * un problema. La versión anterior de este archivo NO cubría ese caso y
 * bloqueaba SIEMPRE que hubiera cualquier orden vinculada — eso rompía el
 * camino orden → factura que ya está en producción (PR #68): facturar
 * OR000423 u OR000403 habría fallado con 400.
 *
 * Cubre:
 *   (a) factura desde la orden X, producto Disponible vinculado a X → NO bloquea
 *       — LA PRUEBA IMPORTANTE. Verificada al revés más abajo: con la
 *       versión rota (sin mirar el origen), esta prueba SÍ falla.
 *   (b) factura desde la orden X, producto vinculado a la orden Y → bloquea
 *   (c) mostrador, producto vinculado a cualquier orden → bloquea
 *   (d) mostrador, producto sin orden y Disponible → no bloquea
 *   (e) en los dos caminos, producto que no está Disponible → bloquea
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

// (a) — LA PRUEBA IMPORTANTE: factura desde la orden X, producto Disponible
// vinculado a X. Es exactamente el estado real de OR000423/OR000403.
{
  const estadoActual = new Map([["recPD1", { estado: "Disponible", ordenIds: ["recORDX"] }]]);
  const noDisponibles = calcularProductosDigitalesNoDisponibles(
    [lineaProductoDigital("recPD1")], estadoActual, "recORDX"
  );
  assert(noDisponibles.length === 0, "(a) Disponible y vinculado a SU PROPIA orden (X) → NO bloquea");
}

// (b) — vinculado a una orden DISTINTA de la de origen.
{
  const estadoActual = new Map([["recPD1", { estado: "Disponible", ordenIds: ["recORDY"] }]]);
  const noDisponibles = calcularProductosDigitalesNoDisponibles(
    [lineaProductoDigital("recPD1")], estadoActual, "recORDX"
  );
  assert(noDisponibles[0]?.motivo === "YA_VINCULADO_A_ORDEN", "(b) Vinculado a OTRA orden (Y, no X) → bloquea");
  assert(noDisponibles[0]?.ordenesVinculadasIds?.includes("recORDY") === true, "(b) El bloqueo trae el id de la otra orden");
  assert(noDisponibles[0]?.ordenesVinculadasIds?.includes("recORDX") !== true, "(b) Nunca incluye la orden de origen en la lista de 'otras'");
}

// (c) — mostrador (sin orden de origen): CUALQUIER vinculación bloquea.
{
  const estadoActual = new Map([["recPD1", { estado: "Disponible", ordenIds: ["recORDZ"] }]]);
  const noDisponibles = calcularProductosDigitalesNoDisponibles(
    [lineaProductoDigital("recPD1")], estadoActual, null
  );
  assert(noDisponibles[0]?.motivo === "YA_VINCULADO_A_ORDEN", "(c) Mostrador + vinculado a cualquier orden → bloquea");
}

// (d) — mostrador, sin ninguna orden vinculada y Disponible: el camino feliz.
{
  const estadoActual = new Map([["recPD1", { estado: "Disponible", ordenIds: [] }]]);
  const noDisponibles = calcularProductosDigitalesNoDisponibles(
    [lineaProductoDigital("recPD1")], estadoActual, null
  );
  assert(noDisponibles.length === 0, "(d) Mostrador, sin orden vinculada, Disponible → no bloquea");
}

// (e) — en los DOS caminos, Estado distinto de Disponible bloquea.
{
  // Desde una orden, sin ningún problema de vinculación (vinculado a la
  // propia X), pero ya no Disponible — por ejemplo, ya se facturó.
  const estadoActual = new Map([["recPD1", { estado: "Usado", ordenIds: ["recORDX"] }]]);
  const noDisponibles = calcularProductosDigitalesNoDisponibles(
    [lineaProductoDigital("recPD1")], estadoActual, "recORDX"
  );
  assert(noDisponibles[0]?.motivo === "NO_DISPONIBLE", "(e) Desde su orden, ya no Disponible → bloquea con NO_DISPONIBLE");
}
{
  // Mostrador, sin orden, pero ya no Disponible.
  const estadoActual = new Map([["recPD1", { estado: "Usado", ordenIds: [] }]]);
  const noDisponibles = calcularProductosDigitalesNoDisponibles(
    [lineaProductoDigital("recPD1")], estadoActual, null
  );
  assert(noDisponibles[0]?.motivo === "NO_DISPONIBLE", "(e) Mostrador, sin orden, ya no Disponible → bloquea con NO_DISPONIBLE");
}

// ─── Casos adicionales (fail-closed, prioridad, líneas ajenas) ───────────────

{
  // Fail-closed: no encontrado (borrado, o id inválido) también bloquea.
  const noDisponibles = calcularProductosDigitalesNoDisponibles([lineaProductoDigital("recFANTASMA")], new Map(), null);
  assert(noDisponibles[0]?.motivo === "NO_ENCONTRADO", "Producto que no existe → bloquea con NO_ENCONTRADO (fail-closed)");
}
{
  // Prioridad: vinculado a otra orden Y ya no Disponible a la vez reporta el
  // motivo más específico (la vinculación).
  const estadoActual = new Map([["recPD1", { estado: "Usado", ordenIds: ["recORDY"] }]]);
  const noDisponibles = calcularProductosDigitalesNoDisponibles(
    [lineaProductoDigital("recPD1")], estadoActual, "recORDX"
  );
  assert(noDisponibles[0]?.motivo === "YA_VINCULADO_A_ORDEN", "Con ambos problemas a la vez, prioriza YA_VINCULADO_A_ORDEN");
}
{
  // Líneas que no son de producto digital se ignoran por completo.
  const lineaServicio: DetalleFactura = {
    descripcion: "Diagnóstico", cantidad: 1, precioUnitario: 20, descuento: 0, precioTotalSinImpuesto: 20,
    impuestos: [{ codigo: "2", codigoPorcentaje: "4", tarifa: 15, baseImponible: 20, valor: 3 }],
    tipo: "servicio",
  };
  const noDisponibles = calcularProductosDigitalesNoDisponibles([lineaServicio], new Map(), null);
  assert(noDisponibles.length === 0, "Una línea de servicio nunca entra a esta verificación");
}
{
  const mensajeConId = mensajeProductosDigitalesNoDisponibles([
    { productoDigitalId: "recPD1", descripcion: "Windows 11 Pro", motivo: "YA_VINCULADO_A_ORDEN", ordenesVinculadasIds: ["recORDY"] },
  ]);
  assert(mensajeConId.includes("Windows 11 Pro"), "El mensaje identifica el producto por su nombre");
  assert(mensajeConId.includes("otra orden"), "El mensaje distingue 'otra orden' (nunca dice que es 'esta')");
  assert(mensajeConId.includes("recORDY"), "El mensaje incluye el id de la otra orden cuando se tiene a mano");

  const mensajeSinId = mensajeProductosDigitalesNoDisponibles([
    { productoDigitalId: "recPD1", descripcion: "Office 365", motivo: "YA_VINCULADO_A_ORDEN" },
  ]);
  assert(mensajeSinId.includes("otra orden"), "Sin ids a mano, igual distingue 'otra orden'");
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
    // (a) end-to-end: facturando desde la orden recORDX, el producto está
    // vinculado a esa misma orden — no debe bloquear.
    global.fetch = ((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (decodeURIComponent(url).includes("/Productos Digitales")) {
        return Promise.resolve(json({
          records: [{ id: "recPD1", fields: { "Estado": "Disponible", "Orden de Reparación": ["recORDX"] } }],
        }));
      }
      throw new Error(`fetch inesperado: ${url}`);
    }) as unknown as typeof fetch;

    const desdeSuOrden = await verificarProductosDigitalesDisponibles([lineaProductoDigital("recPD1")], "recORDX");
    assert(desdeSuOrden.length === 0, "(a) end-to-end: facturando desde su propia orden, no bloquea");

    // Releído justo antes de emitir, dice que ya no está Disponible.
    global.fetch = ((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (decodeURIComponent(url).includes("/Productos Digitales")) {
        return Promise.resolve(json({
          records: [{ id: "recPD1", fields: { "Estado": "Usado", "Orden de Reparación": [] } }],
        }));
      }
      throw new Error(`fetch inesperado: ${url}`);
    }) as unknown as typeof fetch;

    const noDisponibles = await verificarProductosDigitalesDisponibles([lineaProductoDigital("recPD1")], null);
    assert(noDisponibles.length === 1, "(e) end-to-end: releído justo antes de emitir, bloquea 1 producto");
    assert(noDisponibles[0]?.motivo === "NO_DISPONIBLE", "(e) end-to-end: motivo NO_DISPONIBLE");

    // Sin líneas de producto digital: cero llamadas a Airtable.
    global.fetch = (() => { throw new Error("no debería llamar a fetch"); }) as unknown as typeof fetch;
    const vacio = await verificarProductosDigitalesDisponibles([], null);
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
