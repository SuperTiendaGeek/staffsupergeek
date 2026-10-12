import "server-only";

// Envío del correo de novedades al proveedor (auditoría Shipping V2, punto 8c).
//
// Sale desde staff@supertiendageek.com con el SMTP del hosting (cPanel), el
// mismo servidor que ya usa Facturación, pero con SU PROPIA cuenta:
//   SMTP_HOST, SMTP_PORT, SMTP_SECURE  → se reutilizan (mismo servidor).
//   NOVEDADES_SMTP_USER                → staff@supertiendageek.com
//   NOVEDADES_SMTP_PASS                → contraseña de esa cuenta (solo en Vercel)
//   NOVEDADES_SMTP_FROM                → SUPER GEEK <staff@supertiendageek.com>
// Si el proveedor contesta el correo con su programa de correo, la respuesta
// llega a la misma cuenta (Reply-To).
//
// Si falta algo, NO se lanza error: la novedad se guarda igual y se avisa.

import nodemailer from "nodemailer";

export type ConfigCorreoNovedades = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  /** Dirección pura (sin nombre) a la que se responde. */
  correoRespuesta: string;
};

function direccionDe(valor: string): string {
  const m = /<([^>]+)>/.exec(valor);
  return (m ? m[1] : valor).trim();
}

/** null = falta configuración; el motivo explica qué. */
export function leerConfigCorreoNovedades(): { config: ConfigCorreoNovedades | null; falta: string[] } {
  const host = process.env.SMTP_HOST?.trim() ?? "";
  const port = parseInt(process.env.SMTP_PORT?.trim() || "465", 10);
  const secure = (process.env.SMTP_SECURE?.trim().toLowerCase() ?? "true") === "true";
  const user = process.env.NOVEDADES_SMTP_USER?.trim() ?? "";
  const pass = process.env.NOVEDADES_SMTP_PASS?.trim() ?? "";
  const from = process.env.NOVEDADES_SMTP_FROM?.trim() || (user ? `SUPER GEEK <${user}>` : "");
  const falta = [
    !host && "SMTP_HOST",
    !user && "NOVEDADES_SMTP_USER",
    !pass && "NOVEDADES_SMTP_PASS",
  ].filter(Boolean) as string[];
  if (falta.length) return { config: null, falta };
  return { config: { host, port, secure, user, pass, from, correoRespuesta: direccionDe(from) || user }, falta: [] };
}

export async function enviarCorreoNovedad(
  config: ConfigCorreoNovedades,
  mensaje: { para: string; asunto: string; html: string; texto: string }
): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    // Que un SMTP lento no deje colgado el registro de la novedad.
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  await transporter.sendMail({
    from: config.from,
    to: mensaje.para,
    replyTo: config.correoRespuesta,
    subject: mensaje.asunto,
    text: mensaje.texto,
    html: mensaje.html,
  });
}
