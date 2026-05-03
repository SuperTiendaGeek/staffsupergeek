import "server-only";

import { Resend } from "resend";

type SendTwoFactorCodeEmailInput = {
  to: string;
  code: string;
  userName: string;
};

function getRequiredEmailEnv(name: "RESEND_API_KEY" | "STAFF_2FA_FROM") {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing email environment variable: ${name}`);
  }

  return value;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildTwoFactorEmailHtml({ code, userName }: Pick<SendTwoFactorCodeEmailInput, "code" | "userName">) {
  const safeUserName = escapeHtml(userName);
  const safeCode = escapeHtml(code);

  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Código de acceso - Portal Staff SUPER GEEK</title>
      </head>
      <body style="margin:0;background:#050608;color:#f7f8f8;font-family:Arial,Helvetica,sans-serif;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#050608;padding:32px 16px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;border:1px solid #262b33;background:#101318;border-radius:8px;overflow:hidden;">
                <tr>
                  <td style="padding:28px 28px 12px;">
                    <div style="display:inline-block;background:#b6ff3b;color:#050608;font-weight:800;letter-spacing:0;padding:10px 12px;border-radius:8px;">
                      SUPER GEEK Staff
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 28px 0;">
                    <h1 style="margin:0;color:#ffffff;font-size:24px;line-height:1.25;font-weight:700;">Código de acceso</h1>
                    <p style="margin:14px 0 0;color:#d4d4d8;font-size:15px;line-height:1.6;">
                      Hola ${safeUserName}, usa este código para completar tu inicio de sesión.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:28px;">
                    <div style="display:inline-block;border:1px solid rgba(182,255,59,0.35);background:rgba(182,255,59,0.08);color:#b6ff3b;font-size:34px;line-height:1;font-weight:800;letter-spacing:8px;border-radius:8px;padding:20px 24px;">
                      ${safeCode}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 28px 28px;">
                    <p style="margin:0;color:#a1a1aa;font-size:13px;line-height:1.6;">Este código expira en 10 minutos.</p>
                    <p style="margin:10px 0 0;color:#a1a1aa;font-size:13px;line-height:1.6;">
                      Si no intentaste iniciar sesión, puedes ignorar este correo.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

export async function sendTwoFactorCodeEmail({ to, code, userName }: SendTwoFactorCodeEmailInput) {
  const resend = new Resend(getRequiredEmailEnv("RESEND_API_KEY"));
  const from = getRequiredEmailEnv("STAFF_2FA_FROM");
  const { error } = await resend.emails.send({
    from,
    to,
    subject: "Código de acceso - Portal Staff SUPER GEEK",
    html: buildTwoFactorEmailHtml({ code, userName }),
    text: [
      "SUPER GEEK Staff",
      "",
      `Hola ${userName}, usa este código para completar tu inicio de sesión: ${code}`,
      "",
      "Este código expira en 10 minutos.",
      "Si no intentaste iniciar sesión, puedes ignorar este correo."
    ].join("\n")
  });

  if (error) {
    throw new Error(`Resend failed to send 2FA email: ${error.message}`);
  }
}
