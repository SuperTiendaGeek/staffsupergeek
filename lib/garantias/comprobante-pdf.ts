import "server-only";

// PDF A4 del comprobante de entrega en garantía, con el estilo de Facturación.
// Documento interno NO tributario. Ver ./comprobante.ts.

import { encabezadoPdf, generarPdfA4, type EmisorPdf } from "@/lib/documentos/pdf-base";
import { fechaCorta } from "./plazos";
import type { ComprobanteGarantia } from "./comprobante";

const GRIS = "#e8e8e8";

export async function generarComprobanteGarantiaPdf(emisor: EmisorPdf, c: ComprobanteGarantia): Promise<Uint8Array> {
  const content: unknown[] = [
    encabezadoPdf(emisor, "ENTREGA EN GARANTÍA", c.numero, fechaCorta(c.fecha)),
    { table: { widths: [70, "*", 70, 120], body: [
      [{ text: "CLIENTE:", bold: true }, { text: c.cliente.nombre }, { text: "IDENTIF.:", bold: true }, { text: c.cliente.identificacion || "—" }],
      [{ text: "TELÉFONO:", bold: true }, { text: c.cliente.telefono || "—" }, { text: "ORDEN:", bold: true }, { text: c.orden.codigo }],
      [{ text: "EQUIPO:", bold: true }, { text: c.orden.equipo || "—", colSpan: 3 }, {}, {}],
    ] }, layout: "lightHorizontalLines", margin: [0, 0, 0, 10] },
    { table: { headerRows: 1, widths: ["*", 150, 60], body: [
      [
        { text: "Garantía SUPER GEEK", bold: true, fillColor: GRIS },
        { text: "Nueva garantía", bold: true, fillColor: GRIS },
        { text: "Precio", bold: true, fillColor: GRIS, alignment: "right" },
      ],
      ...c.lineas.map((l) => [
        { stack: [
          { text: `${l.descripcion}${l.sku ? ` (${l.sku})` : ""}`, bold: true },
          ...(l.garantiaDe ? [{ text: `Garantía de: ${l.garantiaDe}`, color: "#666" }] : []),
          ...(l.motivo ? [{ text: `Motivo: ${l.motivo}`, color: "#666", italics: true }] : []),
          ...(l.cortesia ? [{ text: "Cortesía de SUPER GEEK", color: "#8a6d00", bold: true }] : []),
          ...(l.piezaRetirada === "Se devuelve al cliente" ? [{ text: "Se devuelve la pieza retirada al cliente.", color: "#666" }] : []),
        ] },
        { text: l.nuevaGarantia },
        { text: "$0.00", alignment: "right", bold: true },
      ]),
    ] }, layout: "lightHorizontalLines", margin: [0, 0, 0, 12] },
    { text: c.entregado
      ? "Se entregó sin costo para el cliente, como parte de la garantía de SUPER GEEK."
      : "Constancia previa: la garantía nueva cuenta desde la entrega del equipo.", color: "#444", margin: [0, 0, 0, 30] },
    { columns: [
      { width: "*", stack: [{ text: "_____________________________", alignment: "center" }, { text: "Entregado por SUPER GEEK", alignment: "center", color: "#666" }] },
      { width: "*", stack: [{ text: "_____________________________", alignment: "center" }, { text: "Recibí conforme (cliente)", alignment: "center", color: "#666" }] },
    ] },
  ];
  return generarPdfA4(
    content,
    "DOCUMENTO NO TRIBUTARIO — Constancia de entrega en garantía entre el cliente y SUPER TIENDA GEEK. No es un comprobante de venta autorizado por el SRI.",
  );
}
