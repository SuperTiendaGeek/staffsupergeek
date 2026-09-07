/**
 * Mejoras de UI/listado para borradores de factura.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/borradores-ui.test.ts
 *
 * Puro: global.fetch es un doble en memoria. No toca Airtable real ni el SRI.
 */

import fs from "fs";
import path from "path";

import { TicketFactura, type TicketFacturaData } from "@/components/facturacion/print/TicketFactura";
import type { EmisorTicket } from "@/components/facturacion/print/ticketShared";
import { resolverBorradorInicial } from "@/lib/facturacion/borradores/formulario";
import { listarDocumentos } from "@/lib/facturacion/documentos/listar";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const emisor: EmisorTicket = {
  nombreComercial: "SUPER GEEK",
  razonSocial: "SUPER GEEK",
  ruc: "1003710272001",
  dirMatriz: "Ibarra",
};

const facturaBase: TicketFacturaData = {
  numeroFactura: "001-002-000000709",
  estado: "AUTORIZADO",
  fechaEmision: "2026-09-05",
  clienteNombre: "Cliente Prueba",
  clienteIdentificacion: "1001471976",
  subtotal: 10,
  iva: 1.5,
  total: 11.5,
  items: [
    {
      codigo: "SKU-1",
      descripcion: "Producto de prueba",
      cantidad: 1,
      precioUnitario: 10,
      descuento: 0,
      ivaPct: 15,
      total: 10,
    },
  ],
  formaPago: "01",
  claveAcceso: "0509202601100371027200120010020000007091234567811",
  numeroAutorizacion: "0509202601100371027200120010020000007091234567811",
  fechaAutorizacion: "2026-09-05T18:30:00.000Z",
  ambiente: "PRODUCCIÓN",
};

function collectText(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join("");
  if (typeof node === "object" && "props" in node) {
    const props = (node as { props?: { children?: unknown } }).props;
    return collectText(props?.children);
  }
  return "";
}

function renderTicket(factura: TicketFacturaData): string {
  return collectText(TicketFactura({ emisor, factura }));
}

const fetchOriginal = global.fetch;
const envOriginal = {
  AIRTABLE_API_KEY: process.env.AIRTABLE_API_KEY,
  AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID,
};

(async () => {
  // a) El ticket 80 mm de un borrador grita que no es comprobante tributario.
  {
    const html = renderTicket({
      ...facturaBase,
      numeroFactura: "",
      estado: "BORRADOR",
      claveAcceso: "",
      numeroAutorizacion: "",
      fechaAutorizacion: "",
    });
    assert(html.includes("ESTO ES UN BORRADOR"), "Ticket BORRADOR: contiene la leyenda principal");
    assert(
      html.includes("NO ES UN COMPROBANTE VÁLIDO Y NO TIENE VALIDEZ TRIBUTARIA"),
      "Ticket BORRADOR: aclara que no tiene validez tributaria"
    );
    assert(
      html.includes("aviso-borrador") && html.includes("border: 3px solid #000") && html.includes("font-size: 18px"),
      "Ticket BORRADOR: usa contraste/tamaño, no solo color"
    );
  }

  {
    const html = renderTicket(facturaBase);
    assert(!html.includes("ESTO ES UN BORRADOR"), "Ticket emitido: no muestra la leyenda de borrador");
  }

  // b/c) FacturacionForm respeta la precedencia prop > search param, y conserva
  // el comportamiento por URL cuando la prop no viene.
  {
    assert(
      resolverBorradorInicial("recPROP", "recURL") === "recPROP",
      "FacturacionForm: la prop borradorId tiene precedencia sobre el search param"
    );
    assert(
      resolverBorradorInicial(undefined, "recURL") === "recURL",
      "FacturacionForm: sin prop sigue leyendo ?borrador=... desde la URL"
    );

    const form = fs.readFileSync(path.join(process.cwd(), "components/facturacion/FacturacionForm.tsx"), "utf8");
    const modal = fs.readFileSync(path.join(process.cwd(), "components/facturacion/NuevoDocumentoModal.tsx"), "utf8");
    const docs = fs.readFileSync(path.join(process.cwd(), "components/facturacion/DocumentosFacturacion.tsx"), "utf8");

    assert(
      form.includes('resolverBorradorInicial(borradorIdProp, searchParams.get("borrador"))'),
      "FacturacionForm: usa la resolucion prop/URL al cargar borrador"
    );
    assert(
      modal.includes("borradorId={borradorId ?? null}") && modal.includes("onEmisionExitosa={onClose}"),
      "NuevoDocumentoModal: pasa borradorId y reutiliza onClose tras emision exitosa"
    );
    assert(
      docs.includes("onAbrirBorrador(doc.recordId)") &&
        docs.includes('setNuevoDocumento({ tipoInicial: "factura", borradorId: recordId })') &&
        !docs.includes("/facturacion/nueva?borrador="),
      "DocumentosFacturacion: Abrir para facturar abre el modal, no navega"
    );
  }

  // d/e/f) /facturacion oculta borradores consumidos, pero deja vivos los
  // borradores limpios y no toca facturas emitidas.
  {
    process.env.AIRTABLE_API_KEY = "fake-token-para-test";
    process.env.AIRTABLE_BASE_ID = "appFAKEBASE0001";

    let facturasPidioBorradorConsumido = false;

    global.fetch = (async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = (init?.method ?? "GET").toUpperCase();
      const segments = decodeURIComponent(url.pathname).split("/").filter(Boolean);
      const table = segments[2];

      if (method !== "GET") return json({ error: "metodo inesperado" }, 500);

      if (table === "Facturas Electrónicas") {
        facturasPidioBorradorConsumido = url.searchParams.getAll("fields[]").includes("Borrador Consumido");
        return json({
          records: [
            {
              id: "recBORRADORCONSUMIDO",
              fields: {
                "Número de Factura": "",
                "Estado": "BORRADOR",
                "Ambiente": "PRODUCCIÓN",
                "Fecha de Emisión": "2026-09-05",
                "Cliente - Nombre": "Borrador Consumido",
                "Cliente - Identificación": "1001471976",
                "Subtotal": 20,
                "IVA": 3,
                "Total": 23,
                "Borrador Consumido": true,
              },
            },
            {
              id: "recBORRADORLIMPIO",
              fields: {
                "Número de Factura": "",
                "Estado": "BORRADOR",
                "Ambiente": "PRODUCCIÓN",
                "Fecha de Emisión": "2026-09-05",
                "Cliente - Nombre": "Borrador Limpio",
                "Cliente - Identificación": "1003063268",
                "Subtotal": 30,
                "IVA": 4.5,
                "Total": 34.5,
                "Borrador Consumido": false,
              },
            },
            {
              id: "recEMITIDA",
              fields: {
                "Clave de Acceso": "clave",
                "Número de Factura": "001-002-000000709",
                "Estado": "AUTORIZADO",
                "Ambiente": "PRODUCCIÓN",
                "Fecha de Emisión": "2026-09-05",
                "Cliente - Nombre": "Factura Emitida",
                "Cliente - Identificación": "1003710272",
                "Subtotal": 40,
                "IVA": 6,
                "Total": 46,
                "Borrador Consumido": true,
              },
            },
          ],
        });
      }

      if (table === "Recibos") return json({ records: [] });

      return json({ error: `tabla no esperada: ${table}` }, 500);
    }) as typeof fetch;

    const { documentos } = await listarDocumentos({ grupo: "ventas", incluirPruebas: true });
    const ids = documentos.map((d) => d.recordId);

    assert(facturasPidioBorradorConsumido, "Listado: pide el campo Borrador Consumido a Airtable");
    assert(!ids.includes("recBORRADORCONSUMIDO"), "Listado: excluye un borrador consumido");
    assert(ids.includes("recBORRADORLIMPIO"), "Listado: incluye un borrador no consumido");
    assert(ids.includes("recEMITIDA"), "Listado: incluye facturas emitidas aunque tengan Borrador Consumido marcado");
  }

  global.fetch = fetchOriginal;
  if (envOriginal.AIRTABLE_API_KEY === undefined) delete process.env.AIRTABLE_API_KEY;
  else process.env.AIRTABLE_API_KEY = envOriginal.AIRTABLE_API_KEY;
  if (envOriginal.AIRTABLE_BASE_ID === undefined) delete process.env.AIRTABLE_BASE_ID;
  else process.env.AIRTABLE_BASE_ID = envOriginal.AIRTABLE_BASE_ID;

  if (fallos > 0) {
    console.error(`\n❌ borradores-ui.test.ts — ${fallos} asercion(es) fallida(s)`);
    process.exit(1);
  }
  console.log("\n✅ borradores-ui.test.ts — todos los asserts pasaron");
})();
