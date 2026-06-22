import "server-only";

// Envío del RIDE y XML por correo electrónico usando Nodemailer + SMTP de cPanel.
// Variables requeridas en .env.local:
//   SMTP_HOST, SMTP_PORT, SMTP_SECURE (true|false), SMTP_USER, SMTP_PASS, SMTP_FROM
// Variable de modo prueba:
//   SMTP_TEST_TO — si está definida, fuerza el destinatario a esta dirección
//   (quitar cuando se pase a producción — ver TODO abajo)

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

  // TODO (producción): eliminar este bloque cuando se quite SMTP_TEST_TO
  const destFinal = process.env.SMTP_TEST_TO?.trim() ?? input.destinatario;
  const modoTest  = !!process.env.SMTP_TEST_TO?.trim();

  const transporter = nodemailer.createTransport({
    host:   cfg.host,
    port:   cfg.port,
    secure: cfg.secure,
    auth:   { user: cfg.user, pass: cfg.pass },
  });

  const ambienteLabel = input.ambiente === "1" ? "PRUEBA" : "PRODUCCIÓN";
  const nombreArchivo = input.claveAcceso;

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
    subject:     `Factura Electrónica ${input.numeroFactura} [${ambienteLabel}] - SUPER TIENDA GEEK`,
    text: [
      `Estimado/a ${input.nombreComprador},`,
      "",
      `Adjunto encontrará su factura electrónica No. ${input.numeroFactura} emitida el ${input.fechaEmision.toLocaleDateString("es-EC")}.`,
      "",
      `Archivos adjuntos:`,
      `  • ${nombreArchivo}.xml — Comprobante electrónico autorizado por el SRI`,
      `  • ${nombreArchivo}.pdf — Representación Impresa (RIDE)`,
      "",
      modoTest ? `[MODO PRUEBA — destinatario real: ${input.destinatario}]` : "",
      "",
      "SUPER TIENDA GEEK",
    ].join("\n"),
    html: `
      <p>Estimado/a <strong>${input.nombreComprador}</strong>,</p>
      <p>Adjunto encontrará su factura electrónica <strong>No. ${input.numeroFactura}</strong>
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
