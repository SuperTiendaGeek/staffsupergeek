import type { ShippingV2AccessContext } from "@/types/shipping-v2";
import { NO_SHIPPING_V2_PERMISSIONS, systemShippingV2Access } from "../access";
import { attachShippingV2PackingInvoice } from "../airtable";
import {
  SHIPPING_V2_ITEM_FIELDS,
  SHIPPING_V2_PACKING_FIELDS,
  SHIPPING_V2_PROVIDER_FIELDS,
  SHIPPING_V2_TABLES,
} from "../schema.generated";
import {
  activarEnvFalso,
  limpiarEnvFalso,
  construirFetchDouble,
  crearEstadoDouble,
  crearRegistroDouble,
  registrarTablaDouble,
  type AirtableDoubleState,
} from "../../finanzas/__tests__/_airtableDouble";

const F_ITEM = SHIPPING_V2_ITEM_FIELDS;
const F_PACKING = SHIPPING_V2_PACKING_FIELDS;
const F_PROV = SHIPPING_V2_PROVIDER_FIELDS;
const PACKING_INVOICE_FIELD = "Factura";

type Fixture = {
  state: AirtableDoubleState;
  providerId: string;
  packingId: string;
  uploads: number;
};

let fallos = 0;
const fetchOriginal = global.fetch;

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

async function assertRejects(fn: () => unknown | Promise<unknown>, fragmento: string, msg: string) {
  try {
    await fn();
    assert(false, `${msg} -> debía fallar`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(
      message.includes(fragmento),
      message.includes(fragmento) ? `${msg} -> ${fragmento}` : `${msg} -> esperado: ${fragmento}; recibido: ${message}`
    );
  }
}

function jsonResponse(status: number, body: unknown): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    text: async () => text,
    json: async () => JSON.parse(text),
  } as Response;
}

function setupFixture(): Fixture {
  activarEnvFalso();
  const state = crearEstadoDouble();
  registrarTablaDouble(state, SHIPPING_V2_TABLES.proveedores);
  registrarTablaDouble(state, SHIPPING_V2_TABLES.items);
  registrarTablaDouble(state, SHIPPING_V2_TABLES.packings);
  registrarTablaDouble(state, SHIPPING_V2_TABLES.eventos);

  const providerId = crearRegistroDouble(state, SHIPPING_V2_TABLES.proveedores, {
    [F_PROV.proveedorId]: "ROBERTO-USA",
    [F_PROV.nombre]: "Roberto-USA",
    [F_PROV.estado]: "Activo",
    [F_PROV.tipoProveedor]: "USA",
  });
  const itemId = crearRegistroDouble(state, SHIPPING_V2_TABLES.items, {
    [F_ITEM.sku]: "INV-ITEM-001",
    [F_ITEM.nombre]: "Item invoice",
    [F_ITEM.tipoOperacion]: "Compra a proveedor",
    [F_ITEM.tipoItem]: "Equipo completo",
    [F_ITEM.categoria]: "Laptop",
    [F_ITEM.estadoItem]: "En packing",
    [F_ITEM.proveedorCompra]: [providerId],
    [F_ITEM.requierePago]: false,
    [F_ITEM.requierePacking]: true,
    [F_ITEM.modoLogistico]: "Asignar a packing existente",
    [F_ITEM.afectaInventario]: true,
    [F_ITEM.cantidad]: 1,
    [F_ITEM.unidad]: "Unidad",
    [F_ITEM.costoProveedor]: 50,
    [F_ITEM.fechaRegistro]: "2026-07-31T00:00:00.000Z",
  });
  const packingId = crearRegistroDouble(state, SHIPPING_V2_TABLES.packings, {
    [F_PACKING.packingId]: "PACK-INVOICE-001",
    [F_PACKING.nombre]: "Packing invoice",
    [F_PACKING.tipo]: "Caja",
    [F_PACKING.estado]: "Cerrado",
    [F_PACKING.proveedorResponsable]: [providerId],
    [F_PACKING.itemsIncluidos]: [itemId],
    [F_PACKING.fechaCreacion]: "2026-07-31T00:00:00.000Z",
  });

  const doubleFetch = construirFetchDouble(state);
  const fixture: Fixture = { state, providerId, packingId, uploads: 0 };

  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.hostname === "content.airtable.com" && method === "POST" && url.pathname.endsWith("/uploadAttachment")) {
      fixture.uploads++;
      const segments = decodeURIComponent(url.pathname).split("/").filter(Boolean);
      const recordId = segments[2] ?? "";
      const packing = state.otras.get(SHIPPING_V2_TABLES.packings)?.get(recordId);
      if (!packing) return jsonResponse(404, "Record not found");
      packing.fields[PACKING_INVOICE_FIELD] = [
        {
          id: "attINVOICE",
          url: "https://example.test/invoice.pdf",
          filename: "invoice.pdf",
          type: "application/pdf",
        },
      ];
      return jsonResponse(200, {});
    }
    return doubleFetch(String(input), init);
  }) as typeof fetch;

  return fixture;
}

function teardownFixture() {
  global.fetch = fetchOriginal;
  limpiarEnvFalso();
}

async function withFixture(run: (fixture: Fixture) => Promise<void> | void) {
  const fixture = setupFixture();
  try {
    await run(fixture);
  } finally {
    teardownFixture();
  }
}

function providerAccess(providerId: string): ShippingV2AccessContext {
  return {
    isAdmin: false,
    mode: "provider",
    providerId,
    providerCode: "ROBERTO-USA",
    providerName: "Roberto-USA",
    permissions: {
      ...NO_SHIPPING_V2_PERMISSIONS,
      canViewPackings: true,
      canViewInvoice: true,
    },
  };
}

async function testAdminPuedeAdjuntarYReleerFactura() {
  await withFixture(async (fixture) => {
    const result = await attachShippingV2PackingInvoice({
      packingId: fixture.packingId,
      filename: "invoice.pdf",
      pdfBytes: new Uint8Array([1, 2, 3]),
      registradoPor: "Admin Test",
      invoiceNumber: "INV-TEST",
      access: systemShippingV2Access(),
    });

    assert(fixture.uploads === 1, "El test usa upload simulado, no Airtable real");
    assert(result.packing.id === fixture.packingId, "Admin genera factura y relee el Packing actualizado");
    assert(result.attachment?.filename === "invoice.pdf", "La factura adjunta queda disponible en la respuesta");
  });
}

async function testProveedorPuedeVerPeroNoGenerarFactura() {
  await withFixture(async (fixture) => {
    await assertRejects(
      () => attachShippingV2PackingInvoice({
        packingId: fixture.packingId,
        filename: "invoice.pdf",
        pdfBytes: new Uint8Array([1, 2, 3]),
        registradoPor: "Roberto",
        invoiceNumber: "INV-TEST",
        access: providerAccess(fixture.providerId),
      }),
      "No tienes permiso para generar facturas de packing",
      "Proveedor con canViewInvoice no puede generar factura"
    );
    assert(fixture.uploads === 0, "Proveedor sin permiso no llega a subir factura");
  });
}

async function main() {
  await testAdminPuedeAdjuntarYReleerFactura();
  await testProveedorPuedeVerPeroNoGenerarFactura();

  if (fallos > 0) {
    console.error(`Fallaron ${fallos} comprobaciones.`);
    process.exit(1);
  }

  console.log("Contrato de acceso para factura proveedor en Packings V2: OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
