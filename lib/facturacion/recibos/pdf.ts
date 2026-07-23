import "server-only";

// PDF del RECIBO — documento interno NO tributario. Muy similar a la factura,
// pero sin clave de acceso, sin autorización, sin código de barras, sin IVA, y
// con pie que aclara que no es un comprobante tributario. Incluye la forma de
// pago (el recibo sí registra un ingreso).

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const pdfmake = require("pdfmake") as any;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const vfsRaw  = require("pdfmake/build/vfs_fonts") as { pdfMake?: { vfs: Record<string, string> } } & Record<string, string>;

import fs   from "fs";
import path from "path";

import { totalLinea, totalRecibo } from "./calculos";
import type { LineaRecibo, ReciboCliente } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DocDef = any;

const FORMA_PAGO_LABEL: Record<string, string> = {
  "01": "EFECTIVO", "15": "COMPENSACIÓN DE DEUDAS", "16": "TARJETA DE DÉBITO", "17": "DINERO ELECTRÓNICO",
  "18": "TARJETA PREPAGO", "19": "TARJETA DE CRÉDITO", "20": "OTROS (SIST. FINANCIERO)", "21": "ENDOSO DE TÍTULOS",
};

let _logo: string | null | undefined = undefined;
function getLogo(): string | null {
  if (_logo !== undefined) return _logo;
  try { _logo = `data:image/png;base64,${fs.readFileSync(path.join(process.cwd(), "public", "logo-factura.png")).toString("base64")}`; }
  catch { _logo = null; }
  return _logo;
}

let _init = false;
function initPdf() {
  if (_init) return;
  _init = true;
  pdfmake.setUrlAccessPolicy(() => false);
  const vfsData: Record<string, string> = vfsRaw.pdfMake?.vfs ?? (vfsRaw as unknown as Record<string, string>);
  for (const [k, v] of Object.entries(vfsData)) pdfmake.virtualfs.writeFileSync(k, Buffer.from(v, "base64"));
  pdfmake.addFonts({ Roboto: { normal: "Roboto-Regular.ttf", bold: "Roboto-Medium.ttf", italics: "Roboto-Italic.ttf", bolditalics: "Roboto-MediumItalic.ttf" } });
}

export type ReciboPdfInput = {
  numero: string; fecha: Date;
  ruc: string; razonSocial: string; nombreComercial?: string; dirMatriz: string;
  cliente: ReciboCliente; lineas: LineaRecibo[]; formaPago: string; nota?: string;
};

const mon = (n: number) => `$${n.toFixed(2)}`;
const dec = (n: number) => n.toFixed(2);
function ddmmaaaa(d: Date): string { const p = (n: number) => String(n).padStart(2, "0"); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`; }

export async function generarReciboPdf(input: ReciboPdfInput): Promise<Uint8Array> {
  initPdf();
  const logo = getLogo();
  const total = totalRecibo(input.lineas);

  const comercial = input.nombreComercial?.trim() || input.razonSocial;
  const mostrarRazon = input.razonSocial.trim() && input.razonSocial.trim() !== comercial.trim();

  const docDef: DocDef = {
    pageSize: "A4", pageMargins: [30, 30, 40, 40], defaultStyle: { font: "Roboto", fontSize: 8 },
    content: [
      {
        columns: [
          logo ? { image: logo, width: 90 } : { text: "", width: 90 },
          { stack: [
            { text: comercial, bold: true, fontSize: 11 },
            ...(mostrarRazon ? [{ text: input.razonSocial, fontSize: 8 }] : []),
            { text: `R.U.C: ${input.ruc}`, fontSize: 8 },
            { text: input.dirMatriz, fontSize: 8 },
          ], width: "*", margin: [10, 0, 0, 0] },
          { width: 190, table: { widths: ["*"], body: [
            [{ text: "RECIBO", bold: true, alignment: "center", fontSize: 13, color: "#444" }],
            [{ text: `No. ${input.numero}`, alignment: "center", bold: true }],
            [{ text: `FECHA: ${ddmmaaaa(input.fecha)}`, alignment: "center", fontSize: 8 }],
          ] }, layout: "lightHorizontalLines" },
        ], columnGap: 10, margin: [0, 0, 0, 10],
      },
      { table: { widths: [90, "*", 70, 120], body: [[
        { text: "CLIENTE:", bold: true }, { text: input.cliente.razonSocial },
        { text: "IDENTIF.:", bold: true }, { text: input.cliente.identificacion ?? "—" },
      ]] }, layout: "lightHorizontalLines", margin: [0, 0, 0, 10] },
      {
        table: {
          headerRows: 1, widths: [55, "*", 40, 60, 55, 60],
          body: [
            [
              { text: "Cód.", bold: true, fillColor: "#e8e8e8" },
              { text: "Descripción", bold: true, fillColor: "#e8e8e8" },
              { text: "Cant.", bold: true, fillColor: "#e8e8e8", alignment: "right" },
              { text: "P.Unit.", bold: true, fillColor: "#e8e8e8", alignment: "right" },
              { text: "Desc.", bold: true, fillColor: "#e8e8e8", alignment: "right" },
              { text: "Total", bold: true, fillColor: "#e8e8e8", alignment: "right" },
            ],
            ...input.lineas.map((l) => [
              { text: l.codigo ?? "" }, { text: l.descripcion },
              { text: dec(l.cantidad), alignment: "right" }, { text: mon(l.precioUnitario), alignment: "right" },
              { text: mon(l.descuento), alignment: "right" }, { text: mon(totalLinea(l)), alignment: "right" },
            ]),
          ],
        }, layout: "lightHorizontalLines", margin: [0, 0, 0, 10],
      },
      {
        columns: [
          { width: "*", stack: [
            { text: `FORMA DE PAGO: ${FORMA_PAGO_LABEL[input.formaPago] ?? input.formaPago}`, bold: true },
            ...(input.nota ? [{ text: `Nota: ${input.nota}`, italics: true, color: "#666", margin: [0, 4, 0, 0] }] : []),
          ] },
          { width: 10, text: "" },
          { width: 200, table: { widths: ["*", 80], body: [
            [{ text: "TOTAL", bold: true, fillColor: "#e8e8e8" }, { text: mon(total), bold: true, alignment: "right", fillColor: "#e8e8e8" }],
          ] }, layout: "lightHorizontalLines" },
        ],
      },
    ],
    footer: {
      text: "DOCUMENTO NO TRIBUTARIO — Este recibo es una constancia interna de compra entre el cliente y SUPER TIENDA GEEK. No es un comprobante de venta autorizado por el SRI.",
      alignment: "center", fontSize: 7, color: "#888", margin: [30, 10, 30, 0],
    },
  };

  const buf = await pdfmake.createPdf(docDef).getBuffer();
  return new Uint8Array(buf);
}
