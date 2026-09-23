import "server-only";

// PDF del PRESUPUESTO de una orden — mismo estilo que la proforma (pdfmake,
// Roboto, logo de factura). Documento informativo, NO tributario.
// Nunca muestra proveedor, URL ni costo interno. Al pie lleva el enlace de
// aprobación (y su QR) para que el cliente responda en línea.

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const pdfmake = require("pdfmake") as any;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const vfsRaw  = require("pdfmake/build/vfs_fonts") as { pdfMake?: { vfs: Record<string, string> } } & Record<string, string>;

import fs   from "fs";
import path from "path";

import { ordenarPorGrupo, type LineaRetirada, type TotalesPrioridad, type VistaLinea, type Situacion } from "./enlace-reglas";

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

export type PresupuestoPdfInput = {
  emisor: { nombreComercial: string; razonSocial: string; ruc: string; dirMatriz: string };
  orden: {
    idVisible: string;
    fechaIngreso: string;
    cliente: string;
    /** Ya enmascarada (ver enmascararCedula). */
    cedula: string;
    equipo: string;
    problema: string;
    recomendaciones: string;
  };
  lineas: VistaLinea[];
  retiradas: LineaRetirada[];
  totalAprobado: number;
  totalPendiente: number;
  porPrioridad?: TotalesPrioridad;
  fecha: Date;
  enlace: { url: string; vence: string } | null;
};

export const ESTADO_PDF: Record<Situacion, string> = {
  nueva: "Por aprobar",
  modificada: "Cambió · por aprobar",
  repropuesta: "Por aprobar",
  aprobada: "Aprobado",
  en_proceso: "Aprobado",
  no_aprobada: "No aprobado",
  anulada: "Anulado",
};

export function enmascararCedula(cedula: string): string {
  const d = (cedula ?? "").replace(/\D/g, "");
  return d.length >= 4 ? `${"*".repeat(Math.max(0, d.length - 4))}${d.slice(-4)}` : "";
}

const mon = (n: number) => `$${n.toFixed(2)}`;
const FMT_EC = new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "2-digit", year: "numeric" });
function ddmmaaaa(d: Date): string {
  return FMT_EC.format(d);
}
/** Fecha corta en hora de Ecuador. Una fecha sin hora ("2026-09-10") se muestra tal cual. */
export function fechaCorta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const t = Date.parse(iso ?? "");
  return Number.isFinite(t) ? FMT_EC.format(new Date(t)) : iso || "";
}

export async function generarPresupuestoPdf(input: PresupuestoPdfInput): Promise<Uint8Array> {
  initPdf();
  const logo = getLogo();
  const e = input.emisor;
  const comercial = e.nombreComercial?.trim() || e.razonSocial;
  const mostrarRazon = e.razonSocial.trim() && e.razonSocial.trim() !== comercial.trim();
  const emisor = [
    { text: comercial, bold: true, fontSize: 11 },
    ...(mostrarRazon ? [{ text: e.razonSocial, fontSize: 8 }] : []),
    ...(e.ruc ? [{ text: `R.U.C: ${e.ruc}`, fontSize: 8 }] : []),
    ...(e.dirMatriz ? [{ text: e.dirMatriz, fontSize: 8 }] : []),
  ];

  const o = input.orden;
  const datoOrden = (etq: string, val: string) => (val ? [{ text: etq, bold: true }, { text: val }] : null);
  const filasOrden = [
    datoOrden("CLIENTE:", o.cliente),
    datoOrden("IDENTIF.:", o.cedula),
    datoOrden("EQUIPO:", o.equipo),
    datoOrden("PROBLEMA REPORTADO:", o.problema),
  ].filter((f): f is Array<{ text: string; bold?: boolean }> => !!f);

  const visibles = ordenarPorGrupo(input.lineas);
  // Letra por grupo de alternativas (A, B, …) en orden de aparición.
  const letraGrupo = new Map<string, string>();
  for (const l of visibles) if (l.grupo && !letraGrupo.has(l.grupo)) letraGrupo.set(l.grupo, String.fromCharCode(65 + letraGrupo.size));
  const COLOR_PRIORIDAD: Record<string, string> = { Necesaria: "#b3261e", Recomendada: "#8a6d00", Opcional: "#1a5fb4" };
  const filas = visibles.map((l) => {
    const detalle: Array<Record<string, unknown>> = [{ text: l.descripcion }];
    const sub: Array<Record<string, unknown>> = [
      { text: l.prioridad.toUpperCase(), bold: true, color: COLOR_PRIORIDAD[l.prioridad] ?? "#777" },
      { text: ` · ${l.tipo}` },
    ];
    if (l.grupo) sub.push({ text: ` · Alternativa ${letraGrupo.get(l.grupo)} (elige una)`, bold: true });
    if (l.bajoPedido) sub.push({ text: ` · Bajo pedido${l.tiempoEstimado ? `, llega en ${l.tiempoEstimado}` : ""}` });
    detalle.push({ text: sub, fontSize: 7, color: "#777" });
    if (l.notaCliente) detalle.push({ text: l.notaCliente, fontSize: 7, color: "#444", italics: true, margin: [0, 1, 0, 0] });
    if (l.anterior) detalle.push({ text: `Antes: ${l.anterior.cantidad} × ${mon(l.anterior.precioUnitario)}${l.anterior.descripcion !== l.descripcion ? ` (${l.anterior.descripcion})` : ""}`, fontSize: 7, color: "#a15c00", italics: true });
    const tachada = l.situacion === "no_aprobada" || l.situacion === "anulada";
    return [
      { stack: detalle },
      { text: String(l.cantidad), alignment: "right" },
      { text: mon(l.precioUnitario), alignment: "right" },
      { text: mon(l.subtotal), alignment: "right", decoration: tachada ? "lineThrough" : undefined, color: tachada ? "#999" : undefined },
      { text: ESTADO_PDF[l.situacion], alignment: "center", bold: l.pendiente, color: l.pendiente ? "#a15c00" : tachada ? "#999" : "#2E5C00" },
    ];
  });

  const totales: Array<[string, number, boolean]> = [];
  const pp = input.porPrioridad;
  if (pp) {
    const d = (x: "Necesaria" | "Recomendada" | "Opcional") => (pp.desde.includes(x) ? " (desde)" : "");
    if (pp.Necesaria > 0) totales.push([`Necesario${d("Necesaria")}`, pp.Necesaria, false]);
    if (pp.Recomendada > 0) totales.push([`Recomendado${d("Recomendada")}`, pp.Recomendada, false]);
    if (pp.Opcional > 0) totales.push([`Opcional${d("Opcional")}`, pp.Opcional, false]);
  }
  totales.push(["TOTAL APROBADO", input.totalAprobado, false]);
  if (input.totalPendiente > 0) {
    totales.push(["PENDIENTE DE TU RESPUESTA", input.totalPendiente, false]);
    totales.push([pp?.desde.length ? "TOTAL SI APRUEBAS TODO (desde)" : "TOTAL SI APRUEBAS TODO", Math.round((input.totalAprobado + input.totalPendiente) * 100) / 100, true]);
  } else {
    totales[totales.length - 1][2] = true;
  }

  const content: DocDef[] = [
    {
      columns: [
        logo ? { image: logo, width: 90 } : { text: "", width: 90 },
        { stack: emisor, width: "*", margin: [10, 0, 0, 0] },
        {
          width: 190,
          table: { widths: ["*"], body: [
            [{ text: "PRESUPUESTO", bold: true, alignment: "center", fontSize: 13, color: "#444" }],
            [{ text: `Orden ${o.idVisible}`, alignment: "center", bold: true }],
            [{ text: `FECHA: ${ddmmaaaa(input.fecha)}`, alignment: "center", fontSize: 8 }],
            ...(o.fechaIngreso ? [[{ text: `INGRESO: ${fechaCorta(o.fechaIngreso)}`, alignment: "center", fontSize: 8 }]] : []),
          ] },
          layout: "lightHorizontalLines",
        },
      ],
      columnGap: 10, margin: [0, 0, 0, 10],
    },
    ...(filasOrden.length ? [{ table: { widths: [95, "*"], body: filasOrden }, layout: "lightHorizontalLines", margin: [0, 0, 0, 8] }] : []),
    ...(o.recomendaciones ? [{
      table: { widths: ["*"], body: [[{ stack: [{ text: "RECOMENDACIONES DEL TÉCNICO", bold: true, fontSize: 8, margin: [0, 0, 0, 2] }, { text: o.recomendaciones }] , fillColor: "#f4f4f1" }]] },
      layout: "noBorders", margin: [0, 0, 0, 10],
    }] : []),
    {
      table: {
        headerRows: 1,
        widths: ["*", 30, 55, 55, 80],
        body: [
          [
            { text: "Descripción", bold: true, fillColor: "#e8e8e8" },
            { text: "Cant.", bold: true, fillColor: "#e8e8e8", alignment: "right" },
            { text: "P.Unit.", bold: true, fillColor: "#e8e8e8", alignment: "right" },
            { text: "Total", bold: true, fillColor: "#e8e8e8", alignment: "right" },
            { text: "Estado", bold: true, fillColor: "#e8e8e8", alignment: "center" },
          ],
          ...(filas.length ? filas : [[{ text: "Sin líneas en el presupuesto.", colSpan: 5, italics: true, color: "#777" }, {}, {}, {}, {}]]),
        ],
      },
      layout: "lightHorizontalLines", margin: [0, 0, 0, 8],
    },
    ...(input.retiradas.length ? [{
      text: `Retirado del presupuesto por el taller: ${input.retiradas.map((r) => `${r.descripcion} (${mon(r.subtotal)})`).join("; ")}.`,
      fontSize: 7, italics: true, color: "#777", margin: [0, 0, 0, 8],
    }] : []),
    {
      columns: [
        { width: "*", stack: [
          { text: "Precios en dólares, con IVA incluido. Los repuestos bajo pedido se solicitan al proveedor cuando apruebas.", fontSize: 7, italics: true, color: "#666" },
          { text: "NECESARIA: sin esto no se puede reparar el equipo. RECOMENDADA: el técnico lo aconseja. OPCIONAL: mejora sugerida. En las alternativas se elige solo una.", fontSize: 7, color: "#666", margin: [0, 4, 0, 0] },
        ] },
        { width: 10, text: "" },
        {
          width: 230,
          table: { widths: ["*", 80], body: totales.map(([t, v, fuerte]) => [
            { text: t, bold: fuerte, fillColor: fuerte ? "#e8e8e8" : undefined },
            { text: mon(v), bold: fuerte, alignment: "right", fillColor: fuerte ? "#e8e8e8" : undefined },
          ]) },
          layout: "lightHorizontalLines",
        },
      ],
      margin: [0, 0, 0, 14],
    },
  ];

  if (input.enlace) {
    content.push({
      table: { widths: [90, "*"], body: [[
        { qr: input.enlace.url, fit: 85, margin: [2, 2, 2, 2] },
        { stack: [
          { text: "Revisa y aprueba tu presupuesto en línea", bold: true, fontSize: 10, margin: [0, 4, 0, 4] },
          { text: "Escanea el código o abre este enlace desde tu celular. Puedes aprobar o rechazar cada línea; si el taller cambia algo, el mismo enlace te lo mostrará.", fontSize: 8, color: "#555", margin: [0, 0, 0, 4] },
          { text: input.enlace.url, fontSize: 8, color: "#1a5fb4", link: input.enlace.url },
          ...(input.enlace.vence ? [{ text: `Enlace válido hasta el ${fechaCorta(input.enlace.vence)}.`, fontSize: 7, color: "#777", margin: [0, 3, 0, 0] }] : []),
        ] },
      ]] },
      layout: { hLineColor: () => "#cfcfc8", vLineColor: () => "#cfcfc8" },
    });
  }

  const docDef: DocDef = {
    pageSize: "A4",
    pageMargins: [30, 30, 40, 40],
    defaultStyle: { font: "Roboto", fontSize: 8 },
    content,
    footer: {
      text: "DOCUMENTO NO TRIBUTARIO — Presupuesto informativo de la orden de reparación. No es un comprobante de venta autorizado por el SRI.",
      alignment: "center", fontSize: 7, color: "#888", margin: [30, 10, 30, 0],
    },
  };

  const buf = await pdfmake.createPdf(docDef).getBuffer();
  return new Uint8Array(buf);
}
