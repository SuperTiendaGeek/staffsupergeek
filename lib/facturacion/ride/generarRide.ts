import "server-only";

// Genera el RIDE (Representación Impresa del Documento Electrónico) en PDF.
// Usa pdfmake (Node.js) + bwip-js para el código de barras Code 128.
// Layout conforme al Anexo A de la Ficha Técnica SRI 2.32.

// pdfmake Node.js entry exports a singleton with virtualfs (not in @types/pdfmake browser types)
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const pdfmake = require("pdfmake") as any;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const vfsRaw  = require("pdfmake/build/vfs_fonts") as { pdfMake?: { vfs: Record<string, string> } } & Record<string, string>;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bwipjs  = require("bwip-js") as { toBuffer: (opts: Record<string, unknown>) => Promise<Buffer> };

import fs   from "fs";
import path from "path";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DocDef = any;

import type { TotalImpuesto, Pago, CampoAdicional } from "../types/factura";

// ─── Cache del logo (leído una sola vez desde public/logo-factura.png) ────────

// undefined = no intentado aún; null = archivo no encontrado; string = dataURL
let _logoDataUrl: string | null | undefined = undefined;

function getLogoDataUrl(): string | null {
  if (_logoDataUrl !== undefined) return _logoDataUrl;
  try {
    const imgPath = path.join(process.cwd(), "public", "logo-factura.png");
    const buf     = fs.readFileSync(imgPath);
    _logoDataUrl  = `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    _logoDataUrl = null;
    console.warn("[generarRide] public/logo-factura.png no encontrado — cabecera sin logo");
  }
  return _logoDataUrl;
}

// ─── Inicialización única de pdfmake (fuentes Roboto embebidas) ───────────────

let _initialized = false;
function initPdfMake() {
  if (_initialized) return;
  _initialized = true;
  pdfmake.setUrlAccessPolicy(() => false);
  const vfsData: Record<string, string> = vfsRaw.pdfMake?.vfs ?? (vfsRaw as unknown as Record<string, string>);
  for (const [key, val] of Object.entries(vfsData)) {
    pdfmake.virtualfs.writeFileSync(key, Buffer.from(val, "base64"));
  }
  pdfmake.addFonts({
    Roboto: {
      normal:      "Roboto-Regular.ttf",
      bold:        "Roboto-Medium.ttf",
      italics:     "Roboto-Italic.ttf",
      bolditalics: "Roboto-MediumItalic.ttf",
    },
  });
}

// ─── Catálogo formas de pago SRI ─────────────────────────────────────────────

const FORMA_PAGO_LABEL: Record<string, string> = {
  "01": "EFECTIVO",
  "15": "COMPENSACIÓN DE DEUDAS",
  "16": "TARJETA DE DÉBITO",
  "17": "DINERO ELECTRÓNICO",
  "18": "TARJETA PREPAGO",
  "19": "TARJETA DE CRÉDITO",
  "20": "OTROS (SIST. FINANCIERO)",
  "21": "ENDOSO DE TÍTULOS",
};

function labelFormaPago(codigo: string): string {
  return FORMA_PAGO_LABEL[codigo] ?? `FORMA DE PAGO ${codigo}`;
}

// ─── Tipos de entrada ─────────────────────────────────────────────────────────

export type DetalleRide = {
  codigo?:       string;
  descripcion:   string;
  unidadMedida?: string;
  cantidad:      number;
  precioUnitario:number;
  descuento:     number;
  total:         number;
};

export type RideInput = {
  // Emisor
  ruc:                      string;
  razonSocial:              string;
  nombreComercial?:         string;
  dirMatriz:                string;
  dirEstablecimiento?:      string;
  obligadoContabilidad?:    string;   // "SI" | "NO" — from config
  // Comprobante
  claveAcceso:              string;
  ambiente:                 "1" | "2";
  numeroFactura:            string;   // "001-002-000000644"
  fechaEmision:             Date;
  // Autorización
  numeroAutorizacion:       string;
  fechaAutorizacion:        string;   // ISO 8601
  // Comprador
  tipoIdentificacion:       string;
  identificacion:           string;
  razonSocialComprador:     string;
  // Totales desglosados
  totalConImpuestos:        TotalImpuesto[];
  totalSinImpuestos:        number;   // totalSinImpuestos del XML (suma de bases)
  totalDescuento:           number;
  propina?:                 number;
  total:                    number;
  // Pagos
  pagos:                    Pago[];
  // Detalles
  detalles:                 DetalleRide[];
  // Adicional (parametrizable: se muestra solo si el llamador lo provee)
  infoAdicional?:           CampoAdicional[];

  // ── Fase 18: modo NOTA DE CRÉDITO ──────────────────────────────────────────
  // Los tres campos son OPCIONALES y su ausencia deja el RIDE EXACTAMENTE
  // como estaba (factura). Cuando `tipoDocumento` es "NOTA DE CRÉDITO":
  //   · el rótulo del recuadro superior cambia,
  //   · se añade el bloque "documento que modifica" + motivo,
  //   · se omite el bloque FORMA DE PAGO (una NC no tiene pagos: acredita).
  tipoDocumento?:           "FACTURA" | "NOTA DE CRÉDITO";
  /** Número de la factura modificada, "001-002-000000681". Solo en NC. */
  documentoModificado?:     { numero: string; fechaEmision: Date };
  /** Motivo de la nota de crédito. Solo en NC. */
  motivo?:                  string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mon = (n: number) => `$${n.toFixed(2)}`;
const dec = (n: number) => n.toFixed(2);

function fechaDDMMAAAA(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function isoToDisplay(iso: string): string {
  const d   = new Date(iso);
  const dd  = String(d.getDate()).padStart(2, "0");
  const mm  = String(d.getMonth() + 1).padStart(2, "0");
  const hh  = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const ss  = String(d.getSeconds()).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${min}:${ss}`;
}

async function barcodeDataUrl(claveAcceso: string): Promise<string> {
  const png = await bwipjs.toBuffer({
    bcid:            "code128",
    text:            claveAcceso,
    scale:           2,
    height:          12,
    includetext:     false,
    backgroundcolor: "FFFFFF",
  });
  return `data:image/png;base64,${png.toString("base64")}`;
}

// ─── Desglose de totales ──────────────────────────────────────────────────────

type FilaTotales = { label: string; valor: number };

function desglosaRTotales(input: RideInput): FilaTotales[] {
  const rows: FilaTotales[] = [];

  // IVA por tasa (codigo=2)
  for (const t of input.totalConImpuestos) {
    if (t.codigo !== "2") continue;
    const cp   = String(t.codigoPorcentaje);
    const base = t.baseImponible;
    if (base === 0) continue;
    const labels: Record<string, string> = {
      "4": "SUBTOTAL IVA 15%",
      "3": "SUBTOTAL IVA 12%",
      "5": "SUBTOTAL IVA 5%",
      "2": "SUBTOTAL IVA 0%",
      "0": "SUBTOTAL NO OBJETO DE IVA",
      "1": "SUBTOTAL EXENTO DE IVA",
      "6": "SUBTOTAL IVA 8%",
    };
    rows.push({ label: labels[cp] ?? `SUBTOTAL IVA (${cp})`, valor: base });
  }

  rows.push({ label: "SUBTOTAL SIN IMPUESTOS", valor: input.totalSinImpuestos });

  if (input.totalDescuento !== 0)
    rows.push({ label: "TOTAL DESCUENTO",  valor: input.totalDescuento });

  // ICE (codigo=3)
  for (const t of input.totalConImpuestos.filter((t) => t.codigo === "3")) {
    if (t.valor !== 0) rows.push({ label: "ICE", valor: t.valor });
  }

  // IVA por tasa — el valor del impuesto
  for (const t of input.totalConImpuestos) {
    if (t.codigo !== "2") continue;
    const cp = String(t.codigoPorcentaje);
    if (t.valor === 0) continue;
    const labels: Record<string, string> = {
      "4": "IVA 15%", "3": "IVA 12%", "5": "IVA 5%", "6": "IVA 8%",
    };
    const label = labels[cp];
    if (label) rows.push({ label, valor: t.valor });
  }

  if (input.propina && input.propina !== 0)
    rows.push({ label: "PROPINA", valor: input.propina });

  rows.push({ label: "VALOR TOTAL", valor: input.total });
  return rows;
}

// ─── Generación del PDF ───────────────────────────────────────────────────────

export async function generarRide(input: RideInput): Promise<Uint8Array> {
  initPdfMake();
  const barcode  = await barcodeDataUrl(input.claveAcceso);
  const logoUrl  = getLogoDataUrl();

  const ambienteLabel    = input.ambiente === "1" ? "PRUEBAS" : "PRODUCCIÓN";
  const obligadoLabel    = input.obligadoContabilidad ?? "NO";

  // Número de factura: "001-002-000000647" → partes
  const [estab = "", ptoEmi = "", sec = ""] = input.numeroFactura.split("-");

  // Detalles: 7 columnas (Cód, Descripción, Unid, Cant, P.Unit, Desc, Total)
  const DET_WIDTHS = ["auto", "*", "auto", "auto", "auto", "auto", "auto"];

  const filasTotales = desglosaRTotales(input);

  // Columna central del encabezado: logo (si existe) + datos del emisor
  // margin[1]=1 en el stack: pequeño respiro superior para que el primer renglón
  // no toque el borde del logo y quede visualmente alineado al tope.
  const emisorStack = {
    width: "*",
    margin: [0, 1, 0, 0],
    stack: [
      { text: input.razonSocial, style: "h2" },
      ...(input.nombreComercial
        ? [{ text: input.nombreComercial, bold: true }]
        : []),
      { text: `Dir. Matriz: ${input.dirMatriz}` },
      ...(input.dirEstablecimiento
        ? [{ text: `Dir. Estab.: ${input.dirEstablecimiento}` }]
        : []),
      { text: `RUC: ${input.ruc}` },
      { text: `OBLIGADO A LLEVAR CONTABILIDAD: ${obligadoLabel}` },
    ],
  };

  // Si hay logo, encabezado izquierdo = [logo 55px | datos emisor]; si no, solo datos.
  // columnGap: 13 da la separación logo↔texto (~13 pt ≈ 4.6 mm en A4).
  const leftColumn: DocDef = logoUrl
    ? {
        width: "*",
        columns: [
          { width: 55, image: logoUrl, height: 55 },
          emisorStack,
        ],
        columnGap: 13,
      }
    : emisorStack;

  const docDef: DocDef = {
    pageSize:     "A4",
    pageMargins:  [30, 30, 30, 30],
    defaultStyle: { font: "Roboto", fontSize: 8 },
    content: [

      // ── Encabezado ─────────────────────────────────────────────────────────
      {
        columns: [
          leftColumn,
          {
            width: 195,
            table: {
              widths: ["*"],
              body: [
                [{ text: "R.U.C: " + input.ruc, bold: true, alignment: "center" }],
                [{ text: input.tipoDocumento ?? "FACTURA", bold: true, alignment: "center", fontSize: 11 }],
                [{ text: `No. ${estab}-${ptoEmi}-${sec}`, alignment: "center", bold: true }],
                [{ text: `NÚMERO DE AUTORIZACIÓN\n${input.numeroAutorizacion}`, alignment: "center", fontSize: 7 }],
                [{ text: `FECHA Y HORA DE AUTORIZACIÓN:\n${isoToDisplay(input.fechaAutorizacion)}`, alignment: "center", fontSize: 7 }],
                [{ text: `AMBIENTE: ${ambienteLabel}`, alignment: "center" }],
                [{ text: "EMISIÓN: NORMAL", alignment: "center" }],
              ],
            },
            layout: "lightHorizontalLines",
          },
        ],
        columnGap: 10,
        margin:    [0, 0, 0, 8],
      },

      // ── Código de barras ───────────────────────────────────────────────────
      { image: barcode, width: 400, alignment: "center", margin: [0, 0, 0, 2] },
      { text: `CLAVE DE ACCESO: ${input.claveAcceso}`, fontSize: 7, alignment: "center", margin: [0, 0, 0, 8] },

      // ── Datos del comprador ────────────────────────────────────────────────
      {
        table: {
          widths: [100, "*", 80, 80],
          body: [
            [
              { text: "RAZÓN SOCIAL / NOMBRES:", bold: true },
              { text: input.razonSocialComprador },
              { text: "IDENTIFICACIÓN:", bold: true },
              { text: input.identificacion },
            ],
            [
              { text: "FECHA DE EMISIÓN:", bold: true },
              { text: fechaDDMMAAAA(input.fechaEmision) },
              { text: "" }, { text: "" },
            ],
          ],
        },
        layout: "lightHorizontalLines",
        margin: [0, 0, 0, 8],
      },

      // ── Documento que modifica + motivo (SOLO nota de crédito) ────────────
      ...(input.documentoModificado
        ? [
            {
              table: {
                widths: [100, "*", 80, 80],
                body: [
                  [
                    { text: "COMPROBANTE QUE MODIFICA:", bold: true },
                    { text: `FACTURA No. ${input.documentoModificado.numero}` },
                    { text: "FECHA EMISIÓN:", bold: true },
                    { text: fechaDDMMAAAA(input.documentoModificado.fechaEmision) },
                  ],
                  [
                    { text: "RAZÓN DE MODIFICACIÓN:", bold: true },
                    { text: input.motivo ?? "", colSpan: 3 },
                    { text: "" }, { text: "" },
                  ],
                ],
              },
              layout: "lightHorizontalLines",
              margin: [0, 0, 0, 8],
            },
          ]
        : []),

      // ── Tabla de detalles (7 columnas, incluye Descuento) ─────────────────
      {
        table: {
          headerRows: 1,
          widths:     DET_WIDTHS,
          body: [
            [
              { text: "Cód.",        bold: true, fillColor: "#e8e8e8" },
              { text: "Descripción", bold: true, fillColor: "#e8e8e8" },
              { text: "Unid.",       bold: true, fillColor: "#e8e8e8", alignment: "center" },
              { text: "Cant.",       bold: true, fillColor: "#e8e8e8", alignment: "right" },
              { text: "P. Unitario", bold: true, fillColor: "#e8e8e8", alignment: "right" },
              { text: "Descuento",   bold: true, fillColor: "#e8e8e8", alignment: "right" },
              { text: "Total",       bold: true, fillColor: "#e8e8e8", alignment: "right" },
            ],
            ...input.detalles.map((d) => [
              { text: d.codigo ?? "" },
              { text: d.descripcion },
              { text: d.unidadMedida ?? "", alignment: "center" },
              { text: dec(d.cantidad),       alignment: "right" },
              { text: mon(d.precioUnitario), alignment: "right" },
              { text: mon(d.descuento),      alignment: "right" },
              { text: mon(d.total),          alignment: "right" },
            ]),
          ],
        },
        layout: "lightHorizontalLines",
        margin: [0, 0, 0, 8],
      },

      // ── Totales + Forma de pago (lado a lado) ─────────────────────────────
      // En nota de crédito no hay formas de pago (el documento acredita, no
      // cobra): esa columna queda vacía y los totales conservan su posición.
      {
        columns: [
          // Forma de pago
          input.pagos.length === 0
            ? { width: "*", text: "" }
            : {
            width: "*",
            stack: [
              { text: "FORMA DE PAGO", bold: true, margin: [0, 0, 0, 2] },
              {
                table: {
                  widths: ["*", 70],
                  body: input.pagos.map((p) => [
                    { text: labelFormaPago(p.formaPago) },
                    { text: mon(p.total), alignment: "right" },
                  ]),
                },
                layout: "lightHorizontalLines",
              },
            ],
          },
          { width: 10, text: "" },
          // Totales desglosados
          {
            width: 220,
            table: {
              widths: ["*", 80],
              body: filasTotales.map((f, i) => {
                const isLast = i === filasTotales.length - 1;
                return [
                  { text: f.label,       bold: isLast, fillColor: isLast ? "#e8e8e8" : undefined },
                  { text: mon(f.valor),  bold: isLast, alignment: "right", fillColor: isLast ? "#e8e8e8" : undefined },
                ];
              }),
            },
            layout: "lightHorizontalLines",
          },
        ],
        margin: [0, 0, 0, 8],
      },

      // ── Información adicional (solo si el llamador la provee) ─────────────
      ...(input.infoAdicional?.length
        ? [
            { text: "INFORMACIÓN ADICIONAL", bold: true, margin: [0, 0, 0, 2] },
            {
              table: {
                widths: [130, "*"],
                body: input.infoAdicional.map((c) => [
                  { text: c.nombre, bold: true },
                  { text: c.valor },
                ]),
              },
              layout: "lightHorizontalLines",
            },
          ]
        : []),
    ],
    styles: {
      h2: { fontSize: 11, bold: true },
    },
  };

  const buf = await pdfmake.createPdf(docDef).getBuffer();
  return new Uint8Array(buf);
}
