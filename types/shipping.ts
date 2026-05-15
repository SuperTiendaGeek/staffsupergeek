export const SHIPPING_ITEM_CATEGORIES = ["Laptop", "Desktop", "Electronico", "Repuesto"] as const;
export const SHIPPING_ITEM_FOR_OPTIONS = ["Stock", "Pedido", "Repuesto", "Uso Local", "Cotización"] as const;
export const SHIPPING_CREATABLE_ITEM_FOR_OPTIONS = ["Stock", "Repuesto", "Uso Local"] as const;
export const SHIPPING_ITEM_CARRIERS = ["UPS", "USPS", "FeDex", "Gofo", "Otros"] as const;

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
  estadoPago: string;
  recargosPagoExterior: number | null;
};

export type ShippingPacking = {
  id: string;
  pack: string;
  tipo: string;
  estado: string;
  items: string;
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
