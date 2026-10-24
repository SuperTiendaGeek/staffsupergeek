// Correo al proveedor con botón RESPONDER (auditoría Shipping V2, punto 8c ·
// 11-oct-2026). Puro y testeable: arma el correo y maneja el enlace temporal.
//
// Reglas del dueño:
//  · Se envía solo a proveedores CON PORTAL (correo registrado y permiso
//    "Responder novedades"), al registrar una novedad con responsable
//    Proveedor y cada vez que le contestamos.
//  · Sale desde staff@supertiendageek.com y las respuestas por correo llegan
//    al mismo staff@.
//  · El botón RESPONDER abre una página que muestra SOLO esa novedad, sin
//    iniciar sesión. El enlace dura 7 días y deja de servir al responder.
//
// Seguridad: el enlace lleva un código aleatorio de 32 bytes. En Airtable solo
// se guarda su HUELLA (SHA-256), nunca el código: quien lea la base no puede
// armar el enlace. Cada correo nuevo reemplaza el enlace anterior.

import { createHash, randomBytes } from "node:crypto";

export const DIAS_ENLACE_PROVEEDOR = 7;
export const PERMISO_RESPONDER_NOVEDADES = "Responder novedades";
export const RUTA_PUBLICA_NOVEDAD = "/novedad-proveedor";

/** 32 bytes en base64url = 43 caracteres. */
export const TOKEN_ENLACE_REGEX = /^[A-Za-z0-9_-]{43}$/;

export function generarTokenEnlace(): string {
  return randomBytes(32).toString("base64url");
}

export function huellaToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function venceEnlace(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() + DIAS_ENLACE_PROVEEDOR * 86_400_000).toISOString();
}

export function urlEnlaceNovedad(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}${RUTA_PUBLICA_NOVEDAD}/${token}`;
}

export type EstadoEnlace = { ok: true } | { ok: false; motivo: "formato" | "no-coincide" | "vencido" };

/** ¿Este código abre esta novedad ahora? */
export function evaluarEnlace(input: { token: string; huellaGuardada?: string | null; vence?: string | null; ahora?: Date }): EstadoEnlace {
  if (!TOKEN_ENLACE_REGEX.test(input.token)) return { ok: false, motivo: "formato" };
  const guardada = String(input.huellaGuardada || "").trim();
  if (!guardada || guardada !== huellaToken(input.token)) return { ok: false, motivo: "no-coincide" };
  const vence = Date.parse(String(input.vence || ""));
  if (!Number.isFinite(vence) || vence <= (input.ahora ?? new Date()).getTime()) return { ok: false, motivo: "vencido" };
  return { ok: true };
}

/**
 * Solo se escribe a proveedores con portal: correo válido y permiso para
 * responder. Punto 11 (24-oct): un proveedor desactivado no recibe correos.
 */
export function proveedorRecibeCorreo(p: { email?: string | null; permisosPortal?: string[] | null; estado?: string | null }): boolean {
  if (String(p.estado || "").trim().toLowerCase() === "inactivo") return false;
  const email = String(p.email || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  return (p.permisosPortal ?? []).some((permiso) => permiso.trim().toLowerCase() === PERMISO_RESPONDER_NOVEDADES.toLowerCase());
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fechaLegible(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  return new Intl.DateTimeFormat("es-EC", { dateStyle: "long", timeStyle: "short", timeZone: "America/Guayaquil" }).format(fecha);
}

export type DatosCorreoNovedad = {
  motivo: "nueva" | "respuesta";
  proveedorNombre: string;
  novedadId: string;
  sku: string;
  articulo: string;
  tipo: string;
  descripcion: string;
  /** Nuestro último mensaje (cuando le contestamos). */
  mensaje?: string;
  url: string;
  vence: string;
  correoRespuesta: string;
};

/** Asunto, HTML y texto plano del correo. Todo lo variable va escapado. */
export function construirCorreoNovedad(d: DatosCorreoNovedad): { asunto: string; html: string; texto: string } {
  const asunto = d.motivo === "nueva"
    ? `SUPER GEEK · Novedad en el artículo ${d.sku} (${d.tipo})`
    : `SUPER GEEK · Respuesta sobre la novedad del artículo ${d.sku}`;
  const intro = d.motivo === "nueva"
    ? "Al revisar un artículo que nos vendió, registramos la siguiente novedad. Le agradecemos revisarla y enviarnos su respuesta con la propuesta para resolverla."
    : "Le escribimos sobre la novedad que tenemos abierta con usted. Este es nuestro mensaje; le agradecemos su respuesta.";
  const vence = fechaLegible(d.vence);

  const filas = [
    ["Novedad", d.novedadId],
    ["Artículo", `${d.sku} · ${d.articulo}`],
    ["Tipo", d.tipo],
    ["Descripción", d.descripcion],
  ]
    .filter(([, valor]) => String(valor || "").trim())
    .map(([etiqueta, valor]) => `<tr><td style="padding:6px 12px 6px 0;color:#6b6b66;font-size:13px;vertical-align:top;white-space:nowrap">${escapar(etiqueta)}</td><td style="padding:6px 0;color:#1d1d1b;font-size:14px;white-space:pre-wrap">${escapar(String(valor))}</td></tr>`)
    .join("");

  const mensajeHtml = d.mensaje?.trim()
    ? `<div style="margin:16px 0;padding:12px 14px;border-left:3px solid #9bbd1f;background:#f6f8ee;color:#1d1d1b;font-size:14px;white-space:pre-wrap">${escapar(d.mensaje.trim())}</div>`
    : "";

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapar(asunto)}</title></head>
<body style="margin:0;padding:24px;background:#f2f2ef;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden">
    <tr><td style="background:#151613;padding:18px 24px;color:#d7ff4f;font-size:18px;font-weight:bold;letter-spacing:.5px">SUPER GEEK</td></tr>
    <tr><td style="padding:24px">
      <p style="margin:0 0 14px;color:#1d1d1b;font-size:15px">Estimado(a) ${escapar(d.proveedorNombre || "proveedor")}:</p>
      <p style="margin:0 0 16px;color:#1d1d1b;font-size:14px;line-height:1.5">${escapar(intro)}</p>
      <table role="presentation" cellspacing="0" cellpadding="0">${filas}</table>
      ${mensajeHtml}
      <p style="margin:22px 0">
        <a href="${escapar(d.url)}" style="display:inline-block;background:#d7ff4f;color:#151515;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 28px;border-radius:999px">RESPONDER</a>
      </p>
      <p style="margin:0 0 6px;color:#6b6b66;font-size:12px;line-height:1.5">El botón abre solo esta novedad, con sus fotos e historial, sin necesidad de iniciar sesión. Es un enlace personal: vence el ${escapar(vence)} y deja de funcionar cuando envíe su respuesta. Si vence, puede responder desde el portal de proveedores.</p>
      <p style="margin:0;color:#6b6b66;font-size:12px;line-height:1.5">Por favor, responda con el botón para que su respuesta quede registrada. Si necesita escribirnos, hágalo a ${escapar(d.correoRespuesta)}.</p>
    </td></tr>
    <tr><td style="padding:14px 24px;background:#f6f6f3;color:#8f908a;font-size:11px">SUPER GEEK · ${escapar(d.correoRespuesta)}</td></tr>
  </table>
</body></html>`;

  const texto = [
    `Estimado(a) ${d.proveedorNombre || "proveedor"}:`,
    "",
    intro,
    "",
    `Novedad: ${d.novedadId}`,
    `Artículo: ${d.sku} · ${d.articulo}`,
    `Tipo: ${d.tipo}`,
    d.descripcion ? `Descripción: ${d.descripcion}` : "",
    d.mensaje?.trim() ? `\nNuestro mensaje:\n${d.mensaje.trim()}` : "",
    "",
    `RESPONDER: ${d.url}`,
    `El enlace vence el ${vence} y deja de funcionar cuando envíe su respuesta. Si vence, responda desde el portal de proveedores.`,
    "",
    `SUPER GEEK · ${d.correoRespuesta}`,
  ].filter((linea, i, arr) => !(linea === "" && arr[i - 1] === "")).join("\n");

  return { asunto, html, texto };
}
