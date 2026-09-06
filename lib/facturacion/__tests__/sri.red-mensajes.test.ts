/**
 * Test — mensajes ante SRI lento/fallo de red.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/sri.red-mensajes.test.ts
 *
 * Puro: sin red real. global.fetch se reemplaza por un doble local.
 */

import { enviarComprobante } from "../sri/recepcion";
import { consultarAutorizacion } from "../sri/autorizacion";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); }
  else       { console.log("✓", msg); }
}

const fetchOriginal = global.fetch;

function errorFetchFailed(): Error {
  return new TypeError("fetch failed");
}

function errorAbort(): Error {
  const err = new Error("The operation was aborted");
  err.name = "AbortError";
  return err;
}

function respuestaSoap(xml: string): Response {
  return {
    ok: true,
    status: 200,
    text: async () => xml,
  } as Response;
}

async function capturaError(fn: () => Promise<unknown>): Promise<Error> {
  try {
    await fn();
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
  return new Error("La operación no falló");
}

const soapDevuelta = `
<soap:Envelope>
  <soap:Body>
    <RespuestaRecepcionComprobante>
      <estado>DEVUELTA</estado>
      <comprobantes>
        <comprobante>
          <claveAcceso>123</claveAcceso>
          <mensajes>
            <mensaje>
              <identificador>69</identificador>
              <mensaje>ERROR EN LA IDENTIFICACION DEL RECEPTOR</mensaje>
              <informacionAdicional>Detalle original del SRI</informacionAdicional>
              <tipo>ERROR</tipo>
            </mensaje>
          </mensajes>
        </comprobante>
      </comprobantes>
    </RespuestaRecepcionComprobante>
  </soap:Body>
</soap:Envelope>`;

(async () => {
  // a) RECEPCION: fallo de red no invita a reemitir un comprobante enviado.
  let intentosRecepcion = 0;
  global.fetch = (async () => {
    intentosRecepcion++;
    throw errorFetchFailed();
  }) as typeof fetch;

  const errorRecepcion = await capturaError(() =>
    enviarComprobante("<factura/>", { endpointRecepcion: "https://sri.test/recepcion?wsdl" })
  );

  assert(intentosRecepcion === 3, "Recepción: fallo de red hace 2 reintentos automáticos y luego falla");
  assert(errorRecepcion.message.includes("SRI no está respondiendo"), "Recepción: explica que el SRI no responde");
  assert(errorRecepcion.message.includes("NO se emitió"), "Recepción: dice que la factura NO se emitió");
  assert(errorRecepcion.message.includes("NO se consumió ningún número"), "Recepción: dice que NO se consumió número");
  assert(errorRecepcion.message.includes("reintentar en unos minutos"), "Recepción: permite reintentar luego");

  // b) AUTORIZACION: la factura ya está en el SRI, así que el mensaje debe
  // impedir explícitamente otra emisión.
  let intentosAutorizacion = 0;
  global.fetch = (async () => {
    intentosAutorizacion++;
    throw errorFetchFailed();
  }) as typeof fetch;

  const errorAutorizacion = await capturaError(() =>
    consultarAutorizacion("123", { endpointAutorizacion: "https://sri.test/autorizacion?wsdl" })
  );

  assert(intentosAutorizacion === 1, "Autorización: no agrega reintentos propios");
  assert(errorAutorizacion.message.includes("YA fue enviada al SRI"), "Autorización: dice que ya está en el SRI");
  assert(errorAutorizacion.message.includes("NO se ha perdido"), "Autorización: dice que no se perdió");
  assert(errorAutorizacion.message.includes("NO debes emitir otra factura"), "Autorización: prohíbe reemitir");
  assert(errorAutorizacion.message.includes("Consultar estado"), "Autorización: manda al botón Consultar estado");

  // c) Los mensajes son distintos y ninguno filtra el texto crudo de Node.
  assert(errorRecepcion.message !== errorAutorizacion.message, "Recepción y autorización tienen mensajes distintos");
  assert(!errorRecepcion.message.includes("fetch failed"), "Recepción: no muestra fetch failed");
  assert(!errorAutorizacion.message.includes("fetch failed"), "Autorización: no muestra fetch failed");

  // d) DEVUELTA es una respuesta válida del SRI: no se reintenta y conserva
  // exactamente sus mensajes parseados.
  let intentosDevuelta = 0;
  global.fetch = (async () => {
    intentosDevuelta++;
    return respuestaSoap(soapDevuelta);
  }) as typeof fetch;

  const devuelta = await enviarComprobante("<factura/>", { endpointRecepcion: "https://sri.test/recepcion?wsdl" });

  assert(devuelta.estado === "DEVUELTA", "Recepción: DEVUELTA se conserva como resultado SRI");
  assert(intentosDevuelta === 1, "Recepción: DEVUELTA no se reintenta");
  assert("mensajes" in devuelta && devuelta.mensajes[0]?.identificador === "69", "Recepción: conserva código de mensaje SRI");
  assert("mensajes" in devuelta && devuelta.mensajes[0]?.informacionAdicional === "Detalle original del SRI", "Recepción: conserva detalle SRI");

  // e) Timeout de 30s conserva mensaje propio y no entra al circuito de
  // reintentos de errores de red inmediatos.
  let intentosTimeout = 0;
  global.fetch = (async () => {
    intentosTimeout++;
    throw errorAbort();
  }) as typeof fetch;

  const errorTimeout = await capturaError(() =>
    enviarComprobante("<factura/>", { endpointRecepcion: "https://sri.test/recepcion?wsdl" })
  );

  assert(intentosTimeout === 1, "Recepción: timeout no se reintenta");
  assert(errorTimeout.message.includes("Timeout (30s)"), "Recepción: timeout mantiene mensaje propio de 30s");
  assert(errorTimeout.message.includes("NO se emitió"), "Recepción timeout: también dice que no se emitió");
  assert(!errorTimeout.message.includes("fetch failed"), "Recepción timeout: no muestra fetch failed");

  global.fetch = fetchOriginal;

  if (fallos > 0) {
    console.error(`\n❌ sri.red-mensajes.test.ts — ${fallos} aserción(es) fallida(s)`);
    process.exit(1);
  }
  console.log("\n✅ sri.red-mensajes.test.ts — todos los asserts pasaron");
})();
