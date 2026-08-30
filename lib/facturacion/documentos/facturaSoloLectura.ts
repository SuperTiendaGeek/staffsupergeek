// DTO de solo lectura de una factura — cliente, ítems, totales, SRI. Sin
// nada de estado de flujo (correo, sincronización, etc.) que no aporta a
// una vista de consulta. Usado por la página
// app/facturacion/documentos/factura/[recordId]/page.tsx y por el endpoint
// que consume el modal de /tecnicos/mantenimientos (VerFacturaModal) — un
// solo lugar que arma esta forma, para no tener la misma lógica de mapeo
// en dos sitios.

import { obtenerFactura } from "@/lib/facturacion/airtable/facturas";
import { parsearLineasFactura, type ItemTicket } from "@/lib/facturacion/print/lineasFactura";

export type FacturaSoloLectura = {
  recordId: string;
  numeroFactura: string;
  estado: string;
  ambiente: string;
  clienteNombre: string;
  clienteIdentificacion: string;
  clienteCorreo: string;
  fechaEmision: string;
  claveAcceso: string;
  subtotal: number;
  iva: number;
  total: number;
  formaPago: string;
  items: ItemTicket[];
};

export async function obtenerFacturaSoloLectura(recordId: string): Promise<FacturaSoloLectura | null> {
  const factura = await obtenerFactura(recordId);
  if (!factura) return null;

  const { items, formaPago } = parsearLineasFactura(factura.lineasJson);

  return {
    recordId: factura.recordId,
    numeroFactura: factura.numeroFactura,
    estado: factura.estado,
    ambiente: factura.ambiente,
    clienteNombre: factura.clienteNombre,
    clienteIdentificacion: factura.clienteIdentificacion,
    clienteCorreo: factura.clienteCorreo,
    fechaEmision: factura.fechaEmision,
    claveAcceso: factura.claveAcceso,
    subtotal: factura.subtotal,
    iva: factura.iva,
    total: factura.total,
    formaPago,
    items,
  };
}
