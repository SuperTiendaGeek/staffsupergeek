// Integración del reparto de costos con Airtable (doble en memoria):
// qué se guarda en cada Item cuando cambia el packing. El cálculo en sí está
// probado en packing-reparto.test.ts.
import { systemShippingV2Access } from "../access";
import {
  recalcularCostosShippingV2Packing,
  removeItemFromShippingV2Packing,
  transitionShippingV2PackingStatus,
  updateShippingV2Packing,
} from "../airtable";
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
const ADMIN = { actualizadoPor: "Admin Test", access: systemShippingV2Access() };

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

type Fixture = { state: AirtableDoubleState; packingId: string; otrId: string; repId: string };

function campos(state: AirtableDoubleState, id: string) {
  return state.otras.get(SHIPPING_V2_TABLES.items)!.get(id)!.fields;
}

function setup(estado: string, flete: number | null = 55.8): Fixture {
  activarEnvFalso();
  const state = crearEstadoDouble();
  for (const tabla of [SHIPPING_V2_TABLES.proveedores, SHIPPING_V2_TABLES.items, SHIPPING_V2_TABLES.packings, SHIPPING_V2_TABLES.eventos]) {
    registrarTablaDouble(state, tabla);
  }
  const providerId = crearRegistroDouble(state, SHIPPING_V2_TABLES.proveedores, {
    [F_PROV.proveedorId]: "PROV-REPARTO",
    [F_PROV.nombre]: "Proveedor reparto",
    [F_PROV.estado]: "Activo",
    [F_PROV.tipoProveedor]: "USA",
  });
  const item = (sku: string, cantidad: number, costo: number) => crearRegistroDouble(state, SHIPPING_V2_TABLES.items, {
    [F_ITEM.sku]: sku,
    [F_ITEM.nombre]: sku,
    [F_ITEM.tipoOperacion]: "Compra a proveedor",
    [F_ITEM.tipoItem]: "Accesorio",
    [F_ITEM.categoria]: "Accesorios",
    [F_ITEM.estadoItem]: estado,
    [F_ITEM.proveedorCompra]: [providerId],
    [F_ITEM.requierePacking]: true,
    [F_ITEM.modoLogistico]: "Asignar a packing existente",
    [F_ITEM.cantidad]: cantidad,
    [F_ITEM.costoProveedor]: costo,
  });
  const otrId = item("OTR-000187", 8, 10);
  const repId = item("REP-000041", 1, 35.53);
  const packingId = crearRegistroDouble(state, SHIPPING_V2_TABLES.packings, {
    [F_PACKING.packingId]: "PK-20260928-97012",
    [F_PACKING.tipo]: "Caja",
    [F_PACKING.estado]: estado,
    [F_PACKING.proveedorResponsable]: [providerId],
    [F_PACKING.itemsIncluidos]: [otrId, repId],
    [F_PACKING.flete]: flete,
    [F_PACKING.reglaDistribucionCostos]: "Por costo del item",
  });
  for (const id of [otrId, repId]) campos(state, id)["Shipping Packings"] = [packingId];
  global.fetch = construirFetchDouble(state) as typeof fetch;
  return { state, packingId, otrId, repId };
}

async function conFixture(estado: string, run: (f: Fixture) => Promise<void>, flete: number | null = 55.8) {
  const f = setup(estado, flete);
  try {
    await run(f);
  } finally {
    global.fetch = fetchOriginal;
    limpiarEnvFalso();
  }
}

async function testEditarFleteReparte() {
  await conFixture("En tránsito", async ({ state, packingId, otrId, repId }) => {
    await updateShippingV2Packing(packingId, { flete: 55.8 }, ADMIN);
    const otr = campos(state, otrId);
    const rep = campos(state, repId);
    assert(otr[F_ITEM.fleteAsignadoRegistro] === 38.64, "Editar flete guarda 38,64 en OTR-000187");
    assert(rep[F_ITEM.fleteAsignadoRegistro] === 17.16, "…y 17,16 en REP-000041");
    assert(otr[F_ITEM.unidadesEnPacking] === 8 && rep[F_ITEM.unidadesEnPacking] === 1, "Guarda las unidades que viajan (8 y 1)");
  }, 0);
}

async function testVistaPreviaNoEscribe() {
  await conFixture("En tránsito", async ({ state, packingId, otrId }) => {
    const r = await recalcularCostosShippingV2Packing(packingId, { registradoPor: "Admin Test", vistaPrevia: true, access: systemShippingV2Access() });
    assert(r.estado === "vista-previa" && r.cambios.length === 2, "Vista previa lista los 2 cambios");
    assert(campos(state, otrId)[F_ITEM.fleteAsignadoRegistro] === undefined, "Vista previa no escribe nada");
    const aplicado = await recalcularCostosShippingV2Packing(packingId, { registradoPor: "Admin Test", access: systemShippingV2Access() });
    assert(aplicado.estado === "aplicado", "Aplicar escribe");
    const otraVez = await recalcularCostosShippingV2Packing(packingId, { registradoPor: "Admin Test", access: systemShippingV2Access() });
    assert(otraVez.estado === "sin-cambios", "Repetir el recálculo no vuelve a escribir (idempotente)");
  });
}

async function testRecibirFijaUnidades() {
  await conFixture("En tránsito", async ({ state, packingId, otrId }) => {
    await transitionShippingV2PackingStatus(packingId, { action: "mark-received", actor: "Admin Test", access: systemShippingV2Access() });
    assert(campos(state, otrId)[F_ITEM.unidadesEnPacking] === 8, "Al recibir quedan guardadas las 8 unidades");
    // Se venden 5: el stock baja, lo que viajó no.
    campos(state, otrId)[F_ITEM.cantidad] = 3;
    await updateShippingV2Packing(packingId, { flete: 55.8 }, ADMIN);
    assert(campos(state, otrId)[F_ITEM.fleteAsignadoRegistro] === 38.64, "Vender unidades no mueve el flete ya asignado");
    assert(campos(state, otrId)[F_ITEM.unidadesEnPacking] === 8, "…ni las unidades guardadas");
  });
}

async function testRecibidoAntiguoNoSeToca() {
  await conFixture("Recibido", async ({ state, packingId, otrId }) => {
    const r = await recalcularCostosShippingV2Packing(packingId, { registradoPor: "Admin Test", access: systemShippingV2Access() });
    assert(r.estado === "omitido", "Packing recibido sin unidades guardadas se omite");
    await updateShippingV2Packing(packingId, { flete: 60 }, ADMIN);
    assert(campos(state, otrId)[F_ITEM.fleteAsignadoRegistro] === undefined, "Editarlo no inventa un reparto (sigue con la fórmula heredada)");
  });
}

async function testQuitarItemLimpia() {
  await conFixture("En Proceso", async ({ state, packingId, otrId, repId }) => {
    await recalcularCostosShippingV2Packing(packingId, { registradoPor: "Admin Test", access: systemShippingV2Access() });
    await removeItemFromShippingV2Packing(packingId, repId, { registradoPor: "Admin Test", access: systemShippingV2Access() });
    assert(campos(state, repId)[F_ITEM.fleteAsignadoRegistro] === null, "El item quitado deja de cargar flete de esa caja");
    assert(campos(state, repId)[F_ITEM.unidadesEnPacking] === null, "…y pierde sus unidades en packing");
    assert(campos(state, otrId)[F_ITEM.fleteAsignadoRegistro] === 55.8, "El item que queda absorbe todo el flete");
  });
}

async function main() {
  await testEditarFleteReparte();
  await testVistaPreviaNoEscribe();
  await testRecibirFijaUnidades();
  await testRecibidoAntiguoNoSeToca();
  await testQuitarItemLimpia();
  if (fallos > 0) {
    console.error(`Fallaron ${fallos} comprobaciones.`);
    process.exit(1);
  }
  console.log("Reparto de costos de packing (integración): OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
