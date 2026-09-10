import { systemShippingV2Access } from "../access";
import { updateShippingV2Packing } from "../airtable";
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

type Fixture = {
  state: AirtableDoubleState;
  providerId: string;
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

function setupFixture(): Fixture {
  activarEnvFalso();
  const state = crearEstadoDouble();
  registrarTablaDouble(state, SHIPPING_V2_TABLES.proveedores);
  registrarTablaDouble(state, SHIPPING_V2_TABLES.items);
  registrarTablaDouble(state, SHIPPING_V2_TABLES.packings);
  registrarTablaDouble(state, SHIPPING_V2_TABLES.eventos);

  const providerId = crearRegistroDouble(state, SHIPPING_V2_TABLES.proveedores, {
    [F_PROV.proveedorId]: "PROV-REGLA",
    [F_PROV.nombre]: "Proveedor regla",
    [F_PROV.estado]: "Activo",
    [F_PROV.tipoProveedor]: "USA",
  });

  global.fetch = construirFetchDouble(state) as typeof fetch;
  return { state, providerId };
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

function crearPacking(fixture: Fixture, estado: string) {
  const itemId = crearRegistroDouble(fixture.state, SHIPPING_V2_TABLES.items, {
    [F_ITEM.sku]: `ITEM-${estado}`,
    [F_ITEM.nombre]: `Item ${estado}`,
    [F_ITEM.tipoOperacion]: "Compra a proveedor",
    [F_ITEM.tipoItem]: "Equipo completo",
    [F_ITEM.categoria]: "Laptop",
    [F_ITEM.estadoItem]: estado,
    [F_ITEM.proveedorCompra]: [fixture.providerId],
    [F_ITEM.requierePago]: false,
    [F_ITEM.requierePacking]: true,
    [F_ITEM.modoLogistico]: "Asignar a packing existente",
    [F_ITEM.afectaInventario]: true,
    [F_ITEM.cantidad]: 1,
    [F_ITEM.unidad]: "Unidad",
    [F_ITEM.costoProveedor]: 100,
    [F_ITEM.fechaRegistro]: "2026-09-10T00:00:00.000Z",
  });

  return crearRegistroDouble(fixture.state, SHIPPING_V2_TABLES.packings, {
    [F_PACKING.packingId]: `PACK-${estado}`,
    [F_PACKING.nombre]: `Packing ${estado}`,
    [F_PACKING.tipo]: "Caja",
    [F_PACKING.estado]: estado,
    [F_PACKING.proveedorResponsable]: [fixture.providerId],
    [F_PACKING.itemsIncluidos]: [itemId],
    [F_PACKING.flete]: 10,
    [F_PACKING.arancel]: 0,
    [F_PACKING.otrosCostos]: 0,
    [F_PACKING.reglaDistribucionCostos]: "No definida",
    [F_PACKING.fechaCreacion]: "2026-09-10T00:00:00.000Z",
  });
}

async function testReglaEditableEnRecibido() {
  await withFixture(async (fixture) => {
    const packingId = crearPacking(fixture, "Recibido");

    const packing = await updateShippingV2Packing(
      packingId,
      { reglaDistribucionCostos: "Por cantidad" },
      { actualizadoPor: "Admin Test", access: systemShippingV2Access() }
    );

    assert(packing.reglaDistribucionCostos === "Por cantidad", "Recibido permite completar Regla distribución");
  });
}

async function testReglaEditableEnRevision() {
  await withFixture(async (fixture) => {
    const packingId = crearPacking(fixture, "En revisión");

    const packing = await updateShippingV2Packing(
      packingId,
      { reglaDistribucionCostos: "Por costo del item" },
      { actualizadoPor: "Admin Test", access: systemShippingV2Access() }
    );

    assert(packing.reglaDistribucionCostos === "Por costo del item", "En revisión permite completar Regla distribución");
  });
}

async function testRevisionNoAbreCostosCompletos() {
  await withFixture(async (fixture) => {
    const packingId = crearPacking(fixture, "En revisión");

    await assertRejects(
      () => updateShippingV2Packing(
        packingId,
        { flete: 25 },
        { actualizadoPor: "Admin Test", access: systemShippingV2Access() }
      ),
      "No se puede editar flete cuando el packing está en estado En revisión",
      "En revisión no abre flete/arancel/otros por accidente"
    );
  });
}

async function main() {
  await testReglaEditableEnRecibido();
  await testReglaEditableEnRevision();
  await testRevisionNoAbreCostosCompletos();

  if (fallos > 0) {
    console.error(`Fallaron ${fallos} comprobaciones.`);
    process.exit(1);
  }

  console.log("Contrato de regla de distribución de packing: OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
