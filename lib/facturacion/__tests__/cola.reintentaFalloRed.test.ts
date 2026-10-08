/**
 * Test — esperarAutorizacion() ya no se rinde en el primer fallo de red.
 * Ejecutar: npm test cola.reintenta
 *
 * Las 6 facturas sin descargo (723…756) se autorizaron en el SRI en el mismo
 * segundo en que se recibieron, pero la emisión terminó "EN PROCESAMIENTO":
 * un fallo de red o una espera agotada en la primera consulta cortaba toda la
 * espera, aunque quedaba tiempo para volver a preguntar. Ahora un error
 * TRANSITORIO (red, timeout, 502/503/504) se reintenta dentro del mismo
 * presupuesto; un error real (SOAP Fault) se sigue lanzando de inmediato.
 * global.fetch reemplazado por un doble; nunca toca el SRI.
 */

import { esperarAutorizacion } from "../sri/cola";
import { ErrorTransitorioSri } from "../sri/autorizacion";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const SOAP_AUTORIZADO =
  `<soap:Envelope><soap:Body><ns2:autorizacionComprobanteResponse><RespuestaAutorizacionComprobante>` +
  `<claveAccesoConsultada>123</claveAccesoConsultada><numeroComprobantes>1</numeroComprobantes><autorizaciones>` +
  `<autorizacion><estado>AUTORIZADO</estado><numeroAutorizacion>123</numeroAutorizacion>` +
  `<fechaAutorizacion>2026-10-05T17:45:20-05:00</fechaAutorizacion><ambiente>PRODUCCIÓN</ambiente>` +
  `<comprobante><![CDATA[<factura/>]]></comprobante><mensajes/></autorizacion>` +
  `</autorizaciones></RespuestaAutorizacionComprobante></ns2:autorizacionComprobanteResponse></soap:Body></soap:Envelope>`;

const SOAP_FAULT = `<soap:Envelope><soap:Body><soap:Fault><faultstring>clave mal formada</faultstring></soap:Fault></soap:Body></soap:Envelope>`;

const cfg = { endpointAutorizacion: "https://sri.test/autorizacion?wsdl" };
const opciones = { maxEsperaMs: 1_500, intervaloBase: 20 };
const fetchOriginal = global.fetch;

function respuesta(body: string, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => body } as Response;
}

async function capturar(fn: () => Promise<unknown>): Promise<{ valor?: unknown; error?: Error }> {
  try { return { valor: await fn() }; } catch (e) { return { error: e as Error }; }
}

(async () => {
  // 1. Primer intento falla por red, el segundo responde AUTORIZADO.
  let llamadas = 0;
  global.fetch = (async () => {
    llamadas++;
    if (llamadas === 1) throw new TypeError("fetch failed");
    return respuesta(SOAP_AUTORIZADO);
  }) as unknown as typeof fetch;
  const r1 = await capturar(() => esperarAutorizacion("123", cfg, opciones));
  assert(!r1.error, "Fallo de red en la 1.ª consulta: NO corta la espera");
  assert((r1.valor as { estado?: string })?.estado === "AUTORIZADO", "…y devuelve AUTORIZADO en la 2.ª");
  assert(llamadas === 2, "…con exactamente dos consultas");

  // 2. 503 del SRI (transitorio), luego AUTORIZADO.
  llamadas = 0;
  global.fetch = (async () => {
    llamadas++;
    return llamadas === 1 ? respuesta("Service Unavailable", 503) : respuesta(SOAP_AUTORIZADO);
  }) as unknown as typeof fetch;
  const r2 = await capturar(() => esperarAutorizacion("123", cfg, opciones));
  assert((r2.valor as { estado?: string })?.estado === "AUTORIZADO", "HTTP 503: se reintenta y llega AUTORIZADO");

  // 3. La red no vuelve nunca: se rinde al agotar el presupuesto, con el
  //    mensaje de "ya está en el SRI, no reemitas".
  llamadas = 0;
  global.fetch = (async () => { llamadas++; throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
  const t0 = Date.now();
  const r3 = await capturar(() => esperarAutorizacion("123", cfg, opciones));
  assert(r3.error instanceof ErrorTransitorioSri, "Sin red todo el tiempo: termina con ErrorTransitorioSri");
  assert(!!r3.error && r3.error.message.includes("NO debes emitir otra factura"), "…cuyo mensaje prohíbe reemitir");
  assert(llamadas > 1, "…después de reintentar");
  assert(Date.now() - t0 < 1_500 + 6_000, "…sin pasarse del presupuesto (+ el mínimo de una consulta)");

  // 4. Un SOAP Fault no es transitorio: se lanza en la primera consulta.
  llamadas = 0;
  global.fetch = (async () => { llamadas++; return respuesta(SOAP_FAULT, 500); }) as unknown as typeof fetch;
  const r4 = await capturar(() => esperarAutorizacion("123", cfg, opciones));
  assert(!!r4.error && !(r4.error instanceof ErrorTransitorioSri) && r4.error.message.includes("SOAP Fault"), "SOAP Fault: se lanza tal cual");
  assert(llamadas === 1, "…sin reintentar");

  global.fetch = fetchOriginal;
  if (fallos > 0) {
    console.error(`\n❌ cola.reintentaFalloRed.test.ts — ${fallos} aserción(es) fallida(s)`);
    process.exit(1);
  }
  console.log("\n✅ cola.reintentaFalloRed.test.ts — todos los asserts pasaron");
})();
