import { SHIPPING_V2_FINANCE_SELECT_OPTIONS, SHIPPING_V2_ITEM_SELECT_OPTIONS, SHIPPING_V2_PACKING_SELECT_OPTIONS, SHIPPING_V2_PAYMENT_SELECT_OPTIONS } from "@/lib/shipping-v2/schema.generated";

export type ShippingV2RecordBase = {
  id: string;
  createdTime?: string;
};

export type ShippingV2ProveedorEstado = "Activo" | "Inactivo" | "En Revision";
export type ShippingV2ItemEstado = "Borrador" | "Pendiente Pago" | "Pagado" | "En Transito" | "Disponible" | "Entregado" | "Cancelado";
export type ShippingV2PagoEstado = (typeof SHIPPING_V2_PAYMENT_SELECT_OPTIONS.estadoPago)[number];
export type ShippingV2FinanzasMovimientoEstado = (typeof SHIPPING_V2_FINANCE_SELECT_OPTIONS.estadoIntegracion)[number];
export type ShippingV2PackingEstado = (typeof SHIPPING_V2_PACKING_SELECT_OPTIONS.estado)[number];
export type ShippingV2PackingTipo = (typeof SHIPPING_V2_PACKING_SELECT_OPTIONS.tipo)[number];
export type ShippingV2RecepcionEstado = "Pendiente" | "Parcial" | "Completa" | "Observada";
export type ShippingV2NovedadEstado = "Abierta" | "En Revision" | "Resuelta" | "Cancelada";
export type ShippingV2MigracionEstado = "Pendiente" | "Procesada" | "Error" | "Omitida";
export type ShippingV2EventoTipo = "Inventario" | "Pago" | "Packing" | "Recepcion" | "Novedad" | "Sistema";
export type ShippingV2ModoLogistico = (typeof SHIPPING_V2_ITEM_SELECT_OPTIONS.modoLogistico)[number];

export type ShippingV2Proveedor = ShippingV2RecordBase & {
  proveedorId?: string;
  label: string;
  nombre: string;
  estado: ShippingV2ProveedorEstado | string;
  tipoProveedor?: string;
  requierePagoAntesEnvio: boolean | null;
  plazoSugeridoPagoDias: number | null;
  metodoPagoPreferido?: string;
  cuentaDestinoPagoPreferida?: string;
  puedeArmarPackings: boolean | null;
  puedeRecibirEncargosTerceros: boolean | null;
  permiteTriangulacion: boolean | null;
  contacto?: string;
  email?: string;
  telefono?: string;
  pais?: string;
  paisZonaLogistica?: string;
  urlRastreo?: string;
  plantillaUrlRastreo?: string;
  permiteRastreoWeb: boolean | null;
  notasRastreo?: string;
};

export type ShippingV2Attachment = {
  id?: string;
  url: string;
  filename?: string;
  type?: string;
  width?: number;
  height?: number;
  thumbnailUrl?: string;
};

export type ShippingV2Item = ShippingV2RecordBase & {
  sku: string;
  itemId?: string;
  codigo: string;
  skuInterno: string;
  skuProveedor?: string;
  metodoAsignacionSku?: string;
  skuProveedorUsadoComoInterno: boolean | null;
  skuDuplicadoDetectado: boolean | null;
  skuOriginalSugerido?: string;
  nombre: string;
  aiNombre?: string;
  descripcion?: string;
  modelo?: string;
  marca?: string;
  numeroSerie?: string;
  categoria?: string;
  tipoOperacion: string;
  tipoItem: string;
  condicion?: string;
  cantidad: number | null;
  unidad?: string;
  estado: ShippingV2ItemEstado | string;
  estadoRevision?: string;
  estadoTriangulacion?: string;
  estadoDespiece?: string;
  afectaInventario: boolean | null;
  proveedorId?: string;
  proveedorNombre?: string;
  proveedorLogisticoId?: string;
  proveedorLogisticoNombre?: string;
  requierePago: boolean | null;
  modoLogistico?: ShippingV2ModoLogistico | string;
  costoProveedor: number | null;
  fletePacking: number | null;
  arancelPacking: number | null;
  otrosCostosPacking: number | null;
  reglaDistribucionPacking?: string;
  totalCostoProveedorPacking: number | null;
  cantidadItemsPacking: number | null;
  costoFleteAsignado: number | null;
  costoArancelAsignado: number | null;
  otrosCostosAsignados: number | null;
  costoAsignadoDespiece: number | null;
  costoLogisticoAsignado: number | null;
  costoTotalUnidad: number | null;
  costoTotalEstimado: number | null;
  precioVentaSugerido: number | null;
  precioVenta: number | null;
  qty: number | null;
  disponibleVenta: boolean | null;
  reservado: boolean | null;
  usoLocal: boolean | null;
  esRepuesto: boolean | null;
  esRegalo: boolean | null;
  conNovedad: boolean | null;
  ubicacionActual?: string;
  origenFisicoActual?: string;
  fechaRegistro?: string;
  trackingDirecto?: string;
  trackingHaciaIntermediario?: string;
  trackingDesdeIntermediario?: string;
  trackingUsa?: string;
  trackingEc?: string;
  requierePacking: boolean | null;
  pagoV2ItemIds: string[];
  pagoV2RegaloIds: string[];
  packingId?: string;
  /** @deprecated Campo legacy "Pago relacionado" apunta a la tabla vieja Pago. No usar para Shipping V2. */
  pagoId?: string;
  /** @deprecated IDs de la tabla vieja Pago. No usar para Shipping V2. */
  legacyPagoRelacionadoIds: string[];
  itemPadreId?: string;
  itemHijoIds: string[];
  motivoDespiece?: string;
  fechaDespiece?: string;
  responsableDespiece?: string;
  esParteRecuperada: boolean | null;
  observacionesInternas?: string;
  observacionVenta?: string;
  legacyItemId?: string;
  legacyPagoId?: string;
  legacyPackingId?: string;
  fuenteMigracion?: string;
  estadoMigracion?: string;
  registradoPor?: string;
  ultimaActualizacion?: string;
  actualizadoPor?: string;
  fotos: ShippingV2Attachment[];
  evidencias: ShippingV2Attachment[];
};

export const SHIPPING_V2_ITEM_ESTADOS = SHIPPING_V2_ITEM_SELECT_OPTIONS.estadoItem;
export const SHIPPING_V2_TIPOS_OPERACION = SHIPPING_V2_ITEM_SELECT_OPTIONS.tipoOperacion;
export const SHIPPING_V2_TIPOS_ITEM = SHIPPING_V2_ITEM_SELECT_OPTIONS.tipoItem;
export const SHIPPING_V2_CATEGORIAS = SHIPPING_V2_ITEM_SELECT_OPTIONS.categoria;
export const SHIPPING_V2_CONDICIONES = SHIPPING_V2_ITEM_SELECT_OPTIONS.condicion;
export const SHIPPING_V2_UNIDADES = SHIPPING_V2_ITEM_SELECT_OPTIONS.unidad;
export const SHIPPING_V2_ESTADOS_REVISION = SHIPPING_V2_ITEM_SELECT_OPTIONS.estadoRevision;
export const SHIPPING_V2_ESTADOS_TRIANGULACION = SHIPPING_V2_ITEM_SELECT_OPTIONS.estadoTriangulacion;
export const SHIPPING_V2_ESTADOS_DESPIECE = SHIPPING_V2_ITEM_SELECT_OPTIONS.estadoDespiece;
export const SHIPPING_V2_MODOS_LOGISTICOS = SHIPPING_V2_ITEM_SELECT_OPTIONS.modoLogistico;

export type ShippingV2ItemWriteInput = {
  nombre?: string;
  descripcion?: string;
  tipoOperacion: string;
  tipoItem: string;
  categoria?: string;
  estado: string;
  proveedorId?: string;
  proveedorLogisticoId?: string;
  requierePago?: boolean;
  requierePacking?: boolean;
  afectaInventario?: boolean;
  disponibleVenta?: boolean;
  reservado?: boolean;
  sku?: string;
  skuInterno?: string;
  skuProveedor?: string;
  modelo?: string;
  marca?: string;
  numeroSerie?: string;
  condicion?: string;
  cantidad?: number | null;
  unidad?: string;
  costoProveedor?: number | null;
  precioVentaSugerido?: number | null;
  precioVenta?: number | null;
  ubicacionActual?: string;
  origenFisicoActual?: string;
  observacionesInternas?: string;
  observacionVenta?: string;
  esRepuesto?: boolean;
  usoLocal?: boolean;
  estadoRevision?: string;
  estadoTriangulacion?: string;
  estadoDespiece?: string;
  modoLogistico?: ShippingV2ModoLogistico | string;
  trackingDirecto?: string;
};

export type ShippingV2Pago = ShippingV2RecordBase & {
  pagoId: string;
  estado: ShippingV2PagoEstado | string;
  estadoPago: ShippingV2PagoEstado | string;
  proveedorId?: string;
  proveedorNombre?: string;
  itemIds: string[];
  itemsResumen: ShippingV2PagoItemResumen[];
  regalosIds: string[];
  regalosResumen: ShippingV2PagoItemResumen[];
  total: number | null;
  totalAPagar: number | null;
  totalPagado: number | null;
  saldoPendiente: number | null;
  totalRegalos: number | null;
  cantidadItems: number;
  cantidadRegalos: number;
  fechaCreacion?: string;
  fechaVencimientoSugerida?: string;
  fechaPagoMax?: string;
  fechaPagoReal?: string;
  metodoPago?: string;
  cuentaOrigen?: string;
  transaccionId?: string;
  comprobante: ShippingV2Attachment[];
  facturaProveedor: ShippingV2Attachment[];
  observacion?: string;
  registradoPor?: string;
  pagadoPor?: string;
  estadoIntegracionFinanzas?: string;
  movimientoFinanzasId?: string;
  movimientoFinanzasIds: string[];
  fechaAnulacion?: string;
  motivoAnulacion?: string;
};

export type ShippingV2PagoItemResumen = Pick<
  ShippingV2Item,
  | "id"
  | "sku"
  | "skuProveedor"
  | "nombre"
  | "tipoOperacion"
  | "tipoItem"
  | "categoria"
  | "estado"
  | "proveedorId"
  | "proveedorNombre"
  | "proveedorLogisticoId"
  | "proveedorLogisticoNombre"
  | "costoProveedor"
  | "esRegalo"
>;

export type ShippingV2FinanzasMovimiento = ShippingV2RecordBase & {
  movimientoId: string;
  estado: ShippingV2FinanzasMovimientoEstado | string;
  origen?: string;
  tipoMovimiento?: string;
  pagoId?: string;
  proveedorId?: string;
  proveedorNombre?: string;
  fecha?: string;
  monto: number | null;
  metodo?: string;
  cuentaOrigen?: string;
  transaccionId?: string;
  comprobante: ShippingV2Attachment[];
  observacion?: string;
  registradoPor?: string;
};

export type ShippingV2PagoWriteInput = {
  estadoPago?: string;
  proveedorId?: string;
  itemIds?: string[];
  regalosIds?: string[];
  fechaVencimientoSugerida?: string;
  observacion?: string;
  fechaPagoReal?: string;
  metodoPago?: string;
  cuentaOrigen?: string;
  transaccionId?: string;
  comprobanteUrl?: string;
};

export type ShippingV2PagoMarkPaidInput = {
  fechaPagoReal?: string;
  metodoPago?: string;
  cuentaOrigen?: string;
  transaccionId?: string;
  comprobanteUrl?: string;
  observacion?: string;
};

export type ShippingV2Packing = ShippingV2RecordBase & {
  packingId: string;
  nombre: string;
  estado: ShippingV2PackingEstado | string;
  tipo?: ShippingV2PackingTipo | string;
  proveedorResponsableId?: string;
  proveedorResponsableNombre?: string;
  /** @deprecated Campo legacy en Packings. UI principal usa Transportista EC. */
  proveedorLogisticoEcId?: string;
  /** @deprecated Campo legacy en Packings. UI principal usa Transportista EC. */
  proveedorLogisticoEcNombre?: string;
  itemIds: string[];
  items: ShippingV2Item[];
  itemCount: number;
  trackingUsa?: string;
  transportistaUsa?: string;
  transportistaUsaNombre?: string;
  trackingEc?: string;
  transportistaEc?: string;
  transportistaEcNombre?: string;
  peso: number | null;
  flete: number | null;
  arancel: number | null;
  otrosCostos: number | null;
  costoTotalItemsProveedor: number | null;
  cantidadItemsPacking: number | null;
  reglaDistribucion?: string;
  reglaDistribucionCostos?: string;
  observacionCostos?: string;
  observaciones?: string;
  fechaCreacion?: string;
  fechaCierre?: string;
  fechaEnvio?: string;
  fechaRecepcion?: string;
  cerradoPor?: string;
  creadoPor?: string;
  conNovedad: boolean;
};

export type ShippingV2PackingWriteInput = {
  nombre?: string;
  tipo?: string;
  estado?: string;
  proveedorResponsableId?: string;
  /** @deprecated Campo legacy en Packings. UI principal usa Transportista EC. */
  proveedorLogisticoEcId?: string;
  trackingUsa?: string;
  transportistaUsa?: string;
  trackingEc?: string;
  transportistaEc?: string;
  peso?: number | null;
  flete?: number | null;
  arancel?: number | null;
  otrosCostos?: number | null;
  reglaDistribucionCostos?: string;
  observacionCostos?: string;
  observaciones?: string;
};

export const SHIPPING_V2_PACKING_ESTADOS = SHIPPING_V2_PACKING_SELECT_OPTIONS.estado;
export const SHIPPING_V2_PACKING_TIPOS = SHIPPING_V2_PACKING_SELECT_OPTIONS.tipo;
export const SHIPPING_V2_REGLAS_DISTRIBUCION_COSTOS = SHIPPING_V2_PACKING_SELECT_OPTIONS.reglaDistribucionCostos;

export type ShippingV2Recepcion = ShippingV2RecordBase & {
  recepcionId: string;
  estado: ShippingV2RecepcionEstado | string;
  packingId?: string;
  fechaRecepcion?: string;
  itemsRecibidos: number;
  observacion?: string;
};

export type ShippingV2Novedad = ShippingV2RecordBase & {
  titulo: string;
  estado: ShippingV2NovedadEstado | string;
  severidad?: "Baja" | "Media" | "Alta" | "Critica" | string;
  itemId?: string;
  packingId?: string;
  descripcion?: string;
};

export type ShippingV2Migracion = ShippingV2RecordBase & {
  origenRecordId: string;
  destinoRecordId?: string;
  estado: ShippingV2MigracionEstado | string;
  entidad: string;
  mensaje?: string;
};

export type ShippingV2Evento = ShippingV2RecordBase & {
  tipo: ShippingV2EventoTipo | string;
  entidad: string;
  entidadId?: string;
  descripcion: string;
  actor?: string;
  fecha?: string;
};

export type ShippingV2DashboardSummary = {
  totalItems: number;
  itemsPendientesPago: number;
  itemsEnTransito: number;
  itemsDisponibles: number;
  pagosPendientes: number;
  packingsEnProceso: number;
  packingsEnTransito: number;
  novedadesAbiertas: number;
};

export type ShippingV2PagoPendingItem = Pick<
  ShippingV2Item,
  | "id"
  | "sku"
  | "skuProveedor"
  | "nombre"
  | "tipoOperacion"
  | "tipoItem"
  | "categoria"
  | "estado"
  | "proveedorId"
  | "proveedorNombre"
  | "proveedorLogisticoId"
  | "proveedorLogisticoNombre"
  | "requierePago"
  | "costoProveedor"
  | "cantidad"
  | "esRegalo"
  | "fechaRegistro"
  | "pagoV2ItemIds"
  | "pagoV2RegaloIds"
>;

export type ShippingV2PagoSupportCard =
  | {
      kind: "item";
      id: string;
      item: ShippingV2PagoPendingItem;
      proveedorId?: string;
      proveedorNombre?: string;
      total: number | null;
      missing: string[];
    }
  | {
      kind: "pago";
      id: string;
      pago: ShippingV2Pago;
      proveedorId?: string;
      proveedorNombre?: string;
      total: number | null;
      missing: string[];
    };

export type ShippingV2PagosSummary = {
  totalPorPagar: number;
  totalPagadoSinSoporte: number;
  totalPagadoCompleto: number;
  incompletos: number;
  porPagarCount: number;
  itemsSinPagoCount: number;
  pagosPendientesCount: number;
  pagadosSinSoporteCount: number;
  pagosCompletosCount: number;
};

export type ShippingV2PagosWorkspace = {
  pagos: ShippingV2Pago[];
  itemsPendientes: ShippingV2PagoPendingItem[];
  porPagar: ShippingV2PagoPendingItem[];
  pagosPendientes: ShippingV2Pago[];
  pendientes: {
    itemsSinPago: ShippingV2PagoPendingItem[];
    pagosPendientes: ShippingV2Pago[];
  };
  pagadosSinSoporte: ShippingV2PagoSupportCard[];
  sinSoporte: {
    itemsPagadosSinPago: Extract<ShippingV2PagoSupportCard, { kind: "item" }>[];
    pagosIncompletos: Extract<ShippingV2PagoSupportCard, { kind: "pago" }>[];
  };
  pagosCompletos: ShippingV2Pago[];
  pagosRegistrados: ShippingV2Pago[];
  proveedores: ShippingV2Proveedor[];
  summary: ShippingV2PagosSummary;
};
