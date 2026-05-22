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
  nombre: string;
  estado: ShippingV2ProveedorEstado | string;
  contacto?: string;
  email?: string;
  telefono?: string;
  pais?: string;
};

export type ShippingV2Item = ShippingV2RecordBase & {
  codigo: string;
  nombre: string;
  estado: ShippingV2ItemEstado | string;
  proveedorId?: string;
  proveedorNombre?: string;
  costoProveedor: number | null;
  precioVenta: number | null;
  qty: number | null;
  trackingUsa?: string;
  trackingEc?: string;
  packingId?: string;
  pagoId?: string;
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
