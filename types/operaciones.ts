export const ESTADOS_OPERACION = [
  "Requerimiento",
  "Cotizado",
  "Aprobado",
  "Pedido",
  "Entregado",
  "Rechazado",
] as const;

export type EstadoOperacion = (typeof ESTADOS_OPERACION)[number];

export const ESTADOS_TABLERO = [
  "Requerimiento",
  "Cotizado",
  "Aprobado",
  "Pedido",
  "Entregado",
] as const satisfies readonly EstadoOperacion[];

export type OperacionListado = {
  id: string;
  codigo: string;
  productoSolicitado: string;
  estado: EstadoOperacion | string;
  clienteNombre: string;
  totalCotizado: number | null;
  totalAbonado: number | null;
  saldoPendiente: number | null;
  tieneOrden: boolean;
  /** Hay al menos una opción cargada, elegida o no (ver resolverEstadoCobro). */
  tieneOpciones: boolean;
  /**
   * Fecha de creación del registro (ISO 8601), tomada de `createdTime` de
   * Airtable — no hay un campo "Fecha" propio en "Operación Comercial".
   */
  fechaCreacion: string;
  /**
   * "Última Actualización" de Airtable (ISO 8601, lastModifiedTime — se
   * resetea con cualquier cambio al registro). Es la referencia para "días
   * sin gestión" (ver lib/operaciones/vencimiento.ts): a diferencia de la
   * fecha de creación, se reinicia sola si alguien reactiva una cotización
   * rechazada automáticamente, evitando que vuelva a rechazarse de inmediato.
   */
  ultimaActualizacion: string;
};

export type AirtableAttachment = {
  id: string | null;
  url: string;
  filename: string | null;
  size: number | null;
  type: string | null;
  thumbnails?: unknown;
};

export type ProveedorBusqueda = {
  id: string;
  nombre: string;
};

export type CrearOpcionInput = {
  productoDescripcion: string;
  proveedorId?: string | null;
  tiempoEstimado?: string;
  costoProveedor?: number | null;
  precioVentaCliente?: number | null;
  urlProveedor?: string;
  notaParaCliente?: string;
  notaInterna?: string;
};

export type OpcionDetalle = {
  id: string;
  productoDescripcion: string;
  proveedorId: string | null;
  proveedorNombre: string;
  tiempoEstimado: string;
  costoProveedor: number | null;
  flete: number | null;
  arancel: number | null;
  otrosCostos: number | null;
  costoRealTotal: number | null;
  precioVentaCliente: number | null;
  gananciaEstimada: number | null;
  urlProveedor: string;
  fotos: AirtableAttachment[];
  notaParaCliente: string;
  notaInterna: string;
  estadoOpcion: string;
  seleccionadaPorCliente: boolean;
  esElegida: boolean;
};

export type AbonoDetalle = {
  id: string;
  idAbono: number | null;
  fecha: string;
  monto: number | null;
  metodoPago: string;
  estadoAbono: string;
  observacion: string;
  clienteLabel: string;
  aplicadoA: "operacion" | "orden";
};

export type OrdenVinculada = {
  id: string;
  codigoOrden: string;
};

export type ClienteBusquedaOp = {
  id: string;
  nombre: string;
  cedula: string;
  telefono: string;
  correo: string;
};

export type OrdenClienteOp = {
  id: string;
  codigoOrden: string;
  equipo: string;
  estado: string;
  fechaIngreso: string;
};

export type CrearOperacionInput = {
  clienteId: string;
  productoSolicitado: string;
  categoria?: string;
  descripcionRequerimiento?: string;
  requiereInstalacion?: boolean;
  equipoEnTienda?: boolean;
  ordenId?: string | null;
};

export type CrearAbonoInput = {
  monto: number;
  metodoPago: string;
  fechaAbono: string;
  numeroTransaccion?: string;
  observacion?: string;
  registradoPor: string;
  operacionId: string;
  ordenId?: string | null;
};

export type ShippingItemResumen = {
  id: string;
  nombre: string;
  estadoItem: string;
};

export type OperacionDetalle = {
  id: string;
  codigo: string;
  /** Fecha de creación del registro (ISO 8601), ver `OperacionListado.fechaCreacion`. */
  fechaCreacion: string;
  /** Ver `OperacionListado.ultimaActualizacion`. */
  ultimaActualizacion: string;
  productoSolicitado: string;
  descripcionRequerimiento: string;
  estado: string;
  clienteId: string | null;
  clienteNombre: string;
  clienteTelefono: string;
  clienteCorreo: string;
  clienteCedula: string;
  categoria: string;
  requiereInstalacion: boolean;
  equipoEnTienda: boolean;
  totalCotizado: number | null;
  totalAbonado: number | null;
  saldoPendiente: number | null;
  codigoPedido: string;
  estadoInstalacion: string;
  observacionInterna: string;
  opcionElegidaId: string | null;
  /**
   * Artículos de inventario generados por esta operación ("Artículo físico" es
   * un link múltiple). Antes se exponía solo el primero y el resto no se veía
   * en pantalla, aunque la cuenta unificada sí los cobraba todos.
   */
  articulosFisicos: ShippingItemResumen[];
  ordenVinculada: OrdenVinculada | null;
  opciones: OpcionDetalle[];
  abonos: AbonoDetalle[];
};
