export const CARRIERS_PEDIDO = ["UPS", "USPS", "FeDex", "Gofo", "Otros"] as const;

export type CarrierPedido = (typeof CARRIERS_PEDIDO)[number];
export type ProveedorOrigenPedido = "ECU" | "USA" | "CHN" | "";

export function normalizeCarrierPedido(value: unknown): CarrierPedido | "" {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  const found = CARRIERS_PEDIDO.find((carrier) => carrier.toLowerCase() === normalized);
  return found ?? "";
}

export type PedidoItem = {
  id: string;
  codigo: string;
  item: string;
  categoria: string;
  itemPara: string;
  precioVenta: number | null;
  costoProveedor: number | null;
  fleteEcItemSolo: number | null;
  arancelItemSolo: number | null;
  ganancia: number | null;
  gananciaNeta: number | null;
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
  usaTracking?: string;
  ecTracking?: string;
  carrier?: CarrierPedido | "";
  recibido?: boolean;
  recibidoEnLv?: boolean;
  notaInterna?: string;
  notaPublica?: string;
};
