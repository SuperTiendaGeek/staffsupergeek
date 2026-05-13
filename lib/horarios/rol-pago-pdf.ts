import "server-only";

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { HorarioPago, HorarioPeriodoPagoDetalle, HorarioRegistro } from "@/types/horarios";

type GenerateRolPagoPdfInput = {
  periodo: HorarioPeriodoPagoDetalle;
  generadoPor: string;
  generadoEn: Date;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 44;
const LIME = rgb(0.66, 0.95, 0.22);
const DARK = rgb(0.1, 0.1, 0.12);
const GRAY = rgb(0.35, 0.36, 0.4);
const LIGHT_GRAY = rgb(0.94, 0.95, 0.96);
const BORDER = rgb(0.82, 0.84, 0.86);

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value);
}

function formatDate(value?: string) {
  if (!value) {
    return "--";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function formatDateTime(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;

  return new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatTime(value?: string) {
  if (!value) {
    return "--:--";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Guayaquil",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function truncateText(text: string, maxLength: number) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function drawText(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, color = DARK) {
  page.drawText(text, { x, y, font, size, color });
}

function drawKeyValue(page: PDFPage, label: string, value: string, x: number, y: number, fonts: { regular: PDFFont; bold: PDFFont }) {
  drawText(page, label, x, y, fonts.bold, 9, GRAY);
  drawText(page, truncateText(value || "--", 34), x, y - 14, fonts.regular, 10, DARK);
}

function addPage(pdf: PDFDocument) {
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 18, width: PAGE_WIDTH, height: 18, color: LIME });
  return page;
}

function ensureSpace(pdf: PDFDocument, page: PDFPage, y: number, needed: number) {
  if (y - needed > MARGIN) {
    return { page, y };
  }

  return { page: addPage(pdf), y: PAGE_HEIGHT - MARGIN };
}

function drawSectionTitle(page: PDFPage, title: string, y: number, font: PDFFont) {
  page.drawRectangle({ x: MARGIN, y: y - 5, width: PAGE_WIDTH - MARGIN * 2, height: 18, color: LIGHT_GRAY });
  drawText(page, title, MARGIN + 8, y, font, 10, DARK);
}

function drawDivider(page: PDFPage, y: number) {
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: BORDER });
}

function drawJornadasTable(pdf: PDFDocument, page: PDFPage, y: number, registros: HorarioRegistro[], fonts: { regular: PDFFont; bold: PDFFont }) {
  let state = ensureSpace(pdf, page, y, 70);
  page = state.page;
  y = state.y;
  drawSectionTitle(page, "Jornadas vinculadas", y, fonts.bold);
  y -= 28;

  const headers = ["Fecha", "Entrada", "Salida", "Horas", "Total", "Estado"];
  const xs = [MARGIN, 112, 178, 250, 315, 390];
  headers.forEach((header, index) => drawText(page, header, xs[index], y, fonts.bold, 8, GRAY));
  y -= 12;

  registros.forEach((registro) => {
    state = ensureSpace(pdf, page, y, 18);
    page = state.page;
    y = state.y;
    const values = [
      formatDate(registro.fecha),
      formatTime(registro.entrada),
      formatTime(registro.salidaFinal),
      `${registro.horasTrabajadas.toFixed(2)} h`,
      formatMoney(registro.totalEstimadoDia),
      registro.estadoDia
    ];
    values.forEach((value, index) => drawText(page, truncateText(value, index === 5 ? 20 : 14), xs[index], y, fonts.regular, 8, DARK));
    y -= 14;
  });

  return { page, y: y - 8 };
}

function drawPagosTable(pdf: PDFDocument, page: PDFPage, y: number, pagos: HorarioPago[], fonts: { regular: PDFFont; bold: PDFFont }) {
  let state = ensureSpace(pdf, page, y, 70);
  page = state.page;
  y = state.y;
  drawSectionTitle(page, "Pagos registrados", y, fonts.bold);
  y -= 28;

  const headers = ["Fecha", "Monto", "Metodo", "Transaccion", "Banco", "Estado"];
  const xs = [MARGIN, 110, 175, 275, 395, 475];
  headers.forEach((header, index) => drawText(page, header, xs[index], y, fonts.bold, 8, GRAY));
  y -= 12;

  pagos.forEach((pago) => {
    state = ensureSpace(pdf, page, y, 18);
    page = state.page;
    y = state.y;
    const values = [
      formatDate(pago.fechaPago),
      formatMoney(pago.montoPagado),
      pago.metodoPago || "--",
      pago.numeroTransaccion || "--",
      pago.bancoCuentaOrigen || "--",
      pago.estadoPago || "Registrado"
    ];
    values.forEach((value, index) => drawText(page, truncateText(value, index >= 2 ? 18 : 14), xs[index], y, fonts.regular, 8, DARK));
    y -= 14;
  });

  return { page, y: y - 8 };
}

export async function generateRolPagoPdf(input: GenerateRolPagoPdfInput) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };
  let page = addPage(pdf);
  let y = PAGE_HEIGHT - MARGIN;
  const pagosActivos = input.periodo.pagos.filter((pago) => pago.estadoPago === "Registrado");
  const empleadoNombre = input.periodo.empleado || input.periodo.correo || "Empleado";
  const empleadoCedula = input.periodo.empleadoCedula || "No registrada";
  const empleadoRol = input.periodo.empleadoRol || "No registrado";
  const empleadoCorreo = input.periodo.correo || "No registrado";

  drawText(page, "SUPER GEEK", MARGIN, y, bold, 18, DARK);
  drawText(page, "Rol de Pago", MARGIN, y - 24, bold, 24, DARK);
  drawText(page, `Generado: ${formatDateTime(input.generadoEn)}`, PAGE_WIDTH - 210, y, regular, 9, GRAY);
  drawDivider(page, y - 42);
  y -= 64;

  drawSectionTitle(page, "Datos del empleado", y, bold);
  y -= 34;
  drawKeyValue(page, "Empleado", empleadoNombre, MARGIN, y, fonts);
  drawKeyValue(page, "Cedula", empleadoCedula, MARGIN + 260, y, fonts);
  y -= 42;
  drawKeyValue(page, "Cargo/Rol", empleadoRol, MARGIN, y, fonts);
  drawKeyValue(page, "Correo", empleadoCorreo, MARGIN + 260, y, fonts);
  y -= 48;

  drawSectionTitle(page, "Datos del periodo", y, bold);
  y -= 34;
  drawKeyValue(page, "Periodo", `${formatDate(input.periodo.fechaInicio)} - ${formatDate(input.periodo.fechaFin)}`, MARGIN, y, fonts);
  drawKeyValue(page, "Estado del periodo", input.periodo.estadoPeriodo, MARGIN + 260, y, fonts);
  y -= 48;

  drawSectionTitle(page, "Resumen", y, bold);
  y -= 34;
  drawKeyValue(page, "Total horas", `${input.periodo.totalHoras.toFixed(2)} h`, MARGIN, y, fonts);
  drawKeyValue(page, "Total ganado", formatMoney(input.periodo.totalGanado), MARGIN + 130, y, fonts);
  drawKeyValue(page, "Total ajustes", formatMoney(input.periodo.totalAjustes), MARGIN + 260, y, fonts);
  drawKeyValue(page, "Total neto", formatMoney(input.periodo.totalNeto), MARGIN + 390, y, fonts);
  y -= 26;
  drawKeyValue(page, "Total pagado", formatMoney(input.periodo.totalPagado), MARGIN, y, fonts);
  drawKeyValue(page, "Saldo pendiente neto", formatMoney(input.periodo.saldoPendienteNeto), MARGIN + 130, y, fonts);
  y -= 52;

  const jornadas = drawJornadasTable(pdf, page, y, input.periodo.registros, fonts);
  page = jornadas.page;
  y = jornadas.y;
  const pagos = drawPagosTable(pdf, page, y, pagosActivos, fonts);
  page = pagos.page;
  y = pagos.y;

  const footer = ensureSpace(pdf, page, y, 48);
  page = footer.page;
  y = footer.y;
  drawSectionTitle(page, "Generacion", y, bold);
  y -= 30;
  drawText(page, `Generado por: ${input.generadoPor}`, MARGIN, y, regular, 9, DARK);

  return pdf.save();
}
