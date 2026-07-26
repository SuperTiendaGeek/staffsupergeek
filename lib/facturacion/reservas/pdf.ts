import "server-only";

// PDF comprobante de RESERVA (apartado) — documento interno no tributario. Es la
// copia del cliente (descargable y enviable por WhatsApp en reservas remotas).
// Muestra el ítem, los abonos, el saldo pendiente y la fecha límite.

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const pdfmake = require("pdfmake") as any;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const vfsRaw  = require("pdfmake/build/vfs_fonts") as { pdfMake?: { vfs: Record<string, string> } } & Record<string, string>;

import fs   from "fs";
import path from "path";
import type { AbonoReserva, ReservaCliente } from "./types";

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

export type ReservaPdfInput = {
  numero: string; fecha: Date; fechaLimite: string; plazoDias: number;
  ruc: string; razonSocial: string; nombreComercial?: string; dirMatriz: string;
  cliente: ReservaCliente; descripcionItem: string; precio: number;
  abonos: AbonoReserva[]; totalAbonado: number;
};

const mon = (n: number) => `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
function ddmmaaaa(iso: string): string {
  const s = iso.slice(0, 10); const [y, m, d] = s.split("-");
  return d && m && y ? `${d}/${m}/${y}` : s;
}
function ddmmaaaaFecha(d: Date): string { const p = (n: number) => String(n).padStart(2, "0"); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`; }

export async function generarReservaPdf(input: ReservaPdfInput): Promise<Uint8Array> {
  initPdf();
  const logo = getLogo();
  const saldo = Math.max(0, Math.round((input.precio - input.totalAbonado) * 100) / 100);
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
            [{ text: "COMPROBANTE DE RESERVA", bold: true, alignment: "center", fontSize: 11, color: "#444" }],
            [{ text: `No. ${input.numero}`, alignment: "center", bold: true }],
            [{ text: `FECHA: ${ddmmaaaaFecha(input.fecha)}`, alignment: "center", fontSize: 8 }],
          ] }, layout: "lightHorizontalLines" },
        ], columnGap: 10, margin: [0, 0, 0, 10],
      },
      { table: { widths: [70, "*", 70, 120], body: [
        [{ text: "CLIENTE:", bold: true }, { text: input.cliente.razonSocial }, { text: "IDENTIF.:", bold: true }, { text: input.cliente.identificacion ?? "—" }],
        [{ text: "TELÉFONO:", bold: true }, { text: input.cliente.telefono ?? "—" }, { text: "CORREO:", bold: true }, { text: input.cliente.correo ?? "—" }],
      ] }, layout: "lightHorizontalLines", margin: [0, 0, 0, 10] },
      { table: { widths: ["*", 90], body: [
        [{ text: "ÍTEM RESERVADO", bold: true, fillColor: "#e8e8e8" }, { text: "PRECIO", bold: true, fillColor: "#e8e8e8", alignment: "right" }],
        [{ text: input.descripcionItem }, { text: mon(input.precio), alignment: "right" }],
      ] }, layout: "lightHorizontalLines", margin: [0, 0, 0, 10] },
      { text: "ABONOS", bold: true, margin: [0, 0, 0, 4] },
      { table: { headerRows: 1, widths: ["*", 150, 90], body: [
        [
          { text: "Fecha", bold: true, fillColor: "#e8e8e8" },
          { text: "Forma de pago", bold: true, fillColor: "#e8e8e8" },
          { text: "Monto", bold: true, fillColor: "#e8e8e8", alignment: "right" },
        ],
        ...input.abonos.map((a) => [
          { text: ddmmaaaaFecha(new Date(a.fecha)) },
          { text: FORMA_PAGO_LABEL[a.formaPago] ?? a.formaPago },
          { text: mon(a.monto), alignment: "right" },
        ]),
      ] }, layout: "lightHorizontalLines", margin: [0, 0, 0, 10] },
      {
        columns: [
          { width: "*", stack: [
            { text: `RESERVA VÁLIDA HASTA: ${ddmmaaaa(input.fechaLimite)}`, bold: true, color: "#993C1D" },
            { text: `Plazo: ${input.plazoDias} días desde la reserva.`, fontSize: 8, color: "#666", margin: [0, 2, 0, 0] },
          ] },
          { width: 10, text: "" },
          { width: 200, table: { widths: ["*", 80], body: [
            [{ text: "Precio", bold: true }, { text: mon(input.precio), alignment: "right" }],
            [{ text: "Total abonado", bold: true }, { text: mon(input.totalAbonado), alignment: "right" }],
            [{ text: "SALDO PENDIENTE", bold: true, fillColor: "#e8e8e8" }, { text: mon(saldo), bold: true, alignment: "right", fillColor: "#e8e8e8" }],
          ] }, layout: "lightHorizontalLines" },
        ],
      },
    ],
    footer: {
      text: "DOCUMENTO NO TRIBUTARIO — Reserva/apartado de mercadería. Si no se completa el pago dentro del plazo, el ítem vuelve a estar disponible y lo abonado queda como saldo a favor del cliente. No es un comprobante de venta autorizado por el SRI.",
      alignment: "center", fontSize: 7, color: "#888", margin: [30, 10, 30, 0],
    },
  };

  const buf = await pdfmake.createPdf(docDef).getBuffer();
  return new Uint8Array(buf);
}
