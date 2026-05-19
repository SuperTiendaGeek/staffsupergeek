export const SHIPPING_ITEM_CATEGORIES = ["Laptop", "Desktop", "Electronico", "Repuesto"] as const;
export const SHIPPING_ITEM_FOR_OPTIONS = ["Stock", "Pedido", "Repuesto", "Uso Local", "Cotización"] as const;
export const SHIPPING_CREATABLE_ITEM_FOR_OPTIONS = ["Stock", "Repuesto", "Uso Local"] as const;
export const SHIPPING_ITEM_CARRIERS = ["UPS", "USPS", "FeDex", "Gofo", "Otros"] as const;
export const SHIPPING_PACKING_STATUSES = ["En Proceso", "Cerrado", "En Tránsito", "Recibido", "Cancelado"] as const;
export const SHIPPING_PACKING_TYPES = ["Caja", "Sobre", "Maleta", "Otro"] as const;

export type ShippingItemPara = (typeof SHIPPING_ITEM_FOR_OPTIONS)[number];
export type ShippingCreatableItemPara = (typeof SHIPPING_CREATABLE_ITEM_FOR_OPTIONS)[number];

export type ShippingItem = {
  id: string;
  codigo: string;
  item: string;
  categoria: string;
  itemPara: ShippingItemPara | string;
  proveedor: string;
  costoProveedor: number | null;
  precioVenta: number | null;
  qty: number | null;
  peso: number | null;
  estadoPago: string;
  estadoEmpaque: string;
  pago: string;
  pagoCount: number;
  packing: string;
  packingCount: number;
  usaTracking: string;
  ecTracking: string;
  carrier: string;
  notaInterna: string;
  notaPublica: string;
  regalo: boolean;
  encargo: boolean;
  fechaOfertado: string;
};

export type ShippingPackingAvailableItem = Pick<
  ShippingItem,
  "id" | "codigo" | "item" | "proveedor" | "costoProveedor" | "peso" | "regalo" | "encargo" | "usaTracking" | "estadoPago" | "estadoEmpaque"
>;

export type ShippingPendingPaymentItem = {
  id: string;
  codigo: string;
  item: string;
  proveedor: string;
  fechaOfertado: string;
  fechaGrupo: string;
  costoProveedor: number | null;
  regalo: boolean;
};

export type ShippingPaymentPreviewGroup = {
  key: string;
  pagoId: string;
  proveedor: string;
  proveedorNormalizado: string;
  fechaGrupo: string;
  fechaGrupoLabel: string;
  itemConCostoCount: number;
  regaloCount: number;
  totalCostoProveedor: number;
  status: "suggested";
  items: ShippingPendingPaymentItem[];
  itemsConCosto: ShippingPendingPaymentItem[];
  regalos: ShippingPendingPaymentItem[];
};

export type ShippingPaymentPreparationPreview = {
  gruposNuevosSugeridos: ShippingPaymentPreviewGroup[];
  pagosExistentesPendientes: ShippingPago[];
  itemsAntiguosPorRevisar: ShippingPendingPaymentItem[];
};

export type ShippingNewItemInput = {
  item: string;
  categoria: string;
  itemPara: ShippingCreatableItemPara;
  proveedorId: string;
  qty: number | null;
  costoProveedor: number;
  precioVenta: number | null;
  peso: number | null;
  regalo: boolean;
  encargo: boolean;
  carrier: string;
  usaTracking: string;
  ecTracking: string;
  notaInterna: string;
  notaPublica: string;
};

export type ShippingPaymentLinkResult = {
  pagoId: string | null;
  pagoRecordId: string | null;
  action: "created" | "updated" | "skipped";
  writtenFields: string[];
  warnings: string[];
};

export type ShippingAttachmentInput = {
  filename: string;
  contentType: string;
  fileBase64: string;
};

export type ShippingPago = {
  id: string;
  pagoId: string;
  totalPago: number | null;
  fechaPagoMax: string;
  transaccionId: string;
  proveedor: string;
  pagoRealizado: boolean;
  pagoRealizadoValor: string;
  estadoPago: string;
  recargosPagoExterior: number | null;
  fechaPagoReal: string;
  metodoPago: string;
  cuentaOrigen: string;
  observacion: string;
  registradoPor: string;
  movimientoFinanzasId: string;
  estadoIntegracionFinanzas: string;
  comprobanteCount: number;
  itemCount: number;
};

export const SHIPPING_PAYMENT_METHODS = ["PayPal", "Tarjeta", "Transferencia bancaria", "Efectivo", "Depósito", "Otro"] as const;
export const SHIPPING_PAYMENT_SOURCE_ACCOUNTS = ["PayPal", "Banco Pichincha", "Caja", "PayPhone", "DataFast", "Otro"] as const;

export type ShippingPaymentMethod = (typeof SHIPPING_PAYMENT_METHODS)[number];
export type ShippingPaymentSourceAccount = (typeof SHIPPING_PAYMENT_SOURCE_ACCOUNTS)[number];

export type ShippingPaymentRegistrationInput = {
  pagoRecordId: string;
  fechaPagoReal: string;
  metodoPago: ShippingPaymentMethod;
  cuentaOrigen: ShippingPaymentSourceAccount;
  transaccionId: string;
  observacion: string;
  registradoPor: string;
  comprobante?: ShippingAttachmentInput | null;
};

export type ShippingPaymentRegistrationResult = {
  pago: ShippingPago;
  warning: string | null;
  writtenFields: string[];
  pagoRealizadoWrittenAs: "checkbox" | "datetime";
};

// Contrato tentativo para la futura integración con Finanzas.
// Por ahora Shipping solo prepara la vista previa; no crea movimientos reales.
export type ShippingFinanceMovementDraft = {
  fechaPago: string;
  proveedor: string;
  total: number;
  metodoPago: string;
  cuentaOrigen: string;
  transaccionId: string;
  comprobante: string;
  movimientoFinanzasId: string | null;
};

export type ShippingPacking = {
  id: string;
  pack: string;
  tipo: string;
  estado: string;
  items: string;
  itemIds: string[];
  itemCount: number;
  costoTotalItems: number | null;
  peso: number | null;
  usaTracking: string;
  ecTracking: string;
  fechaEnvio: string;
  arriboEstimado: string;
  fleteEc: number | null;
  arancel: number | null;
  qtyRegalos: number | null;
  qtyEncargos: number | null;
};

export type ShippingPackingItem = ShippingPackingAvailableItem & {
  packingIds: string[];
};

export type ShippingPackingDetail = {
  packing: ShippingPacking;
  items: ShippingPackingItem[];
  availableItems: ShippingPackingAvailableItem[];
  existingStatuses: string[];
  missingStatuses: string[];
};

export type ShippingNewPackingInput = {
  pack: string;
  tipo: string;
  estado: string;
  peso: number | null;
  usaTracking: string;
  ecTracking: string;
  carrier: string;
  fechaEnvio: string;
  arriboEstimado: string;
  observacion: string;
  fleteEc: number | null;
  arancel: number | null;
  itemIds: string[];
};

export type ShippingQuickPackingInput = {
  tipo?: string;
  estado?: string;
};

export type ShippingPackingLogisticsInput = {
  peso: number | null;
  usaTracking: string;
  ecTracking: string;
  fechaEnvio: string;
  arriboEstimado: string;
  fleteEc: number | null;
  arancel: number | null;
};

export type ShippingCreatePackingResult = {
  packing: ShippingPacking;
  warning: string | null;
  writtenFields: string[];
};

export type ShippingProveedor = {
  id: string;
  nombre: string;
  direccion: string;
  comprasTotales: number | null;
  itemsRelacionados: number;
};

export type ShippingDashboardSummary = {
  itemsRecientes: number;
  itemsPendientesPago: number;
  pagosPendientes: number;
  pagosRealizados: number;
  itemsPagadosSinPacking: number;
  packingsPreparacion: number;
  packingsEnviados: number;
  packingsRecibidos: number;
  itemsRegalo: number;
  itemsEncargo: number;
};

export type ShippingDashboardPendingWork = {
  itemsPendientesPago: ShippingItem[];
  itemsPagadosSinPacking: ShippingItem[];
  packingsSinTrackingUsa: ShippingPacking[];
  packingsEnviadosSinRecepcion: ShippingPacking[];
  encargosPendientesAgrupar: ShippingItem[];
};
