import "server-only";

import {
  buildShippingItemsProductFilterFormula,
  mapShippingItemProductRecord,
  type ProductoCatalogo,
} from "@/lib/facturacion/airtable/productosShippingItems";
import { buscarProductosDigitales } from "@/lib/facturacion/airtable/productosDigitales";

// Busca productos vendibles en DOS fuentes — "Shipping Items" y "Productos
// Digitales" (ambas en la base SUPER GEEK ADM) — para el buscador único del
// formulario de facturación.
// SOLO LECTURA — este módulo nunca escribe.
// Decisión: la emisión de facturas no afecta el inventario; el módulo de
// facturación es únicamente SRI + registro en "Facturas Electrónicas".
// El descuento de stock se gestionará en un flujo separado cuando se implemente.
//
// Las dos búsquedas van en paralelo (Promise.all, no allSettled): si
// cualquiera de las dos falla, buscarProductos() completa falla — nunca se
// arma una lista a medias con un fallback silencioso. Un error visible es
// mejor que un buscador que dice "no hay resultados" cuando en realidad una
// de las dos fuentes no se pudo consultar.
//
// TODO: Shipping Items no tiene campo de IVA por producto.
//       Todos los productos se asignan a IVA 15% (codigoPorcentaje "4").
//       Para soportar tarifas mixtas, agrega el campo "Tarifa IVA" a la tabla
//       y actualiza mapProductoRecord() para leerlo.

const TABLE = "Shipping Items";

function getClient() {
  const token  = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token)  throw new Error("AIRTABLE_API_KEY no configurada");
  if (!baseId) throw new Error("AIRTABLE_BASE_ID no configurada");
  return {
    baseUrl: `https://api.airtable.com/v0/${baseId}`,
    headers: { Authorization: `Bearer ${token}` } as Record<string, string>,
  };
}

export type { ProductoCatalogo };

async function buscarEnShippingItems(query: string, pageSize: number): Promise<ProductoCatalogo[]> {
  const client  = getClient();
  // Pre-lowercase the term in code; search in lowercased field for case-insensitive match.
  // Campos buscados: "Nombre del item" y "SKU".
  // {Disponible para venta} es checkbox → truthy cuando está marcado; no necesita =TRUE().
  // {Cantidad}>=1 (Fase 17.b): un item sin stock no aparece en el buscador —
  // regla del dueño: Cantidad 0 = no se puede cargar ni facturar.
  // {Precio venta final}>0: el precio sugerido no es fuente autorizada para facturar.
  // AND necesita coma entre argumentos — no .join("") sobre múltiples piezas.
  const formula = buildShippingItemsProductFilterFormula(query);

  const params = new URLSearchParams({
    filterByFormula: formula,
    pageSize:        String(pageSize),
  });
  params.append("fields[]", "SKU");
  params.append("fields[]", "Nombre del item");
  params.append("fields[]", "Descripción");
  params.append("fields[]", "Precio venta final");
  params.append("fields[]", "Unidad");
  params.append("fields[]", "Disponible para venta");
  params.append("fields[]", "Cantidad");

  const url = `${client.baseUrl}/${encodeURIComponent(TABLE)}?${params}`;
  const res = await fetch(url, { headers: client.headers, cache: "no-store" });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable Productos ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { records?: Array<{ id: string; fields?: Record<string, unknown> }> };
  return (data.records ?? []).map(mapShippingItemProductRecord).filter((producto): producto is ProductoCatalogo => producto !== null);
}

export async function buscarProductos(q: string, pageSize = 8): Promise<ProductoCatalogo[]> {
  const query = q.trim();
  if (query.length < 2) return [];

  const [shippingItems, productosDigitales] = await Promise.all([
    buscarEnShippingItems(query, pageSize),
    buscarProductosDigitales(query, pageSize),
  ]);

  return [...shippingItems, ...productosDigitales];
}
