import "server-only";

import { fetchRecordsByIds } from "../gancho/airtableGancho";
import type { LineaProforma } from "./types";

const SHIPPING_ITEMS_TABLE = "Shipping Items";
const SHIPPING_ITEM_ORIGIN = "shipping-item";

type ShippingItemProformaRecord = {
  id: string;
  fields?: Record<string, unknown>;
};

export type LineaProformaShippingItemInvalida = {
  shippingItemId: string;
  descripcion: string;
  motivo: "SIN_ID" | "NO_EXISTE" | "SIN_PRECIO_FINAL" | "PRECIO_LINEA_INVALIDO";
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function firstPositiveNum(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value > 0 ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value.trim().replace(",", "."));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

export function isLineaProformaShippingItem(linea: Pick<LineaProforma, "origen" | "shippingItemId">) {
  return cleanString(linea.shippingItemId) !== "" || cleanString(linea.origen) === SHIPPING_ITEM_ORIGIN;
}

export function tienePrecioFinalShippingItemValido(record: ShippingItemProformaRecord | undefined) {
  return firstPositiveNum(record?.fields?.["Precio venta final"]) !== null;
}

export function calcularLineasProformaShippingItemsInvalidas(
  lineas: readonly LineaProforma[],
  records: readonly ShippingItemProformaRecord[]
): LineaProformaShippingItemInvalida[] {
  const recordsById = new Map(records.map((record) => [record.id, record]));
  const invalidas: LineaProformaShippingItemInvalida[] = [];

  for (const linea of lineas) {
    if (!isLineaProformaShippingItem(linea)) continue;

    const shippingItemId = cleanString(linea.shippingItemId);
    const descripcion = cleanString(linea.descripcion) || "Línea sin descripción";

    if (!shippingItemId) {
      invalidas.push({ shippingItemId: "", descripcion, motivo: "SIN_ID" });
      continue;
    }

    if (typeof linea.precioUnitario !== "number" || !Number.isFinite(linea.precioUnitario) || linea.precioUnitario <= 0) {
      invalidas.push({ shippingItemId, descripcion, motivo: "PRECIO_LINEA_INVALIDO" });
      continue;
    }

    const record = recordsById.get(shippingItemId);
    if (!record) {
      invalidas.push({ shippingItemId, descripcion, motivo: "NO_EXISTE" });
      continue;
    }

    if (!tienePrecioFinalShippingItemValido(record)) {
      invalidas.push({ shippingItemId, descripcion, motivo: "SIN_PRECIO_FINAL" });
    }
  }

  return invalidas;
}

export function mensajeLineasProformaShippingItemsInvalidas(invalidas: readonly LineaProformaShippingItemInvalida[]) {
  if (invalidas.length === 0) return null;

  const partes = invalidas.map((linea) => {
    const nombre = `"${linea.descripcion}"`;
    if (linea.motivo === "SIN_ID") return `${nombre} viene de Shipping Items pero no conserva shippingItemId`;
    if (linea.motivo === "NO_EXISTE") return `${nombre} no existe en Shipping Items`;
    if (linea.motivo === "PRECIO_LINEA_INVALIDO") return `${nombre} requiere precio unitario mayor a 0`;
    return `${nombre} no tiene Precio venta final válido en Shipping Items`;
  });

  return `No se puede crear la proforma: ${partes.join("; ")}.`;
}

export async function validarLineasProformaShippingItems(lineas: readonly LineaProforma[]) {
  const shippingItemIds = [
    ...new Set(
      lineas
        .filter(isLineaProformaShippingItem)
        .map((linea) => cleanString(linea.shippingItemId))
        .filter(Boolean)
    ),
  ];

  const records = shippingItemIds.length > 0
    ? await fetchRecordsByIds(SHIPPING_ITEMS_TABLE, shippingItemIds)
    : [];

  return mensajeLineasProformaShippingItemsInvalidas(
    calcularLineasProformaShippingItemsInvalidas(lineas, records)
  );
}
