import "server-only";

// Envío del RIDE y XML por correo electrónico usando Nodemailer + SMTP de cPanel.
// Variables requeridas en .env.local:
//   SMTP_HOST, SMTP_PORT, SMTP_SECURE (true|false), SMTP_USER, SMTP_PASS, SMTP_FROM
// Variable de modo prueba:
//   SMTP_TEST_TO — si está definida, fuerza el destinatario a esta dirección.
//   Fase 17: esto YA NO depende de acordarse de borrar la variable al pasar a
//   producción (era severidad Alta en docs/CIERRE_FASE16.md ítem 9 — si se
//   olvidaba, ningún cliente real recibía su factura, sin error visible).
//   Ahora es una regla de código: en ambiente PRODUCCIÓN (input.ambiente ===
//   "2") SMTP_TEST_TO se ignora siempre, sin importar si quedó seteada. Sigue
//   siendo buena práctica borrarla del entorno cuando ya no se necesite, pero
//   dejarla puesta por descuido ya no puede hacer que una factura real se
//   quede sin llegarle al cliente.

import nodemailer from "nodemailer";

type Adjunto = {
  filename:    string;
  content:     Buffer;
  contentType: string;
};

export type CorreoRideInput = {
  destinatario:    string;       // correo del comprador
  nombreComprador: string;
  numeroFactura:   string;       // "001-002-000000644"
  fechaEmision:    Date;
  ambiente:        "1" | "2";
  xmlBuffer:       Buffer;
  pdfBuffer:       Buffer;
  claveAcceso:     string;
  /** Fase 18: rótulo del documento. Ausente = "Factura Electrónica"
   *  (comportamiento idéntico al de siempre para facturas). */
  tipoDocumento?:  "Factura Electrónica" | "Nota de Crédito";
};

function getSmtpConfig() {
  const host   = process.env.SMTP_HOST?.trim();
  const port   = parseInt(process.env.SMTP_PORT?.trim() ?? "587", 10);
  const secure = process.env.SMTP_SECURE?.trim().toLowerCase() === "true";
  const user   = process.env.SMTP_USER?.trim();
  const pass   = process.env.SMTP_PASS?.trim();
  const from   = process.env.SMTP_FROM?.trim();

  if (!host) throw new Error("SMTP_HOST no configurada");
  if (!user)  throw new Error("SMTP_USER no configurada");
  if (!pass)  throw new Error("SMTP_PASS no configurada");
  if (!from)  throw new Error("SMTP_FROM no configurada");

  return { host, port, secure, user, pass, from };
}

export async function enviarRide(input: CorreoRideInput): Promise<void> {
  const cfg = getSmtpConfig();

  // Guard de producción — ver nota de arriba. SMTP_TEST_TO solo puede actuar
  // fuera de ambiente "2"; en producción real, input.destinatario siempre
  // gana, sin excepción.
  const smtpTestTo = process.env.SMTP_TEST_TO?.trim();
  const testToActivo = input.ambiente !== "2" && !!smtpTestTo;
  const destFinal = testToActivo ? smtpTestTo! : input.destinatario;
  const modoTest  = testToActivo;

  const transporter = nodemailer.createTransport({
    host:   cfg.host,
    port:   cfg.port,
    secure: cfg.secure,
    auth:   { user: cfg.user, pass: cfg.pass },
  });

  const ambienteLabel = input.ambiente === "1" ? "PRUEBA" : "PRODUCCIÓN";
  const nombreArchivo = input.claveAcceso;
  const tipoDoc       = input.tipoDocumento ?? "Factura Electrónica";

  const adjuntos: Adjunto[] = [
    {
      filename:    `${nombreArchivo}.xml`,
      content:     input.xmlBuffer,
      contentType: "text/xml",
    },
    {
      filename:    `${nombreArchivo}.pdf`,
      content:     input.pdfBuffer,
      contentType: "application/pdf",
    },
  ];

  await transporter.sendMail({
    from:        `"SUPER TIENDA GEEK" <${cfg.from}>`,
    to:          destFinal,
    subject:     `${tipoDoc} ${input.numeroFactura} [${ambienteLabel}] - SUPER TIENDA GEEK`,
    text: [
      `Estimado/a ${input.nombreComprador},`,
      "",
      `Adjunto encontrará su ${tipoDoc.toLowerCase()} No. ${input.numeroFactura} emitida el ${input.fechaEmision.toLocaleDateString("es-EC")}.`,
      "",
      `Archivos adjuntos:`,
      `  • ${nombreArchivo}.xml — Comprobante electrónico autorizado por el SRI`,
      `  • ${nombreArchivo}.pdf — Representación Impresa (RIDE)`,
      "",
      // Una NC autorizada es válida de inmediato — no requiere aceptación del
      // receptor (esa idea era un error: la aceptación de 5 días hábiles es
      // del flujo de ANULACIÓN, no de la emisión). No se agrega ningún aviso.
      modoTest ? `[MODO PRUEBA — destinatario real: ${input.destinatario}]` : "",
      "",
      "SUPER TIENDA GEEK",
    ].join("\n"),
    html: `
      <p>Estimado/a <strong>${input.nombreComprador}</strong>,</p>
      <p>Adjunto encontrará su ${tipoDoc.toLowerCase()} <strong>No. ${input.numeroFactura}</strong>
         emitida el <strong>${input.fechaEmision.toLocaleDateString("es-EC")}</strong>.</p>
      <ul>
        <li><strong>${nombreArchivo}.xml</strong> — Comprobante electrónico autorizado por el SRI</li>
        <li><strong>${nombreArchivo}.pdf</strong> — Representación Impresa (RIDE)</li>
      </ul>
      ${modoTest ? `<p style="color:#888;font-size:11px;">[MODO PRUEBA — destinatario real: ${input.destinatario}]</p>` : ""}
      <p>Atentamente,<br/><strong>SUPER TIENDA GEEK</strong></p>
    `,
    attachments: adjuntos,
  });
}
