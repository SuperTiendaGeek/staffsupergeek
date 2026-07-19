/**
 * Test — postEmision() (gancho Fase 16 PR3, lib/facturacion/gancho/postEmision.ts)
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/gancho.postEmision.test.ts
 *
 * global.fetch reemplazado por un doble que dispatchea por tabla/método —
 * nunca toca Airtable real. Cubre exactamente los casos pedidos: post-emisión
 * feliz, fallo parcial simulado (con detalle + estado ERROR sin lanzar),
 * reintento idempotente (no re-toca lo ya Vendido+linkeado, no duplica
 * llamadas), factura de mostrador (nunca dispara nada — verificado a nivel
 * funcional Y de código fuente del endpoint de emisión), y factura
 * solo-servicios (nunca toca Shipping Items).
 *
 * Lanza en la primera falla y sale con código distinto de 0.
 */

import fs   from "fs";
import path from "path";
import { postEmision } from "../gancho/postEmision";
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

const fetchOriginal = global.fetch;

const FACTURA_ID = "recFACT0001";

// Estado simulado de Shipping Items en la "base" — mutable entre llamadas
// para poder verificar qué PATCH realmente se disparó.
// Fase 17.b: cantidad simula el campo "Cantidad" (inventario real).
type ItemSimulado = { id: string; estadoItem: string; facturaIds: string[]; cantidad: number; disponibleVenta?: boolean };

function crearDoble(items: Map<string, ItemSimulado>, idsQueFallan: Set<string>) {
  const patchesRecibidos: Array<{ id: string; fields: Record<string, unknown> }> = [];
  const syncWrites: Array<{ recordId: string; fields: Record<string, unknown> }> = [];

  const fetchDoble = async (url: string | URL, init?: RequestInit) => {
    const urlStr = String(url);
    const method = init?.method ?? "GET";

    // GET Shipping Items (fetchRecordsByIds — lectura de estado actual)
    if (method === "GET" && urlStr.includes("Shipping%20Items")) {
      const records = [...items.values()].map((it) => ({
        id: it.id,
        fields: { "Estado Item": it.estadoItem, "Factura": it.facturaIds, "Cantidad": it.cantidad },
      }));
      return { ok: true, json: async () => ({ records }) } as Response;
    }

    // PATCH Shipping Items/{id}
    if (method === "PATCH" && urlStr.includes("Shipping%20Items/")) {
      const id = urlStr.split("Shipping%20Items/")[1];
      if (idsQueFallan.has(id)) {
        return { ok: false, status: 422, text: async () => "simulado: error de validación" } as Response;
      }
      const body = JSON.parse(String(init?.body)) as { fields: Record<string, unknown> };
      patchesRecibidos.push({ id, fields: body.fields });
      const actual = items.get(id)!;
      items.set(id, {
        ...actual,
        estadoItem: (body.fields["Estado Item"] as string) ?? actual.estadoItem,
        facturaIds: (body.fields["Factura"] as string[]) ?? actual.facturaIds,
        cantidad:   typeof body.fields["Cantidad"] === "number" ? (body.fields["Cantidad"] as number) : actual.cantidad,
        disponibleVenta:
          typeof body.fields["Disponible para venta"] === "boolean"
            ? (body.fields["Disponible para venta"] as boolean)
            : actual.disponibleVenta,
      });
      return { ok: true, json: async () => ({ id, fields: body.fields }) } as Response;
    }

    // PATCH Facturas Electrónicas/{id} (actualizarSincronizacionInventario)
    if (method === "PATCH" && urlStr.includes(encodeURIComponent("Facturas Electrónicas"))) {
      const body = JSON.parse(String(init?.body)) as { fields: Record<string, unknown> };
      syncWrites.push({ recordId: FACTURA_ID, fields: body.fields });
      return { ok: true, json: async () => ({ id: FACTURA_ID, fields: body.fields }) } as Response;
    }

    throw new Error(`fetch inesperado en el test hacia: ${method} ${urlStr}`);
  };

  return { fetchDoble, patchesRecibidos, syncWrites };
}

function lineaProducto(shippingItemId: string, descripcion = "Repuesto"): DetalleFactura {
  return {
    descripcion,
    cantidad: 1,
    precioUnitario: 10,
    descuento: 0,
    precioTotalSinImpuesto: 10,
    impuestos: [{ codigo: "2", codigoPorcentaje: "4", tarifa: 15, baseImponible: 10, valor: 1.5 }],
    tipo: "producto",
    shippingItemId,
  };
}

function lineaServicio(descripcion = "Mano de obra"): DetalleFactura {
  return {
    descripcion,
    cantidad: 1,
    precioUnitario: 20,
    descuento: 0,
    precioTotalSinImpuesto: 20,
    impuestos: [{ codigo: "2", codigoPorcentaje: "4", tarifa: 15, baseImponible: 20, valor: 3 }],
    tipo: "servicio",
  };
}

// Línea "de mostrador" o manual: nunca lleva tipo/shippingItemId.
function lineaManual(descripcion = "Producto de mostrador"): DetalleFactura {
  return {
    descripcion,
    cantidad: 1,
    precioUnitario: 15,
    descuento: 0,
    precioTotalSinImpuesto: 15,
    impuestos: [{ codigo: "2", codigoPorcentaje: "4", tarifa: 15, baseImponible: 15, valor: 2.25 }],
  };
}

(async () => {
  process.env.AIRTABLE_API_KEY = "fake-token-para-test";
  process.env.AIRTABLE_BASE_ID = "appFAKEBASE0001";

  // ─── (a) post-emisión feliz — items de 1 unidad se agotan y quedan Vendido ──
  {
    const items = new Map<string, ItemSimulado>([
      ["recITEM1", { id: "recITEM1", estadoItem: "Disponible", facturaIds: [], cantidad: 1 }],
      ["recITEM2", { id: "recITEM2", estadoItem: "Disponible", facturaIds: [], cantidad: 1 }],
    ]);
    const { fetchDoble, patchesRecibidos } = crearDoble(items, new Set());
    global.fetch = fetchDoble as unknown as typeof fetch;

    const resultado = await postEmision({
      facturaRecordId: FACTURA_ID,
      detalles: [lineaProducto("recITEM1"), lineaProducto("recITEM2"), lineaServicio()],
      ambiente: "2",
    });

    assert(resultado.estado === "OK", "Feliz: estado final OK");
    assert(patchesRecibidos.length === 2, "Feliz: solo 2 PATCH (uno por cada item producto, el servicio se ignora)");
    assert(items.get("recITEM1")!.estadoItem === "Vendido", "Feliz: recITEM1 (1 unidad, agotado) queda Vendido");
    assert(items.get("recITEM1")!.cantidad === 0, "Feliz: recITEM1 queda con Cantidad 0");
    assert(items.get("recITEM1")!.disponibleVenta === false, "Feliz: recITEM1 agotado deja de estar Disponible para venta");
    assert(items.get("recITEM1")!.facturaIds.includes(FACTURA_ID), "Feliz: recITEM1 queda linkeado a la factura");
    assert(items.get("recITEM2")!.estadoItem === "Vendido", "Feliz: recITEM2 queda Vendido");
  }

  // ─── (a bis) Fase 17.b — venta PARCIAL: descuenta sin agotar ────────────────
  {
    const items = new Map<string, ItemSimulado>([
      ["recITEM5", { id: "recITEM5", estadoItem: "Repuesto", facturaIds: [], cantidad: 5 }],
    ]);
    const { fetchDoble, patchesRecibidos } = crearDoble(items, new Set());
    global.fetch = fetchDoble as unknown as typeof fetch;

    const linea = { ...lineaProducto("recITEM5", "RAM Hynix 1GB (vende 2 de 5)"), cantidad: 2 };
    const resultado = await postEmision({
      facturaRecordId: FACTURA_ID,
      detalles: [linea],
      ambiente: "2",
    });

    assert(resultado.estado === "OK", "Parcial: estado OK");
    assert(patchesRecibidos.length === 1, "Parcial: un solo PATCH");
    assert(items.get("recITEM5")!.cantidad === 3, "Parcial: Cantidad 5 - 2 = 3");
    assert(items.get("recITEM5")!.estadoItem === "Repuesto", "Parcial: con stock restante NO se marca Vendido (estado logístico intacto)");
    assert(items.get("recITEM5")!.disponibleVenta === undefined, "Parcial: Disponible para venta no se toca con stock restante");
    assert(items.get("recITEM5")!.facturaIds.includes(FACTURA_ID), "Parcial: el link a la factura sí se registra (marca de idempotencia)");
  }

  // ─── (a ter) Fase 17.b — links se ACUMULAN, no se reemplazan ────────────────
  {
    const items = new Map<string, ItemSimulado>([
      ["recITEM6", { id: "recITEM6", estadoItem: "Repuesto", facturaIds: ["recFACTVIEJA"], cantidad: 2 }],
    ]);
    const { fetchDoble } = crearDoble(items, new Set());
    global.fetch = fetchDoble as unknown as typeof fetch;

    const resultado = await postEmision({
      facturaRecordId: FACTURA_ID,
      detalles: [lineaProducto("recITEM6")],
      ambiente: "2",
    });

    assert(resultado.estado === "OK", "Append: estado OK");
    assert(items.get("recITEM6")!.facturaIds.includes("recFACTVIEJA"), "Append: la factura anterior se conserva");
    assert(items.get("recITEM6")!.facturaIds.includes(FACTURA_ID), "Append: la factura nueva se agrega");
    assert(items.get("recITEM6")!.cantidad === 1, "Append: Cantidad 2 - 1 = 1");
  }

  // ─── (a quater) Fase 17.b — stock insuficiente al descontar: clamp a 0 + ERROR ──
  {
    const items = new Map<string, ItemSimulado>([
      ["recITEM7", { id: "recITEM7", estadoItem: "Repuesto", facturaIds: [], cantidad: 1 }],
    ]);
    const { fetchDoble, syncWrites } = crearDoble(items, new Set());
    global.fetch = fetchDoble as unknown as typeof fetch;

    const linea = { ...lineaProducto("recITEM7", "Repuesto sobrevendido"), cantidad: 3 };
    const resultado = await postEmision({
      facturaRecordId: FACTURA_ID,
      detalles: [linea],
      ambiente: "2",
    });

    assert(resultado.estado === "ERROR", "Sobreventa: estado ERROR (la factura ya es real, pero queda constancia)");
    assert(!!resultado.detalle && resultado.detalle.includes("stock insuficiente"), "Sobreventa: el detalle explica el descuadre");
    assert(items.get("recITEM7")!.cantidad === 0, "Sobreventa: Cantidad queda en 0, nunca negativa");
    assert(items.get("recITEM7")!.estadoItem === "Vendido", "Sobreventa: stock agotado queda Vendido");
    assert(
      syncWrites.some((w) => w.fields["Sincronización Inventario"] === "ERROR"),
      "Sobreventa: Sincronización Inventario queda ERROR para revisión manual"
    );
  }

  // ─── (e) factura solo-servicios desde el gancho ──────────────────────────────
  {
    const items = new Map<string, ItemSimulado>();
    const { fetchDoble, patchesRecibidos, syncWrites } = crearDoble(items, new Set());
    global.fetch = fetchDoble as unknown as typeof fetch;

    const resultado = await postEmision({
      facturaRecordId: FACTURA_ID,
      detalles: [lineaServicio("Diagnóstico"), lineaServicio("Mano de obra")],
      ambiente: "2",
    });

    assert(resultado.estado === "OK", "Solo-servicios: estado OK");
    assert(patchesRecibidos.length === 0, "Solo-servicios: nunca se toca Shipping Items");
    assert(
      syncWrites.some((w) => w.fields["Sincronización Inventario"] === "OK"),
      "Solo-servicios: se marca OK directo, sin pasar por PENDIENTE con items"
    );
  }

  // ─── (d) factura de mostrador (líneas sin tipo/shippingItemId) ──────────────
  {
    const items = new Map<string, ItemSimulado>();
    const { fetchDoble, patchesRecibidos } = crearDoble(items, new Set());
    global.fetch = fetchDoble as unknown as typeof fetch;

    const resultado = await postEmision({
      facturaRecordId: FACTURA_ID,
      detalles: [lineaManual(), lineaManual("Otro producto de mostrador")],
      ambiente: "2",
    });

    assert(resultado.estado === "OK", "Mostrador: si por error se invocara, resuelve OK sin tocar nada");
    assert(patchesRecibidos.length === 0, "Mostrador: líneas sin tipo/shippingItemId nunca generan PATCH a Shipping Items");
  }

  // ─── (b) fallo parcial simulado ───────────────────────────────────────────────
  {
    const items = new Map<string, ItemSimulado>([
      ["recITEM1", { id: "recITEM1", estadoItem: "Disponible", facturaIds: [], cantidad: 1 }],
      ["recITEM2", { id: "recITEM2", estadoItem: "Disponible", facturaIds: [], cantidad: 1 }],
    ]);
    const { fetchDoble, syncWrites } = crearDoble(items, new Set(["recITEM2"]));
    global.fetch = fetchDoble as unknown as typeof fetch;

    const resultado = await postEmision({
      facturaRecordId: FACTURA_ID,
      detalles: [lineaProducto("recITEM1"), lineaProducto("recITEM2", "Repuesto que falla")],
      ambiente: "2",
    });

    assert(resultado.estado === "ERROR", "Fallo parcial: estado final ERROR (no lanza excepción)");
    assert(!!resultado.detalle && resultado.detalle.includes("recITEM2"), "Fallo parcial: el detalle menciona el item que falló");
    assert(!!resultado.detalle && resultado.detalle.includes("1/2"), "Fallo parcial: el detalle refleja cuántos sí se sincronizaron (1 de 2)");
    assert(items.get("recITEM1")!.estadoItem === "Vendido", "Fallo parcial: el item que SÍ funcionó queda Vendido igual");
    assert(items.get("recITEM2")!.estadoItem === "Disponible", "Fallo parcial: el item que falló NO queda marcado");
    assert(
      syncWrites.some((w) => w.fields["Sincronización Inventario"] === "ERROR" && typeof w.fields["Error Sincronización"] === "string"),
      "Fallo parcial: Sincronización Inventario queda ERROR con Error Sincronización con detalle"
    );
  }

  // ─── (c) reintento idempotente ────────────────────────────────────────────────
  {
    // recITEM1 ya quedó Vendido + linkeado a ESTA factura en el intento
    // anterior (falló solo recITEM2) — el reintento no debe volver a
    // tocarlo ni contarlo como error.
    const items = new Map<string, ItemSimulado>([
      ["recITEM1", { id: "recITEM1", estadoItem: "Vendido", facturaIds: [FACTURA_ID], cantidad: 0 }],
      ["recITEM2", { id: "recITEM2", estadoItem: "Disponible", facturaIds: [], cantidad: 1 }],
    ]);
    const { fetchDoble, patchesRecibidos } = crearDoble(items, new Set());
    global.fetch = fetchDoble as unknown as typeof fetch;

    const resultado = await postEmision({
      facturaRecordId: FACTURA_ID,
      detalles: [lineaProducto("recITEM1"), lineaProducto("recITEM2")],
      ambiente: "2",
    });

    assert(resultado.estado === "OK", "Reintento: estado final OK tras reparar lo que faltaba");
    assert(patchesRecibidos.length === 1, "Reintento: solo 1 PATCH — recITEM1 ya estaba hecho, no se vuelve a tocar");
    assert(patchesRecibidos[0].id === "recITEM2", "Reintento: el único PATCH es sobre el item que faltaba (recITEM2)");
    assert(items.get("recITEM2")!.estadoItem === "Vendido", "Reintento: recITEM2 queda reparado");
  }

  // ─── (c bis) reintento cuando TODO ya estaba hecho — no debe tocar nada ──────
  {
    const items = new Map<string, ItemSimulado>([
      ["recITEM1", { id: "recITEM1", estadoItem: "Vendido", facturaIds: [FACTURA_ID], cantidad: 0 }],
    ]);
    const { fetchDoble, patchesRecibidos } = crearDoble(items, new Set());
    global.fetch = fetchDoble as unknown as typeof fetch;

    const resultado = await postEmision({
      facturaRecordId: FACTURA_ID,
      detalles: [lineaProducto("recITEM1")],
      ambiente: "2",
    });

    assert(resultado.estado === "OK", "Reintento (todo hecho): estado OK");
    assert(patchesRecibidos.length === 0, "Reintento (todo hecho): cero PATCH — no duplica trabajo ya hecho");
  }

  // ─── (f) Fase 17 — guard de ambiente: pruebas NUNCA debe tocar Shipping Items ──
  {
    const items = new Map<string, ItemSimulado>([
      ["recITEM1", { id: "recITEM1", estadoItem: "Disponible", facturaIds: [], cantidad: 1 }],
    ]);
    const { fetchDoble, patchesRecibidos } = crearDoble(items, new Set());
    global.fetch = fetchDoble as unknown as typeof fetch;

    const resultado = await postEmision({
      facturaRecordId: FACTURA_ID,
      detalles: [lineaProducto("recITEM1")],
      ambiente: "1", // PRUEBAS
    });

    assert(resultado.estado === "OK", "Guard ambiente pruebas: responde OK (nada que reportar como error)");
    assert(patchesRecibidos.length === 0, "Guard ambiente pruebas: CERO llamadas a Shipping Items, ni de lectura ni de escritura");
    assert(items.get("recITEM1")!.estadoItem === "Disponible", "Guard ambiente pruebas: el item real queda intacto");
  }

  // ─── (g) Fase 17 — guard de ambiente: sin ambiente definido también debe fallar cerrado ──
  {
    const items = new Map<string, ItemSimulado>([
      ["recITEM1", { id: "recITEM1", estadoItem: "Disponible", facturaIds: [], cantidad: 1 }],
    ]);
    const { fetchDoble, patchesRecibidos } = crearDoble(items, new Set());
    global.fetch = fetchDoble as unknown as typeof fetch;

    const resultado = await postEmision({
      facturaRecordId: FACTURA_ID,
      detalles: [lineaProducto("recITEM1")],
      // sin `ambiente` — no debe asumir producción por omisión
    });

    assert(resultado.estado === "OK", "Guard ambiente indefinido: responde OK");
    assert(patchesRecibidos.length === 0, "Guard ambiente indefinido: fail-closed — cero llamadas a Shipping Items");
  }

  global.fetch = fetchOriginal;
  delete process.env.AIRTABLE_API_KEY;
  delete process.env.AIRTABLE_BASE_ID;

  // ─── Mostrador — verificación a nivel de código fuente ───────────────────────
  // El endpoint de emisión solo llama a postEmision() cuando el body trae
  // origen (gancho); mostrador jamás manda origen, así que el guard en el
  // código fuente es la garantía real de que nunca se dispara para mostrador.
  const rutaEmitir = path.join(__dirname, "..", "..", "..", "app", "api", "facturacion", "emitir", "route.ts");
  const codigoEmitir = fs.readFileSync(rutaEmitir, "utf8");
  assert(
    codigoEmitir.includes("postEmision"),
    "El endpoint de emisión debe invocar postEmision()"
  );
  assert(
    /if\s*\([^)]*body\.origen[^)]*\)\s*\{[\s\S]*?postEmision/.test(codigoEmitir),
    "postEmision() debe estar condicionado a que el body traiga origen (mostrador nunca lo manda)"
  );
  assert(
    codigoEmitir.includes("resultado.estado === \"AUTORIZADO\""),
    "postEmision() debe estar condicionado también a que la emisión haya quedado AUTORIZADO"
  );

  if (fallos > 0) {
    console.error(`\n❌ gancho.postEmision.test.ts — ${fallos} aserción(es) fallida(s)`);
    process.exit(1);
  }
  console.log("\n✅ gancho.postEmision.test.ts — todos los asserts pasaron");
})();
