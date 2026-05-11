export const CARRIERS_PEDIDO = ["UPS", "USPS", "FeDex", "Gofo", "Otros"] as const;

export type CarrierPedido = (typeof CARRIERS_PEDIDO)[number];
export type ProveedorOrigenPedido = "ECU" | "USA" | "CHN" | "";

export type ProveedorPedido = {
  id: string;
  nombre: string;
  direccion: ProveedorOrigenPedido;
};

export type EstadoPedidoOption = {
  id: string;
  name: string;
};

export type PedidoAttachment = {
  id?: string | null;
  url: string;
  filename?: string | null;
  size?: number | null;
  type?: string | null;
};

export function normalizeCarrierPedido(value: unknown): CarrierPedido | "" {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  const found = CARRIERS_PEDIDO.find((carrier) => carrier.toLowerCase() === normalized);
  return found ?? "";
}

export type PedidoItem = {
  id: string;
  codigo: string;
  identificador: string;
  skuProveedor: string;
  item: string;
  categoria: string;
  itemPara: string;
  precioVenta: number | null;
  costoProveedor: number | null;
  fleteEcItemSolo: number | null;
  arancelItemSolo: number | null;
  ganancia: number | null;
  gananciaNeta: number | null;
  proveedorId: string;
  proveedor: string;
  proveedorOrigen: ProveedorOrigenPedido;
  esProveedorLocal: boolean;
  esProveedorExterior: boolean;
  requiereUsaTracking: boolean;
  requiereEcTracking: boolean;
  estaEncargado: boolean;
  usaTracking: string;
  ecTracking: string;
  carrier: string;
  recibido: boolean;
  recibidoEnLv: boolean;
  estadosPedido: string;
  notaInterna: string;
  notaPublica: string;
  evidencias: PedidoAttachment[];
  cotizacionId: string;
  cotizacionCodigo: string;
  opcionCotizacionId: string;
  clienteRecordIdReparaciones: string;
  clienteNombreSnapshot: string;
  clienteTelefonoSnapshot: string;
  requiereInstalacion: boolean;
  ordenReparacionId: string;
  ordenReparacionCodigo: string;
  estadoInstalacion: string;
};

export type PedidoUpdateInput = {
  proveedorId?: string;
  fleteEcItemSolo?: number | null;
  arancelItemSolo?: number | null;
  usaTracking?: string;
  ecTracking?: string;
  carrier?: CarrierPedido | "";
  recibido?: boolean;
  recibidoEnLv?: boolean;
  estadosPedido?: string;
  notaInterna?: string;
  notaPublica?: string;
};
