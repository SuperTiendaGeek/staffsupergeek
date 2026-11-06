import "server-only";

// PDF A4 del Comprobante de entrega (sin cobro), con el estilo de Facturación.
// Documento interno NO tributario. Ver ./comprobante.ts.

import { encabezadoPdf, generarPdfA4, type EmisorPdf } from "@/lib/documentos/pdf-base";
import { fechaHoraEntrega } from "./formato";
import type { ComprobanteEntrega } from "./comprobante";

export async function generarComprobanteEntregaPdf(emisor: EmisorPdf, c: ComprobanteEntrega): Promise<Uint8Array> {
  const fila = (etiqueta: string, valor: string) => [{ text: etiqueta, bold: true }, { text: valor || "—", colSpan: 3 }, {}, {}];
  const content: unknown[] = [
    encabezadoPdf(emisor, "COMPROBANTE DE ENTREGA", c.numero, fechaHoraEntrega(c.fecha)),
    { table: { widths: [90, "*", 70, 120], body: [
      [{ text: "CLIENTE:", bold: true }, { text: c.cliente.nombre }, { text: "IDENTIF.:", bold: true }, { text: c.cliente.identificacion || "—" }],
      [{ text: "TELÉFONO:", bold: true }, { text: c.cliente.telefono || "—" }, { text: "ORDEN:", bold: true }, { text: c.orden.codigo }],
      fila("EQUIPO:", c.orden.equipo),
      fila("MOTIVO:", `${c.motivo}${c.detalle ? ` — ${c.detalle}` : ""}`),
      fila("ACCESORIOS:", c.accesorios || "Ninguno"),
      fila("ESTADO:", c.estado),
      fila("RETIRA:", c.retiradoPor),
    ] }, layout: "lightHorizontalLines", margin: [0, 0, 0, 12] },
    { text: "Se entrega el equipo sin cobro: no hubo venta ni servicio facturable.", color: "#444", margin: [0, 0, 0, 4] },
    { columns: [{ text: "TOTAL", bold: true }, { text: "$0.00", bold: true, alignment: "right" }], margin: [0, 0, 0, 36] },
    { columns: [
      { width: "*", stack: [{ text: "_____________________________", alignment: "center" }, { text: `Entregado por SUPER GEEK${c.entregadoPor ? ` (${c.entregadoPor})` : ""}`, alignment: "center", color: "#666" }] },
      { width: "*", stack: [{ text: "_____________________________", alignment: "center" }, { text: "Recibí conforme", alignment: "center", color: "#666" }] },
    ] },
  ];
  return generarPdfA4(
    content,
    "DOCUMENTO NO TRIBUTARIO — Constancia de entrega sin cobro entre el cliente y SUPER TIENDA GEEK. No es un comprobante de venta autorizado por el SRI.",
  );
}
