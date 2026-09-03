import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { ShippingV2PackingInvoiceData } from "@/types/shipping-v2";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 42;
const LIME = rgb(0.67, 0.86, 0.18);
const DARK = rgb(0.08, 0.09, 0.08);
const TEXT = rgb(0.12, 0.12, 0.11);
const MUTED = rgb(0.42, 0.43, 0.4);
const LINE = rgb(0.82, 0.84, 0.78);
const SOFT = rgb(0.96, 0.97, 0.93);
const FOOTER_LINE_Y = 50;
const CONTENT_BOTTOM = 76;

type Fonts = {
  regular: PDFFont;
  bold: PDFFont;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function display(value?: string | number | null) {
  const text = String(value ?? "").trim();
  return text || "-";
}

// Las StandardFonts de pdf-lib (Helvetica/HelveticaBold) usan la
// codificación WinAnsi (Windows-1252) — no representan emoji ni la mayoría
// de símbolos fuera de Latin-1. Un nombre o descripción de producto con un
// emoji (pasa más seguido de lo que uno esperaría — ver PK-20260902-45681)
// hacía que TODA la generación de la factura reventara con un 500, sin
// identificar siquiera qué ítem tenía el problema. Se reemplaza cualquier
// carácter no codificable por "?" en vez de dejar que pdf-lib lance.
function pdfText(value: string | number | null | undefined, font: PDFFont) {
  const text = display(value).replace(/[–—]/g, "-");
  let safe = "";
  for (const char of text) {
    try {
      font.widthOfTextAtSize(char, 1);
      safe += char;
    } catch {
      safe += "?";
    }
  }
  return safe;
}

function cleanMarkdownUrl(value: string) {
  return value
    .trim()
    .replace(/^mailto:/i, "")
    .replace(/[<>]/g, "");
}

function normalizeFooterLine(line: string) {
  return line.replace(/[ \t]{2,}/g, " ").trim();
}

function sanitizeInvoiceRichTextFooter(input?: string | null) {
  const text = String(input ?? "").trim();
  if (!text) return "";

  return text
    .replace(/\r\n?/g, "\n")
    .replace(/!?\[([^\]]*)\]\(([^)]+)\)/g, (_match, label: string, url: string) => {
      const cleanLabel = cleanMarkdownUrl(label);
      const cleanUrl = cleanMarkdownUrl(url);
      return cleanLabel || cleanUrl;
    })
    .replace(/\*\*([^*\n]+(?:\n[^*\n]+)*)\*\*/g, "$1")
    .replace(/__([^_\n]+(?:\n[^_\n]+)*)__/g, "$1")
    .replace(/(^|[\s([{])\*([^*\n]+?)\*(?=[\s)\]},.!?:;]|$)/g, "$1$2")
    .replace(/\[([^\]]+)\]/g, "$1")
    .replace(/\((mailto:[^)]+)\)/gi, (_match, value: string) => cleanMarkdownUrl(value))
    .replace(/mailto:([^\s)]+)/gi, "$1")
    .split("\n")
    .map(normalizeFooterLine)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function dateText(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "2-digit" }).format(date);
}

function drawText(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, color = TEXT) {
  page.drawText(pdfText(text, font), { x, y, size, font, color });
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = pdfText(text, font).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      return;
    }
    if (line) lines.push(line);
    line = word;
  });
  if (line) lines.push(line);
  return lines.length ? lines : ["-"];
}

function drawWrappedText(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, maxWidth: number, color = TEXT) {
  const lines = wrapText(text, font, size, maxWidth);
  lines.forEach((line, index) => drawText(page, line, x, y - index * (size + 4), font, size, color));
  return y - lines.length * (size + 4);
}

function formatCityStateZip(city?: string, state?: string, zip?: string) {
  const cleanCity = display(city) === "-" ? "" : display(city);
  const cleanState = display(state) === "-" ? "" : display(state);
  const cleanZip = display(zip) === "-" ? "" : display(zip);
  const stateZip = [cleanState, cleanZip].filter(Boolean).join(" ");
  return [cleanCity, stateZip].filter(Boolean).join(cleanCity && stateZip ? ", " : "");
}

async function fetchLogo(pdf: PDFDocument, logoUrl?: string): Promise<PDFImage | null> {
  if (!logoUrl) return null;
  try {
    const response = await fetch(logoUrl, { cache: "no-store" });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "";
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (contentType.includes("png") || logoUrl.toLowerCase().includes(".png")) return pdf.embedPng(bytes);
    if (contentType.includes("jpeg") || contentType.includes("jpg") || /\.(jpe?g)(\?|$)/i.test(logoUrl)) return pdf.embedJpg(bytes);
  } catch {
    return null;
  }
  return null;
}

function addPage(pdf: PDFDocument) {
  return pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
}

function ensureSpace(pdf: PDFDocument, page: PDFPage, y: number, needed: number) {
  if (y - needed >= CONTENT_BOTTOM) return { page, y };
  return { page: addPage(pdf), y: PAGE_HEIGHT - 76 };
}

function drawInstitutionalFooter(page: PDFPage, fonts: Fonts) {
  page.drawLine({ start: { x: MARGIN, y: FOOTER_LINE_Y }, end: { x: PAGE_WIDTH - MARGIN, y: FOOTER_LINE_Y }, color: LINE, thickness: 0.8 });
  drawText(page, "Generated by SUPER GEEK Shipping V2 for logistics and provider documentation purposes.", MARGIN, 32, fonts.regular, 8, MUTED);
  drawText(page, "Amounts shown in USD.", MARGIN, 20, fonts.regular, 8, MUTED);
}

function drawAllInstitutionalFooters(pdf: PDFDocument, fonts: Fonts) {
  pdf.getPages().forEach((footerPage) => drawInstitutionalFooter(footerPage, fonts));
}

function drawProviderInvoiceFooter(pdf: PDFDocument, page: PDFPage, y: number, text: string | undefined, fonts: Fonts) {
  const footerText = sanitizeInvoiceRichTextFooter(text);
  if (!footerText) return { page, y };

  y -= 18;
  const paragraphs = footerText.split(/\r?\n/);
  paragraphs.forEach((paragraph) => {
    const trimmed = paragraph.trim();
    if (!trimmed) {
      y -= 10;
      return;
    }
    wrapText(trimmed, fonts.regular, 9, PAGE_WIDTH - MARGIN * 2).forEach((line) => {
      const next = ensureSpace(pdf, page, y, 15);
      page = next.page;
      y = next.y;
      drawText(page, line, MARGIN, y, fonts.regular, 9, TEXT);
      y -= 13;
    });
  });
  return { page, y: y - 4 };
}

function drawHeader(page: PDFPage, data: ShippingV2PackingInvoiceData, fonts: Fonts, logo: PDFImage | null) {
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 108, width: PAGE_WIDTH, height: 108, color: DARK });
  if (logo) {
    const scaled = logo.scaleToFit(86, 54);
    page.drawImage(logo, { x: MARGIN, y: PAGE_HEIGHT - 82, width: scaled.width, height: scaled.height });
  }
  const providerX = logo ? 140 : MARGIN;
  drawText(page, data.provider.name, providerX, PAGE_HEIGHT - 45, fonts.bold, 16, rgb(1, 1, 1));
  drawText(page, data.provider.website || "", providerX, PAGE_HEIGHT - 63, fonts.regular, 9, rgb(0.86, 0.88, 0.82));
  drawText(page, data.provider.email || "", providerX, PAGE_HEIGHT - 78, fonts.regular, 9, rgb(0.86, 0.88, 0.82));
  drawText(page, "INVOICE", PAGE_WIDTH - 190, PAGE_HEIGHT - 48, fonts.bold, 28, LIME);
  drawText(page, data.invoice.invoiceNumber, PAGE_WIDTH - 190, PAGE_HEIGHT - 70, fonts.regular, 9, rgb(0.86, 0.88, 0.82));
}

function drawInfoBlocks(page: PDFPage, data: ShippingV2PackingInvoiceData, fonts: Fonts, top = PAGE_HEIGHT - 144) {
  drawText(page, "SHIP TO", MARGIN, top, fonts.bold, 11, DARK);
  let y = top - 18;
  [
    data.recipient.name,
    data.recipient.company,
    data.recipient.address1,
    data.recipient.address2,
    formatCityStateZip(data.recipient.city, data.recipient.state, data.recipient.zip),
    data.recipient.country,
    data.recipient.phone ? `Phone: ${data.recipient.phone}` : "",
  ].filter(Boolean).forEach((line) => {
    drawText(page, String(line), MARGIN, y, fonts.regular, 9.5, TEXT);
    y -= 14;
  });

  const x = 345;
  drawText(page, "DOCUMENT", x, top, fonts.bold, 11, DARK);
  const rows = [
    ["Date", dateText(data.invoice.generatedAt)],
    ["Order Reference", display(data.packing.ordenReferencia)],
    ["Packing ID", data.packing.packingId],
    ["Tracking Number", display(data.packing.tracking)],
    ["Ship Date", dateText(data.packing.fechaEnvio)],
  ];
  y = top - 18;
  rows.forEach(([label, value]) => {
    drawText(page, `${label}:`, x, y, fonts.bold, 8.8, MUTED);
    y = drawWrappedText(page, value, x + 96, y, fonts.regular, 8.8, 130, TEXT) - 2;
  });
}

function drawTableHeader(page: PDFPage, y: number, fonts: Fonts) {
  page.drawRectangle({ x: MARGIN, y: y - 6, width: PAGE_WIDTH - MARGIN * 2, height: 24, color: SOFT });
  const headers = [
    ["Item #", MARGIN + 8],
    ["Supplier SKU", MARGIN + 62],
    ["Description", MARGIN + 170],
    ["Qty", MARGIN + 382],
    ["Unit Price", MARGIN + 424],
    ["Line Total", MARGIN + 492],
  ] as const;
  headers.forEach(([label, x]) => drawText(page, label, x, y + 2, fonts.bold, 8.5, DARK));
}

function drawItemRow(page: PDFPage, item: ShippingV2PackingInvoiceData["items"][number], index: number, y: number, fonts: Fonts) {
  const descLines = wrapText(item.description, fonts.regular, 8.5, 198);
  const rowHeight = Math.max(28, descLines.length * 12 + 12);
  page.drawLine({ start: { x: MARGIN, y: y - rowHeight + 4 }, end: { x: PAGE_WIDTH - MARGIN, y: y - rowHeight + 4 }, color: LINE, thickness: 0.5 });
  drawText(page, String(index + 1), MARGIN + 8, y - 11, fonts.regular, 8.5);
  drawText(page, display(item.skuProveedor), MARGIN + 62, y - 11, fonts.regular, 8.5);
  descLines.forEach((line, lineIndex) => drawText(page, line, MARGIN + 170, y - 11 - lineIndex * 12, fonts.regular, 8.5));
  drawText(page, String(item.quantity), MARGIN + 390, y - 11, fonts.regular, 8.5);
  drawText(page, money(item.unitPrice), MARGIN + 424, y - 11, fonts.regular, 8.5);
  drawText(page, money(item.lineTotal), MARGIN + 492, y - 11, fonts.regular, 8.5);
  return y - rowHeight;
}

async function generateStandardInvoicePdf(data: ShippingV2PackingInvoiceData) {
  const pdf = await PDFDocument.create();
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const logo = await fetchLogo(pdf, data.provider.logoUrl);
  let page = addPage(pdf);
  drawHeader(page, data, fonts, logo);
  drawInfoBlocks(page, data, fonts);

  let y = PAGE_HEIGHT - 322;
  drawTableHeader(page, y, fonts);
  y -= 18;

  data.items.forEach((item, index) => {
    if (y < CONTENT_BOTTOM + 34) {
      page = addPage(pdf);
      y = PAGE_HEIGHT - 76;
      drawTableHeader(page, y, fonts);
      y -= 18;
    }
    y = drawItemRow(page, item, index, y, fonts);
  });

  y -= 16;
  ({ page, y } = ensureSpace(pdf, page, y, 74));
  const totalsX = PAGE_WIDTH - 220;
  page.drawRectangle({ x: totalsX, y: y - 44, width: 178, height: 58, color: SOFT });
  drawText(page, "Subtotal", totalsX + 14, y - 6, fonts.regular, 10, TEXT);
  drawText(page, money(data.totals.subtotal), totalsX + 104, y - 6, fonts.regular, 10, TEXT);
  drawText(page, "Total USD", totalsX + 14, y - 28, fonts.bold, 12, DARK);
  drawText(page, money(data.totals.total), totalsX + 104, y - 28, fonts.bold, 12, DARK);

  y -= 62;
  ({ page, y } = drawProviderInvoiceFooter(pdf, page, y, data.provider.invoiceFooter, fonts));
  drawAllInstitutionalFooters(pdf, fonts);
  return pdf.save();
}

// ─── Plantilla "Estilo_Roberto_LV" ───────────────────────────────────────────
//
// Reproduce el diseño de factura que este proveedor específico venía usando
// antes de este sistema (PDF de referencia aportado por el usuario), no el
// diseño estándar de arriba. Elegible por proveedor vía "Diseño de factura"
// en Shipping Proveedores — hoy solo Roberto-USA la usa, pero cualquier otro
// proveedor podría elegirla si le queda bien; por eso vive aparte del
// estándar en vez de mezclarse con él.
export const INVOICE_TEMPLATE_ESTILO_ROBERTO_LV = "Estilo_Roberto_LV";

const RL_NAVY = rgb(0.11, 0.17, 0.29);
const RL_GREEN = rgb(0.18, 0.6, 0.3);
const RL_BAND = rgb(0.95, 0.96, 0.96);
const RL_ZEBRA = rgb(0.97, 0.97, 0.96);
const RL_BORDER = rgb(0.84, 0.85, 0.82);
const RL_MUTED = rgb(0.4, 0.42, 0.4);
const RL_WHITE = rgb(1, 1, 1);

function drawRightAligned(page: PDFPage, text: string, rightX: number, y: number, font: PDFFont, size: number, color = TEXT) {
  const safeText = pdfText(text, font);
  const width = font.widthOfTextAtSize(safeText, size);
  drawText(page, safeText, rightX - width, y, font, size, color);
}

function drawEstiloRobertoLvHeader(page: PDFPage, data: ShippingV2PackingInvoiceData, fonts: Fonts, logo: PDFImage | null) {
  const nameX = logo ? MARGIN + 78 : MARGIN;
  if (logo) {
    const scaled = logo.scaleToFit(64, 64);
    page.drawImage(logo, { x: MARGIN, y: PAGE_HEIGHT - 36 - scaled.height, width: scaled.width, height: scaled.height });
  }
  drawText(page, data.provider.name, nameX, PAGE_HEIGHT - 46, fonts.bold, 19, RL_NAVY);
  if (data.provider.tagline) drawText(page, data.provider.tagline, nameX, PAGE_HEIGHT - 64, fonts.regular, 9.5, RL_MUTED);

  drawRightAligned(page, "INVOICE", PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 48, fonts.bold, 24, RL_NAVY);
  drawRightAligned(page, data.invoice.invoiceNumber, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 66, fonts.regular, 9, RL_MUTED);

  page.drawLine({ start: { x: 0, y: PAGE_HEIGHT - 96 }, end: { x: PAGE_WIDTH, y: PAGE_HEIGHT - 96 }, color: RL_NAVY, thickness: 1.2 });
}

// Franja de datos de empresa: nombre + "Datos de empresa (factura)" (texto
// libre, una línea por dato — dirección, teléfono, número de registro, lo
// que aplique) a la izquierda, email a la derecha. Altura dinámica según
// cuántas líneas tenga el proveedor, para no asumir un formato fijo que no
// le sirva a otro proveedor que use esta misma plantilla en el futuro.
// Devuelve la Y donde puede empezar el siguiente bloque.
function drawEstiloRobertoLvCompanyBand(page: PDFPage, data: ShippingV2PackingInvoiceData, fonts: Fonts): number {
  const infoLines = (data.provider.companyInfo || "").split("\n").map((line) => line.trim()).filter(Boolean);
  const leftRows = 1 + infoLines.length;
  const rightRows = data.provider.email ? 2 : 0;
  const bandHeight = Math.max(leftRows, rightRows, 1) * 13 + 20;
  const top = PAGE_HEIGHT - 96;
  const bottom = top - bandHeight;

  page.drawRectangle({ x: 0, y: bottom, width: PAGE_WIDTH, height: bandHeight, color: RL_BAND });
  page.drawRectangle({ x: 0, y: bottom, width: 5, height: bandHeight, color: RL_GREEN });

  let y = top - 16;
  drawText(page, data.provider.name, MARGIN, y, fonts.bold, 10, RL_NAVY);
  infoLines.forEach((line) => {
    y -= 13;
    drawText(page, line, MARGIN, y, fonts.regular, 9, TEXT);
  });

  if (data.provider.email) {
    const emailX = 345;
    let ey = top - 16;
    drawText(page, "Email", emailX, ey, fonts.bold, 9, RL_NAVY);
    ey -= 13;
    drawText(page, data.provider.email, emailX, ey, fonts.regular, 9, TEXT);
  }

  return bottom - 24;
}

function drawEstiloRobertoLvTableHeader(page: PDFPage, y: number, fonts: Fonts) {
  page.drawRectangle({ x: MARGIN, y: y - 6, width: PAGE_WIDTH - MARGIN * 2, height: 24, color: RL_NAVY });
  // "Unit Price"/"Line Total" corridos un poco a la izquierda respecto a la
  // columna de datos (misma columna, drawItemRow no se toca): a 8.5pt bold
  // el rótulo completo no entra en el ancho de esa columna si arranca en la
  // misma x que los montos — se veía texto blanco cortado contra el fondo
  // blanco de la página, fuera de la banda azul marino.
  const headers = [
    ["Item #", MARGIN + 8],
    ["Supplier SKU", MARGIN + 62],
    ["Description", MARGIN + 170],
    ["Qty", MARGIN + 382],
    ["Unit Price", MARGIN + 404],
    ["Line Total", MARGIN + 470],
  ] as const;
  headers.forEach(([label, x]) => drawText(page, label, x, y + 2, fonts.bold, 8.5, RL_WHITE));
}

// Reusa drawItemRow (mismas columnas/posiciones que la plantilla estándar)
// pero con banda zebra detrás — hay que calcular el alto de fila antes de
// llamarlo, porque el fondo se dibuja debajo del texto.
function drawEstiloRobertoLvItemRow(page: PDFPage, item: ShippingV2PackingInvoiceData["items"][number], index: number, y: number, fonts: Fonts) {
  if (index % 2 === 1) {
    const descLines = wrapText(item.description, fonts.regular, 8.5, 198);
    const rowHeight = Math.max(28, descLines.length * 12 + 12);
    page.drawRectangle({ x: MARGIN, y: y - rowHeight + 4, width: PAGE_WIDTH - MARGIN * 2, height: rowHeight - 4, color: RL_ZEBRA });
  }
  return drawItemRow(page, item, index, y, fonts);
}

function drawEstiloRobertoLvPageNumbers(pdf: PDFDocument, companyName: string, fonts: Fonts) {
  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    drawText(page, companyName, MARGIN, 10, fonts.regular, 8, RL_MUTED);
    drawRightAligned(page, `Page ${index + 1} of ${pages.length}`, PAGE_WIDTH - MARGIN, 10, fonts.regular, 8, RL_MUTED);
  });
}

async function generateEstiloRobertoLvInvoicePdf(data: ShippingV2PackingInvoiceData) {
  const pdf = await PDFDocument.create();
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const logo = await fetchLogo(pdf, data.provider.logoUrl);
  let page = addPage(pdf);
  drawEstiloRobertoLvHeader(page, data, fonts, logo);
  const infoTop = drawEstiloRobertoLvCompanyBand(page, data, fonts);
  drawInfoBlocks(page, data, fonts, infoTop);

  // Mismo espacio reservado que la plantilla estándar entre el "top" de los
  // bloques SHIP TO/DOCUMENT INFO y el encabezado de la tabla (ver
  // drawInfoBlocks / PAGE_HEIGHT - 322 en generateStandardInvoicePdf).
  let y = infoTop - 178;
  drawEstiloRobertoLvTableHeader(page, y, fonts);
  y -= 18;

  data.items.forEach((item, index) => {
    if (y < CONTENT_BOTTOM + 34) {
      page = addPage(pdf);
      y = PAGE_HEIGHT - 76;
      drawEstiloRobertoLvTableHeader(page, y, fonts);
      y -= 18;
    }
    y = drawEstiloRobertoLvItemRow(page, item, index, y, fonts);
  });

  y -= 16;
  ({ page, y } = ensureSpace(pdf, page, y, 74));
  const totalsX = PAGE_WIDTH - 220;
  page.drawLine({ start: { x: totalsX, y: y - 26 }, end: { x: PAGE_WIDTH - MARGIN, y: y - 26 }, color: RL_BORDER, thickness: 0.8 });
  drawText(page, "Subtotal", totalsX + 14, y - 6, fonts.regular, 10, TEXT);
  drawText(page, money(data.totals.subtotal), totalsX + 104, y - 6, fonts.regular, 10, TEXT);
  drawText(page, "Total USD", totalsX + 14, y - 42, fonts.bold, 13, RL_NAVY);
  drawText(page, money(data.totals.total), totalsX + 104, y - 42, fonts.bold, 13, RL_NAVY);

  y -= 58;
  ({ page, y } = drawProviderInvoiceFooter(pdf, page, y, data.provider.invoiceFooter, fonts));
  drawAllInstitutionalFooters(pdf, fonts);
  drawEstiloRobertoLvPageNumbers(pdf, data.provider.name, fonts);
  return pdf.save();
}

// ─── Despachador ──────────────────────────────────────────────────────────
//
// Único punto de entrada usado por la ruta API — decide la plantilla según
// "Diseño de factura" del proveedor. Cualquier valor no reconocido (vacío,
// "Estándar", o un valor viejo/typo) cae al diseño estándar por seguridad:
// nunca debe romperse la generación de factura por un dato mal cargado.
export async function generateShippingV2PackingInvoicePdf(data: ShippingV2PackingInvoiceData) {
  if (data.provider.template?.trim() === INVOICE_TEMPLATE_ESTILO_ROBERTO_LV) {
    return generateEstiloRobertoLvInvoicePdf(data);
  }
  return generateStandardInvoicePdf(data);
}
