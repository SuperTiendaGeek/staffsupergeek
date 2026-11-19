import assert from "node:assert/strict";
import { mock } from "node:test";
import nodemailer, { type SendMailOptions } from "nodemailer";
import PostalMime, { type Email } from "postal-mime";
import { enviarRide, type CorreoRideInput } from "../correo/enviarRide";
import { enviarCorreoNovedad, type ConfigCorreoNovedades } from "../../shipping-v2/novedades-correo-envio";

// PDF mínimo válido y fijo, con cabecera binaria y offsets xref calculados.
function pdfFijo(): Buffer {
  const contenido = "BT /F1 10 Tf 10 50 Td (PRUEBA MIME SIN VALOR TRIBUTARIO) Tj ET\n";
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 100] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${contenido.length} >>\nstream\n${contenido}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let texto = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];
  objetos.forEach((objeto, i) => {
    offsets.push(Buffer.byteLength(texto, "latin1"));
    texto += `${i + 1} 0 obj\n${objeto}\nendobj\n`;
  });
  const xref = Buffer.byteLength(texto, "latin1");
  texto += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) texto += `${String(offset).padStart(10, "0")} 00000 n \n`;
  texto += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(texto, "latin1");
}

const PDF = pdfFijo();
const XML = Buffer.concat([
  Buffer.from([0xef, 0xbb, 0xbf]),
  Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\r\n<prueba>Crédito &amp; reparación: áéíóú</prueba>\r\n'),
]);
const FECHA = new Date("2026-11-19T17:00:00.000Z");
const CLAVE = "1".repeat(49);
const ride: CorreoRideInput = {
  destinatario: "cliente@example.invalid", nombreComprador: "Cliente Prueba",
  numeroFactura: "001-002-000000001", fechaEmision: FECHA, ambiente: "1",
  xmlBuffer: XML, pdfBuffer: PDF, claveAcceso: CLAVE,
};

type Resultado = { message: Buffer; envelope: { from: string; to: string[] } };
type PrototipoMailer = { sendMail: (opciones: SendMailOptions) => Promise<unknown> };

function comprobarRide(correo: Email, destino: string, ambiente: string): void {
  assert.deepEqual(correo.to, [{ name: "", address: destino }]);
  assert.deepEqual(correo.from, { name: "SUPER TIENDA GEEK", address: "facturas@example.invalid" });
  assert.equal(correo.replyTo, undefined, "RIDE no añade Reply-To (comportamiento actual)");
  assert.equal(correo.subject, `Factura Electrónica ${ride.numeroFactura} [${ambiente}] - SUPER TIENDA GEEK`);
  assert.match(correo.text ?? "", /Estimado\/a Cliente Prueba/);
  assert.match(correo.html ?? "", /Cliente Prueba/);
  assert.equal(correo.attachments.length, 2);
  for (const [extension, tipo, esperado] of [
    ["xml", "text/xml", XML], ["pdf", "application/pdf", PDF],
  ] as const) {
    const adjunto = correo.attachments.find(a => a.filename === `${CLAVE}.${extension}`);
    assert(adjunto, `Falta el adjunto .${extension}`);
    assert.equal(adjunto.mimeType, tipo);
    assert.equal(adjunto.disposition, "attachment");
    assert(typeof adjunto.content !== "string", "Decodificar el MIME a bytes, sin conversiones de texto");
    const bytes = adjunto.content instanceof ArrayBuffer ? new Uint8Array(adjunto.content) : adjunto.content;
    assert.deepEqual(Buffer.from(bytes), esperado, `El .${extension} debe conservar todos sus bytes`);
  }
}

(async () => {
  // No cargar .env.local: estos valores son ficticios y se restauran al final.
  const entorno = {
    SMTP_HOST: "smtp.example.invalid", SMTP_PORT: "587", SMTP_SECURE: "false",
    SMTP_USER: "usuario-ficticio", SMTP_PASS: "clave-ficticia",
    SMTP_FROM: "facturas@example.invalid", SMTP_TEST_TO: "pruebas@example.invalid",
  };
  const anteriores = Object.fromEntries(Object.keys(entorno).map(k => [k, process.env[k]]));
  Object.assign(process.env, entorno);
  const stream = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "windows" });
  const prototipo = Object.getPrototypeOf(stream) as PrototipoMailer;
  const enviarOriginal = prototipo.sendMail;
  let ultimo: { correo: Email; envelope: Resultado["envelope"] } | undefined;
  let envios = 0;
  // Interceptar el método del transporte, sin reasignar exportaciones del SDK.
  const doble = mock.method(prototipo, "sendMail", async (opciones: SendMailOptions) => {
    const resultado = await enviarOriginal.call(stream, {
      ...opciones, date: FECHA, messageId: "<mensaje-fijo@example.invalid>",
    }) as Resultado;
    assert(Buffer.isBuffer(resultado.message), "streamTransport debe devolver un Buffer");
    ultimo = { correo: await PostalMime.parse(resultado.message), envelope: resultado.envelope };
    envios++;
    return resultado;
  });
  try {
    // Verificar que el transporte SMTP normal queda interceptado ANTES de usarlo.
    const control = nodemailer.createTransport({ host: entorno.SMTP_HOST });
    assert.equal(control.sendMail, prototipo.sendMail, "El doble debe impedir toda conexión SMTP");

    await enviarRide(ride);
    assert(ultimo);
    comprobarRide(ultimo.correo, entorno.SMTP_TEST_TO, "PRUEBA");
    assert.deepEqual(ultimo.envelope, { from: entorno.SMTP_FROM, to: [entorno.SMTP_TEST_TO] });
    assert.match(ultimo.correo.text ?? "", /MODO PRUEBA/);

    await enviarRide({ ...ride, ambiente: "2" });
    assert(ultimo);
    comprobarRide(ultimo.correo, ride.destinatario, "PRODUCCIÓN");
    assert.deepEqual(ultimo.envelope.to, [ride.destinatario]);
    assert(!ultimo.correo.text?.includes("MODO PRUEBA"));

    const config: ConfigCorreoNovedades = {
      host: entorno.SMTP_HOST, port: 587, secure: false,
      user: "usuario-novedades-ficticio", pass: "clave-novedades-ficticia",
      from: '"SUPER GEEK" <staff@example.invalid>', correoRespuesta: "respuestas@example.invalid",
    };
    await enviarCorreoNovedad(config, {
      para: "proveedor@example.invalid", asunto: "Novedad: reparación y crédito",
      texto: "Detalle fijo de la novedad: reparación.", html: "<p>Detalle fijo de la novedad: reparación.</p>",
    });
    assert(ultimo);
    assert.deepEqual(ultimo.correo.from, { name: "SUPER GEEK", address: "staff@example.invalid" });
    assert.deepEqual(ultimo.correo.to, [{ name: "", address: "proveedor@example.invalid" }]);
    assert.deepEqual(ultimo.correo.replyTo, [{ name: "", address: config.correoRespuesta }]);
    assert.equal(ultimo.correo.subject, "Novedad: reparación y crédito");
    assert.equal(ultimo.correo.text?.trim(), "Detalle fijo de la novedad: reparación.");
    assert.equal(ultimo.correo.html?.trim(), "<p>Detalle fijo de la novedad: reparación.</p>");
    assert.equal(ultimo.correo.attachments.length, 0, "Novedades no añade adjuntos");
    assert.deepEqual(ultimo.envelope, { from: "staff@example.invalid", to: ["proveedor@example.invalid"] });
    assert.equal(envios, 3);
    console.log("correo.mensaje: RIDE y novedades conservan cabeceras, destinatarios y adjuntos decodificados byte por byte; sin red.");
  } finally {
    doble.mock.restore();
    stream.close();
    for (const k of Object.keys(entorno)) {
      if (anteriores[k] === undefined) delete process.env[k];
      else process.env[k] = anteriores[k];
    }
  }
})().catch((error: unknown) => {
  console.error(error instanceof assert.AssertionError ? error.message : "Falló la prueba MIME sin red.");
  process.exitCode = 1;
});
