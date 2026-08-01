import { systemShippingV2Access } from "../access";
import {
  getAirtableRateLimitRetryDelayMs,
  getShippingV2PackingById,
  getShippingV2Proveedores,
  transitionShippingV2PackingStatus,
} from "../airtable";
import { formatShippingV2PackingItemsUnitsSummary } from "../packing-calculations";
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

type AirtableCall = {
  method: string;
  tableName: string;
  recordId: string;
  recordCount: number | null;
  url: string;
};

type Fixture = {
  state: AirtableDoubleState;
  providerId: string;
  calls: AirtableCall[];
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

function assertMoney(actual: number | null | undefined, expected: number, msg: string) {
  assert(actual === expected, `${msg} (${actual} === ${expected})`);
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

function parseAirtableCall(input: string | URL, init?: RequestInit): AirtableCall {
  const url = new URL(String(input));
  const segments = decodeURIComponent(url.pathname).split("/").filter(Boolean);
  let recordCount: number | null = null;
  if (init?.body) {
    try {
      const body = JSON.parse(String(init.body)) as { records?: unknown[] };
      recordCount = Array.isArray(body.records) ? body.records.length : null;
    } catch {
      recordCount = null;
    }
  }
  return {
    method: (init?.method ?? "GET").toUpperCase(),
    tableName: segments[2] ?? "",
    recordId: segments[3] ?? "",
    recordCount,
    url: url.toString(),
  };
}

function setupFixture(): Fixture {
  activarEnvFalso();
  const state = crearEstadoDouble();
  registrarTablaDouble(state, SHIPPING_V2_TABLES.proveedores);
  registrarTablaDouble(state, SHIPPING_V2_TABLES.items);
  registrarTablaDouble(state, SHIPPING_V2_TABLES.packings);
  registrarTablaDouble(state, SHIPPING_V2_TABLES.eventos);

  const providerId = crearRegistroDouble(state, SHIPPING_V2_TABLES.proveedores, {
    [F_PROV.proveedorId]: "PROV-PACK",
    [F_PROV.nombre]: "Proveedor Packing",
    [F_PROV.estado]: "Activo",
    [F_PROV.tipoProveedor]: "USA",
  });

  const doubleFetch = construirFetchDouble(state);
  const calls: AirtableCall[] = [];
  global.fetch = (async (input: string | URL, init?: RequestInit) => {
    calls.push(parseAirtableCall(input, init));
    return doubleFetch(input, init);
  }) as typeof fetch;

  return { state, providerId, calls };
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

function createItemRecord(
  fixture: Fixture,
  index: number,
  overrides: Record<string, unknown> = {}
): string {
  return crearRegistroDouble(fixture.state, SHIPPING_V2_TABLES.items, {
    [F_ITEM.sku]: `PACK-ITEM-${String(index).padStart(3, "0")}`,
    [F_ITEM.nombre]: `Item packing ${index}`,
    [F_ITEM.tipoOperacion]: "Compra a proveedor",
    [F_ITEM.tipoItem]: "Equipo completo",
    [F_ITEM.categoria]: "Laptop",
    [F_ITEM.estadoItem]: "En packing",
    [F_ITEM.proveedorCompra]: [fixture.providerId],
    [F_ITEM.requierePago]: false,
    [F_ITEM.requierePacking]: true,
    [F_ITEM.packingRelacionado]: [],
    [F_ITEM.modoLogistico]: "Asignar a packing existente",
    [F_ITEM.afectaInventario]: true,
    [F_ITEM.disponibleVenta]: false,
    [F_ITEM.reservado]: false,
    [F_ITEM.cantidad]: 1,
    [F_ITEM.unidad]: "Unidad",
    [F_ITEM.costoProveedor]: 10,
    [F_ITEM.esRegalo]: false,
    [F_ITEM.fechaRegistro]: "2026-07-31T00:00:00.000Z",
    ...overrides,
  });
}

function createPackingRecord(fixture: Fixture, itemIds: string[], overrides: Record<string, unknown> = {}) {
  return crearRegistroDouble(fixture.state, SHIPPING_V2_TABLES.packings, {
    [F_PACKING.packingId]: "PACK-RATE-001",
    [F_PACKING.nombre]: "Packing rate limit",
    [F_PACKING.tipo]: "Caja",
    [F_PACKING.estado]: "En Proceso",
    [F_PACKING.proveedorResponsable]: [fixture.providerId],
    [F_PACKING.itemsIncluidos]: itemIds,
    [F_PACKING.reglaDistribucionCostos]: "Por cantidad",
    [F_PACKING.fechaCreacion]: "2026-07-31T00:00:00.000Z",
    ...overrides,
  });
}

function itemRecordGetCount(calls: AirtableCall[]) {
  return calls.filter((call) =>
    call.method === "GET" &&
    call.tableName === SHIPPING_V2_TABLES.items &&
    Boolean(call.recordId)
  ).length;
}

function itemListGetCount(calls: AirtableCall[]) {
  return calls.filter((call) =>
    call.method === "GET" &&
    call.tableName === SHIPPING_V2_TABLES.items &&
    !call.recordId
  ).length;
}

function writeCount(calls: AirtableCall[]) {
  return calls.filter((call) => call.method !== "GET").length;
}

function itemPatchCalls(calls: AirtableCall[]) {
  return calls.filter((call) => call.method === "PATCH" && call.tableName === SHIPPING_V2_TABLES.items);
}

function response(status: number, body: unknown, headers?: Record<string, string>): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    text: async () => text,
    json: async () => JSON.parse(text),
  } as Response;
}

async function withFakeFetch(fetchImpl: typeof fetch, run: () => Promise<void> | void) {
  activarEnvFalso();
  global.fetch = fetchImpl;
  try {
    await run();
  } finally {
    global.fetch = fetchOriginal;
    limpiarEnvFalso();
  }
}

async function testPackingCargaUnItemAgrupado() {
  await withFixture(async (fixture) => {
    const itemId = createItemRecord(fixture, 1, {
      [F_ITEM.cantidad]: 2,
      [F_ITEM.costoProveedor]: 10,
    });
    const packingId = createPackingRecord(fixture, [itemId]);

    const packing = await getShippingV2PackingById(packingId, systemShippingV2Access(), {
      includeAiName: false,
    });

    assert(itemRecordGetCount(fixture.calls) === 0, "Packing con 1 item no hace GET individual a Shipping Items");
    assert(itemListGetCount(fixture.calls) === 1, "Packing con 1 item usa una consulta agrupada a Shipping Items");
    assert(packing.items.length === 1, "Packing devuelve el item incluido");
    assert(packing.items[0].cantidad === 2, "El item conserva Cantidad 2");
    assertMoney(packing.items[0].costoProveedor, 10, "El item conserva Costo proveedor unitario");
    assertMoney(packing.items[0].subtotalProveedorPacking, 20, "Subtotal proveedor = Cantidad x costo unitario");
    assert(packing.referenciasIncluidas === 1, "Ítems incluidos cuenta registros");
    assert(packing.unidadesTotales === 2, "Unidades totales suma Cantidad");
    assert(
      formatShippingV2PackingItemsUnitsSummary({
        referenciasIncluidas: packing.referenciasIncluidas,
        unidadesTotales: packing.unidadesTotales ?? 0,
      }) === "1 ítem · 2 unidades",
      "Resumen visual conserva ítems y unidades"
    );
    assert(writeCount(fixture.calls) === 0, "Cargar packing no escribe en Airtable");
  });
}

async function testPackingCargaVeinteItemsAgrupados() {
  await withFixture(async (fixture) => {
    const itemIds = Array.from({ length: 20 }, (_, index) =>
      createItemRecord(fixture, index + 1, {
        [F_ITEM.cantidad]: index + 1,
        [F_ITEM.costoProveedor]: 2,
      })
    );
    const packingId = createPackingRecord(fixture, itemIds);

    const packing = await getShippingV2PackingById(packingId, systemShippingV2Access(), {
      includeAiName: false,
    });

    assert(itemRecordGetCount(fixture.calls) === 0, "Packing con 20 items no dispara 20 GET individuales");
    assert(itemListGetCount(fixture.calls) === 1, "Packing con 20 items usa una sola consulta agrupada");
    assert(
      packing.items.map((item) => item.id).join(",") === itemIds.join(","),
      "La carga agrupada conserva el orden de los Items del Packing"
    );
    assert(packing.items[19].cantidad === 20, "El item 20 conserva su Cantidad");
    assertMoney(packing.items[19].costoProveedor, 2, "El item 20 conserva su costo unitario");
    assertMoney(packing.items[19].subtotalProveedorPacking, 40, "El item 20 conserva subtotal Cantidad x costo");
    assert(packing.referenciasIncluidas === 20, "Ítems incluidos cuenta 20 registros");
    assert(packing.unidadesTotales === 210, "Unidades totales suma 1..20");
    assert(writeCount(fixture.calls) === 0, "Cargar packing con 20 items no escribe en Airtable");
  });
}

async function testPackingActualizaCuarentaYUnItemsEnLotes() {
  await withFixture(async (fixture) => {
    const itemIds = Array.from({ length: 41 }, (_, index) =>
      createItemRecord(fixture, index + 1, {
        [F_ITEM.cantidad]: 1,
        [F_ITEM.costoProveedor]: 2,
      })
    );
    const packingId = createPackingRecord(fixture, itemIds, {
      [F_PACKING.estado]: "Cerrado",
    });

    const packing = await transitionShippingV2PackingStatus(packingId, {
      action: "mark-in-transit",
      actor: "Admin Test",
      access: systemShippingV2Access(),
    });
    const patchCalls = itemPatchCalls(fixture.calls);

    assert(packing.estado === "En tránsito", "Packing con 41 items puede marcarse en tránsito");
    assert(patchCalls.length === 2, "Los 41 items se actualizan en 2 PATCH a Shipping Items");
    assert(
      patchCalls.map((call) => call.recordCount).join(",") === "25,16",
      "Los lotes respetan el máximo de 25 records de Airtable"
    );
    assert(
      patchCalls.every((call) => (call.recordCount ?? 0) <= 25),
      "Ningún PATCH de Shipping Items supera 25 records"
    );
    assert(
      itemIds.every((itemId) => fixture.state.otras.get(SHIPPING_V2_TABLES.items)?.get(itemId)?.fields[F_ITEM.estadoItem] === "En tránsito"),
      "Todos los items quedan en tránsito"
    );
  });
}

async function testRateLimitReintentaYLuegoResuelve() {
  let attempts = 0;
  await withFakeFetch((async () => {
    attempts++;
    if (attempts === 1) return response(429, "RATE_LIMIT_REACHED", { "Retry-After": "0" });
    return response(200, { records: [] });
  }) as typeof fetch, async () => {
    await getShippingV2Proveedores();
  });

  assert(attempts === 2, "Un 429 se reintenta de forma limitada y resuelve si Airtable responde");
}

function testRateLimitEsperaProgresiva() {
  const retryAfter = getAirtableRateLimitRetryDelayMs(new Headers({ "Retry-After": "2" }), 1);
  const primerReintento = getAirtableRateLimitRetryDelayMs(new Headers(), 0);
  const segundoReintento = getAirtableRateLimitRetryDelayMs(new Headers(), 1);
  assert(retryAfter === 2000, "Respeta Retry-After cuando Airtable lo devuelve");
  assert(segundoReintento > primerReintento, "Un segundo 429 aumenta la espera progresiva");
}

async function testErrorNoRateLimitNoReintenta() {
  let attempts = 0;
  await withFakeFetch((async () => {
    attempts++;
    return response(401, "NO_AUTH");
  }) as typeof fetch, async () => {
    await assertRejects(() => getShippingV2Proveedores(), "401", "Un 401 no se reintenta como rate limit");
  });

  assert(attempts === 1, "Un 401 hace un solo intento");
}

async function testRateLimitAgotaIntentosConMensajeClaro() {
  let attempts = 0;
  await withFakeFetch((async () => {
    attempts++;
    return response(429, "RATE_LIMIT_REACHED", { "Retry-After": "0" });
  }) as typeof fetch, async () => {
    await assertRejects(
      () => getShippingV2Proveedores(),
      "Se agotaron 3 reintentos por rate limit",
      "Después del máximo de intentos se devuelve un error claro"
    );
  });

  assert(attempts === 4, "El rate limit se intenta una vez inicial más 3 reintentos");
}

async function main() {
  await testPackingCargaUnItemAgrupado();
  await testPackingCargaVeinteItemsAgrupados();
  await testPackingActualizaCuarentaYUnItemsEnLotes();
  await testRateLimitReintentaYLuegoResuelve();
  testRateLimitEsperaProgresiva();
  await testErrorNoRateLimitNoReintenta();
  await testRateLimitAgotaIntentosConMensajeClaro();

  if (fallos > 0) {
    console.error(`Fallaron ${fallos} comprobaciones.`);
    process.exit(1);
  }

  console.log("Contrato de carga agrupada y 429 en Packings V2: OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
