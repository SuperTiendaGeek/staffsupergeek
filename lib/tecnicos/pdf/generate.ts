import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from "pdf-lib";

// ─── Page geometry ────────────────────────────────────────────────────────────
const W  = 595.28;   // A4 width
const H  = 841.89;   // A4 height
const M  = 40;       // margin
const CW = W - M * 2; // content width ≈ 515
const FOOTER_H = 32;
const SAFE_Y   = FOOTER_H + 24; // never draw below this

// ─── Design tokens (0–1 RGB) ──────────────────────────────────────────────────
const INK       = rgb(0.039, 0.039, 0.035); // #0A0A09
const LIME      = rgb(0.843, 1.000, 0.310); // #D7FF4F — brand lime
const LIME_BRD  = rgb(0.682, 0.871, 0.133); // #AEDE22 — medium lime
const KEY_INK   = rgb(0.165, 0.400, 0.000); // #2A6600 — dark green for keys
const DIM       = rgb(0.420, 0.420, 0.404); // #6B6B67 — secondary text
const RULE      = rgb(0.878, 0.878, 0.859); // #E0E0DB — dividers
const GHOST     = rgb(0.953, 0.953, 0.945); // #F3F3F1 — card fill
const LIME_TINT = rgb(0.918, 0.996, 0.820); // #EAFed1 — credential box fill
const WARM      = rgb(1.000, 0.973, 0.906); // #FFF8E8 — security note fill
const WARM_BRD  = rgb(0.933, 0.808, 0.353); // #EDCE5A — security note border
const WARM_TXT  = rgb(0.467, 0.353, 0.008); // #775A02 — security note text
const FTR_BG    = rgb(0.082, 0.082, 0.071); // #151512 — footer background

// ─── Types ────────────────────────────────────────────────────────────────────
export interface PDFProductoData {
  softwareProducto: string;
  marcaProducto: string | null;
  tipoProducto: string | null;
  logoProductoUrl: string | null;
  portalActivacionCatalogo: string | null;
  instruccionesPdfCatalogo: string | null;
  notasParaClienteCatalogo: string | null;
  duracion: string | null;
  fechaUsoVenta: string | null;
  expira: string | null;
  clienteNombre: string | null;
  ordenIdVisible: string | null;
  claveActivacion: string | null;
  usuarioCorreo: string | null;
  contrasena: string | null;
  generadoPor: string;
  fechaGeneracion: string;
}

// ─── Text utilities ───────────────────────────────────────────────────────────

function sanitizePdfText(text: string): string {
  return text
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/[""„‟]/g, '"')
    .replace(/[''‚‛′‵]/g, "'")
    .replace(/[—–‒‑‐]/g, "-")
    .replace(/…/g, "...")
    .replace(/[   ]/g, " ")
    .replace(/[•‣⁃∙●◦]/g, "-")
    .replace(/[✓✔✅]/g, "(ok)")
    .replace(/[✗✘❌✖]/g, "(x)")
    .replace(/[^\x00-\xFF]/g, "?")
    .replace(/ {2,}/g, " ")
    .trim();
}

function wrapLine(font: PDFFont, text: string, size: number, maxW: number): string[] {
  const safe = sanitizePdfText(text);
  if (!safe) return [];
  const words = safe.split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function splitAndWrap(font: PDFFont, text: string, size: number, maxW: number): string[] {
  return text
    .replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    .split("\n").map((l) => l.trim()).filter(Boolean)
    .flatMap((l) => wrapLine(font, l, size, maxW));
}

function parseInstrucciones(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    .split("\n").map((l) => l.trim()).filter(Boolean)
    .map((l) => l.replace(/^\d+[\.\)]\s*/, ""));
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return sanitizePdfText(dateStr);
    return d.toLocaleDateString("es-CR", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return sanitizePdfText(dateStr);
  }
}

function tw(font: PDFFont, text: string, size: number): number {
  return font.widthOfTextAtSize(sanitizePdfText(text), size);
}

function dt(page: PDFPage, text: string, x: number, y: number, size: number, font: PDFFont, color: ReturnType<typeof rgb>) {
  const s = sanitizePdfText(text);
  if (s) page.drawText(s, { x, y, size, font, color });
}

// ─── Section label ─────────────────────────────────────────────────────────
function drawSectionLabel(page: PDFPage, bold: PDFFont, label: string, y: number): number {
  const s = sanitizePdfText(label).toUpperCase();
  page.drawText(s, { x: M, y: y - 8, size: 6, font: bold, color: DIM });
  const labelEnd = M + tw(bold, s, 6) + 6;
  page.drawLine({ start: { x: labelEnd, y: y - 5 }, end: { x: W - M, y: y - 5 }, thickness: 0.4, color: RULE });
  return 14;
}

// ─── Main generator ───────────────────────────────────────────────────────────

export async function generateProductoDigitalPDF(data: PDFProductoData): Promise<Uint8Array> {
  const doc  = await PDFDocument.create();
  const page = doc.addPage([W, H]) as PDFPage;

  const bold     = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular  = await doc.embedFont(StandardFonts.Helvetica);
  const mono     = await doc.embedFont(StandardFonts.Courier);
  const monoBold = await doc.embedFont(StandardFonts.CourierBold);

  let y = H;

  // ── FOOTER — drawn first so content never overwrites it ─────────────────
  page.drawRectangle({ x: 0, y: 0, width: W, height: FOOTER_H, color: FTR_BG });
  page.drawLine({ start: { x: 0, y: FOOTER_H }, end: { x: W, y: FOOTER_H }, thickness: 1, color: LIME });
  dt(page, `Generado por: ${data.generadoPor}`, M, FOOTER_H - 13, 6.5, regular, DIM);
  dt(page, sanitizePdfText(data.fechaGeneracion), M, FOOTER_H - 23, 6, regular, DIM);
  const confStr = "Documento confidencial - SUPER GEEK";
  dt(page, confStr, W - M - tw(regular, confStr, 6.5), FOOTER_H - 18, 6.5, regular, DIM);

  // ── TOP LIME STRIP ───────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: H - 5, width: W, height: 5, color: LIME });
  y = H - 5;

  // ── HEADER ───────────────────────────────────────────────────────────────
  y -= 16;
  page.drawText("SUPER GEEK", { x: M, y: y - 16, size: 16, font: bold, color: INK });
  page.drawText("Rompiendo la brecha digital", { x: M, y: y - 28, size: 7, font: regular, color: DIM });

  const docType = "Documento de respaldo digital";
  dt(page, docType, W - M - tw(regular, docType, 7), y - 16, 7, regular, DIM);
  const dateLabel = sanitizePdfText(data.fechaGeneracion);
  dt(page, dateLabel, W - M - tw(regular, dateLabel, 6.5), y - 27, 6.5, regular, DIM);
  y -= 38;

  // Thin divider
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: RULE });
  y -= 16;

  // ── HERO: Logo + Product name + Badges ───────────────────────────────────
  const LOGO_SZ = 52;
  let logoEmbedded = false;

  if (data.logoProductoUrl) {
    try {
      const res = await fetch(data.logoProductoUrl);
      if (res.ok) {
        const bytes = await res.arrayBuffer();
        const ct    = res.headers.get("content-type") ?? "";
        const isPng = ct.includes("png") || data.logoProductoUrl.toLowerCase().includes(".png");
        const img   = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const scale = Math.min(LOGO_SZ / img.width, LOGO_SZ / img.height);
        const iw = img.width * scale;
        const ih = img.height * scale;
        page.drawImage(img, { x: W - M - iw, y: y - ih, width: iw, height: ih });
        logoEmbedded = true;
      }
    } catch { /* logo optional */ }
  }

  const nameMaxW = logoEmbedded ? CW - LOGO_SZ - 14 : CW;
  const nameLines = wrapLine(bold, data.softwareProducto, 20, nameMaxW);
  let nameY = y;
  for (const line of nameLines) {
    page.drawText(line, { x: M, y: nameY - 20, size: 20, font: bold, color: INK });
    nameY -= 24;
  }
  nameY -= 4;

  // Badges
  const badges = [data.marcaProducto, data.tipoProducto].filter(Boolean) as string[];
  let bx = M;
  for (const badge of badges) {
    const btext = sanitizePdfText(badge);
    const bw = tw(bold, btext, 7.5) + 12;
    const bh = 15;
    page.drawRectangle({ x: bx, y: nameY - bh, width: bw, height: bh, color: LIME_TINT });
    page.drawText(btext, { x: bx + 6, y: nameY - 10.5, size: 7.5, font: bold, color: KEY_INK });
    bx += bw + 6;
  }
  const badgesEnd = nameY - (badges.length > 0 ? 19 : 0);

  y = Math.min(badgesEnd, logoEmbedded ? y - LOGO_SZ : badgesEnd) - 14;

  // ── LIME ACCENT RULE ─────────────────────────────────────────────────────
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.5, color: LIME });
  y -= 16;

  // ── INFO GRID (2-column cards) ────────────────────────────────────────────
  type Card = { label: string; value: string };
  const cards: Card[] = [];

  if (data.duracion) {
    const isPerpetua = /perpetua/i.test(data.duracion);
    cards.push({ label: "Duracion", value: isPerpetua ? "Perpetua (no expira)" : sanitizePdfText(data.duracion) });
  }
  if (data.fechaUsoVenta) {
    cards.push({ label: "Fecha de activacion", value: fmtDate(data.fechaUsoVenta) });
  }
  if (data.expira && !/perpetua/i.test(data.duracion ?? "")) {
    cards.push({ label: "Expira", value: fmtDate(data.expira) });
  }
  if (data.clienteNombre) {
    cards.push({ label: "Cliente", value: sanitizePdfText(data.clienteNombre) });
  }
  if (data.ordenIdVisible) {
    cards.push({ label: "Orden de servicio", value: `#${sanitizePdfText(data.ordenIdVisible)}` });
  }

  if (cards.length > 0) {
    const COLS   = 2;
    const GAP    = 8;
    const CARD_W = (CW - GAP) / COLS;
    const CARD_H = 38;
    const rows   = Math.ceil(cards.length / COLS);

    for (let row = 0; row < rows; row++) {
      if (y - CARD_H < SAFE_Y) break;
      for (let col = 0; col < COLS; col++) {
        const idx = row * COLS + col;
        if (idx >= cards.length) break;
        const { label, value } = cards[idx];
        const cx = M + col * (CARD_W + GAP);
        const cy = y - CARD_H;
        // Last item: full width if odd
        const isLastSolo = idx === cards.length - 1 && cards.length % 2 !== 0;
        const cw = isLastSolo ? CW : CARD_W;

        page.drawRectangle({ x: cx, y: cy, width: cw, height: CARD_H, color: GHOST });
        const lbl = sanitizePdfText(label).toUpperCase();
        page.drawText(lbl, { x: cx + 8, y: cy + CARD_H - 12, size: 6, font: bold, color: DIM });
        const valLines = wrapLine(bold, value, 9.5, cw - 16);
        let vy = cy + CARD_H - 24;
        for (const vl of valLines.slice(0, 2)) {
          page.drawText(vl, { x: cx + 8, y: vy, size: 9.5, font: bold, color: INK });
          vy -= 12;
        }
      }
      y -= CARD_H + GAP;
    }
    y += GAP; // trim trailing gap
    y -= 14;
  }

  // ── PORTAL DE ACTIVACION ──────────────────────────────────────────────────
  if (data.portalActivacionCatalogo?.trim() && y > SAFE_Y + 30) {
    y -= drawSectionLabel(page, bold, "Portal de activacion", y);
    const pLines = wrapLine(regular, data.portalActivacionCatalogo, 9, CW);
    for (const line of pLines) {
      if (y < SAFE_Y + 14) break;
      page.drawText(line, { x: M, y: y - 12, size: 9, font: regular, color: KEY_INK });
      y -= 14;
    }
    y -= 10;
  }

  // ── THIN DIVIDER ─────────────────────────────────────────────────────────
  if (y > SAFE_Y + 20) {
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: RULE });
    y -= 16;
  }

  // ── CREDENTIAL BOX ────────────────────────────────────────────────────────
  const hasCred = Boolean(data.claveActivacion || data.usuarioCorreo || data.contrasena);
  if (hasCred && y > SAFE_Y + 60) {
    const ACCENT  = 5;
    const PAD_L   = 14;
    const PAD_R   = 12;
    const PAD_TB  = 14;
    const innerW  = CW - ACCENT - PAD_L - PAD_R;

    // Pre-compute box height
    let boxH = PAD_TB * 2;

    // "CREDENCIALES DE ACCESO" label inside box: 8 + 8 gap
    boxH += 8 + 8;

    let keyLines: string[] = [];
    if (data.claveActivacion) {
      keyLines = wrapLine(monoBold, data.claveActivacion, 12, innerW);
      boxH += keyLines.length * 16 + 6; // lines + gap
    }

    const otherCreds: { label: string; value: string; mono: boolean }[] = [];
    if (data.usuarioCorreo) otherCreds.push({ label: "Usuario / Correo", value: data.usuarioCorreo, mono: false });
    if (data.contrasena)    otherCreds.push({ label: "Contrasena", value: data.contrasena, mono: true });

    if (data.claveActivacion && otherCreds.length > 0) boxH += 12; // divider
    for (const c of otherCreds) {
      const f = c.mono ? mono : regular;
      boxH += 8 + wrapLine(f, c.value, 9, innerW).length * 12 + 8;
    }

    if (y - boxH > SAFE_Y) {
      y -= drawSectionLabel(page, bold, "Credenciales de acceso", y);
      y -= 6;

      // Box
      page.drawRectangle({ x: M, y: y - boxH, width: CW, height: boxH, color: LIME_TINT, borderColor: LIME_BRD, borderWidth: 0.75 });
      // Left accent
      page.drawRectangle({ x: M, y: y - boxH, width: ACCENT, height: boxH, color: LIME });

      const bx = M + ACCENT + PAD_L;
      let by = y - PAD_TB;

      // Inner header
      page.drawText("CREDENCIALES DE ACCESO", { x: bx, y: by - 8, size: 6.5, font: bold, color: DIM });
      by -= 16;

      // Key
      if (keyLines.length > 0) {
        page.drawText("CLAVE DE ACTIVACION", { x: bx, y: by - 8, size: 6, font: bold, color: DIM });
        by -= 14;
        for (const kl of keyLines) {
          page.drawText(kl, { x: bx, y: by - 13, size: 12, font: monoBold, color: KEY_INK });
          by -= 16;
        }
        by -= 2;
        if (otherCreds.length > 0) {
          page.drawLine({
            start: { x: bx, y: by - 5 }, end: { x: W - M - PAD_R, y: by - 5 },
            thickness: 0.4, color: LIME_BRD,
          });
          by -= 12;
        }
      }

      // Other creds
      for (const { label, value, mono: useMono } of otherCreds) {
        const fnt = useMono ? mono : regular;
        page.drawText(sanitizePdfText(label).toUpperCase(), { x: bx, y: by - 8, size: 6, font: bold, color: DIM });
        by -= 14;
        const vLines = wrapLine(fnt, value, 9, innerW);
        for (const vl of vLines) {
          page.drawText(vl, { x: bx, y: by - 9, size: 9, font: fnt, color: INK });
          by -= 12;
        }
        by -= 6;
      }

      y -= boxH + 18;
    }
  }

  // ── INSTRUCCIONES ────────────────────────────────────────────────────────
  const instrucciones = parseInstrucciones(data.instruccionesPdfCatalogo);
  if (instrucciones.length > 0 && y > SAFE_Y + 40) {
    y -= drawSectionLabel(page, bold, "Instrucciones de activacion", y);
    y -= 4;

    for (let i = 0; i < instrucciones.length; i++) {
      if (y < SAFE_Y + 20) break;
      const prefix  = `${i + 1}.`;
      const prefW   = tw(bold, prefix, 8.5) + 6;
      const sLines  = wrapLine(regular, instrucciones[i], 8.5, CW - prefW - 2);

      for (let li = 0; li < sLines.length; li++) {
        if (y < SAFE_Y + 14) break;
        if (li === 0) page.drawText(prefix, { x: M, y: y - 10, size: 8.5, font: bold, color: KEY_INK });
        page.drawText(sLines[li], { x: M + prefW, y: y - 10, size: 8.5, font: regular, color: INK });
        y -= 13;
      }
      y -= 3;
    }
    y -= 10;
  }

  // ── NOTAS PARA CLIENTE ────────────────────────────────────────────────────
  if (data.notasParaClienteCatalogo?.trim() && y > SAFE_Y + 40) {
    y -= drawSectionLabel(page, bold, "Notas importantes", y);
    y -= 6;

    const noteLines = splitAndWrap(regular, data.notasParaClienteCatalogo, 8.5, CW - 16);
    const noteH = noteLines.length * 13 + 18;

    if (y - noteH > SAFE_Y) {
      page.drawRectangle({ x: M, y: y - noteH, width: CW, height: noteH, color: GHOST });
      let ny = y - 9;
      for (const ln of noteLines) {
        if (ny - 13 < SAFE_Y) break;
        page.drawText(ln, { x: M + 8, y: ny, size: 8.5, font: regular, color: INK });
        ny -= 13;
      }
      y -= noteH + 10;
    }
  }

  // ── SECURITY NOTE ─────────────────────────────────────────────────────────
  if (y > SAFE_Y + 30) {
    const secText =
      "Conserve este documento en un lugar seguro. Las credenciales son personales e " +
      "intransferibles. No comparta esta informacion por medios inseguros. " +
      "Si cree que fueron comprometidas, contacte a SUPER GEEK de inmediato.";
    const secLines = wrapLine(regular, secText, 7.5, CW - 18);
    const secH = secLines.length * 11 + 16;

    if (y - secH > SAFE_Y) {
      y -= 6;
      page.drawRectangle({ x: M, y: y - secH, width: CW, height: secH, color: WARM, borderColor: WARM_BRD, borderWidth: 0.75 });
      let sy = y - 8;
      for (const ln of secLines) {
        if (sy - 11 < SAFE_Y) break;
        page.drawText(ln, { x: M + 9, y: sy, size: 7.5, font: regular, color: WARM_TXT });
        sy -= 11;
      }
    }
  }

  return doc.save();
}
