import "server-only";

// PDF A4 del comprobante de abono, con el estilo de Facturación. Documento
// interno NO tributario. Ver lib/cobros/comprobante-abono.ts.

import { encabezadoPdf, generarPdfA4, monPdf as mon, type EmisorPdf } from "@/lib/documentos/pdf-base";
import { fechaComprobante, type ComprobanteAbono } from "./comprobante-abono";

const GRIS = "#e8e8e8";

export async function generarComprobanteAbonoPdf(emisor: EmisorPdf, c: ComprobanteAbono): Promise<Uint8Array> {
  const content: unknown[] = [
    encabezadoPdf(emisor, "COMPROBANTE DE ABONO", c.numero, fechaComprobante(c.fecha)),
  ];
  if (c.abono.anulado) {
    content.push({ text: "ANULADO — ESTE PAGO FUE ANULADO", bold: true, fontSize: 14, color: "#B42318", alignment: "center", margin: [0, 0, 0, 10] });
  }
  content.push(
    { table: { widths: [70, "*", 70, 120], body: [
      [{ text: "CLIENTE:", bold: true }, { text: c.cliente.nombre }, { text: "IDENTIF.:", bold: true }, { text: c.cliente.identificacion || "—" }],
      [{ text: "TELÉFONO:", bold: true }, { text: c.cliente.telefono || "—" }, { text: "CUENTA:", bold: true }, { text: c.referencia }],
    ] }, layout: "lightHorizontalLines", margin: [0, 0, 0, 10] },
    { table: { widths: ["*", 160, 90], body: [
      [
        { text: "PAGO RECIBIDO", bold: true, fillColor: GRIS },
        { text: "Forma de pago", bold: true, fillColor: GRIS },
        { text: "Monto", bold: true, fillColor: GRIS, alignment: "right" },
      ],
      [
        { stack: [
          { text: `Abono a la cuenta ${c.referencia}` },
          ...(c.abono.transaccion ? [{ text: `Transacción: ${c.abono.transaccion}`, color: "#666" }] : []),
          ...(c.abono.observacion ? [{ text: `Nota: ${c.abono.observacion}`, color: "#666", italics: true }] : []),
        ] },
        { text: c.abono.metodo },
        { text: mon(c.abono.monto), alignment: "right", bold: true, fontSize: 10 },
      ],
    ] }, layout: "lightHorizontalLines", margin: [0, 0, 0, 12] },
  );
  if (c.cargos.length > 0) {
    content.push(
      { text: "DETALLE DE LA CUENTA", bold: true, margin: [0, 0, 0, 4] },
      { table: { headerRows: 1, widths: ["*", 70, 60, 70], body: [
        [
          { text: "Descripción", bold: true, fillColor: GRIS },
          { text: "Precio", bold: true, fillColor: GRIS, alignment: "right" },
          { text: "Desc.", bold: true, fillColor: GRIS, alignment: "right" },
          { text: "Total", bold: true, fillColor: GRIS, alignment: "right" },
        ],
        ...c.cargos.map((g) => [
          { text: g.enEspera ? `${g.nombre} (por llegar)` : g.nombre },
          { text: mon(g.precio), alignment: "right" },
          { text: g.descuento > 0 ? mon(g.descuento) : "—", alignment: "right" },
          { text: mon(g.neto), alignment: "right" },
        ]),
      ] }, layout: "lightHorizontalLines", margin: [0, 0, 0, 12] },
    );
  }
  content.push(
    { text: "PAGOS DE LA CUENTA", bold: true, margin: [0, 0, 0, 4] },
    { table: { headerRows: 1, widths: [80, 90, "*", 90], body: [
      [
        { text: "No.", bold: true, fillColor: GRIS },
        { text: "Fecha", bold: true, fillColor: GRIS },
        { text: "Forma de pago", bold: true, fillColor: GRIS },
        { text: "Monto", bold: true, fillColor: GRIS, alignment: "right" },
      ],
      ...c.pagos.map((p) => [
        { text: p.numero, bold: p.esEste },
        { text: fechaComprobante(p.fecha), bold: p.esEste },
        { text: p.esEste ? `${p.metodo} (este pago)` : p.metodo, bold: p.esEste },
        { text: mon(p.monto), alignment: "right", bold: p.esEste },
      ]),
    ] }, layout: "lightHorizontalLines", margin: [0, 0, 0, 10] },
    { columns: [
      { width: "*", text: c.saldoPendiente > 0 ? "La factura o el recibo se entrega al completar el pago." : "", color: "#666", margin: [0, 4, 0, 0] },
      { width: 10, text: "" },
      { width: 200, table: { widths: ["*", 80], body: [
        [{ text: "Total de la cuenta", bold: true }, { text: mon(c.totalCuenta), alignment: "right" }],
        [{ text: "Total pagado", bold: true }, { text: mon(c.totalPagado), alignment: "right" }],
        c.saldoAFavor > 0
          ? [{ text: "SALDO A FAVOR", bold: true, fillColor: GRIS }, { text: mon(c.saldoAFavor), bold: true, alignment: "right", fillColor: GRIS }]
          : [{ text: "SALDO PENDIENTE", bold: true, fillColor: GRIS }, { text: mon(c.saldoPendiente), bold: true, alignment: "right", fillColor: GRIS }],
      ] }, layout: "lightHorizontalLines" },
    ] },
  );
  return generarPdfA4(
    content,
    "DOCUMENTO NO TRIBUTARIO — Constancia de pago entre el cliente y SUPER TIENDA GEEK. No es un comprobante de venta autorizado por el SRI.",
  );
}
