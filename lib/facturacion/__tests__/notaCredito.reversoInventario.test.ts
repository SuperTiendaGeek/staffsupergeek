/**
 * Test — reverso de inventario de la nota de crédito (Fase 18 PR2a).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/notaCredito.reversoInventario.test.ts
 *
 * Espejo del test de postEmision. global.fetch se reemplaza por un doble que
 * simula Shipping Items + la tabla de NC. Cubre: suma de vuelta al stock,
 * reactivación de un item agotado, guard de ambiente (pruebas no toca nada),
 * solo devolución física mueve inventario, idempotencia por link de NC, y
 * agrupación de varias líneas del mismo item.
 *
 * Lanza en la primera falla y sale con código distinto de 0.
 */

import { revertirInventarioNotaCredito } from "../notaCredito/revertirInventario";
import type { DetalleNotaCredito } from "../notaCredito/types";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const fetchOriginal = global.fetch;
const NC_ID = "recNC0001";

type Item = { id: string; estadoItem: string; ncIds: string[]; cantidad: number; disponibleVenta: boolean };

function crearDoble(items: Map<string, Item>) {
  const patches: Array<{ id: string; fields: Record<string, unknown> }> = [];
  const ncWrites: Array<Record<string, unknown>> = [];

  const fetchDoble = async (url: string | URL, init?: RequestInit) => {
    const s = String(url);
    const method = init?.method ?? "GET";

    if (method === "GET" && s.includes("Shipping%20Items")) {
      const records = [...items.values()].map((it) => ({
        id: it.id,
        fields: {
          "Estado Item": it.estadoItem,
          "Nota de Crédito": it.ncIds,
          "Cantidad": it.cantidad,
          "Disponible para venta": it.disponibleVenta,
        },
      }));
      return { ok: true, json: async () => ({ records }) } as Response;
    }

    if (method === "PATCH" && s.includes("Shipping%20Items/")) {
      const id = s.split("Shipping%20Items/")[1];
      const body = JSON.parse(String(init?.body)) as { fields: Record<string, unknown> };
      patches.push({ id, fields: body.fields });
      const it = items.get(id)!;
      items.set(id, {
        ...it,
        cantidad:        typeof body.fields["Cantidad"] === "number" ? (body.fields["Cantidad"] as number) : it.cantidad,
        ncIds:           (body.fields["Nota de Crédito"] as string[]) ?? it.ncIds,
        disponibleVenta: typeof body.fields["Disponible para venta"] === "boolean" ? (body.fields["Disponible para venta"] as boolean) : it.disponibleVenta,
        estadoItem:      (body.fields["Estado Item"] as string) ?? it.estadoItem,
      });
      return { ok: true, json: async () => ({ id }) } as Response;
    }

    if (method === "PATCH" && s.includes(encodeURIComponent("Notas de Crédito Electrónicas"))) {
      const body = JSON.parse(String(init?.body)) as { fields: Record<string, unknown> };
      ncWrites.push(body.fields);
      return { ok: true, json: async () => ({ id: NC_ID }) } as Response;
    }

    throw new Error(`fetch inesperado: ${method} ${s}`);
  };

  return { fetchDoble, patches, ncWrites };
}

function linea(shippingItemId: string | undefined, cantidad: number, devolucionFisica: boolean, tipo: "producto" | "servicio" = "producto"): DetalleNotaCredito {
  return {
    descripcion: "Repuesto",
    cantidad,
    precioUnitario: 100,
    descuento: 0,
    precioTotalSinImpuesto: 100 * cantidad,
    impuestos: [{ codigo: "2", codigoPorcentaje: "4", tarifa: 15, baseImponible: 100 * cantidad, valor: 15 * cantidad }],
    ...(shippingItemId ? { tipo, shippingItemId } : { tipo }),
    devolucionFisica,
  };
}

(async () => {
  process.env.AIRTABLE_API_KEY = "fake";
  process.env.AIRTABLE_BASE_ID = "appFAKE";

  // ─── (a) devolución simple: suma de vuelta + reactiva item agotado ──────────
  {
    const items = new Map<string, Item>([
      ["recI1", { id: "recI1", estadoItem: "Vendido", ncIds: [], cantidad: 0, disponibleVenta: false }],
    ]);
    const { fetchDoble, patches } = crearDoble(items);
    global.fetch = fetchDoble as unknown as typeof fetch;

    const r = await revertirInventarioNotaCredito({ notaCreditoRecordId: NC_ID, detalles: [linea("recI1", 1, true)], ambiente: "2" });

    assert(r.estado === "OK", "Devolución: estado OK");
    assert(patches.length === 1, "Devolución: un PATCH");
    assert(items.get("recI1")!.cantidad === 1, "Devolución: Cantidad 0 + 1 = 1 (vuelve al stock)");
    assert(items.get("recI1")!.disponibleVenta === true, "Devolución: item agotado se reactiva como Disponible para venta");
    assert(items.get("recI1")!.estadoItem === "Disponible", "Devolución: Estado Item se restaura");
    assert(items.get("recI1")!.ncIds.includes(NC_ID), "Devolución: la NC queda vinculada al item (trazabilidad + idempotencia)");
  }

  // ─── (b) guard de ambiente: pruebas NO toca inventario ──────────────────────
  {
    const items = new Map<string, Item>([
      ["recI1", { id: "recI1", estadoItem: "Vendido", ncIds: [], cantidad: 0, disponibleVenta: false }],
    ]);
    const { fetchDoble, patches } = crearDoble(items);
    global.fetch = fetchDoble as unknown as typeof fetch;

    const r = await revertirInventarioNotaCredito({ notaCreditoRecordId: NC_ID, detalles: [linea("recI1", 1, true)], ambiente: "1" });

    assert(r.estado === "OK", "Guard pruebas: responde OK");
    assert(patches.length === 0, "Guard pruebas: CERO llamadas a Shipping Items");
    assert(items.get("recI1")!.cantidad === 0, "Guard pruebas: el inventario real queda intacto");
  }

  // ─── (c) sin devolución física: no toca inventario ──────────────────────────
  {
    const items = new Map<string, Item>([
      ["recI1", { id: "recI1", estadoItem: "Repuesto", ncIds: [], cantidad: 3, disponibleVenta: true }],
    ]);
    const { fetchDoble, patches } = crearDoble(items);
    global.fetch = fetchDoble as unknown as typeof fetch;

    const r = await revertirInventarioNotaCredito({ notaCreditoRecordId: NC_ID, detalles: [linea("recI1", 1, false)], ambiente: "2" });

    assert(r.estado === "OK", "Sin devolución física: OK");
    assert(patches.length === 0, "Sin devolución física: no toca inventario (ajuste de precio, no devolución)");
  }

  // ─── (d) parcial: item con stock restante solo suma, no reactiva ────────────
  {
    const items = new Map<string, Item>([
      ["recI1", { id: "recI1", estadoItem: "Repuesto", ncIds: [], cantidad: 3, disponibleVenta: true }],
    ]);
    const { fetchDoble } = crearDoble(items);
    global.fetch = fetchDoble as unknown as typeof fetch;

    await revertirInventarioNotaCredito({ notaCreditoRecordId: NC_ID, detalles: [linea("recI1", 2, true)], ambiente: "2" });

    assert(items.get("recI1")!.cantidad === 5, "Parcial: 3 + 2 = 5");
    assert(items.get("recI1")!.estadoItem === "Repuesto", "Parcial: item que ya estaba disponible no cambia su Estado Item");
  }

  // ─── (e) idempotencia: reintento con la NC ya vinculada no suma otra vez ────
  {
    const items = new Map<string, Item>([
      ["recI1", { id: "recI1", estadoItem: "Disponible", ncIds: [NC_ID], cantidad: 1, disponibleVenta: true }],
    ]);
    const { fetchDoble, patches } = crearDoble(items);
    global.fetch = fetchDoble as unknown as typeof fetch;

    const r = await revertirInventarioNotaCredito({ notaCreditoRecordId: NC_ID, detalles: [linea("recI1", 1, true)], ambiente: "2" });

    assert(r.estado === "OK", "Idempotencia: OK");
    assert(patches.length === 0, "Idempotencia: la NC ya vinculada no vuelve a sumar (cero PATCH)");
    assert(items.get("recI1")!.cantidad === 1, "Idempotencia: Cantidad no se duplica");
  }

  // ─── (f) agrupación: dos líneas del mismo item suman juntas ─────────────────
  {
    const items = new Map<string, Item>([
      ["recI1", { id: "recI1", estadoItem: "Repuesto", ncIds: [], cantidad: 0, disponibleVenta: false }],
    ]);
    const { fetchDoble, patches } = crearDoble(items);
    global.fetch = fetchDoble as unknown as typeof fetch;

    await revertirInventarioNotaCredito({ notaCreditoRecordId: NC_ID, detalles: [linea("recI1", 1, true), linea("recI1", 2, true)], ambiente: "2" });

    assert(patches.length === 1, "Agrupación: un solo PATCH para el mismo item");
    assert(items.get("recI1")!.cantidad === 3, "Agrupación: 0 + (1+2) = 3");
  }

  global.fetch = fetchOriginal;
  delete process.env.AIRTABLE_API_KEY;
  delete process.env.AIRTABLE_BASE_ID;

  if (fallos > 0) {
    console.error(`\n❌ notaCredito.reversoInventario.test.ts — ${fallos} aserción(es) fallida(s)`);
    process.exit(1);
  }
  console.log("\n✅ notaCredito.reversoInventario.test.ts — todos los asserts pasaron");
})();
