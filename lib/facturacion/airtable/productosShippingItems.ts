// "fuente" es obligatorio a propósito, no opcional: cada sitio que consume
// un ProductoCatalogo (agregarProducto en el formulario, hoy; cualquier
// otro futuro) tiene que decidir explícitamente qué hacer con cada fuente
// — un shippingItemId no significa lo mismo que un productoDigitalId, y un
// campo opcional dejaría pasar el caso "no decidí nada" sin que el
// compilador se queje.
export type FuenteProductoCatalogo = "shippingItem" | "productoDigital";

export type ProductoCatalogo = {
  id: string;
  sku: string;
  nombre: string;
  descripcion: string;
  precioVenta: number;
  unidad: string;
  cantidadDisponible: number;
  fuente: FuenteProductoCatalogo;
};

type ProductoRecord = {
  id: string;
  fields?: Record<string, unknown>;
};

function firstStr(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return "";
}

function firstNum(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstPositiveNum(value: unknown): number | null {
  const parsed = firstNum(value);
  return parsed > 0 ? parsed : null;
}

export function escapeShippingItemsProductFormula(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function buildShippingItemsProductFilterFormula(query: string) {
  const escaped = escapeShippingItemsProductFormula(query.trim().toLowerCase());

  return (
    `AND({Disponible para venta},` +
    `{Cantidad}>=1,` +
    `{Precio venta final}>0,` +
    `OR(` +
      `SEARCH("${escaped}",LOWER({Nombre del item})),` +
      `SEARCH("${escaped}",LOWER({SKU}))` +
    `))`
  );
}

export function mapShippingItemProductRecord(record: ProductoRecord): ProductoCatalogo | null {
  const fields = record.fields ?? {};
  const precioVenta = firstPositiveNum(fields["Precio venta final"]);

  if (precioVenta === null) return null;

  return {
    id: record.id,
    sku: firstStr(fields["SKU"]),
    nombre: firstStr(fields["Nombre del item"] ?? fields["Nombre"]),
    descripcion: firstStr(fields["Descripción"] ?? fields["Descripcion"]),
    precioVenta,
    unidad: firstStr(fields["Unidad"]) || "UNIDAD",
    cantidadDisponible: firstNum(fields["Cantidad"] ?? 0),
    fuente: "shippingItem",
  };
}
