import { SHIPPING_V2_ITEM_SELECT_OPTIONS } from "@/lib/shipping-v2/schema.generated";

export type ShippingV2RecordBase = {
  id: string;
  createdTime?: string;
};

export type ShippingV2ProveedorEstado = "Activo" | "Inactivo" | "En Revision";
export type ShippingV2ItemEstado = "Borrador" | "Pendiente Pago" | "Pagado" | "En Transito" | "Disponible" | "Entregado" | "Cancelado";
export type ShippingV2PagoEstado = "Pendiente" | "Pagado" | "Observado" | "Cancelado";
export type ShippingV2FinanzasMovimientoEstado = "Pendiente" | "Sincronizado" | "Error" | "Cancelado";
export type ShippingV2PackingEstado = "En Proceso" | "Cerrado" | "En Transito" | "Recibido" | "Cancelado";
export type ShippingV2RecepcionEstado = "Pendiente" | "Parcial" | "Completa" | "Observada";
export type ShippingV2NovedadEstado = "Abierta" | "En Revision" | "Resuelta" | "Cancelada";
export type ShippingV2MigracionEstado = "Pendiente" | "Procesada" | "Error" | "Omitida";
export type ShippingV2EventoTipo = "Inventario" | "Pago" | "Packing" | "Recepcion" | "Novedad" | "Sistema";

export type ShippingV2Proveedor = ShippingV2RecordBase & {
  proveedorId?: string;
  label: string;
  nombre: string;
  estado: ShippingV2ProveedorEstado | string;
  tipoProveedor?: string;
  puedeArmarPackings: boolean | null;
  puedeRecibirEncargosTerceros: boolean | null;
  permiteTriangulacion: boolean | null;
  contacto?: string;
  email?: string;
  telefono?: string;
  pais?: string;
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
  costoProveedor: number | null;
  costoAsignadoDespiece: number | null;
  costoLogisticoAsignado: number | null;
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
  packingId?: string;
  pagoId?: string;
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
};

export type ShippingV2Pago = ShippingV2RecordBase & {
  pagoId: string;
  estado: ShippingV2PagoEstado | string;
  proveedorId?: string;
  proveedorNombre?: string;
  total: number | null;
  fechaPagoMax?: string;
  fechaPagoReal?: string;
  metodoPago?: string;
  transaccionId?: string;
};

export type ShippingV2FinanzasMovimiento = ShippingV2RecordBase & {
  movimientoId: string;
  estado: ShippingV2FinanzasMovimientoEstado | string;
  pagoId?: string;
  fecha?: string;
  monto: number | null;
  cuentaOrigen?: string;
  referencia?: string;
};

export type ShippingV2Packing = ShippingV2RecordBase & {
  packingId: string;
  estado: ShippingV2PackingEstado | string;
  tipo?: string;
  itemCount: number;
  peso: number | null;
  trackingUsa?: string;
  trackingEc?: string;
  fechaEnvio?: string;
  arriboEstimado?: string;
};

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
