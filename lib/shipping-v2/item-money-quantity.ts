import { SHIPPING_V2_ITEM_FIELDS, SHIPPING_V2_ITEM_SELECT_OPTIONS } from "@/lib/shipping-v2/schema.generated";
import type { ShippingV2Item, ShippingV2ItemWriteInput } from "@/types/shipping-v2";

export const SHIPPING_V2_DEFAULT_ITEM_CANTIDAD = 1;
export const SHIPPING_V2_DEFAULT_ITEM_UNIDAD = "Unidad";

const PURCHASE_OPERATION_TYPES = new Set(["Compra a proveedor", "Compra ya pagada"]);
const GIFT_OPERATION_TYPE = "Regalo de proveedor";
const VALID_UNITS = new Set<string>(SHIPPING_V2_ITEM_SELECT_OPTIONS.unidad);
const INLINE_ATOMIC_TYPE_COST_MESSAGE = "Tipo de operación y Costo proveedor deben corregirse juntos: no se puede guardar una compra con costo 0 ni un regalo con costo positivo desde edición inline.";

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isBlank(value: unknown) {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

function parseStrictNumber(value: unknown, label: string) {
  if (isBlank(value)) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim().replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error(`${label} debe ser un número válido.`);
}

export function isShippingV2PurchaseOperation(tipoOperacion: unknown) {
  return PURCHASE_OPERATION_TYPES.has(cleanString(tipoOperacion));
}

export function isShippingV2GiftOperation(tipoOperacion: unknown) {
  return cleanString(tipoOperacion) === GIFT_OPERATION_TYPE;
}

export function isPositiveShippingV2Price(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function normalizeShippingV2ItemQuantity(value: unknown, options: { defaultOnBlank?: number } = {}) {
  const parsed = parseStrictNumber(value, "Cantidad");
  const cantidad = parsed ?? options.defaultOnBlank;

  if (cantidad === undefined || cantidad === null) throw new Error("Cantidad es obligatoria.");
  if (!Number.isInteger(cantidad)) throw new Error("Cantidad debe ser un número entero.");
  if (cantidad <= 0) throw new Error("Cantidad debe ser mayor a 0.");

  return cantidad;
}

export function normalizeShippingV2ItemUnit(value: unknown) {
  const unidad = cleanString(value) || SHIPPING_V2_DEFAULT_ITEM_UNIDAD;
  if (!VALID_UNITS.has(unidad)) throw new Error(`"${unidad}" no es una unidad válida.`);
  return unidad;
}

export function normalizeShippingV2OptionalMoney(
  value: unknown,
  label: string,
  options: { allowZero?: boolean } = {}
) {
  const parsed = parseStrictNumber(value, label);
  if (parsed === null) return null;
  if (parsed < 0) throw new Error(`${label} no puede ser negativo.`);
  if (!options.allowZero && parsed === 0) throw new Error(`${label} debe ser mayor a 0.`);
  return parsed;
}

function normalizeShippingV2OptionalAssignedPrice(value: unknown, label: string) {
  const parsed = parseStrictNumber(value, label);
  if (parsed === null || parsed === 0) return null;
  if (parsed < 0) throw new Error(`${label} no puede ser negativo.`);
  return parsed;
}

function validateCostForOperation(input: { tipoOperacion: unknown; costoProveedor?: number | null }) {
  if (isShippingV2PurchaseOperation(input.tipoOperacion) && !isPositiveShippingV2Price(input.costoProveedor)) {
    throw new Error("Costo proveedor por unidad debe ser mayor a 0 para compras a proveedor.");
  }

  if (isShippingV2GiftOperation(input.tipoOperacion) && input.costoProveedor !== null && input.costoProveedor !== undefined && input.costoProveedor !== 0) {
    throw new Error("En regalos de proveedor, el costo proveedor por unidad debe estar vacío o ser 0.");
  }
}

function validateInlineCostForOperation(input: { tipoOperacion: unknown; costoProveedor?: number | null }) {
  if (isShippingV2PurchaseOperation(input.tipoOperacion) && !isPositiveShippingV2Price(input.costoProveedor)) {
    throw new Error(INLINE_ATOMIC_TYPE_COST_MESSAGE);
  }

  if (isShippingV2GiftOperation(input.tipoOperacion) && input.costoProveedor !== null && input.costoProveedor !== undefined && input.costoProveedor !== 0) {
    throw new Error(INLINE_ATOMIC_TYPE_COST_MESSAGE);
  }
}

export function validateShippingV2ItemMoneyQuantityContract(input: Pick<
  ShippingV2ItemWriteInput,
  "cantidad" | "unidad" | "tipoOperacion" | "costoProveedor" | "precioVentaSugerido" | "precioVenta" | "disponibleVenta"
>) {
  normalizeShippingV2ItemQuantity(input.cantidad);
  normalizeShippingV2ItemUnit(input.unidad);
  validateCostForOperation(input);

  if (input.precioVentaSugerido !== null && input.precioVentaSugerido !== undefined && !isPositiveShippingV2Price(input.precioVentaSugerido)) {
    throw new Error("Precio venta sugerido por unidad debe ser mayor a 0.");
  }

  if (typeof input.precioVenta === "number" && input.precioVenta < 0) {
    throw new Error("Precio venta final por unidad no puede ser negativo.");
  }
}

export function normalizeShippingV2ItemMoneyQuantityInput(
  input: ShippingV2ItemWriteInput,
  options: { mode: "create" | "update" }
): ShippingV2ItemWriteInput {
  const normalized: ShippingV2ItemWriteInput = {
    ...input,
    cantidad: normalizeShippingV2ItemQuantity(input.cantidad, {
      defaultOnBlank: options.mode === "create" ? SHIPPING_V2_DEFAULT_ITEM_CANTIDAD : undefined,
    }),
    unidad: normalizeShippingV2ItemUnit(input.unidad),
    costoProveedor: normalizeShippingV2OptionalMoney(input.costoProveedor, "Costo proveedor por unidad", { allowZero: true }),
    precioVentaSugerido: normalizeShippingV2OptionalMoney(input.precioVentaSugerido, "Precio venta sugerido por unidad"),
    precioVenta: normalizeShippingV2OptionalAssignedPrice(input.precioVenta, "Precio venta final por unidad"),
  };

  validateShippingV2ItemMoneyQuantityContract(normalized);
  return normalized;
}

export function normalizeShippingV2InlineMoneyQuantityField(input: {
  field: string;
  value: unknown;
  item: Pick<ShippingV2Item, "cantidad" | "unidad" | "tipoOperacion" | "costoProveedor" | "precioVentaSugerido" | "precioVenta" | "disponibleVenta">;
}) {
  const F = SHIPPING_V2_ITEM_FIELDS;

  if (input.field === F.cantidad) {
    return normalizeShippingV2ItemQuantity(input.value);
  }

  if (input.field === F.unidad) {
    return normalizeShippingV2ItemUnit(input.value);
  }

  if (input.field === F.costoProveedor) {
    const costoProveedor = normalizeShippingV2OptionalMoney(input.value, "Costo proveedor por unidad", { allowZero: true });
    validateInlineCostForOperation({ tipoOperacion: input.item.tipoOperacion, costoProveedor });
    return costoProveedor;
  }

  if (input.field === F.precioVentaSugerido) {
    return normalizeShippingV2OptionalMoney(input.value, "Precio venta sugerido por unidad");
  }

  if (input.field === F.precioVentaFinal) {
    return normalizeShippingV2OptionalAssignedPrice(input.value, "Precio venta final por unidad");
  }

  if (input.field === F.disponibleVenta) {
    return input.value === true || input.value === "true" || input.value === "on";
  }

  if (input.field === F.tipoOperacion) {
    const tipoOperacion = cleanString(input.value);
    validateInlineCostForOperation({ tipoOperacion, costoProveedor: input.item.costoProveedor });
    return tipoOperacion;
  }

  return input.value;
}
