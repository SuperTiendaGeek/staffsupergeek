/**
 * Test — enviarRide() ignora SMTP_TEST_TO en ambiente PRODUCCIÓN (Fase 17).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/enviarRide.smtpTestToProduccion.test.ts
 *
 * Antes, SMTP_TEST_TO forzaba el destinatario SIEMPRE que estuviera seteada,
 * sin importar el ambiente — si alguien olvidaba borrarla al pasar a
 * producción, ningún cliente real recibía su factura por correo, sin ningún
 * error visible (docs/CIERRE_FASE16.md ítem 9, severidad Alta).
 *
 * Este test cubre las tres combinaciones que importan. No toca red real:
 * nodemailer.createTransport se reemplaza por un doble simple que solo
 * captura los argumentos de sendMail().
 *
 * Lanza en la primera falla y sale con código distinto de 0.
 */

import nodemailer from "nodemailer";
import { enviarRide } from "../correo/enviarRide";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

type CorreoCapturado = { to: string; text: string; html: string };

function instalarTransporterDoble(): { ultimo: () => CorreoCapturado | null } {
  let capturado: CorreoCapturado | null = null;
  (nodemailer as unknown as { createTransport: unknown }).createTransport = () => ({
    sendMail: async (opts: CorreoCapturado) => {
      capturado = opts;
    },
  });
  return { ultimo: () => capturado };
}

const inputBase = {
  destinatario:    "cliente-real@example.com",
  nombreComprador: "Cliente Real",
  numeroFactura:   "001-002-000000700",
  fechaEmision:    new Date("2026-07-16"),
  xmlBuffer:       Buffer.from("<xml/>"),
  pdfBuffer:       Buffer.from("pdf"),
  claveAcceso:     "0807202601100371027200110010020000006671598078819",
};

(async () => {
  process.env.SMTP_HOST = "smtp.fake.test";
  process.env.SMTP_PORT = "587";
  process.env.SMTP_SECURE = "false";
  process.env.SMTP_USER = "fake-user";
  process.env.SMTP_PASS = "fake-pass";
  process.env.SMTP_FROM = "facturas@fake.test";

  const transporterDoble = instalarTransporterDoble();

  // ─── 1. Ambiente PRUEBAS + SMTP_TEST_TO seteada: sí debe forzar el destinatario ──
  {
    process.env.SMTP_TEST_TO = "buzon-de-pruebas@fake.test";
    await enviarRide({ ...inputBase, ambiente: "1" });
    const correo = transporterDoble.ultimo();
    assert(correo?.to === "buzon-de-pruebas@fake.test", "En pruebas, SMTP_TEST_TO sí debe forzar el destinatario");
    assert(!!correo?.text.includes("MODO PRUEBA"), "En pruebas, el cuerpo debe marcar [MODO PRUEBA]");
  }

  // ─── 2. Ambiente PRODUCCIÓN + SMTP_TEST_TO seteada (olvidada): debe IGNORARLA ──
  {
    process.env.SMTP_TEST_TO = "buzon-de-pruebas@fake.test"; // sigue seteada, a propósito
    await enviarRide({ ...inputBase, ambiente: "2" });
    const correo = transporterDoble.ultimo();
    assert(correo?.to === inputBase.destinatario, "En producción, SMTP_TEST_TO debe ignorarse SIEMPRE, aunque esté seteada");
    assert(!correo?.text.includes("MODO PRUEBA"), "En producción, el cuerpo NUNCA debe marcar [MODO PRUEBA]");
  }

  // ─── 3. Ambiente PRODUCCIÓN sin SMTP_TEST_TO: control positivo ─────────────────
  {
    delete process.env.SMTP_TEST_TO;
    await enviarRide({ ...inputBase, ambiente: "2" });
    const correo = transporterDoble.ultimo();
    assert(correo?.to === inputBase.destinatario, "En producción sin SMTP_TEST_TO, el destinatario sigue siendo el real");
  }

  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_SECURE;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.SMTP_FROM;
  delete process.env.SMTP_TEST_TO;

  if (fallos > 0) {
    console.error(`\n❌ enviarRide.smtpTestToProduccion.test.ts — ${fallos} aserción(es) fallida(s)`);
    process.exit(1);
  }
  console.log("\n✅ enviarRide.smtpTestToProduccion.test.ts — todos los asserts pasaron");
})();
