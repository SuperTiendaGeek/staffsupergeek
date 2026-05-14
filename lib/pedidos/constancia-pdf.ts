import "server-only";

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { CotizacionDetalle } from "@/types/cotizaciones";
import type { PedidoAttachment, PedidoItem } from "@/types/pedidos";

type GenerateConstanciaPedidoPdfInput = {
  pedido: PedidoItem;
  cotizacion: CotizacionDetalle | null;
  emitidoEn: Date;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 44;
const LIME = rgb(0.66, 0.95, 0.22);
const DARK = rgb(0.1, 0.1, 0.12);
const TEXT = rgb(0.18, 0.18, 0.2);
const GRAY = rgb(0.42, 0.43, 0.46);
const LIGHT_GRAY = rgb(0.95, 0.96, 0.97);
const BORDER = rgb(0.82, 0.84, 0.86);
const WHITE = rgb(1, 1, 1);

type Fonts = { regular: PDFFont; bold: PDFFont };

export function safeText(value: unknown, fallback = "-") {
  const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  const clean = text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "");
  return clean || fallback;
}

export function formatCurrencyUSD(value: number | null | undefined) {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export function formatDateSpanish(value: Date | string | null | undefined) {
  if (!value) return "";
  const dateOnly = typeof value === "string" ? value.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  const date = dateOnly
    ? new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])))
    : value instanceof Date
      ? value
      : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-EC", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: dateOnly ? "UTC" : "America/Guayaquil",
  }).format(date);
}

function truncateText(text: string, maxLength: number) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = safeText(text).split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word;
  }

  if (line) lines.push(line);
  return lines;
}

function drawText(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, color = TEXT) {
  page.drawText(safeText(text), { x, y, font, size, color });
}

function drawWrappedText(page: PDFPage, text: string, x: number, y: number, width: number, font: PDFFont, size: number, color = TEXT, lineHeight = size + 4) {
  const lines = wrapText(text, font, size, width);
  lines.forEach((line, index) => drawText(page, line, x, y - index * lineHeight, font, size, color));
  return y - lines.length * lineHeight;
}

function drawDivider(page: PDFPage, y: number) {
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.7, color: BORDER });
}

function drawSectionTitle(page: PDFPage, title: string, y: number, font: PDFFont) {
  page.drawRectangle({ x: MARGIN, y: y - 8, width: PAGE_WIDTH - MARGIN * 2, height: 24, color: LIGHT_GRAY });
  page.drawRectangle({ x: MARGIN, y: y - 8, width: 5, height: 24, color: LIME });
  drawText(page, title, MARGIN + 14, y, font, 11, DARK);
}

function drawKeyValue(page: PDFPage, label: string, value: string, x: number, y: number, width: number, fonts: Fonts) {
  drawText(page, label, x, y, fonts.bold, 8, GRAY);
  drawWrappedText(page, value || "-", x, y - 14, width, fonts.regular, 10, TEXT, 13);
}

function getThumbnailUrl(attachment: PedidoAttachment) {
  const thumbnails = attachment.thumbnails;
  if (!thumbnails || typeof thumbnails !== "object") return attachment.url;
  const rows = thumbnails as Record<string, { url?: unknown } | undefined>;
  const url = rows.large?.url || rows.full?.url || rows.small?.url;
  return typeof url === "string" ? url : attachment.url;
}

async function fetchFirstProductImage(pdf: PDFDocument, fotos: PedidoAttachment[]) {
  const first = fotos[0];
  if (!first?.url) return null;

  try {
    const response = await fetch(getThumbnailUrl(first), { cache: "no-store" });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (contentType.includes("png")) return await pdf.embedPng(bytes);
    if (contentType.includes("jpeg") || contentType.includes("jpg")) return await pdf.embedJpg(bytes);
    try {
      return await pdf.embedJpg(bytes);
    } catch {
      return await pdf.embedPng(bytes);
    }
  } catch (error) {
    console.warn("No se pudo cargar la foto del pedido para la constancia:", error);
    return null;
  }
}

function drawImageBox(page: PDFPage, image: PDFImage | null, x: number, y: number, width: number, height: number, fonts: Fonts) {
  page.drawRectangle({ x, y, width, height, color: WHITE, borderColor: BORDER, borderWidth: 0.8 });
  if (!image) {
    drawText(page, "Sin imagen registrada", x + 26, y + height / 2 - 4, fonts.regular, 10, GRAY);
    return;
  }

  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  page.drawImage(image, {
    x: x + (width - drawWidth) / 2,
    y: y + (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  });
}

function pedidoModalidad(pedido: PedidoItem) {
  if (pedido.esProveedorExterior) {
    return {
      modalidad: "Importación del exterior",
      origen: pedido.proveedorOrigen === "CHN" ? "China" : "Estados Unidos",
      entrega:
        "Entrega estimada: aproximadamente de 2 a 3 semanas, sujeta a transporte, aduana y logística nacional.",
    };
  }
  if (pedido.esProveedorLocal) {
    return {
      modalidad: "Pedido local",
      origen: "Ecuador",
      entrega: "Entrega estimada: según disponibilidad y confirmación del proveedor local.",
    };
  }
  return {
    modalidad: "Bajo pedido",
    origen: "No especificado",
    entrega: "Entrega estimada: según disponibilidad y confirmación del pedido.",
  };
}

export async function generateConstanciaPedidoPdf({ pedido, cotizacion, emitidoEn }: GenerateConstanciaPedidoPdfInput) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const image = await fetchFirstProductImage(pdf, pedido.fotos);
  const code = safeText(pedido.codigo, pedido.identificador || pedido.id);
  const productName = safeText(pedido.item, "Producto bajo pedido");
  const price = pedido.precioVenta ?? cotizacion?.totalCotizado ?? 0;
  const paid = cotizacion?.totalAbonado ?? 0;
  const balance = Math.max(cotizacion?.saldoPendiente ?? price - paid, 0);
  const modalidad = pedidoModalidad(pedido);

  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 22, width: PAGE_WIDTH, height: 22, color: LIME });

  let y = PAGE_HEIGHT - MARGIN;
  drawText(page, "SUPER GEEK", MARGIN, y, bold, 18, DARK);
  drawText(page, "Constancia de Pedido", MARGIN, y - 28, bold, 24, DARK);
  drawText(page, `Código del pedido: ${code}`, MARGIN, y - 50, bold, 11, DARK);
  drawText(page, "WhatsApp: 0968808149", PAGE_WIDTH - 205, y - 5, regular, 9, GRAY);
  drawText(page, "Ubicación: Otavalo, Ecuador", PAGE_WIDTH - 205, y - 20, regular, 9, GRAY);
  drawText(page, `Fecha de emisión: ${formatDateSpanish(emitidoEn)}`, PAGE_WIDTH - 205, y - 35, regular, 9, GRAY);
  drawText(page, `Fecha del pedido: ${formatDateSpanish(pedido.fechaOfertado) || "No registrada"}`, PAGE_WIDTH - 205, y - 50, regular, 9, GRAY);
  drawDivider(page, y - 70);
  y -= 98;

  drawSectionTitle(page, "Datos del cliente", y, bold);
  y -= 34;
  drawKeyValue(page, "Nombre del cliente", pedido.clienteNombreSnapshot || cotizacion?.clienteNombre || "No registrado", MARGIN, y, 220, fonts);
  drawKeyValue(page, "Cédula", cotizacion?.clienteCedula || "No registrada", MARGIN + 250, y, 110, fonts);
  drawKeyValue(page, "Telefono", pedido.clienteTelefonoSnapshot || cotizacion?.clienteTelefono || "No registrado", MARGIN + 380, y, 120, fonts);
  y -= 62;

  drawSectionTitle(page, "Detalle del producto solicitado", y, bold);
  y -= 34;
  drawImageBox(page, image, MARGIN, y - 155, 160, 150, fonts);
  drawKeyValue(page, "Producto", productName, MARGIN + 184, y, 300, fonts);
  drawKeyValue(page, "Categoria", pedido.categoria || "No especificada", MARGIN + 184, y - 44, 140, fonts);
  drawKeyValue(page, "SKU interno", pedido.identificador || "No registrado", MARGIN + 344, y - 44, 140, fonts);
  drawKeyValue(page, "Modalidad del pedido", modalidad.modalidad, MARGIN + 184, y - 88, 160, fonts);
  drawKeyValue(page, "Origen", modalidad.origen, MARGIN + 364, y - 88, 120, fonts);
  y -= 190;

  drawSectionTitle(page, "Estado y entrega", y, bold);
  y -= 34;
  drawKeyValue(page, "Estado actual", pedido.estadosPedido || "Sin estado registrado", MARGIN, y, 180, fonts);
  drawWrappedText(page, modalidad.entrega, MARGIN + 220, y - 2, 290, regular, 10, TEXT, 14);
  y -= 70;

  drawSectionTitle(page, "Resumen económico", y, bold);
  y -= 34;
  const tableX = MARGIN;
  const tableWidth = PAGE_WIDTH - MARGIN * 2;
  page.drawRectangle({ x: tableX, y: y - 62, width: tableWidth, height: 80, color: WHITE, borderColor: BORDER, borderWidth: 0.8 });
  page.drawRectangle({ x: tableX, y: y - 2, width: tableWidth, height: 20, color: LIGHT_GRAY });
  drawText(page, "Concepto", tableX + 12, y + 4, bold, 9, GRAY);
  drawText(page, "Valor", tableX + tableWidth - 92, y + 4, bold, 9, GRAY);
  const rows = [
    ["Precio total del pedido", formatCurrencyUSD(price)],
    ["Total abonado", formatCurrencyUSD(paid)],
    ["Saldo pendiente", formatCurrencyUSD(balance)],
  ];
  rows.forEach(([label, value], index) => {
    const rowY = y - 20 - index * 20;
    drawText(page, label, tableX + 12, rowY, regular, 10, TEXT);
    drawText(page, value, tableX + tableWidth - 92, rowY, bold, 10, DARK);
  });
  y -= 102;

  const balanceMessage =
    balance <= 0
      ? "Pedido pagado en su totalidad."
      : `Saldo pendiente por pagar antes de la entrega: ${formatCurrencyUSD(balance)}`;
  page.drawRectangle({ x: MARGIN, y: y - 18, width: PAGE_WIDTH - MARGIN * 2, height: 34, color: LIGHT_GRAY, borderColor: BORDER, borderWidth: 0.5 });
  drawText(page, balanceMessage, MARGIN + 12, y - 2, bold, 10, DARK);
  y -= 58;

  drawSectionTitle(page, "Condiciones", y, bold);
  y -= 34;
  y = drawWrappedText(
    page,
    "Este documento confirma que el cliente ha solicitado el producto descrito en esta constancia. El tiempo de entrega puede variar por factores externos como disponibilidad, transporte, aduana o logística nacional. SUPER GEEK notificará al cliente cuando el pedido esté disponible para retiro en tienda. El saldo pendiente, si existe, deberá ser cancelado antes de la entrega final del producto.",
    MARGIN,
    y,
    PAGE_WIDTH - MARGIN * 2,
    regular,
    9.5,
    TEXT,
    14
  );

  y -= 32;
  drawDivider(page, y);
  drawWrappedText(
    page,
    "Documento emitido por SUPER GEEK como constancia del pedido solicitado por el cliente.",
    MARGIN,
    y - 22,
    PAGE_WIDTH - MARGIN * 2,
    bold,
    10,
    DARK,
    14
  );

  drawText(page, truncateText(`Constancia ${code}`, 60), MARGIN, 30, regular, 8, GRAY);

  return pdf.save();
}
