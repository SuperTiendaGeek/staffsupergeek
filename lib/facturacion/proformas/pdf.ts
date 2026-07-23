import "server-only";

// PDF de la PROFORMA — documento interno NO tributario. Sin clave de acceso,
// sin autorización, sin código de barras. Rotulado "PROFORMA" y con pie legal
// que aclara que no es un comprobante de venta autorizado por el SRI.
//
// Usa el mismo pdfmake que el RIDE (fuentes Roboto embebidas), inicializado de
// forma autónoma para no acoplarse a generarRide.

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const pdfmake = require("pdfmake") as any;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const vfsRaw  = require("pdfmake/build/vfs_fonts") as { pdfMake?: { vfs: Record<string, string> } } & Record<string, string>;

import fs   from "fs";
import path from "path";

import { calcularTotalesProforma } from "./calculos";
import type { LineaProforma, ProformaCliente } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DocDef = any;

let _logo: string | null | undefined = undefined;
function getLogo(): string | null {
  if (_logo !== undefined) return _logo;
  try {
    const buf = fs.readFileSync(path.join(process.cwd(), "public", "logo-factura.png"));
    _logo = `data:image/png;base64,${buf.toString("base64")}`;
  } catch { _logo = null; }
  return _logo;
}

let _init = false;
function initPdf() {
  if (_init) return;
  _init = true;
  pdfmake.setUrlAccessPolicy(() => false);
  const vfsData: Record<string, string> = vfsRaw.pdfMake?.vfs ?? (vfsRaw as unknown as Record<string, string>);
  for (const [k, v] of Object.entries(vfsData)) pdfmake.virtualfs.writeFileSync(k, Buffer.from(v, "base64"));
  pdfmake.addFonts({
    Roboto: { normal: "Roboto-Regular.ttf", bold: "Roboto-Medium.ttf", italics: "Roboto-Italic.ttf", bolditalics: "Roboto-MediumItalic.ttf" },
  });
}

export type ProformaPdfInput = {
  numero:      string;
  fecha:       Date;
  ruc:         string;
  razonSocial: string;
  nombreComercial?: string;
  dirMatriz:   string;
  cliente:     ProformaCliente;
  lineas:      LineaProforma[];
  nota?:       string;
  validezDias?: number | null;
};

const mon = (n: number) => `$${n.toFixed(2)}`;
const dec = (n: number) => n.toFixed(2);
function ddmmaaaa(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export async function generarProformaPdf(input: ProformaPdfInput): Promise<Uint8Array> {
  initPdf();
  const totales = calcularTotalesProforma(input.lineas);
  const logo = getLogo();

  const emisor = [
    ...(input.nombreComercial ? [{ text: input.nombreComercial, bold: true, fontSize: 11 }] : []),
    { text: input.razonSocial, bold: true },
    { text: `R.U.C: ${input.ruc}`, fontSize: 8 },
    { text: input.dirMatriz, fontSize: 8 },
  ];

  const filasTotales: Array<[string, number]> = [];
  for (const t of totales.porTarifa) filasTotales.push([`SUBTOTAL ${t.tarifa}%`, t.base]);
  filasTotales.push(["SUBTOTAL SIN IMPUESTOS", totales.totalSinImpuestos]);
  if (totales.totalDescuento > 0) filasTotales.push(["DESCUENTO", totales.totalDescuento]);
  filasTotales.push(["IVA", totales.iva]);
  filasTotales.push(["VALOR TOTAL", totales.importeTotal]);

  const docDef: DocDef = {
    pageSize: "A4",
    pageMargins: [30, 30, 40, 40],
    defaultStyle: { font: "Roboto", fontSize: 8 },
    content: [
      {
        columns: [
          logo ? { image: logo, width: 90 } : { text: "", width: 90 },
          { stack: emisor, width: "*", margin: [10, 0, 0, 0] },
          {
            width: 190,
            table: { widths: ["*"], body: [
              [{ text: "PROFORMA", bold: true, alignment: "center", fontSize: 13, color: "#444" }],
              [{ text: `No. ${input.numero}`, alignment: "center", bold: true }],
              [{ text: `FECHA: ${ddmmaaaa(input.fecha)}`, alignment: "center", fontSize: 8 }],
              ...(input.validezDias ? [[{ text: `VÁLIDA POR ${input.validezDias} DÍAS`, alignment: "center", fontSize: 8 }]] : []),
            ] },
            layout: "lightHorizontalLines",
          },
        ],
        columnGap: 10, margin: [0, 0, 0, 10],
      },

      // Cliente
      {
        table: { widths: [90, "*", 70, 120], body: [[
          { text: "CLIENTE:", bold: true }, { text: input.cliente.razonSocial },
          { text: "IDENTIF.:", bold: true }, { text: input.cliente.identificacion },
        ]] },
        layout: "lightHorizontalLines", margin: [0, 0, 0, 10],
      },

      // Detalles
      {
        table: {
          headerRows: 1,
          widths: [55, "*", 35, 45, 55, 45, 55],
          body: [
            [
              { text: "Cód.", bold: true, fillColor: "#e8e8e8" },
              { text: "Descripción", bold: true, fillColor: "#e8e8e8" },
              { text: "Cant.", bold: true, fillColor: "#e8e8e8", alignment: "right" },
              { text: "P.Unit.", bold: true, fillColor: "#e8e8e8", alignment: "right" },
              { text: "IVA%", bold: true, fillColor: "#e8e8e8", alignment: "right" },
              { text: "Desc.", bold: true, fillColor: "#e8e8e8", alignment: "right" },
              { text: "Total", bold: true, fillColor: "#e8e8e8", alignment: "right" },
            ],
            ...input.lineas.map((l) => {
              const total = Math.round((l.cantidad * l.precioUnitario - l.descuento + Number.EPSILON) * 100) / 100;
              return [
                { text: l.codigo ?? "" },
                { text: l.descripcion },
                { text: dec(l.cantidad), alignment: "right" },
                { text: mon(l.precioUnitario), alignment: "right" },
                { text: `${({ "4": 15, "3": 14, "8": 8, "5": 5, "2": 0, "1": 0, "0": 0 } as Record<string, number>)[l.tarifaIva] ?? 15}%`, alignment: "right" },
                { text: mon(l.descuento), alignment: "right" },
                { text: mon(total), alignment: "right" },
              ];
            }),
          ],
        },
        layout: "lightHorizontalLines", margin: [0, 0, 0, 10],
      },

      // Totales
      {
        columns: [
          { width: "*", text: input.nota ? `Nota: ${input.nota}` : "", italics: true, color: "#666" },
          { width: 10, text: "" },
          {
            width: 220,
            table: { widths: ["*", 80], body: filasTotales.map((f, i) => {
              const last = i === filasTotales.length - 1;
              return [
                { text: f[0], bold: last, fillColor: last ? "#e8e8e8" : undefined },
                { text: mon(f[1]), bold: last, alignment: "right", fillColor: last ? "#e8e8e8" : undefined },
              ];
            }) },
            layout: "lightHorizontalLines",
          },
        ],
      },
    ],
    footer: {
      text: "DOCUMENTO NO TRIBUTARIO — Esta proforma no representa un comprobante de venta autorizado por el SRI. Es una constancia informativa de los artículos cotizados.",
      alignment: "center", fontSize: 7, color: "#888", margin: [30, 10, 30, 0],
    },
  };

  const buf = await pdfmake.createPdf(docDef).getBuffer();
  return new Uint8Array(buf);
}
