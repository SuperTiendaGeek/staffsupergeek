/**
 * Test — recuperar una factura AUTORIZADA sin dejar el registro a medias.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/recuperar.autorizacion.test.ts
 *
 * Puro: simula SRI + Airtable con global.fetch. No consulta ni modifica datos reales.
 */

import { recuperarFacturaAutorizadaPorClave } from "../almacenamiento/recuperar";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); }
  else       { console.log("✓", msg); }
}

const fetchOriginal = global.fetch;
const envOriginal = { ...process.env };

const CLAVE = "0409202601100371027200120010020000007071234567811";
const NUMERO_AUTORIZACION = "0409202601100371027200120010020000007071234567811";
const FECHA_AUTORIZACION = "2026-09-04T20:15:30-05:00";

type RecordDouble = { id: string; fields: Record<string, unknown> };

function facturaXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<factura id="comprobante" version="1.1.0">
  <infoTributaria>
    <ambiente>2</ambiente>
    <tipoEmision>1</tipoEmision>
    <razonSocial>BOLAÑOS FLORES ALEXIS RUBEN</razonSocial>
    <nombreComercial>SUPER TIENDA GEEK</nombreComercial>
    <ruc>1003710272001</ruc>
    <claveAcceso>${CLAVE}</claveAcceso>
    <codDoc>01</codDoc>
    <estab>001</estab>
    <ptoEmi>002</ptoEmi>
    <secuencial>000000707</secuencial>
    <dirMatriz>Cristobal Colon</dirMatriz>
  </infoTributaria>
  <infoFactura>
    <fechaEmision>04/09/2026</fechaEmision>
    <dirEstablecimiento>Local</dirEstablecimiento>
    <obligadoContabilidad>NO</obligadoContabilidad>
    <tipoIdentificacionComprador>05</tipoIdentificacionComprador>
    <razonSocialComprador>Luis Chuquin</razonSocialComprador>
    <identificacionComprador>1001471976</identificacionComprador>
    <totalSinImpuestos>426.09</totalSinImpuestos>
    <totalDescuento>0.00</totalDescuento>
    <totalConImpuestos>
      <totalImpuesto>
        <codigo>2</codigo>
        <codigoPorcentaje>4</codigoPorcentaje>
        <baseImponible>426.09</baseImponible>
        <tarifa>15.00</tarifa>
        <valor>63.91</valor>
      </totalImpuesto>
    </totalConImpuestos>
    <propina>0.00</propina>
    <importeTotal>490.00</importeTotal>
    <moneda>DOLAR</moneda>
    <pagos>
      <pago>
        <formaPago>01</formaPago>
        <total>490.00</total>
      </pago>
    </pagos>
  </infoFactura>
  <detalles>
    <detalle>
      <codigoPrincipal>SKU-707</codigoPrincipal>
      <descripcion>Producto de prueba</descripcion>
      <cantidad>1.00</cantidad>
      <precioUnitario>426.09</precioUnitario>
      <descuento>0.00</descuento>
      <precioTotalSinImpuesto>426.09</precioTotalSinImpuesto>
      <impuestos>
        <impuesto>
          <codigo>2</codigo>
          <codigoPorcentaje>4</codigoPorcentaje>
          <tarifa>15.00</tarifa>
          <baseImponible>426.09</baseImponible>
          <valor>63.91</valor>
        </impuesto>
      </impuestos>
    </detalle>
  </detalles>
  <infoAdicional>
    <campoAdicional nombre="Email">cliente@example.com</campoAdicional>
  </infoAdicional>
</factura>`;
}

function soapAutorizado(): string {
  return `<soap:Envelope>
  <soap:Body>
    <RespuestaAutorizacionComprobante>
      <autorizaciones>
        <autorizacion>
          <estado>AUTORIZADO</estado>
          <numeroAutorizacion>${NUMERO_AUTORIZACION}</numeroAutorizacion>
          <fechaAutorizacion>${FECHA_AUTORIZACION}</fechaAutorizacion>
          <ambiente>PRODUCCIÓN</ambiente>
          <comprobante><![CDATA[${facturaXml()}]]></comprobante>
          <mensajes></mensajes>
        </autorizacion>
      </autorizaciones>
    </RespuestaAutorizacionComprobante>
  </soap:Body>
</soap:Envelope>`;
}

function respuesta(ok: boolean, status: number, body: unknown): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok,
    status,
    text: async () => text,
    json: async () => JSON.parse(text),
  } as Response;
}

function instalarEnv(nombre: string): void {
  process.env.SRI_AMBIENTE = "2";
  process.env.SRI_RUC = "1003710272001";
  process.env.SRI_RAZON_SOCIAL = "BOLAÑOS FLORES ALEXIS RUBEN";
  process.env.SRI_NOMBRE_COMERCIAL = "SUPER TIENDA GEEK";
  process.env.SRI_DIR_MATRIZ = "Cristobal Colon";
  process.env.SRI_DIR_ESTABLECIMIENTO = "Local";
  process.env.SRI_OBLIGADO_CONTABILIDAD = "NO";
  process.env.SRI_ESTABLECIMIENTO = "001";
  process.env.SRI_PUNTO_EMISION = "002";
  process.env.SRI_SECUENCIAL = "000000707";
  process.env.AIRTABLE_API_KEY = "fake";
  process.env.AIRTABLE_BASE_ID = "appFAKE";
  process.env.FACTURAS_DIR = `/tmp/staffsupergeek-recuperar-${nombre}-${process.pid}`;
}

function crearFetchDouble(registrosIniciales: RecordDouble[]) {
  const registros = new Map(registrosIniciales.map((r) => [r.id, { id: r.id, fields: { ...r.fields } }]));
  const uploads: Array<{ recordId: string; field: string; filename: string }> = [];
  const patches: Array<{ recordId: string; fields: Record<string, unknown> }> = [];
  let nextId = 1;

  const fetchDoble = async (urlInput: string | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(urlInput));
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.hostname === "sri.test" || url.pathname.includes("AutorizacionComprobantesOffline")) {
      return respuesta(true, 200, soapAutorizado());
    }

    if (url.hostname === "content.airtable.com") {
      const segments = decodeURIComponent(url.pathname).split("/").filter(Boolean);
      const recordId = segments[2];
      const field = segments[3];
      const body = JSON.parse(String(init?.body ?? "{}")) as { filename: string };
      uploads.push({ recordId, field, filename: body.filename });
      return respuesta(true, 200, { id: "attTEST" });
    }

    const segments = decodeURIComponent(url.pathname).split("/").filter(Boolean);
    const recordId = segments[3];

    if (method === "GET" && recordId) {
      const record = registros.get(recordId);
      return record ? respuesta(true, 200, record) : respuesta(false, 404, "Record not found");
    }

    if (method === "GET") {
      const records = [...registros.values()].filter((record) => record.fields["Clave de Acceso"] === CLAVE);
      return respuesta(true, 200, { records });
    }

    if (method === "PATCH" && recordId) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { fields: Record<string, unknown> };
      const actual = registros.get(recordId);
      if (!actual) return respuesta(false, 404, "Record not found");
      actual.fields = { ...actual.fields, ...body.fields };
      patches.push({ recordId, fields: body.fields });
      return respuesta(true, 200, actual);
    }

    if (method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { fields: Record<string, unknown> };
      const id = `recCREADO${nextId++}`;
      registros.set(id, { id, fields: { ...body.fields } });
      return respuesta(true, 200, { id });
    }

    throw new Error(`fetch inesperado: ${method} ${url.toString()}`);
  };

  return { fetchDoble, registros, uploads, patches };
}

(async () => {
  // f) Si la factura ya existe, recuperación completa solo autorización/estado
  // y evita sumar adjuntos iguales.
  {
    instalarEnv("existente");
    const nombreXml = `${CLAVE}.xml`;
    const nombrePdf = `${CLAVE}.pdf`;
    const { fetchDoble, registros, uploads, patches } = crearFetchDouble([
      {
        id: "recFACTURA707",
        fields: {
          "Clave de Acceso": CLAVE,
          "Número de Factura": "001-002-000000707",
          "Secuencial": 707,
          "Estado": "RECIBIDA",
          "Ambiente": "PRODUCCIÓN",
          "Fecha de Emisión": "2026-09-04",
          "Cliente - Nombre": "Nombre que ya estaba bien",
          "Cliente - Identificación": "1001471976",
          "Subtotal": 426.09,
          "IVA": 63.91,
          "Total": 490,
          "Líneas JSON": "{\"version\":2,\"detalles\":[]}",
          "XML Autorizado": [{ filename: nombreXml, url: "https://example.test/xml" }],
          "RIDE PDF": [{ filename: nombrePdf, url: "https://example.test/pdf" }],
        },
      },
    ]);
    global.fetch = fetchDoble as typeof fetch;

    const resultado = await recuperarFacturaAutorizadaPorClave(CLAVE);
    const factura = registros.get("recFACTURA707")!;

    assert(resultado.enAirtable === true, "Existente: reporta que ya estaba en Airtable");
    assert(resultado.recordId === "recFACTURA707", "Existente: conserva el mismo recordId");
    assert(factura.fields["Estado"] === "AUTORIZADO", "Existente: actualiza Estado a AUTORIZADO");
    assert(factura.fields["Número de Autorización"] === NUMERO_AUTORIZACION, "Existente: guarda número de autorización");
    assert(factura.fields["Fecha de Autorización"] === FECHA_AUTORIZACION, "Existente: guarda fecha de autorización");
    assert(factura.fields["Cliente - Nombre"] === "Nombre que ya estaba bien", "Existente: no sobreescribe campos de cliente");
    assert(factura.fields["Líneas JSON"] === "{\"version\":2,\"detalles\":[]}", "Existente: no sobreescribe líneas");
    assert(uploads.length === 0, "Existente: si XML/RIDE de esa clave ya están adjuntos, no los duplica");
    assert(patches.some((p) => p.fields["Estado"] === "AUTORIZADO"), "Existente: hace PATCH de autorización");
  }

  // g) Si no existe, el camino de recuperación perdida sigue creando el
  // registro con los campos completos como antes.
  {
    instalarEnv("nueva");
    const { fetchDoble, registros, uploads } = crearFetchDouble([]);
    global.fetch = fetchDoble as typeof fetch;

    const resultado = await recuperarFacturaAutorizadaPorClave(CLAVE);
    const factura = registros.get(resultado.recordId)!;

    assert(resultado.enAirtable === false, "Nueva: reporta que no existía en Airtable");
    assert(Boolean(factura), "Nueva: crea registro en Airtable");
    assert(factura.fields["Estado"] === "AUTORIZADO", "Nueva: crea con Estado AUTORIZADO");
    assert(factura.fields["Número de Factura"] === "001-002-000000707", "Nueva: conserva número de factura del XML");
    assert(factura.fields["Número de Autorización"] === NUMERO_AUTORIZACION, "Nueva: guarda número de autorización");
    assert(factura.fields["Fecha de Autorización"] === FECHA_AUTORIZACION, "Nueva: guarda fecha de autorización");
    assert(factura.fields["Cliente - Nombre"] === "Luis Chuquin", "Nueva: usa cliente del XML");
    assert(typeof factura.fields["Líneas JSON"] === "string" && String(factura.fields["Líneas JSON"]).includes("Producto de prueba"), "Nueva: conserva líneas parseadas del XML");
    assert(uploads.some((u) => u.field === "XML Autorizado" && u.filename === `${CLAVE}.xml`), "Nueva: sube XML");
    assert(uploads.some((u) => u.field === "RIDE PDF" && u.filename === `${CLAVE}.pdf`), "Nueva: sube RIDE");
  }

  global.fetch = fetchOriginal;
  process.env = envOriginal;

  if (fallos > 0) {
    console.error(`\n❌ recuperar.autorizacion.test.ts — ${fallos} aserción(es) fallida(s)`);
    process.exit(1);
  }
  console.log("\n✅ recuperar.autorizacion.test.ts — todos los asserts pasaron");
})();
