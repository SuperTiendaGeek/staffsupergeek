import "server-only";

// Busca productos vendibles en "Shipping Items" (base SUPER GEEK ADM).
// SOLO LECTURA — este módulo nunca escribe en Shipping Items.
// Decisión: la emisión de facturas no afecta el inventario; el módulo de
// facturación es únicamente SRI + registro en "Facturas Electrónicas".
// El descuento de stock se gestionará en un flujo separado cuando se implemente.
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

export type ProductoCatalogo = {
  id:          string;
  sku:         string;
  nombre:      string;
  descripcion: string;
  precioVenta: number;
  unidad:      string;
};

function firstStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : "";
  return "";
}
function firstNum(v: unknown): number {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

function mapProductoRecord(r: { id: string; fields?: Record<string, unknown> }): ProductoCatalogo {
  const f = r.fields ?? {};
  return {
    id:          r.id,
    sku:         firstStr(f["SKU"] ?? f["SKU interno"]),
    nombre:      firstStr(f["Nombre del item"] ?? f["Nombre"]),
    descripcion: firstStr(f["Descripción"] ?? f["Descripcion"]),
    precioVenta: firstNum(f["Precio venta final"] ?? f["Precio venta sugerido"] ?? 0),
    unidad:      firstStr(f["Unidad"]) || "UNIDAD",
  };
}

function escapeFormula(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function buscarProductos(q: string, pageSize = 8): Promise<ProductoCatalogo[]> {
  const query = q.trim();
  if (query.length < 2) return [];

  const client  = getClient();
  // Pre-lowercase the term in code; search in lowercased field for case-insensitive match.
  const escaped = escapeFormula(query.toLowerCase());

  // Campos buscados: "Nombre del item" y "SKU".
  // {Disponible para venta} es checkbox → truthy cuando está marcado; no necesita =TRUE().
  // AND necesita coma entre argumentos — no .join("") sobre múltiples piezas.
  const formula =
    `AND({Disponible para venta},` +
    `OR(` +
      `SEARCH("${escaped}",LOWER({Nombre del item})),` +
      `SEARCH("${escaped}",LOWER({SKU}))` +
    `))`;

  const params = new URLSearchParams({
    filterByFormula: formula,
    pageSize:        String(pageSize),
  });
  params.append("fields[]", "SKU");
  params.append("fields[]", "Nombre del item");
  params.append("fields[]", "Descripción");
  params.append("fields[]", "Precio venta final");
  params.append("fields[]", "Precio venta sugerido");
  params.append("fields[]", "Unidad");
  params.append("fields[]", "Disponible para venta");

  const url = `${client.baseUrl}/${encodeURIComponent(TABLE)}?${params}`;
  const res = await fetch(url, { headers: client.headers, cache: "no-store" });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable Productos ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { records?: Array<{ id: string; fields?: Record<string, unknown> }> };
  return (data.records ?? []).map(mapProductoRecord);
}
