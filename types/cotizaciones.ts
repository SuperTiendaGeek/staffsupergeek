export const ESTADOS_COTIZACION = [
  "Pendiente",
  "Buscando Opciones",
  "Cotización Enviada",
  "Esperando Respuesta",
  "Aprobada",
  "No Disponible",
  "Convertida en Pedido",
] as const;

export type EstadoCotizacion = (typeof ESTADOS_COTIZACION)[number];

export const CATEGORIAS_COTIZACION = [
  "Laptop",
  "Desktop",
  "Electrónico",
  "Repuesto",
  "Consola",
  "iMac",
  "Mainboard",
  "Batería",
  "Otro",
] as const;

export type CategoriaCotizacion = (typeof CATEGORIAS_COTIZACION)[number];

export function normalizeCategoriaCotizacion(value: unknown): CategoriaCotizacion | "" {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";

  if (normalized === "aio" || normalized === "all in one" || normalized === "all-in-one") {
    return "Desktop";
  }

  const found = CATEGORIAS_COTIZACION.find((categoria) => categoria.toLowerCase() === normalized);
  return found ?? "";
}

export const ESTADOS_OPCION_COTIZACION = [
  "Disponible",
  "Ofrecida al Cliente",
  "Seleccionada",
  "Descartada",
  "No Disponible",
] as const;

export type EstadoOpcionCotizacion = (typeof ESTADOS_OPCION_COTIZACION)[number];

export const METODOS_PAGO_ABONO_COTIZACION = [
  "Efectivo",
  "Transferencia bancaria",
  "Depósito",
  "Tarjeta",
  "Otro",
] as const;

export type MetodoPagoAbonoCotizacion = (typeof METODOS_PAGO_ABONO_COTIZACION)[number];

export function normalizeMetodoPagoAbonoCotizacion(value: unknown): MetodoPagoAbonoCotizacion | "" {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  const found = METODOS_PAGO_ABONO_COTIZACION.find((metodo) => metodo.toLowerCase() === normalized);
  return found ?? "";
}

export const CUENTAS_DESTINO_ABONO_COTIZACION = [
  "Caja",
  "Banco Pichincha",
  "PayPhone",
  "DataFast",
  "Otro",
] as const;

export type CuentaDestinoAbonoCotizacion = (typeof CUENTAS_DESTINO_ABONO_COTIZACION)[number];

export function normalizeCuentaDestinoAbonoCotizacion(value: unknown): CuentaDestinoAbonoCotizacion | "" {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  const found = CUENTAS_DESTINO_ABONO_COTIZACION.find((cuenta) => cuenta.toLowerCase() === normalized);
  return found ?? "";
}

export type AirtableAttachment = {
  id?: string | null;
  url: string;
  filename?: string | null;
  size?: number | null;
  type?: string | null;
  thumbnails?: unknown;
};

export type CotizacionClienteSnapshot = {
  recordId: string;
  nombre: string;
  telefono: string;
  email: string;
  cedula: string;
};

export type CotizacionListado = {
  id: string;
  codigo: string;
  clienteNombre: string;
  productoSolicitado: string;
  categoria: string;
  estado: EstadoCotizacion | string;
  totalCotizado: number | null;
  totalAbonado: number | null;
  saldoPendiente: number | null;
  fechaCreacion: string;
  itemPedidoId: string;
};

export type CotizacionResumenEstado = Record<EstadoCotizacion, number>;

export type CotizacionDetalle = CotizacionListado & {
  clienteRecordId: string;
  clienteTelefono: string;
  clienteEmail: string;
  clienteCedula: string;
  descripcionRequerimiento: string;
  requiereInstalacion: boolean;
  equipoYaEstaEnTienda: boolean;
  ordenReparacionId: string;
  ordenReparacionCodigo: string;
  itemPedidoId: string;
  registradoPor: string;
  ultimaActualizacion: string;
  observacionInterna: string;
  opciones: OpcionCotizacion[];
  abonos: AbonoCotizacion[];
};

export type OpcionCotizacion = {
  id: string;
  opcion: string;
  nombre: string;
  descripcion: string;
  fotos: AirtableAttachment[];
  proveedor: string;
  proveedorRecordIds: string[];
  urlProveedor: string;
  costoProveedor: number | null;
  fleteEstimado: number | null;
  arancelImpuestos: number | null;
  otrosCostos: number | null;
  costoRealTotal: number | null;
  precioVentaCliente: number | null;
  gananciaEstimada: number | null;
  estado: EstadoOpcionCotizacion | string;
  seleccionadaPorCliente: boolean;
  notaInterna: string;
  notaParaCliente: string;
};

export type CrearCotizacionInput = {
  cliente: CotizacionClienteSnapshot;
  productoSolicitado: string;
  categoria?: string | null;
  descripcionRequerimiento?: string | null;
  requiereInstalacion?: boolean;
  equipoYaEstaEnTienda?: boolean;
  observacionInterna?: string | null;
  registradoPor: string;
};

export type CrearOpcionCotizacionInput = {
  cotizacionId: string;
  nombre: string;
  descripcion?: string | null;
  proveedor?: string | null;
  urlProveedor?: string | null;
  costoProveedor?: number | null;
  fleteEstimado?: number | null;
  arancelImpuestos?: number | null;
  otrosCostos?: number | null;
  precioVentaCliente?: number | null;
  notaInterna?: string | null;
  notaParaCliente?: string | null;
};

export type AbonoCotizacion = {
  id: string;
  cotizacionRecordIds: string[];
  itemPedidoId: string;
  clienteNombre: string;
  fechaAbono: string;
  monto: number | null;
  metodoPago: MetodoPagoAbonoCotizacion | string;
  cuentaDestino: CuentaDestinoAbonoCotizacion | string;
  comprobante: AirtableAttachment[];
  numeroTransaccion: string;
  registradoPor: string;
  estado: "Registrado" | "Anulado" | string;
  estadoFinanciero: "Pendiente de registrar" | "Registrado en Finanzas" | "Error de sincronización" | "Anulado" | string;
  observacion: string;
  creado: string;
};

export type CrearAbonoCotizacionInput = {
  cotizacionId: string;
  itemPedidoId?: string | null;
  clienteNombre: string;
  fechaAbono?: string | null;
  monto: number;
  metodoPago: MetodoPagoAbonoCotizacion;
  cuentaDestino?: CuentaDestinoAbonoCotizacion | null;
  numeroTransaccion?: string | null;
  registradoPor: string;
  observacion?: string | null;
};
