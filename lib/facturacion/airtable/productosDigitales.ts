import "server-only";

import { fetchRecordsByIds, linkedIds, firstString, numberOrZero } from "@/lib/facturacion/gancho/airtableGancho";
import type { ProductoCatalogo } from "./productosShippingItems";

// Busca productos digitales vendibles en mostrador — "Productos Digitales" +
// "Catálogo Productos Digitales" (base SUPER GEEK ADM).
// SOLO LECTURA — este módulo nunca escribe.
//
// Un producto digital es vendible en mostrador solo si cumple TODO:
//
//   a) Estado = "Disponible"    — filtro por fórmula (singleSelect).
//   b) Precio Venta > 0         — filtro por fórmula (currency).
//   c) SIN orden de reparación vinculada — EN MEMORIA, nunca por
//      filterByFormula. Desde el commit 8a6ca33, vincular un producto a una
//      orden ya NO lo marca "Usado": se queda "Disponible" hasta que la
//      factura de esa orden se autoriza (postEmisionProductosDigitales() en
//      lib/facturacion/gancho/postEmision.ts es quien pone "Usado", recién
//      al facturarse de verdad). Si este filtro no existiera, el mismo
//      producto podría venderse dos veces — una en la orden, otra en
//      mostrador. Y "Orden de Reparación" es un campo de ENLACE: filtrar
//      por él en Airtable falla en silencio y devuelve vacío (bitácora
//      §6) — por eso va en memoria, sobre el resultado ya traído.
//   d) Nombre limpio en el catálogo ("Producto Base") — la MISMA fuente que
//      ya usa la factura desde la orden (ver el comentario de
//      mapProductoDigitalToCuenta() en lib/cuenta-unificada/index.ts, que
//      explica por qué). "Software / Producto" es un campo de enlace: la
//      API de Airtable devuelve el record id del catálogo, no su nombre —
//      hay que resolverlo con un fetch aparte, por RECORD_ID(). NUNCA el
//      campo fórmula "Producto Digital" (Catálogo · Estado · Fecha de
//      compra). Sin nombre limpio, el producto simplemente no aparece —
//      aquí no hace falta bloquear nada: si no se puede vender bien, no se
//      ofrece.
//
// El filtro por texto (query) se aplica DESPUÉS de resolver el nombre
// limpio, y solo contra ese nombre — nunca contra el campo fórmula sucio.

const TABLE          = "Productos Digitales";
const CATALOGO_TABLE = "Catálogo Productos Digitales";

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

export async function buscarProductosDigitales(q: string, pageSize = 8): Promise<ProductoCatalogo[]> {
  const query = q.trim();
  if (query.length < 2) return [];

  const client = getClient();
  const params = new URLSearchParams({
    filterByFormula: `AND({Estado}="Disponible",{Precio Venta}>0)`,
    pageSize:        "100", // la tabla completa es pequeña (~50 registros hoy); se filtra el resto en memoria
  });
  params.append("fields[]", "Software / Producto");
  params.append("fields[]", "Precio Venta");
  params.append("fields[]", "Orden de Reparación");

  const url = `${client.baseUrl}/${encodeURIComponent(TABLE)}?${params}`;
  const res = await fetch(url, { headers: client.headers, cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable Productos Digitales ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { records?: Array<{ id: string; fields?: Record<string, unknown> }> };

  // (c) — en memoria.
  const candidatos = (data.records ?? []).filter(
    (r) => linkedIds(r.fields?.["Orden de Reparación"]).length === 0
  );
  if (candidatos.length === 0) return [];

  // (d) — resolver el nombre limpio del catálogo, por RECORD_ID().
  const catalogoIds = [
    ...new Set(
      candidatos
        .map((r) => linkedIds(r.fields?.["Software / Producto"])[0])
        .filter((id): id is string => !!id)
    ),
  ];
  const catalogoRecords = await fetchRecordsByIds(CATALOGO_TABLE, catalogoIds);
  const nombresPorCatalogoId = new Map<string, string>();
  for (const r of catalogoRecords) {
    nombresPorCatalogoId.set(r.id, firstString(r.fields["Producto Base"]));
  }

  const qLower = query.toLowerCase();
  const productos: ProductoCatalogo[] = [];
  for (const r of candidatos) {
    const catalogoId = linkedIds(r.fields?.["Software / Producto"])[0];
    const nombre = catalogoId ? nombresPorCatalogoId.get(catalogoId) : undefined;
    if (!nombre?.trim()) continue; // (d) sin nombre limpio, no se ofrece

    if (!nombre.toLowerCase().includes(qLower)) continue; // filtro de texto

    const precioVenta = numberOrZero(r.fields?.["Precio Venta"]);
    if (!(precioVenta > 0)) continue; // redundante con la fórmula, defensivo

    productos.push({
      id: r.id,
      sku: "", // Productos Digitales no tiene un campo equivalente a SKU
      nombre,
      descripcion: "",
      precioVenta,
      unidad: "UNIDAD",
      cantidadDisponible: 1, // cada registro es una unidad única — nunca más de 1
      fuente: "productoDigital",
    });
  }

  return productos.slice(0, pageSize);
}
