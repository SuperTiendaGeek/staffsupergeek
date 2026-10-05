import { unidadesLibres } from "@/lib/shipping-v2/unidades";

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

/**
 * `incluirEnCamino`: Reserva y Proforma también ofrecen lo que todavía no
 * llega (se puede apartar o cotizar desde que existe). Factura y Recibo NO:
 * solo venden lo que ya está en la tienda. Por omisión, solo en tienda.
 */
export function buildShippingItemsProductFilterFormula(query: string, opts: { incluirEnCamino?: boolean } = {}) {
  const escaped = escapeShippingItemsProductFormula(query.trim().toLowerCase());
  const soloEnTienda = opts.incluirEnCamino !== true;

  return (
    `AND({Disponible para venta},` +
    // Punto 1 de la auditoría Shipping V2: el mostrador solo vende lo que YA
    // ESTÁ en la tienda. "Disponible para venta" dice que se puede reservar
    // (aunque venga en camino); para venderlo además tiene que haber llegado
    // y, si requiere inspección, tener la ficha firmada. Misma regla que
    // lib/shipping-v2/item-venta.ts (evaluarVentaItem), que es la que de
    // verdad bloquea al emitir (reglas/entregables.ts).
    (soloEnTienda ? `{Recibido},OR(NOT({Requiere inspección}),{Revisado física/técnicamente}),` : ``) +
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
    // Unidades LIBRES: las comprometidas con un cliente/orden/reserva no se
    // venden en mostrador (ver verificarStockDisponible).
    cantidadDisponible: unidadesLibres({
      cantidad: firstNum(fields["Cantidad"] ?? 0),
      cantidadReservada: firstNum(fields["Cantidad Reservada"] ?? 0),
      reservado: fields["Reservado"] === true,
    }),
    fuente: "shippingItem",
  };
}
