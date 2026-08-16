/**
 * Test — (f) una línea de producto digital NUNCA entra en los filtros que
 * mueven Shipping Items: verificación de stock, reverso de anulación,
 * reverso de nota de crédito.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/productoDigital.filtrosShippingItems.test.ts
 *
 * Los cuatro sitios que filtran por (tipo === "producto" && shippingItemId)
 * —lib/facturacion/reglas/stock.ts, gancho/postEmision.ts (cubierto en
 * productoDigital.postEmision.test.ts), anulaciones/reverso.ts,
 * notaCredito/revertirInventario.ts— existen exactamente para que un
 * producto digital ("productoDigital", tabla propia) nunca se confunda con
 * un Shipping Item real. Aquí se prueban los tres que faltan.
 *
 * Sin red donde la propia función lo permite (el filtro corta ANTES del
 * primer fetch); con un doble mínimo en los demás casos — incluida la rama
 * de reverso de anulación, que desde el trabajo de "productos digitales en
 * reverso" SÍ toca Productos Digitales (para devolverlos a Disponible) pero
 * NUNCA Shipping Items. En todos los casos, si Shipping Items llegara a
 * tocarse, el doble lanza y la prueba falla — es la garantía real, no una
 * lectura del código.
 *
 * Lanza en la primera falla y sale con código distinto de 0.
 */

import { calcularFaltantes, verificarStockDisponible } from "../reglas/stock";
import { revertirInventarioFacturaAnulada } from "../anulaciones/reverso";
import { revertirInventarioNotaCredito } from "../notaCredito/revertirInventario";
import type { DetalleFactura } from "../types/factura";
import type { DetalleNotaCredito } from "../notaCredito/types";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

const fetchOriginal = global.fetch;
function fetchQueLanza() {
  return async (url: string | URL) => {
    throw new Error(`fetch inesperado — no debería tocar red para solo-productos-digitales: ${String(url)}`);
  };
}

function lineaProductoDigital(productoDigitalId: string): DetalleFactura {
  return {
    descripcion: "Windows 11 Pro", cantidad: 1, precioUnitario: 17.39, descuento: 0, precioTotalSinImpuesto: 17.39,
    impuestos: [{ codigo: "2", codigoPorcentaje: "4", tarifa: 15, baseImponible: 17.39, valor: 2.61 }],
    tipo: "productoDigital", productoDigitalId,
  };
}

(async () => {
  process.env.AIRTABLE_API_KEY = "fake-token-para-test";
  process.env.AIRTABLE_BASE_ID = "appFAKEBASE0003";

  // ─── reglas/stock.ts — calcularFaltantes (pura) ────────────────────────────
  {
    const disponiblePorItem = new Map<string, number>(); // vacío a propósito: si mirara la línea digital, fallaría por no encontrarla
    const faltantes = calcularFaltantes([lineaProductoDigital("recPD1")], disponiblePorItem);
    assert(faltantes.length === 0, "calcularFaltantes ignora por completo una línea productoDigital (ni siquiera la reporta como sin stock)");
  }
  {
    // Mezclada con una línea de producto real sin stock: solo esta última debe reportarse.
    const lineaProducto: DetalleFactura = {
      descripcion: "Repuesto", cantidad: 1, precioUnitario: 10, descuento: 0, precioTotalSinImpuesto: 10,
      impuestos: [{ codigo: "2", codigoPorcentaje: "4", tarifa: 15, baseImponible: 10, valor: 1.5 }],
      tipo: "producto", shippingItemId: "recITEM1",
    };
    const faltantes = calcularFaltantes(
      [lineaProducto, lineaProductoDigital("recPD2")],
      new Map() // recITEM1 sin stock (0 disponible)
    );
    assert(faltantes.length === 1, "Mezclado con una línea real sin stock: solo se reporta esa, la digital no cuenta");
    assert(faltantes[0].shippingItemId === "recITEM1", "El único faltante reportado es el Shipping Item real, no el producto digital");
  }

  // ─── reglas/stock.ts — verificarStockDisponible (async, corta antes del fetch) ──
  {
    global.fetch = fetchQueLanza() as unknown as typeof fetch;
    const faltantes = await verificarStockDisponible([lineaProductoDigital("recPD3")]);
    assert(faltantes.length === 0, "verificarStockDisponible: solo-productos-digitales devuelve [] sin lanzar");
  }

  // ─── anulaciones/reverso.ts — revertirInventarioFacturaAnulada ─────────────
  // Desde el trabajo de reverso de productos digitales, una línea digital SÍ
  // genera fetch aquí (para devolverla a Disponible — ver
  // productoDigital.reverso.test.ts para ese comportamiento completo). Lo
  // que se prueba aquí es que, aun así, NUNCA toca Shipping Items.
  {
    global.fetch = ((url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes(encodeURIComponent("Productos Digitales"))) {
        // Sin la factura enlazada en el fixture: rama idempotente, sin PATCH.
        return Promise.resolve({ ok: true, json: async () => ({ records: [{ id: "recPD4", fields: { "Factura": [] } }] }) } as Response);
      }
      throw new Error(`fetch inesperado hacia Shipping Items u otra tabla: ${urlStr}`);
    }) as unknown as typeof fetch;

    const resultado = await revertirInventarioFacturaAnulada({
      facturaRecordId: "recFACT1",
      detalles: [lineaProductoDigital("recPD4")],
      ambiente: "2",
    });
    assert(resultado.estado === "OK", "revertirInventarioFacturaAnulada: solo-productos-digitales → OK");
    // Si hubiera intentado tocar Shipping Items, el doble ya habría lanzado
    // y este assert nunca se alcanzaría.
  }

  // ─── notaCredito/revertirInventario.ts — revertirInventarioNotaCredito ────
  // Con solo líneas digitales, aDevolver.length===0 → SÍ hace una escritura
  // (marca "Reverso Inventario"="OK" en la propia NC), pero NUNCA toca
  // Shipping Items. Doble mínimo: responde a esa única escritura y lanza
  // ante cualquier intento de tocar Shipping Items.
  {
    let escrituraNC: { fields: Record<string, unknown> } | null = null;
    global.fetch = (async (url: string | URL, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes(encodeURIComponent("Notas de Crédito Electrónicas"))) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { fields: Record<string, unknown> };
        escrituraNC = { fields: body.fields };
        return { ok: true, json: async () => ({ id: "recNC1", fields: body.fields }) } as Response;
      }
      throw new Error(`fetch inesperado hacia Shipping Items u otra tabla: ${urlStr}`);
    }) as unknown as typeof fetch;

    const detalleNC: DetalleNotaCredito = {
      descripcion: "Windows 11 Pro", cantidad: 1, precioUnitario: 17.39, descuento: 0, precioTotalSinImpuesto: 17.39,
      impuestos: [{ codigo: "2", codigoPorcentaje: "4", tarifa: 15, baseImponible: 17.39, valor: 2.61 }],
      tipo: "productoDigital", devolucionFisica: true, // aunque venga true, tipo !== "producto" lo descarta igual
    };

    const resultado = await revertirInventarioNotaCredito({
      notaCreditoRecordId: "recNC1",
      detalles: [detalleNC],
      ambiente: "2",
    });

    assert(resultado.estado === "OK", "revertirInventarioNotaCredito: solo-productos-digitales → OK");
    assert(escrituraNC !== null && (escrituraNC as { fields: Record<string, unknown> }).fields["Reverso Inventario"] === "OK", "Marca 'Reverso Inventario'=OK en la propia NC (sin items físicos)");
    // Ídem: si hubiera intentado un PATCH a Shipping Items, el doble ya
    // habría lanzado antes de llegar aquí.
  }

  global.fetch = fetchOriginal;
  delete process.env.AIRTABLE_API_KEY;
  delete process.env.AIRTABLE_BASE_ID;

  if (fallos > 0) {
    console.error(`\n❌ productoDigital.filtrosShippingItems.test.ts — ${fallos} aserción(es) fallida(s)`);
    process.exit(1);
  }
  console.log("\n✅ productoDigital.filtrosShippingItems.test.ts — todos los asserts pasaron");
})();
