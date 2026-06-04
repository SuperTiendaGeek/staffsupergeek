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
};

const F = SHIPPING_V2_ITEM_FIELDS;
const O = SHIPPING_V2_ITEM_SELECT_OPTIONS;

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
  disponibleVenta: { key: "disponibleVenta", field: F.disponibleVenta, label: "Disponible para venta/reserva", category: "readOnly", type: "readOnly" },
  reservado: { key: "reservado", field: F.reservado, label: "Reservado", category: "normal", type: "checkbox" },
  costoProveedor: { key: "costoProveedor", field: F.costoProveedor, label: "Costo proveedor", category: "special", type: "currency" },
  precioVentaSugerido: { key: "precioVentaSugerido", field: F.precioVentaSugerido, label: "Precio venta sugerido", category: "normal", type: "currency" },
  precioVentaFinal: { key: "precioVenta", field: F.precioVentaFinal, label: "Precio venta final", category: "normal", type: "currency" },
  cantidad: { key: "cantidad", field: F.cantidad, label: "Cantidad", category: "normal", type: "number" },
  unidad: { key: "unidad", field: F.unidad, label: "Unidad", category: "normal", type: "singleSelect", options: O.unidad },
  sku: { key: "sku", field: F.sku, label: "SKU", category: "special", type: "text" },
  skuInterno: { key: "skuInterno", field: F.skuInterno, label: "SKU interno", category: "hidden", type: "readOnly" },
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
  skuProveedorUsadoComoInterno: { key: "skuProveedorUsadoComoInterno", field: F.skuProveedorUsadoComoInterno, label: "SKU proveedor fue usado como interno", category: "readOnly", type: "readOnly" },
  skuDuplicadoDetectado: { key: "skuDuplicadoDetectado", field: F.skuDuplicadoDetectado, label: "SKU duplicado detectado", category: "readOnly", type: "readOnly" },
  skuOriginalSugerido: { key: "skuOriginalSugerido", field: F.skuOriginalSugerido, label: "SKU original sugerido", category: "readOnly", type: "readOnly" },
  itemPadre: { key: "itemPadreId", field: "Item padre", label: "Item padre", category: "readOnly", type: "readOnly" },
  itemsHijos: { key: "itemHijoIds", field: "Items hijos", label: "Items hijos", category: "readOnly", type: "readOnly" },
  esRepuesto: { key: "esRepuesto", field: F.esRepuesto, label: "Es repuesto", category: "normal", type: "checkbox" },
  esUsoLocal: { key: "usoLocal", field: F.esUsoLocal, label: "Es uso local", category: "normal", type: "checkbox" },
  legacyItemId: { key: "legacyItemId", field: "Legacy Item ID", label: "Legacy Item ID", category: "readOnly", type: "readOnly" },
  legacyPagoId: { key: "legacyPagoId", field: "Legacy Pago ID", label: "Legacy Pago ID", category: "readOnly", type: "readOnly" },
  legacyPackingId: { key: "legacyPackingId", field: "Legacy Packing ID", label: "Legacy Packing ID", category: "readOnly", type: "readOnly" },
  fuenteMigracion: { key: "fuenteMigracion", field: "Fuente de migración", label: "Fuente de migración", category: "readOnly", type: "readOnly" },
  estadoMigracion: { key: "estadoMigracion", field: "Estado de migración", label: "Estado de migración", category: "readOnly", type: "readOnly" },
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
