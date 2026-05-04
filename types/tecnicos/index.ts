// Tipos base para la V1 de SUPER GEEK.
// Mantienen consistencia entre front y futuras APIs sin depender aun de Airtable.

// Estados actuales definidos en Airtable para el ciclo de una orden.
export type EstadoOrden =
  | "Pendiente"
  | "En Proceso"
  | "Esperando Respuesta"
  | "Completado"
  | "Finalizado Entregado"
  | "Enviado a Reciclaje";

// Lista compartida para selects y validaciones; mantener en sincronía con Airtable.
export const ESTADOS_ORDEN: readonly EstadoOrden[] = [
  "Pendiente",
  "En Proceso",
  "Esperando Respuesta",
  "Completado",
  "Finalizado Entregado",
  "Enviado a Reciclaje",
];

// Tipos de orden vigentes en Airtable; ampliar si se agregan mas.
export type TipoOrden = "Servicio de Reparación" | "Pedido de Repuesto";

// Datos basicos del cliente que solicita el servicio.
export interface Cliente {
  id: string;
  nombre: string;
  cedula: string;
  telefono: string;
  correo: string;
  direccion: string;
}

// Perfil del tecnico con permisos granulares para la app.
export interface Tecnico {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
  rol: string;
  ultimoAcceso: string | null; // ISO string; null si aun no ingresa.
  puedeAgregarAvances: boolean;
  puedeCambiarEstado: boolean;
  puedeAgregarRepuestos: boolean;
  puedeAgregarServicios: boolean;
  puedeVerCostos: boolean;
}

// Movimiento en la linea de tiempo de una orden.
export interface HistorialEstado {
  id: string;
  ordenId: string;
  estadoNuevo: EstadoOrden;
  fecha: string; // ISO string; no se usa Date para facilitar serializacion.
  tecnicoId: string | null;
  tecnicoNombre: string | null;
  nota: string | null;
  creadoDesdeAppTecnico: boolean;
  estadoGeneradoIA?: string | null;
  solicitarMensajeCliente?: boolean;
}

// Repuesto cargado a una orden con costos separados.
export interface RepuestoUsado {
  id: string;
  ordenId: string;
  repuesto: string;
  precioCliente: number | null;
  costoProveedor: number | null;
  proveedor: string | null;
  fechaUso: string | null; // ISO string o null si aun no aplicado.
}

// Línea de repuesto asociado a orden (nueva tabla Repuestos por Orden)
export interface RepuestoPorOrden {
  id: string;
  ordenId: string;
  repuestoNombre: string;
  cantidad: number | null;
  precioCliente: number | null;
  subtotalCliente: number | null;
  costoProveedor: number | null;
  proveedor: string | null;
  observacion: string | null;
  fechaRegistro?: string | null;
}

// Servicio asociado a una orden (mano de obra, diagnostico, etc.).
export interface ServicioOrden {
  id: string;
  ordenId: string;
  servicio: string;
  costo: number | null;
}

// Línea de servicio asociado a orden (nueva tabla Servicios por Orden)
export interface ServicioPorOrden {
  id: string;
  ordenId: string;
  servicioNombre: string;
  costo: number | null;
  observacion: string | null;
  fechaRegistro?: string | null;
}

// Abono registrado para una orden (tabla Abonos por Orden).
export interface AbonoComprobanteAdjunto {
  id: string | null;
  url: string;
  filename: string | null;
  contentType: string | null;
  size: number | null;
  thumbnailUrl: string | null;
}

export interface AbonoPorOrden {
  id: string;
  idAbono: string | null;
  ordenId: string;
  fecha: string | null;
  monto: number | null;
  metodoPago: string | null;
  observacion: string | null;
  registradoPor: string | null;
  comprobante: string | null;
  comprobantes: AbonoComprobanteAdjunto[];
}

// Item reutilizable del catalogo de repuestos.
export interface CatalogoRepuesto {
  id: string;
  nombre: string;
  descripcionCorta: string | null;
  skuCodigoInterno: string | null;
  proveedorHabitual: string | null;
  costoBase: number | null;
  precioSugeridoCliente: number | null;
  activo: boolean;
}

// Item reutilizable del catalogo de servicios.
export interface CatalogoServicio {
  id: string;
  nombre: string;
  descripcion: string | null;
  costoSugerido: number | null;
  activo: boolean;
}

// Entidad principal que agrupa cliente, estados y costos.
export interface OrdenReparacion {
  id: string;
  airtableRecordId: string | null; // Mantener null hasta guardar en Airtable.
  clienteId: string;
  clienteNombre: string;
  telefono: string;
  fechaIngreso: string; // ISO string.
  equipo: string;
  accesorios: string | null;
  diagnosticoInicial: string | null;
  estadoActual: EstadoOrden;
  presupuesto: number | null;
  abono: number | null;
  totalPagar: number | null;
  notaInterna: string | null;
  recomendaciones: string | null;
  tipoOrden: TipoOrden;
  historial: HistorialEstado[];
  repuestos: RepuestoUsado[];
  servicios: ServicioOrden[];
  repuestosPorOrden?: RepuestoPorOrden[];
  serviciosPorOrden?: ServicioPorOrden[];
}

// Respuesta generica pensada para APIs internas futuras.
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
