import {
  normalizeShippingV2ItemMoneyQuantityInput,
  normalizeShippingV2InlineMoneyQuantityField,
} from "../item-money-quantity";
import { SHIPPING_V2_ITEM_FIELDS } from "../schema.generated";
import type { ShippingV2ItemWriteInput } from "@/types/shipping-v2";

type InlineItem = Parameters<typeof normalizeShippingV2InlineMoneyQuantityField>[0]["item"];

let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

function baseInput(overrides: Partial<ShippingV2ItemWriteInput> = {}): ShippingV2ItemWriteInput {
  return {
    nombre: "Laptop test",
    tipoOperacion: "Compra a proveedor",
    tipoItem: "Equipo completo",
    categoria: "Laptop",
    estado: "Registrado",
    proveedorId: "recPROV",
    requierePago: true,
    requierePacking: false,
    afectaInventario: true,
    disponibleVenta: false,
    cantidad: 1,
    unidad: "Unidad",
    costoProveedor: 5,
    precioVentaSugerido: 10,
    precioVenta: 12,
    modoLogistico: "No aplica",
    ...overrides,
  };
}

function baseItem(overrides: Partial<InlineItem> = {}): InlineItem {
  return {
    tipoOperacion: "Compra a proveedor",
    disponibleVenta: false,
    cantidad: 1,
    unidad: "Unidad",
    costoProveedor: 5,
    precioVentaSugerido: 10,
    precioVenta: 12,
    ...overrides,
  };
}

function valid(overrides: Partial<ShippingV2ItemWriteInput>, msg: string, check?: (input: ShippingV2ItemWriteInput) => void) {
  const normalized = normalizeShippingV2ItemMoneyQuantityInput(baseInput(overrides), { mode: "create" });
  check?.(normalized);
  assert(true, msg);
}

function invalid(overrides: Partial<ShippingV2ItemWriteInput>, fragmento: string, msg: string) {
  try {
    normalizeShippingV2ItemMoneyQuantityInput(baseInput(overrides), { mode: "create" });
    assert(false, `${msg} → debía fallar`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    assert(message.includes(fragmento), `${msg} → ${fragmento}`);
  }
}

valid({ cantidad: 1 }, "Cantidad 1 es válida", (input) => assert(input.cantidad === 1, "Cantidad 1 se conserva"));
valid({ cantidad: 4 }, "Cantidad 4 es válida", (input) => assert(input.cantidad === 4, "Cantidad 4 se conserva"));
valid({ cantidad: undefined }, "Alta sin cantidad usa default 1", (input) => assert(input.cantidad === 1, "Default de creación es 1"));

invalid({ cantidad: 0 }, "Cantidad debe ser mayor a 0", "Cantidad 0 inválida");
invalid({ cantidad: -1 }, "Cantidad debe ser mayor a 0", "Cantidad negativa inválida");
invalid({ cantidad: 1.5 }, "Cantidad debe ser un número entero", "Cantidad decimal inválida");

invalid({ costoProveedor: 0 }, "Costo proveedor por unidad debe ser mayor a 0", "Compra a proveedor con costo 0 inválida");
invalid({ tipoOperacion: "Compra ya pagada", requierePago: false, costoProveedor: 0 }, "Costo proveedor por unidad debe ser mayor a 0", "Compra ya pagada con costo 0 inválida");
valid({
  tipoOperacion: "Regalo de proveedor",
  requierePago: false,
  costoProveedor: null,
  proveedorId: "",
}, "Regalo de proveedor con costo vacío es válido", (input) => assert(input.costoProveedor === null, "Regalo con costo vacío no genera costo artificial"));
valid({
  tipoOperacion: "Regalo de proveedor",
  requierePago: false,
  costoProveedor: 0,
  proveedorId: "",
}, "Regalo de proveedor con costo 0 es válido", (input) => assert(input.costoProveedor === 0, "Regalo con costo 0 conserva 0 sin inventar costo"));
invalid({
  tipoOperacion: "Regalo de proveedor",
  requierePago: false,
  costoProveedor: 1,
  proveedorId: "",
}, "En regalos de proveedor", "Regalo de proveedor con costo positivo inválido");

invalid({
  precioVentaSugerido: -1,
}, "Precio venta sugerido por unidad no puede ser negativo", "Precio sugerido negativo inválido");

invalid({
  precioVentaSugerido: 0,
}, "Precio venta sugerido por unidad debe ser mayor a 0", "Precio sugerido 0 inválido si se proporciona");

valid({
  disponibleVenta: true,
  precioVenta: null,
}, "Item disponible con Precio venta final vacío se puede crear", (input) => assert(input.precioVenta === null, "Precio final vacío permanece sin asignar"));

invalid({
  precioVenta: -1,
}, "Precio venta final por unidad no puede ser negativo", "Precio final negativo inválido");
valid({
  disponibleVenta: true,
  precioVenta: 0,
}, "Item disponible con Precio venta final 0 se interpreta como sin precio", (input) => assert(input.precioVenta === null, "Precio final 0 normaliza a sin asignar"));

valid({
  disponibleVenta: true,
  precioVenta: 12,
}, "Item disponible con Precio venta final positivo se puede guardar", (input) => assert(input.precioVenta === 12, "Precio final positivo se conserva"));

const normalizedUpdateSinPrecio = normalizeShippingV2ItemMoneyQuantityInput(
  baseInput({ disponibleVenta: true, precioVenta: null }),
  { mode: "update" }
);
assert(normalizedUpdateSinPrecio.precioVenta === null, "Item disponible con Precio venta final vacío se puede editar");

const normalizedUpdatePrecioCero = normalizeShippingV2ItemMoneyQuantityInput(
  baseInput({ disponibleVenta: true, precioVenta: 0 }),
  { mode: "update" }
);
assert(normalizedUpdatePrecioCero.precioVenta === null, "PATCH completo con Precio venta final 0 no falla y lo interpreta como sin precio");

try {
  normalizeShippingV2ItemMoneyQuantityInput(baseInput({ cantidad: undefined }), { mode: "update" });
  assert(false, "Update sin cantidad no debe aplicar default 1");
} catch (e) {
  const message = e instanceof Error ? e.message : String(e);
  assert(message.includes("Cantidad es obligatoria"), "Update sin cantidad exige cantidad explícita");
}

try {
  const inlineDisponible = normalizeShippingV2InlineMoneyQuantityField({
    field: SHIPPING_V2_ITEM_FIELDS.disponibleVenta,
    value: true,
    item: baseItem({ precioVenta: null, disponibleVenta: false }),
  });
  assert(inlineDisponible === true, "Inline permite activar Disponible para venta sin precio final");
} catch (e) {
  assert(false, `Inline no debe fallar solo por activar Disponible para venta sin precio final: ${e instanceof Error ? e.message : String(e)}`);
}

const inlinePrecioCero = normalizeShippingV2InlineMoneyQuantityField({
  field: SHIPPING_V2_ITEM_FIELDS.precioVentaFinal,
  value: 0,
  item: baseItem({ precioVenta: null, disponibleVenta: true }),
});
assert(inlinePrecioCero === null, "Inline Precio venta final 0 se interpreta como sin precio asignado");

try {
  normalizeShippingV2InlineMoneyQuantityField({
    field: SHIPPING_V2_ITEM_FIELDS.tipoOperacion,
    value: "Compra a proveedor",
    item: baseItem({ tipoOperacion: "Regalo de proveedor", costoProveedor: 0 }),
  });
  assert(false, "Inline no debe cambiar regalo a compra con costo 0");
} catch (e) {
  const message = e instanceof Error ? e.message : String(e);
  assert(message.includes("Tipo de operación y Costo proveedor deben corregirse juntos"), "Inline pide corregir tipo y costo juntos al pasar regalo a compra");
}

try {
  normalizeShippingV2InlineMoneyQuantityField({
    field: SHIPPING_V2_ITEM_FIELDS.tipoOperacion,
    value: "Regalo de proveedor",
    item: baseItem({ tipoOperacion: "Compra a proveedor", costoProveedor: 10 }),
  });
  assert(false, "Inline no debe cambiar compra a regalo con costo positivo");
} catch (e) {
  const message = e instanceof Error ? e.message : String(e);
  assert(message.includes("Tipo de operación y Costo proveedor deben corregirse juntos"), "Inline pide corregir tipo y costo juntos al pasar compra a regalo");
}

if (fallos > 0) {
  console.error(`Fallaron ${fallos} comprobaciones.`);
  process.exit(1);
}

console.log("Contrato de cantidad/dinero de Shipping Items: OK");
