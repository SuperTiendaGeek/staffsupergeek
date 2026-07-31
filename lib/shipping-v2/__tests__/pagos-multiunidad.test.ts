import type {
  ShippingV2ItemWriteInput,
  ShippingV2Pago,
  ShippingV2PagoPendingItem,
} from "@/types/shipping-v2";
import { systemShippingV2Access } from "../access";
import {
  computePagosSummary,
  createShippingV2Pago,
  markShippingV2PagoAsPaid,
  updateShippingV2Item,
  updateShippingV2ItemField,
} from "../airtable";
import {
  SHIPPING_V2_ACTIVE_PAYMENT_ITEM_LOCK_MESSAGE,
  calculateShippingV2PaymentItemSubtotal,
  calculateShippingV2PaymentItemsTotal,
} from "../payment-calculations";
import {
  SHIPPING_V2_ITEM_FIELDS,
  SHIPPING_V2_PAYMENT_FIELDS,
  SHIPPING_V2_PROVIDER_FIELDS,
  SHIPPING_V2_TABLES,
} from "../schema.generated";
import {
  __resetCacheNombreTablaParaPruebas,
} from "../../finanzas/table-names";
import { MOVIMIENTOS_FIELDS } from "../../finanzas/movimientos-fields";
import {
  activarEnvFalso,
  limpiarEnvFalso,
  construirFetchDouble,
  crearCuentaDouble,
  crearEstadoDouble,
  crearRegistroDouble,
  registrarTablaDouble,
  type AirtableDoubleState,
} from "../../finanzas/__tests__/_airtableDouble";

const F_ITEM = SHIPPING_V2_ITEM_FIELDS;
const F_PAGO = SHIPPING_V2_PAYMENT_FIELDS;
const F_PROV = SHIPPING_V2_PROVIDER_FIELDS;

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

type Fixture = {
  state: AirtableDoubleState;
  providerId: string;
};

function setupFixture(): Fixture {
  activarEnvFalso();
  __resetCacheNombreTablaParaPruebas();
  const state = crearEstadoDouble("Movimientos Financieros");
  registrarTablaDouble(state, SHIPPING_V2_TABLES.proveedores);
  registrarTablaDouble(state, SHIPPING_V2_TABLES.items);
  registrarTablaDouble(state, SHIPPING_V2_TABLES.pagos);
  registrarTablaDouble(state, SHIPPING_V2_TABLES.eventos);
  crearCuentaDouble(state, { nombre: "Caja Registradora", saldoInicial: 1000, fechaCorte: "2026-01-01" });
  const providerId = crearRegistroDouble(state, SHIPPING_V2_TABLES.proveedores, {
    [F_PROV.proveedorId]: "PROV-TEST",
    [F_PROV.nombre]: "Proveedor Test",
    [F_PROV.estado]: "Activo",
    [F_PROV.tipoProveedor]: "Local",
  });
  global.fetch = construirFetchDouble(state) as typeof fetch;
  return { state, providerId };
}

function teardownFixture() {
  global.fetch = fetchOriginal;
  limpiarEnvFalso();
  __resetCacheNombreTablaParaPruebas();
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
  overrides: Record<string, unknown> = {}
): string {
  const suffix = String(fixture.state.nextId).padStart(3, "0");
  return crearRegistroDouble(fixture.state, SHIPPING_V2_TABLES.items, {
    [F_ITEM.sku]: `PAY-ITEM-${suffix}`,
    [F_ITEM.nombre]: `Item pago ${suffix}`,
    [F_ITEM.tipoOperacion]: "Compra a proveedor",
    [F_ITEM.tipoItem]: "Equipo completo",
    [F_ITEM.categoria]: "Laptop",
    [F_ITEM.estadoItem]: "Pendiente de pago",
    [F_ITEM.proveedorCompra]: [fixture.providerId],
    [F_ITEM.requierePago]: true,
    [F_ITEM.requierePacking]: false,
    [F_ITEM.modoLogistico]: "No aplica",
    [F_ITEM.afectaInventario]: true,
    [F_ITEM.disponibleVenta]: false,
    [F_ITEM.reservado]: false,
    [F_ITEM.cantidad]: 1,
    [F_ITEM.unidad]: "Unidad",
    [F_ITEM.costoProveedor]: 100,
    [F_ITEM.precioVentaFinal]: null,
    [F_ITEM.esRegalo]: false,
    [F_ITEM.fechaRegistro]: "2026-07-31T00:00:00.000Z",
    ...overrides,
  });
}

function createGiftRecord(
  fixture: Fixture,
  overrides: Record<string, unknown> = {}
): string {
  return createItemRecord(fixture, {
    [F_ITEM.sku]: `PAY-GIFT-${String(fixture.state.nextId).padStart(3, "0")}`,
    [F_ITEM.tipoOperacion]: "Regalo de proveedor",
    [F_ITEM.estadoItem]: "Registrado",
    [F_ITEM.requierePago]: false,
    [F_ITEM.costoProveedor]: null,
    [F_ITEM.esRegalo]: true,
    ...overrides,
  });
}

function createPagoRecord(
  fixture: Fixture,
  overrides: Record<string, unknown> = {}
): string {
  return crearRegistroDouble(fixture.state, SHIPPING_V2_TABLES.pagos, {
    [F_PAGO.pagoId]: `PAY-EXIST-${String(fixture.state.nextId).padStart(3, "0")}`,
    [F_PAGO.estadoPago]: "Pendiente",
    [F_PAGO.proveedor]: [fixture.providerId],
    [F_PAGO.itemsRelacionados]: [],
    [F_PAGO.regalosIncluidos]: [],
    [F_PAGO.totalAPagar]: 0,
    [F_PAGO.movimientosFinanzas]: [],
    [F_PAGO.estadoIntegracionFinanzas]: "Pendiente de generar",
    [F_PAGO.fechaCreacion]: "2026-07-31T00:00:00.000Z",
    ...overrides,
  });
}

function paymentSupportInput() {
  return {
    fechaPagoReal: "2026-07-31T12:00:00.000Z",
    metodoPago: "Efectivo",
    cuentaOrigen: "Caja",
    transaccionId: "TX-PAGO-MULTI",
  };
}

function itemWriteInput(fixture: Fixture, overrides: Partial<ShippingV2ItemWriteInput> = {}): ShippingV2ItemWriteInput {
  return {
    nombre: "Item pago editable",
    descripcion: "Test",
    tipoOperacion: "Compra a proveedor",
    tipoItem: "Equipo completo",
    categoria: "Laptop",
    estado: "Pendiente de pago",
    proveedorId: fixture.providerId,
    proveedorLogisticoId: "",
    requierePago: true,
    requierePacking: false,
    afectaInventario: true,
    disponibleVenta: false,
    reservado: false,
    sku: "PAY-EDIT-001",
    skuInterno: "PAY-EDIT-001",
    skuProveedor: "",
    modelo: "",
    marca: "",
    numeroSerie: "",
    condicion: "",
    cantidad: 1,
    unidad: "Unidad",
    costoProveedor: 100,
    precioVentaSugerido: null,
    precioVenta: null,
    ubicacionActual: "",
    origenFisicoActual: "",
    observacionesInternas: "",
    observacionVenta: "",
    esRepuesto: false,
    usoLocal: false,
    estadoRevision: "No aplica",
    estadoTriangulacion: "No aplica",
    estadoDespiece: "No aplica",
    modoLogistico: "No aplica",
    trackingDirecto: "",
    ...overrides,
  };
}

function pendingItem(overrides: Partial<ShippingV2PagoPendingItem> = {}): ShippingV2PagoPendingItem {
  return {
    id: "recPENDING",
    sku: "PENDING-1",
    skuProveedor: "",
    nombre: "Pendiente",
    tipoOperacion: "Compra a proveedor",
    tipoItem: "Equipo completo",
    categoria: "Laptop",
    estado: "Pendiente de pago",
    proveedorId: "recPROV",
    proveedorNombre: "Proveedor",
    proveedorLogisticoId: "",
    proveedorLogisticoNombre: "",
    requierePago: true,
    costoProveedor: 100,
    cantidad: 1,
    esRegalo: false,
    fechaRegistro: "2026-07-31",
    pagoV2ItemIds: [],
    pagoV2RegaloIds: [],
    ...overrides,
  };
}

function pago(overrides: Partial<ShippingV2Pago> = {}): ShippingV2Pago {
  return {
    id: "recPAGO",
    createdTime: "2026-07-31T00:00:00.000Z",
    pagoId: "PAY-TEST",
    estado: "Pendiente",
    estadoPago: "Pendiente",
    proveedorId: "recPROV",
    proveedorNombre: "Proveedor",
    itemIds: [],
    itemsResumen: [],
    regalosIds: [],
    regalosResumen: [],
    total: 0,
    totalAPagar: 0,
    totalPagado: null,
    saldoPendiente: null,
    totalRegalos: 0,
    cantidadItems: 0,
    cantidadRegalos: 0,
    fechaCreacion: "2026-07-31",
    fechaVencimientoSugerida: "",
    fechaPagoMax: "",
    fechaPagoReal: "",
    metodoPago: "",
    cuentaOrigen: "",
    transaccionId: "",
    comprobante: [],
    facturaProveedor: [],
    observacion: "",
    registradoPor: "",
    pagadoPor: "",
    estadoIntegracionFinanzas: "Pendiente de generar",
    movimientoFinanzasId: "",
    movimientoFinanzasIds: [],
    fechaAnulacion: "",
    motivoAnulacion: "",
    ...overrides,
  };
}

assertMoney(
  calculateShippingV2PaymentItemSubtotal({ sku: "UNO", cantidad: 1, costoProveedor: 100 }),
  100,
  "Cantidad 1 paga una vez el costo unitario"
);
assertMoney(
  calculateShippingV2PaymentItemSubtotal({ sku: "DOS", cantidad: 2, costoProveedor: 174.3 }),
  348.6,
  "Cantidad 2 multiplica costo unitario"
);
assertMoney(
  calculateShippingV2PaymentItemSubtotal({ sku: "TRES", cantidad: 3, costoProveedor: 8.58 }),
  25.74,
  "Cantidad 3 redondea subtotal"
);
assertMoney(
  calculateShippingV2PaymentItemsTotal([
    { sku: "DOS", cantidad: 2, costoProveedor: 174.3 },
    { sku: "TRES", cantidad: 3, costoProveedor: 8.58 },
  ]),
  374.34,
  "Total de pago suma subtotales por cantidad"
);
assertMoney(
  calculateShippingV2PaymentItemSubtotal({ sku: "REGALO-COSTO", cantidad: 4, costoProveedor: 999, esRegalo: true }),
  0,
  "Regalo con cantidad y costo positivo no suma al pago"
);
assertMoney(
  calculateShippingV2PaymentItemSubtotal({ sku: "REGALO-VACIO", cantidad: 4, costoProveedor: null, esRegalo: true }),
  0,
  "Regalo con costo vacío no suma al pago"
);
assertMoney(
  calculateShippingV2PaymentItemSubtotal({ sku: "REGALO-CERO", cantidad: 4, costoProveedor: 0, esRegalo: true }),
  0,
  "Regalo con costo 0 no suma al pago"
);

async function main() {
await assertRejects(
  () => calculateShippingV2PaymentItemSubtotal({ sku: "QTY-0", cantidad: 0, costoProveedor: 10 }),
  "Cantidad inválida",
  "Cantidad 0 no es pagable"
);
await assertRejects(
  () => calculateShippingV2PaymentItemSubtotal({ sku: "QTY-NEG", cantidad: -1, costoProveedor: 10 }),
  "Cantidad inválida",
  "Cantidad negativa no es pagable"
);
await assertRejects(
  () => calculateShippingV2PaymentItemSubtotal({ sku: "QTY-DEC", cantidad: 1.5, costoProveedor: 10 }),
  "Cantidad inválida",
  "Cantidad decimal no es pagable"
);

await withFixture(async (fixture) => {
  const itemA = createItemRecord(fixture, {
    [F_ITEM.sku]: "PAY-A",
    [F_ITEM.cantidad]: 2,
    [F_ITEM.costoProveedor]: 174.3,
  });
  const itemB = createItemRecord(fixture, {
    [F_ITEM.sku]: "PAY-B",
    [F_ITEM.cantidad]: 3,
    [F_ITEM.costoProveedor]: 8.58,
  });
  const gift = createGiftRecord(fixture, {
    [F_ITEM.sku]: "PAY-GIFT",
    [F_ITEM.cantidad]: 9,
    [F_ITEM.costoProveedor]: 0,
  });

  const creado = await createShippingV2Pago(
    {
      proveedorId: fixture.providerId,
      itemIds: [itemA, itemB],
      regalosIds: [gift],
      observacion: "Pago multiunidad",
    },
    { registradoPor: "Test", access: systemShippingV2Access() }
  );

  assertMoney(creado.totalAPagar, 374.34, "Crear pago guarda Cantidad x Costo proveedor");
  assertMoney(creado.totalRegalos, 0, "Regalos incluidos quedan en 0 dentro del pago");
  assert(creado.itemsResumen.every((item) => typeof item.cantidad === "number"), "Resumen del pago conserva cantidad para la UI");
});

await withFixture(async (fixture) => {
  const item = createItemRecord(fixture, {
    [F_ITEM.sku]: "PAY-INVALID-QTY",
    [F_ITEM.cantidad]: 0,
    [F_ITEM.costoProveedor]: 100,
  });
  await assertRejects(
    () => createShippingV2Pago({ proveedorId: fixture.providerId, itemIds: [item] }, { registradoPor: "Test", access: systemShippingV2Access() }),
    "Cantidad inválida",
    "Crear pago rechaza item futuro con cantidad 0"
  );
});

await withFixture(async (fixture) => {
  const item = createItemRecord(fixture, {
    [F_ITEM.sku]: "PAY-DUP",
    [F_ITEM.cantidad]: 1,
    [F_ITEM.costoProveedor]: 100,
  });
  await assertRejects(
    () => createShippingV2Pago({ proveedorId: fixture.providerId, itemIds: [item, item] }, { registradoPor: "Test", access: systemShippingV2Access() }),
    "Items duplicados",
    "Crear pago rechaza el mismo item duplicado"
  );
});

{
  const summary = computePagosSummary(
    [
      pendingItem({ id: "recA", cantidad: 2, costoProveedor: 174.3 }),
      pendingItem({ id: "recB", cantidad: 3, costoProveedor: 8.58 }),
    ],
    [],
    [],
    []
  );
  assertMoney(summary.totalPorPagar, 374.34, "Resumen por pagar usa cantidad por costo en items sueltos");
}

{
  const summary = computePagosSummary(
    [],
    [pago({ totalAPagar: 111, saldoPendiente: null })],
    [],
    []
  );
  assertMoney(summary.totalPorPagar, 111, "Pagos ya creados usan el total guardado, no recalculan históricos");
}

await withFixture(async (fixture) => {
  const item = createItemRecord(fixture, {
    [F_ITEM.sku]: "PAY-MOV",
    [F_ITEM.cantidad]: 2,
    [F_ITEM.costoProveedor]: 174.3,
  });
  const creado = await createShippingV2Pago(
    { proveedorId: fixture.providerId, itemIds: [item] },
    { registradoPor: "Test", access: systemShippingV2Access() }
  );
  await markShippingV2PagoAsPaid(creado.id, paymentSupportInput(), { registradoPor: "Test", access: systemShippingV2Access() });
  const movimientos = [...fixture.state.movimientos.values()];
  assert(movimientos.length === 1, "Marcar pago crea un movimiento financiero");
  assertMoney(
    movimientos[0]?.fields[MOVIMIENTOS_FIELDS.monto] as number | undefined,
    348.6,
    "Movimiento financiero usa el total guardado del pago nuevo"
  );
});

await withFixture(async (fixture) => {
  const item = createItemRecord(fixture, {
    [F_ITEM.sku]: "PAY-HIST",
    [F_ITEM.cantidad]: 2,
    [F_ITEM.costoProveedor]: 100,
  });
  const paymentId = createPagoRecord(fixture, {
    [F_PAGO.pagoId]: "PAY-HIST",
    [F_PAGO.itemsRelacionados]: [item],
    [F_PAGO.totalAPagar]: 111,
  });
  await markShippingV2PagoAsPaid(paymentId, paymentSupportInput(), { registradoPor: "Test", access: systemShippingV2Access() });
  const movimientos = [...fixture.state.movimientos.values()];
  const paymentRecord = fixture.state.otras.get(SHIPPING_V2_TABLES.pagos)?.get(paymentId);
  assertMoney(paymentRecord?.fields[F_PAGO.totalAPagar] as number | undefined, 111, "Marcar pagado no reescribe Total a pagar existente");
  assertMoney(
    movimientos[0]?.fields[MOVIMIENTOS_FIELDS.monto] as number | undefined,
    111,
    "Movimiento financiero de pago histórico usa el total guardado"
  );
});

await withFixture(async (fixture) => {
  const pagoActivo = createPagoRecord(fixture, { [F_PAGO.estadoPago]: "Pendiente" });
  const item = createItemRecord(fixture, {
    [F_ITEM.sku]: "PAY-LOCK-QTY",
    [F_ITEM.cantidad]: 1,
    [F_ITEM.costoProveedor]: 100,
    "Shipping Pagos (Items relacionados)": [pagoActivo],
  });
  await assertRejects(
    () => updateShippingV2ItemField(
      item,
      { field: F_ITEM.cantidad, value: 2 },
      { actualizadoPor: "Test", access: systemShippingV2Access() }
    ),
    SHIPPING_V2_ACTIVE_PAYMENT_ITEM_LOCK_MESSAGE,
    "Pago V2 activo bloquea edición inline de Cantidad"
  );
});

await withFixture(async (fixture) => {
  const pagoActivo = createPagoRecord(fixture, { [F_PAGO.estadoPago]: "Pendiente" });
  const item = createItemRecord(fixture, {
    [F_ITEM.sku]: "PAY-LOCK-COST",
    [F_ITEM.cantidad]: 1,
    [F_ITEM.costoProveedor]: 100,
    "Shipping Pagos (Items relacionados)": [pagoActivo],
  });
  await assertRejects(
    () => updateShippingV2ItemField(
      item,
      { field: F_ITEM.costoProveedor, value: 120 },
      { actualizadoPor: "Test", access: systemShippingV2Access() }
    ),
    SHIPPING_V2_ACTIVE_PAYMENT_ITEM_LOCK_MESSAGE,
    "Pago V2 activo bloquea edición inline de Costo proveedor"
  );
});

await withFixture(async (fixture) => {
  const pagoActivo = createPagoRecord(fixture, { [F_PAGO.estadoPago]: "Pendiente" });
  const item = createItemRecord(fixture, {
    [F_ITEM.sku]: "PAY-LOCK-PATCH",
    [F_ITEM.cantidad]: 1,
    [F_ITEM.costoProveedor]: 100,
    "Shipping Pagos (Items relacionados)": [pagoActivo],
  });
  await assertRejects(
    () => updateShippingV2Item(
      item,
      itemWriteInput(fixture, {
        sku: "PAY-LOCK-PATCH",
        skuInterno: "PAY-LOCK-PATCH",
        cantidad: 2,
        costoProveedor: 100,
        modoLogistico: "Pendiente de packing",
      }),
      { actualizadoPor: "Test" }
    ),
    SHIPPING_V2_ACTIVE_PAYMENT_ITEM_LOCK_MESSAGE,
    "Pago V2 activo bloquea PATCH completo que cambia Cantidad"
  );
});

await withFixture(async (fixture) => {
  const pagoAnulado = createPagoRecord(fixture, { [F_PAGO.estadoPago]: "Anulado" });
  const item = createItemRecord(fixture, {
    [F_ITEM.sku]: "PAY-ANULADO",
    [F_ITEM.cantidad]: 1,
    [F_ITEM.costoProveedor]: 100,
    "Shipping Pagos (Items relacionados)": [pagoAnulado],
  });
  await updateShippingV2ItemField(
    item,
    { field: F_ITEM.cantidad, value: 2 },
    { actualizadoPor: "Test", access: systemShippingV2Access() }
  );
  const itemRecord = fixture.state.otras.get(SHIPPING_V2_TABLES.items)?.get(item);
  assertMoney(itemRecord?.fields[F_ITEM.cantidad] as number | undefined, 2, "Pago V2 Anulado permite editar Cantidad");
});

await withFixture(async (fixture) => {
  const item = createItemRecord(fixture, {
    [F_ITEM.sku]: "PAY-FREE-EDIT",
    [F_ITEM.cantidad]: 1,
    [F_ITEM.costoProveedor]: 100,
  });
  await updateShippingV2ItemField(
    item,
    { field: F_ITEM.costoProveedor, value: 120 },
    { actualizadoPor: "Test", access: systemShippingV2Access() }
  );
  const itemRecord = fixture.state.otras.get(SHIPPING_V2_TABLES.items)?.get(item);
  assertMoney(itemRecord?.fields[F_ITEM.costoProveedor] as number | undefined, 120, "Item sin pago permite editar Costo proveedor");
});

if (fallos > 0) {
  console.error(`Fallaron ${fallos} comprobaciones.`);
  process.exit(1);
}

console.log("Contrato de Pagos V2 multiunidad: OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
