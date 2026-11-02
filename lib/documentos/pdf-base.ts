import "server-only";

// Base común de los PDF A4 con el estilo de Facturación (logo, emisor, cuadro
// con el tipo de documento, número y fecha). La usa el comprobante de abono.
// Los PDF de recibo, reserva, proforma y presupuesto todavía repiten este
// bloque en su propio archivo; al tocarlos, deben pasar a usar este.

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const pdfmake = require("pdfmake") as any;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const vfsRaw = require("pdfmake/build/vfs_fonts") as { pdfMake?: { vfs: Record<string, string> } } & Record<string, string>;

import fs from "fs";
import path from "path";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DocDef = any;

export type EmisorPdf = { nombreComercial?: string; razonSocial: string; ruc: string; dirMatriz: string };

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

export const monPdf = (n: number) => `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;

/** Encabezado igual al del recibo y la reserva: logo · emisor · cuadro del documento. */
export function encabezadoPdf(emisor: EmisorPdf, titulo: string, numero: string, fecha: string) {
  const logo = getLogo();
  const comercial = emisor.nombreComercial?.trim() || emisor.razonSocial;
  const mostrarRazon = emisor.razonSocial.trim() && emisor.razonSocial.trim() !== comercial.trim();
  return {
    columns: [
      logo ? { image: logo, width: 90 } : { text: "", width: 90 },
      { stack: [
        { text: comercial, bold: true, fontSize: 11 },
        ...(mostrarRazon ? [{ text: emisor.razonSocial, fontSize: 8 }] : []),
        { text: `R.U.C: ${emisor.ruc}`, fontSize: 8 },
        { text: emisor.dirMatriz, fontSize: 8 },
      ], width: "*", margin: [10, 0, 0, 0] },
      { width: 190, table: { widths: ["*"], body: [
        [{ text: titulo, bold: true, alignment: "center", fontSize: 11, color: "#444" }],
        [{ text: `No. ${numero}`, alignment: "center", bold: true }],
        [{ text: `FECHA: ${fecha}`, alignment: "center", fontSize: 8 }],
      ] }, layout: "lightHorizontalLines" },
    ],
    columnGap: 10,
    margin: [0, 0, 0, 10],
  };
}

export async function generarPdfA4(content: unknown[], pie: string): Promise<Uint8Array> {
  initPdf();
  const docDef: DocDef = {
    pageSize: "A4", pageMargins: [30, 30, 40, 40], defaultStyle: { font: "Roboto", fontSize: 8 },
    content,
    footer: { text: pie, alignment: "center", fontSize: 7, color: "#888", margin: [30, 10, 30, 0] },
  };
  const buf = await pdfmake.createPdf(docDef).getBuffer();
  return new Uint8Array(buf);
}
