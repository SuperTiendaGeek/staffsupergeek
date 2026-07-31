type ShippingItemReservaRecord = {
  id: string;
  fields?: Record<string, unknown>;
};

export class ShippingItemReservaPrecioError extends Error {
  constructor(message = "El item no tiene Precio venta final válido para reserva.") {
    super(message);
    this.name = "ShippingItemReservaPrecioError";
  }
}

function firstStr(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return "";
}

function firstNum(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim().replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function resolverPrecioShippingItemParaReserva(record: ShippingItemReservaRecord) {
  const precioVentaFinal = firstNum(record.fields?.["Precio venta final"]);
  if (precioVentaFinal === null || precioVentaFinal <= 0) {
    throw new ShippingItemReservaPrecioError();
  }
  return precioVentaFinal;
}

export function resolverDatosShippingItemParaReserva(
  record: ShippingItemReservaRecord,
  input: { descripcionItem?: string | null; precioVenta?: unknown } = {}
) {
  return {
    descripcionItem:
      firstStr(input.descripcionItem).trim() ||
      firstStr(record.fields?.["Nombre del item"] ?? record.fields?.["Nombre"]).trim() ||
      "Ítem reservado",
    precioVenta: resolverPrecioShippingItemParaReserva(record),
  };
}
