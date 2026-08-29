import { SHIPPING_V2_ITEM_FIELDS, SHIPPING_V2_ITEM_SELECT_OPTIONS } from "@/lib/shipping-v2/schema.generated";

export type ShippingV2InlineFieldType = "text" | "textarea" | "number" | "currency" | "checkbox" | "singleSelect" | "linkedRecord" | "readOnly";
export type ShippingV2ItemEditCategory = "normal" | "special" | "readOnly" | "hidden";

export type ShippingV2ItemEditFieldConfig = {
  key: string;
  field: string;
  label: string;
  category: ShippingV2ItemEditCategory;
  type: ShippingV2InlineFieldType;
  options?: readonly string[];
  /**
   * Campo de corrección: se puede editar a mano, pero solo con rol de
   * administrador, y el cambio queda registrado en el historial del item.
   * Se usa para las banderas que normalmente mueve el flujo por sí solo y que
   * de vez en cuando hay que destrabar (ver F-24 / F-40 de la auditoría).
   */
  adminOnly?: boolean;
};

const F = SHIPPING_V2_ITEM_FIELDS;
const O = SHIPPING_V2_ITEM_SELECT_OPTIONS;

export const SHIPPING_V2_FACEBOOK_SUPER_GEEK_FIELD = "Facebook Super Geek";
export const SHIPPING_V2_TEXTO_FACEBOOK_FIELD = "Texto Facebook";
export const SHIPPING_V2_TEXTO_FACEBOOK_LEGACY_FIELD = "Texto Facebook fórmula legacy";

export const SHIPPING_V2_ITEM_EDIT_FIELDS = {
  itemId: { key: "itemId", field: F.itemId, label: "SKU", category: "hidden", type: "readOnly" },
  nombre: { key: "nombre", field: F.nombre, label: "Nombre del item", category: "normal", type: "text" },
  aiNombre: { key: "aiNombre", field: F.aiNombre, label: "AI Nombre del item", category: "readOnly", type: "readOnly" },
  descripcion: { key: "descripcion", field: F.descripcion, label: "Descripción", category: "normal", type: "textarea" },
  tipoOperacion: { key: "tipoOperacion", field: F.tipoOperacion, label: "Tipo de operación", category: "special", type: "singleSelect", options: O.tipoOperacion },
  tipoItem: { key: "tipoItem", field: F.tipoItem, label: "Rol general del item", category: "normal", type: "singleSelect", options: O.tipoItem },
  categoria: { key: "categoria", field: F.categoria, label: "Categoría técnica/comercial", category: "normal", type: "singleSelect", options: O.categoria },
  estadoItem: { key: "estado", field: F.estadoItem, label: "Estado Item", category: "special", type: "singleSelect", options: O.estadoItem },
  estadoRevision: { key: "estadoRevision", field: F.estadoRevision, label: "Estado de revisión", category: "normal", type: "singleSelect", options: O.estadoRevision },
  estadoTriangulacion: { key: "estadoTriangulacion", field: F.estadoTriangulacion, label: "Estado de triangulación", category: "normal", type: "singleSelect", options: O.estadoTriangulacion },
  estadoDespiece: { key: "estadoDespiece", field: F.estadoDespiece, label: "Estado de despiece", category: "normal", type: "singleSelect", options: O.estadoDespiece },
  proveedorCompra: { key: "proveedorId", field: F.proveedorCompra, label: "Proveedor de compra", category: "special", type: "linkedRecord" },
  proveedorLogistico: { key: "proveedorLogisticoId", field: F.proveedorLogistico, label: "Proveedor logístico / intermediario", category: "special", type: "linkedRecord" },
  requierePago: { key: "requierePago", field: F.requierePago, label: "Requiere pago", category: "readOnly", type: "readOnly" },
  pagoRelacionado: { key: "pagoId", field: "Shipping Pagos (Items relacionados)", label: "Pago Shipping V2", category: "readOnly", type: "readOnly" },
  requierePacking: { key: "requierePacking", field: F.requierePacking, label: "Requiere packing", category: "readOnly", type: "readOnly" },
  packingRelacionado: { key: "packingId", field: F.packingRelacionado, label: "Packing relacionado", category: "readOnly", type: "readOnly" },
  modoLogistico: { key: "modoLogistico", field: F.modoLogistico, label: "Modo logístico", category: "special", type: "singleSelect", options: O.modoLogistico },
  afectaInventario: { key: "afectaInventario", field: F.afectaInventario, label: "Afecta inventario", category: "readOnly", type: "readOnly" },
  disponibleVenta: { key: "disponibleVenta", field: F.disponibleVenta, label: "Disponible para venta/reserva", category: "special", type: "checkbox", adminOnly: true },
  reservado: { key: "reservado", field: F.reservado, label: "Reservado", category: "normal", type: "checkbox" },
  textoFacebook: { key: "textoFacebook", field: SHIPPING_V2_TEXTO_FACEBOOK_FIELD, label: "Texto Facebook", category: "special", type: "textarea" },
  facebookSuperGeek: { key: "facebookSuperGeek", field: SHIPPING_V2_FACEBOOK_SUPER_GEEK_FIELD, label: "Facebook Super Geek", category: "special", type: "checkbox" },
  costoProveedor: { key: "costoProveedor", field: F.costoProveedor, label: "Costo proveedor unitario", category: "special", type: "currency" },
  precioVentaSugerido: { key: "precioVentaSugerido", field: F.precioVentaSugerido, label: "Precio venta sugerido unitario", category: "normal", type: "currency" },
  precioVentaFinal: { key: "precioVenta", field: F.precioVentaFinal, label: "Precio venta final unitario", category: "normal", type: "currency" },
  // adminOnly: la cantidad en inventario es el dato más sensible del item —
  // de ahí sale el stock disponible para vender, reservar y facturar. Solo
  // Administrador puede corregirlo a mano; el resto del sistema lo mueve
  // solo (recepción, ventas, packing, despiece).
  cantidad: { key: "cantidad", field: F.cantidad, label: "Cantidad", category: "normal", type: "number", adminOnly: true },
  unidad: { key: "unidad", field: F.unidad, label: "Unidad", category: "normal", type: "singleSelect", options: O.unidad },
  sku: { key: "sku", field: F.sku, label: "SKU", category: "special", type: "text" },
  skuProveedor: { key: "skuProveedor", field: F.skuProveedor, label: "SKU proveedor", category: "special", type: "text" },
  modelo: { key: "modelo", field: F.modelo, label: "Modelo", category: "normal", type: "text" },
  marca: { key: "marca", field: F.marca, label: "Marca", category: "normal", type: "text" },
  numeroSerie: { key: "numeroSerie", field: F.numeroSerie, label: "Número de serie", category: "normal", type: "text" },
  condicion: { key: "condicion", field: F.condicion, label: "Condición", category: "normal", type: "singleSelect", options: O.condicion },
  ubicacionActual: { key: "ubicacionActual", field: F.ubicacionActual, label: "Ubicación actual", category: "normal", type: "text" },
  trackingDirecto: { key: "trackingDirecto", field: F.trackingDirecto, label: "Tracking directo", category: "normal", type: "text" },
  observacionesInternas: { key: "observacionesInternas", field: F.observacionesInternas, label: "Observaciones internas", category: "normal", type: "textarea" },
  observacionVenta: { key: "observacionVenta", field: F.observacionVenta, label: "Observación para venta", category: "normal", type: "textarea" },
  metodoAsignacionSku: { key: "metodoAsignacionSku", field: F.metodoAsignacionSku, label: "Método de asignación SKU", category: "readOnly", type: "readOnly" },
  itemPadre: { key: "itemPadreId", field: "Item padre", label: "Item padre", category: "readOnly", type: "readOnly" },
  itemsHijos: { key: "itemHijoIds", field: "Items hijos", label: "Items hijos", category: "readOnly", type: "readOnly" },
  // "Es repuesto" era una de las CINCO casillas donde se guardaba lo mismo
  // (Tipo de operación, Rol general, Categoría, Estado Item y esta). De 86
  // artículos, 24 decían "repuesto" en alguna y en NINGUNO coincidían las
  // cinco. Manda Categoría, que es además la única que consulta el buscador de
  // repuestos de stock. Esta se oculta y ya no se escribe; el dato viejo sigue
  // en Airtable por si hace falta consultarlo.
  esRepuesto: { key: "esRepuesto", field: F.esRepuesto, label: "Es repuesto", category: "hidden", type: "readOnly" },
  esUsoLocal: { key: "usoLocal", field: F.esUsoLocal, label: "Es uso local", category: "normal", type: "checkbox" },
  fechaRegistro: { key: "fechaRegistro", field: F.fechaRegistro, label: "Fecha de registro", category: "readOnly", type: "readOnly" },
  registradoPor: { key: "registradoPor", field: F.registradoPor, label: "Registrado por", category: "readOnly", type: "readOnly" },
  ultimaActualizacion: { key: "ultimaActualizacion", field: F.ultimaActualizacion, label: "Última actualización", category: "readOnly", type: "readOnly" },
  actualizadoPor: { key: "actualizadoPor", field: F.actualizadoPor, label: "Actualizado por", category: "readOnly", type: "readOnly" },
} satisfies Record<string, ShippingV2ItemEditFieldConfig>;

export const SHIPPING_V2_ITEM_EDIT_FIELDS_BY_FIELD = Object.fromEntries(
  Object.values(SHIPPING_V2_ITEM_EDIT_FIELDS).map((config) => [config.field, config])
) as Record<string, ShippingV2ItemEditFieldConfig>;

export function getShippingV2ItemEditField(field: string) {
  return SHIPPING_V2_ITEM_EDIT_FIELDS_BY_FIELD[field] ?? null;
}

export function isShippingV2ItemEditableField(field: string) {
  const config = getShippingV2ItemEditField(field);
  return Boolean(config && (config.category === "normal" || config.category === "special"));
}

export const SHIPPING_V2_PROVIDER_ITEM_EDITABLE_FIELDS = [
  F.nombre,
  F.observacionesInternas,
] as const;

export function isShippingV2ProviderItemEditableField(field: string) {
  return SHIPPING_V2_PROVIDER_ITEM_EDITABLE_FIELDS.some((allowedField) => allowedField === field);
}
