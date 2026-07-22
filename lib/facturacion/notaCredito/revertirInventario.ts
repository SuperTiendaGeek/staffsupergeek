import "server-only";

// Reverso de inventario al autorizarse una nota de crédito (Fase 18 PR2a).
//
// Es el espejo EXACTO de postEmision() (gancho/postEmision.ts): donde la
// factura RESTA de Cantidad al vender, la NC SUMA de vuelta al devolver. Solo
// las líneas marcadas con devolucionFisica=true mueven inventario — una NC
// por ajuste de precio (sin devolución del equipo) no toca stock.
//
// Guard de ambiente idéntico al de postEmision y al puente contable: Shipping
// Items es UN SOLO inventario real; en ambiente pruebas NO se toca nada.
//
// Best-effort: corre DESPUÉS de emitirNotaCredito(), desde el endpoint, en su
// propio try/catch. Un fallo suyo jamás altera el resultado de una NC que el
// SRI ya autorizó — la NC es un documento fiscal real aunque este ajuste falle.
//
// Idempotencia: el link de la NC en el Shipping Item ("Nota de Crédito") es la
// marca de "ya revertido". Un reintento re-lee el estado y salta los items que
// ya tienen esta NC vinculada — nunca suma dos veces.
//
// Regla de la casa: nunca filtrar por campo de link; se lee cada item por su
// record id (ya conocido, viene en la línea) y se escribe por PATCH directo.

import { fetchRecordsByIds, linkedIds, firstString, numberOrZero } from "../gancho/airtableGancho";
import { actualizarReversoInventario } from "./airtable";
import type { DetalleNotaCredito } from "./types";

const SHIPPING_ITEMS_TABLE = "Shipping Items";
const AMBIENTE_PRODUCCION = "2";

type EstadoItemActual = { estadoItem: string; notaCreditoIds: string[]; cantidad: number; disponibleVenta: boolean };

async function fetchEstadoActual(itemIds: string[]): Promise<Map<string, EstadoItemActual>> {
  const records = await fetchRecordsByIds(SHIPPING_ITEMS_TABLE, itemIds);
  const map = new Map<string, EstadoItemActual>();
  for (const r of records) {
    map.set(r.id, {
      estadoItem:      firstString(r.fields["Estado Item"]),
      notaCreditoIds:  linkedIds(r.fields["Nota de Crédito"]),
      cantidad:        numberOrZero(r.fields["Cantidad"]),
      disponibleVenta: r.fields["Disponible para venta"] === true,
    });
  }
  return map;
}

async function patchConReintento(itemId: string, fields: Record<string, unknown>): Promise<void> {
  const token  = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token)  throw new Error("Falta AIRTABLE_API_KEY en .env.local.");
  if (!baseId) throw new Error("Falta AIRTABLE_BASE_ID en .env.local.");

  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(SHIPPING_ITEMS_TABLE)}/${encodeURIComponent(itemId)}`;
  const retryable = new Set([429, 502, 503, 504]);

  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(url, {
      method:  "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ fields }),
      cache:   "no-store",
    });
    if (res.ok || !retryable.has(res.status) || attempt === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  if (!res || !res.ok) {
    const text = res ? await res.text() : "sin respuesta";
    throw new Error(`PATCH Shipping Items ${itemId} → ${res?.status ?? "?"}: ${text}`);
  }
}

export type ResultadoReverso = { estado: "OK" | "ERROR"; detalle?: string };

export type ReversoInput = {
  notaCreditoRecordId: string;
  detalles:            DetalleNotaCredito[];
  ambiente?:           string;
  /** Estado Item al que se restaura un item agotado que vuelve a tener stock.
   *  Default "Disponible" — valor razonable; el operador puede reclasificarlo. */
  estadoItemRestaurado?: string;
};

export async function revertirInventarioNotaCredito(input: ReversoInput): Promise<ResultadoReverso> {
  // Guard de ambiente — fail closed. Solo producción mueve inventario real.
  if (input.ambiente !== AMBIENTE_PRODUCCION) {
    return { estado: "OK" };
  }

  // Solo líneas de producto con devolución física suman de vuelta.
  const aDevolver = input.detalles.filter(
    (d): d is DetalleNotaCredito & { shippingItemId: string } =>
      d.tipo === "producto" && !!d.shippingItemId && d.devolucionFisica === true
  );

  if (aDevolver.length === 0) {
    await actualizarReversoInventario(input.notaCreditoRecordId, "OK").catch((e) =>
      console.error("[revertirInventario] no se pudo marcar OK (sin items físicos):", e)
    );
    return { estado: "OK" };
  }

  await actualizarReversoInventario(input.notaCreditoRecordId, "PENDIENTE").catch((e) =>
    console.error("[revertirInventario] no se pudo marcar PENDIENTE:", e)
  );

  // Agrupar por item (varias líneas de la NC podrían apuntar al mismo item).
  const devueltoPorItem = new Map<string, { cantidad: number; descripcion: string }>();
  for (const d of aDevolver) {
    const prev = devueltoPorItem.get(d.shippingItemId);
    devueltoPorItem.set(d.shippingItemId, {
      cantidad:    (prev?.cantidad ?? 0) + (Number.isFinite(d.cantidad) && d.cantidad > 0 ? d.cantidad : 0),
      descripcion: prev?.descripcion ?? d.descripcion,
    });
  }

  const itemIds = [...devueltoPorItem.keys()];
  const actual  = await fetchEstadoActual(itemIds);
  const fallidos: Array<{ id: string; descripcion: string; error: string }> = [];
  let yaHechos = 0;
  let revertidos = 0;

  for (const [itemId, dev] of devueltoPorItem) {
    const est = actual.get(itemId);

    // Idempotente: el link de ESTA NC en el item marca "ya revertido".
    if (est && est.notaCreditoIds.includes(input.notaCreditoRecordId)) {
      yaHechos++;
      continue;
    }

    const cantidadActual = est?.cantidad ?? 0;
    const nuevaCantidad  = cantidadActual + dev.cantidad;

    const fields: Record<string, unknown> = {
      "Cantidad": nuevaCantidad,
      "Nota de Crédito": [...(est?.notaCreditoIds ?? []), input.notaCreditoRecordId],
    };
    // Si el item estaba agotado/vendido y vuelve a tener stock, se reactiva
    // como disponible (espejo del cierre que hace postEmision al llegar a 0).
    if (nuevaCantidad > 0 && est && !est.disponibleVenta) {
      fields["Disponible para venta"] = true;
      fields["Estado Item"] = input.estadoItemRestaurado ?? "Disponible";
    }

    try {
      await patchConReintento(itemId, fields);
      revertidos++;
    } catch (e) {
      fallidos.push({ id: itemId, descripcion: dev.descripcion, error: e instanceof Error ? e.message : String(e) });
    }
  }

  if (fallidos.length === 0) {
    await actualizarReversoInventario(input.notaCreditoRecordId, "OK").catch((e) =>
      console.error("[revertirInventario] no se pudo marcar OK:", e)
    );
    return { estado: "OK" };
  }

  const detalle =
    `${revertidos + yaHechos}/${devueltoPorItem.size} items revertidos. Fallaron: ` +
    fallidos.map((f) => `${f.descripcion} (${f.id}): ${f.error}`).join("; ");

  await actualizarReversoInventario(input.notaCreditoRecordId, "ERROR", detalle).catch((e) =>
    console.error("[revertirInventario] no se pudo marcar ERROR:", e)
  );

  return { estado: "ERROR", detalle };
}
