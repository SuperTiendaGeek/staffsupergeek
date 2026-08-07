/**
 * Etapa 3 — despertar los mecanismos que solo actúan en producción.
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/etapa3/despertarMecanismos.ts
 *
 * NO ESCRIBE NADA EN AIRTABLE. Ni una sola petición sale a la red: el banco de
 * pruebas (bancoAirtable.ts) intercepta `fetch` y corta cualquier destino que
 * no sea la API simulada. Se puede correr las veces que haga falta.
 *
 * ─── El problema ─────────────────────────────────────────────────────────────
 *
 * Seis mecanismos viven detrás de `if (ambiente !== "2") return;`. En pruebas
 * devuelven "OK" sin hacer nada. Nunca han corrido. El día del corte se
 * encienden los seis a la vez, sobre documentos tributarios que no se pueden
 * deshacer.
 *
 * Este script los ejecuta con ambiente="2" contra datos de mentira, y deja por
 * escrito qué habría hecho cada uno: qué tabla toca, qué campos escribe y con
 * qué valores. Es lo más cerca del día del corte que se puede llegar sin
 * arriesgar dinero real.
 *
 * Genera además `scripts/etapa3/escrituras-capturadas.json`, que consume
 * `verificarEsquema.ts` para contrastar cada nombre contra la base real.
 */

import fs   from "fs";
import path from "path";

import { conBanco, type BancoAirtable, type Registro } from "./bancoAirtable";

// ─── Infraestructura del informe ─────────────────────────────────────────────

let fallos = 0;
const inventario: Record<string, string[]> = {};

function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("  ✗", msg); }
  else       { console.log("  ✓", msg); }
}

function titulo(n: number, texto: string): void {
  console.log(`\n${"═".repeat(74)}\n${n}. ${texto}\n${"═".repeat(74)}`);
}

function acumularInventario(banco: BancoAirtable): void {
  for (const [tabla, campos] of Object.entries(banco.inventarioEscrituras())) {
    inventario[tabla] ??= [];
    for (const c of campos) if (!inventario[tabla].includes(c)) inventario[tabla].push(c);
  }
}

/** Variables mínimas para que los módulos arranquen. Ninguna se usa contra la red. */
function prepararEntorno(): void {
  process.env.AIRTABLE_API_KEY ||= "banco-de-pruebas";
  process.env.AIRTABLE_BASE_ID ||= "appBANCODEPRUEBAS";
}

// ─── Datos de mentira compartidos ────────────────────────────────────────────

const ITEM_ID    = "recITEM0000000001";
const FACTURA_ID = "recFACTURA00000001";
const RECIBO_ID  = "recRECIBO000000001";
const NC_ID      = "recNOTACREDITO0001";
const RESERVA_ID = "recRESERVA00000001";
const CUENTA_ID  = "recCUENTACAJA00001";

function itemConStock(cantidad: number, facturas: string[] = []): Registro {
  return {
    id: ITEM_ID,
    fields: {
      "SKU":                    "ZZZ-BANCO-001",
      "Nombre del artículo":    "Artículo de banco de pruebas",
      "Cantidad":               cantidad,
      "Disponible para venta":  true,
      "Estado Item":            "Disponible",
      "Factura":                facturas,
    },
  };
}

function cuentaCaja(): Registro {
  return {
    id: CUENTA_ID,
    fields: {
      "Nombre":          "Caja Registradora",
      "Tipo de Cuenta":  "Efectivo",
      "Activa":          true,
      "Saldo Inicial":   0,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Descuento de inventario al facturar  (gancho/postEmision.ts)
// ═══════════════════════════════════════════════════════════════════════════

async function mecanismoInventario(): Promise<void> {
  titulo(1, "Descuento de inventario al facturar — postEmision()");

  const { postEmision } = await import("@/lib/facturacion/gancho/postEmision");

  const detalles = [
    { tipo: "producto", shippingItemId: ITEM_ID, cantidad: 2, descripcion: "Artículo de banco de pruebas",
      codigoPrincipal: "ZZZ-BANCO-001", unidadMedida: "Unidad", precioUnitario: 100,
      descuento: 0, precioTotalSinImpuesto: 200, impuestos: [] },
    { tipo: "servicio", cantidad: 1, descripcion: "Servicio que NO debe tocar inventario",
      codigoPrincipal: "SRV-1", unidadMedida: "Unidad", precioUnitario: 50,
      descuento: 0, precioTotalSinImpuesto: 50, impuestos: [] },
  ];

  // ── En PRUEBAS no debe tocar nada ─────────────────────────────────────────
  const pruebas = await conBanco(
    { tablas: { "Shipping Items": [itemConStock(5)] } },
    (b) => postEmision({ facturaRecordId: FACTURA_ID, detalles: detalles as never, ambiente: "1" })
      .then((r) => ({ r, b }))
  );
  assert(!pruebas.banco.huboEscrituras(),
    "En ambiente PRUEBAS no escribe absolutamente nada (el candado hace su trabajo)");

  // ── En PRODUCCIÓN sí ──────────────────────────────────────────────────────
  const prod = await conBanco(
    { tablas: { "Shipping Items": [itemConStock(5)] } },
    async (b) => {
      const r = await postEmision({ facturaRecordId: FACTURA_ID, detalles: detalles as never, ambiente: "2" });
      return { r, b };
    }
  );

  console.log("\n  Escrituras que haría en producción:");
  console.log(prod.banco.resumen());

  assert(prod.resultado.r.estado === "OK", "Termina con estado OK");

  const item = prod.banco.estado("Shipping Items").find((x) => x.id === ITEM_ID);
  assert(item?.fields["Cantidad"] === 3,
    `Descuenta 2 de 5 y deja 3 (valor final: ${item?.fields["Cantidad"]})`);
  assert(item?.fields["Estado Item"] !== "Vendido",
    "Con stock restante NO marca el artículo como Vendido — sigue disponible para la siguiente venta");
  assert(Array.isArray(item?.fields["Factura"]) && (item?.fields["Factura"] as string[]).includes(FACTURA_ID),
    "Enlaza la factura al artículo (es la marca de 'ya descontado')");

  const camposItem = prod.banco.camposEscritos("Shipping Items");
  assert(!camposItem.includes("Disponible para venta"),
    "No toca 'Disponible para venta' mientras quede stock");

  // ── Se agota el stock ─────────────────────────────────────────────────────
  const agota = await conBanco(
    { tablas: { "Shipping Items": [itemConStock(2)] } },
    async (b) => {
      await postEmision({ facturaRecordId: FACTURA_ID, detalles: detalles as never, ambiente: "2" });
      return b;
    }
  );
  const itemAgotado = agota.banco.estado("Shipping Items").find((x) => x.id === ITEM_ID);
  assert(itemAgotado?.fields["Cantidad"] === 0, "Al vender las últimas unidades deja la cantidad en 0");
  assert(itemAgotado?.fields["Estado Item"] === "Vendido", "…y recién ahí lo marca como Vendido");
  assert(itemAgotado?.fields["Disponible para venta"] === false, "…y lo saca de la venta");

  // ── Idempotencia ──────────────────────────────────────────────────────────
  const repetido = await conBanco(
    { tablas: { "Shipping Items": [itemConStock(5, [FACTURA_ID])] } },
    async (b) => {
      await postEmision({ facturaRecordId: FACTURA_ID, detalles: detalles as never, ambiente: "2" });
      return b;
    }
  );
  const itemRepetido = repetido.banco.estado("Shipping Items").find((x) => x.id === ITEM_ID);
  assert(itemRepetido?.fields["Cantidad"] === 5,
    "Si la factura YA está enlazada al artículo, no vuelve a descontar (idempotente)");

  // ── Stock insuficiente ────────────────────────────────────────────────────
  const insuficiente = await conBanco(
    { tablas: { "Shipping Items": [itemConStock(1)] } },
    async (b) => {
      const r = await postEmision({ facturaRecordId: FACTURA_ID, detalles: detalles as never, ambiente: "2" });
      return { r, b };
    }
  );
  const itemCero = insuficiente.banco.estado("Shipping Items").find((x) => x.id === ITEM_ID);
  assert(itemCero?.fields["Cantidad"] === 0,
    "Con stock insuficiente NO rechaza la venta (la factura ya es real ante el SRI): deja el stock en 0");
  assert((insuficiente.resultado.r.detalle ?? "").toLowerCase().includes("stock"),
    "…y deja constancia escrita del descuadre para corregirlo a mano");

  acumularInventario(prod.banco);
  acumularInventario(agota.banco);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Reverso de inventario por nota de crédito
// ═══════════════════════════════════════════════════════════════════════════

async function mecanismoReversoNotaCredito(): Promise<void> {
  titulo(2, "Reverso de inventario por nota de crédito — revertirInventarioNotaCredito()");

  const { revertirInventarioNotaCredito } = await import("@/lib/facturacion/notaCredito/revertirInventario");

  const detalles = [
    { codigoInterno: "ZZZ-BANCO-001", descripcion: "Artículo de banco de pruebas", cantidad: 2,
      precioUnitario: 100, descuento: 0, precioTotalSinImpuesto: 200, impuestos: [],
      tipo: "producto", shippingItemId: ITEM_ID, devolucionFisica: true },
    { codigoInterno: "SRV-1", descripcion: "Servicio devuelto (no vuelve al stock)", cantidad: 1,
      precioUnitario: 50, descuento: 0, precioTotalSinImpuesto: 50, impuestos: [],
      tipo: "servicio", devolucionFisica: false },
  ];

  const pruebas = await conBanco(
    { tablas: { "Shipping Items": [itemConStock(3)] } },
    async (b) => {
      await revertirInventarioNotaCredito({ notaCreditoRecordId: NC_ID, detalles: detalles as never, ambiente: "1" });
      return b;
    }
  );
  assert(!pruebas.banco.huboEscrituras(), "En PRUEBAS no devuelve stock (el candado hace su trabajo)");

  const prod = await conBanco(
    { tablas: { "Shipping Items": [itemConStock(3)] } },
    async (b) => {
      const r = await revertirInventarioNotaCredito({ notaCreditoRecordId: NC_ID, detalles: detalles as never, ambiente: "2" });
      return { r, b };
    }
  );

  console.log("\n  Escrituras que haría en producción:");
  console.log(prod.banco.resumen());

  const item = prod.banco.estado("Shipping Items").find((x) => x.id === ITEM_ID);
  assert(item?.fields["Cantidad"] === 5,
    `Devuelve al stock las 2 unidades acreditadas: 3 → 5 (valor final: ${item?.fields["Cantidad"]})`);

  acumularInventario(prod.banco);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Reverso de inventario y de caja al anular una factura
// ═══════════════════════════════════════════════════════════════════════════

async function mecanismoAnulacion(): Promise<void> {
  titulo(3, "Reverso al anular una factura — revertirInventarioFacturaAnulada() / revertirContable…()");

  const { revertirInventarioFacturaAnulada, revertirContableFacturaAnulada } =
    await import("@/lib/facturacion/anulaciones/reverso");

  const detalles = [{ tipo: "producto", shippingItemId: ITEM_ID, cantidad: 2, descripcion: "Artículo de banco" }];

  // ── Inventario ────────────────────────────────────────────────────────────
  const pruebas = await conBanco(
    { tablas: { "Shipping Items": [itemConStock(1, [FACTURA_ID])] } },
    async (b) => {
      await revertirInventarioFacturaAnulada({ facturaRecordId: FACTURA_ID, detalles, ambiente: "1" });
      return b;
    }
  );
  assert(!pruebas.banco.huboEscrituras(), "En PRUEBAS no revierte nada");

  const prod = await conBanco(
    { tablas: { "Shipping Items": [itemConStock(1, [FACTURA_ID])] } },
    async (b) => {
      const r = await revertirInventarioFacturaAnulada({ facturaRecordId: FACTURA_ID, detalles, ambiente: "2" });
      return { r, b };
    }
  );

  console.log("\n  Escrituras de inventario que haría en producción:");
  console.log(prod.banco.resumen());

  const item = prod.banco.estado("Shipping Items").find((x) => x.id === ITEM_ID);
  assert(item?.fields["Cantidad"] === 3, `Devuelve las 2 unidades al stock: 1 → 3 (valor: ${item?.fields["Cantidad"]})`);
  assert(Array.isArray(item?.fields["Factura"]) && (item?.fields["Factura"] as string[]).length === 0,
    "Desenlaza la factura anulada del artículo");
  assert(item?.fields["Disponible para venta"] === true, "Vuelve a dejarlo disponible para la venta");

  // ── Idempotencia: si ya se desenlazó, no vuelve a sumar ───────────────────
  const repetido = await conBanco(
    { tablas: { "Shipping Items": [itemConStock(3, [])] } },
    async (b) => {
      await revertirInventarioFacturaAnulada({ facturaRecordId: FACTURA_ID, detalles, ambiente: "2" });
      return b;
    }
  );
  const itemRepe = repetido.banco.estado("Shipping Items").find((x) => x.id === ITEM_ID);
  assert(itemRepe?.fields["Cantidad"] === 3,
    "Si la factura ya no está enlazada, NO vuelve a sumar stock (idempotente)");

  // ── Contable: la anulación es el único documento que devuelve dinero ──────
  const contablePruebas = await conBanco(
    { tablas: { "Cuentas Financieras": [cuentaCaja()], "Movimientos Financieros": [] } },
    async (b) => {
      await revertirContableFacturaAnulada({
        facturaRecordId: FACTURA_ID, numeroFactura: "001-002-000000700",
        pagos: [{ formaPago: "01", total: 340 }], registradoPor: "Banco", ambiente: "1",
      } as never);
      return b;
    }
  );
  assert(!contablePruebas.banco.huboEscrituras(), "En PRUEBAS no toca el libro contable");

  const contableProd = await conBanco(
    { tablas: { "Cuentas Financieras": [cuentaCaja()], "Movimientos Financieros": [] } },
    async (b) => {
      await revertirContableFacturaAnulada({
        facturaRecordId: FACTURA_ID, numeroFactura: "001-002-000000700",
        pagos: [{ formaPago: "01", total: 340 }, { formaPago: "15", total: 60 }],
        registradoPor: "Banco", ambiente: "2",
      } as never);
      return b;
    }
  );

  console.log("\n  Escrituras contables que haría en producción:");
  console.log(contableProd.banco.resumen());

  const movs = contableProd.banco.escriturasEn("Movimientos Financieros");
  assert(movs.length >= 1, "Crea el movimiento de devolución del dinero");
  const montos = movs.flatMap((e) => e.registros.map((r) => r.fields["Monto"]));
  assert(montos.includes(340), "Devuelve los $340 cobrados en efectivo");
  assert(!montos.includes(60),
    "NO devuelve en efectivo los $60 pagados con compensación de nota de crédito — ese dinero nunca entró a caja");

  acumularInventario(prod.banco);
  acumularInventario(contableProd.banco);
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Efectos del recibo (documento interno, no va al SRI)
// ═══════════════════════════════════════════════════════════════════════════

async function mecanismoRecibos(): Promise<void> {
  titulo(4, "Efectos del recibo — descontarInventarioRecibo() / registrarIngresoRecibo()");

  const efectos = await import("@/lib/facturacion/recibos/efectos");

  const lineas = [{ shippingItemId: ITEM_ID, cantidad: 1, descripcion: "Artículo de banco", precioUnitario: 100 }];

  const pruebas = await conBanco(
    { tablas: { "Shipping Items": [itemConStock(4)] } },
    async (b) => {
      await efectos.descontarInventarioRecibo({ reciboRecordId: RECIBO_ID, lineas, ambiente: "1" } as never);
      return b;
    }
  );
  assert(!pruebas.banco.huboEscrituras(), "En PRUEBAS el recibo no toca inventario");

  const prod = await conBanco(
    { tablas: { "Shipping Items": [itemConStock(4)] } },
    async (b) => {
      const r = await efectos.descontarInventarioRecibo({ reciboRecordId: RECIBO_ID, lineas, ambiente: "2" } as never);
      return { r, b };
    }
  );

  console.log("\n  Escrituras de inventario que haría en producción:");
  console.log(prod.banco.resumen());

  const item = prod.banco.estado("Shipping Items").find((x) => x.id === ITEM_ID);
  assert(item?.fields["Cantidad"] === 3, `Descuenta 1 de 4 y deja 3 (valor: ${item?.fields["Cantidad"]})`);

  // ── Ingreso en el libro ───────────────────────────────────────────────────
  const ingresoPruebas = await conBanco(
    { tablas: { "Cuentas Financieras": [cuentaCaja()], "Movimientos Financieros": [] } },
    async (b) => {
      await efectos.registrarIngresoRecibo({
        reciboRecordId: RECIBO_ID, numero: "REC-0001", total: 100,
        formaPago: "01", registradoPor: "Banco", ambiente: "1",
      } as never);
      return b;
    }
  );
  assert(!ingresoPruebas.banco.huboEscrituras(), "En PRUEBAS el recibo no toca el libro contable");

  const ingresoProd = await conBanco(
    { tablas: { "Cuentas Financieras": [cuentaCaja()], "Movimientos Financieros": [] } },
    async (b) => {
      await efectos.registrarIngresoRecibo({
        reciboRecordId: RECIBO_ID, numero: "REC-0001", total: 100,
        formaPago: "01", registradoPor: "Banco", ambiente: "2",
      } as never);
      return b;
    }
  );

  console.log("\n  Escrituras contables que haría en producción:");
  console.log(ingresoProd.banco.resumen());

  const movs = ingresoProd.banco.escriturasEn("Movimientos Financieros");
  assert(movs.length >= 1, "Crea el movimiento de ingreso del recibo");
  const montos = movs.flatMap((e) => e.registros.map((r) => r.fields["Monto"]));
  assert(montos.includes(100), "Registra los $100 cobrados");

  acumularInventario(prod.banco);
  acumularInventario(ingresoProd.banco);
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Puente contable de la factura
// ═══════════════════════════════════════════════════════════════════════════

async function mecanismoPuenteContable(): Promise<void> {
  titulo(5, "Puente contable de la factura — procesarPuenteFacturacion()");

  const { procesarPuenteFacturacion } = await import("@/lib/finanzas/puentes/facturacion");

  const resultadoBase = {
    estado: "AUTORIZADO" as const,
    claveAcceso: "1".repeat(49),
    numeroFactura: "001-002-000000700",
    recordId: FACTURA_ID,
  };
  const body = {
    tipoIdentificacionComprador: "05", razonSocialComprador: "Cliente de banco",
    identificacionComprador: "1003710272", detalles: [], totalSinImpuestos: 295.65,
    totalDescuento: 0, totalConImpuestos: [], importeTotal: 340,
    pagos: [{ formaPago: "01", total: 340 }],
  };

  const pruebas = await conBanco(
    { tablas: { "Cuentas Financieras": [cuentaCaja()], "Movimientos Financieros": [] } },
    async (b) => {
      await procesarPuenteFacturacion({ ...resultadoBase, ambiente: "1" } as never, body as never, "Banco");
      return b;
    }
  );
  assert(!pruebas.banco.huboEscrituras(),
    "En PRUEBAS no crea ningún movimiento (por eso hoy el libro está limpio)");

  const prod = await conBanco(
    { tablas: { "Cuentas Financieras": [cuentaCaja()], "Movimientos Financieros": [] } },
    async (b) => {
      await procesarPuenteFacturacion({ ...resultadoBase, ambiente: "2" } as never, body as never, "Banco");
      return b;
    }
  );

  console.log("\n  Escrituras que haría en producción (factura de mostrador):");
  console.log(prod.banco.resumen());

  const movs = prod.banco.escriturasEn("Movimientos Financieros");
  assert(movs.length >= 1, "Crea el movimiento de ingreso de la venta");

  const campos = movs[0]?.registros[0]?.fields ?? {};
  assert(campos["Monto"] === 340, `Registra el total facturado: $${campos["Monto"]}`);
  assert(campos["Tipo de movimiento"] === "Ingreso", "Lo registra como Ingreso");
  assert(campos["Origen"] === "Facturación", "Con origen 'Facturación'");
  assert(campos["Categoría"] === "Venta Mostrador", "Y categoría 'Venta Mostrador'");
  assert(String(campos["Estado Distribución"] ?? "").length > 0,
    "Marca el estado de distribución para que el cuadre de caja lo vea");

  acumularInventario(prod.banco);
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Cierre de la reserva al facturarla
// ═══════════════════════════════════════════════════════════════════════════

async function mecanismoReserva(): Promise<void> {
  titulo(6, "Cierre de la reserva al facturarla — marcarReservaFacturada()");

  const { marcarReservaFacturada } = await import("@/lib/facturacion/reservas/airtable");

  // Este no tiene candado propio: el guard vive en el endpoint
  // (app/api/facturacion/emitir/route.ts), que solo lo llama con ambiente="2".
  // Aquí se comprueba qué escribe cuando efectivamente se llama.
  const prod = await conBanco(
    { tablas: { "Reservas": [{ id: RESERVA_ID, fields: { "Estado": "Activa", "Factura": [] } }] } },
    async (b) => {
      await marcarReservaFacturada(RESERVA_ID, FACTURA_ID);
      return b;
    }
  );

  console.log("\n  Escrituras que haría al facturar una reserva:");
  console.log(prod.banco.resumen());

  const escrituras = prod.banco.escriturasEn("Reservas");
  assert(escrituras.length === 1, "Escribe una sola vez sobre la reserva");

  const campos = escrituras[0]?.registros[0]?.fields ?? {};
  assert(String(campos["Estado"] ?? "").toLowerCase().includes("factur"),
    `Deja la reserva en estado facturada (valor: "${campos["Estado"]}")`);

  const camposReserva = prod.banco.camposEscritos("Reservas");
  assert(camposReserva.some((c) => c.toLowerCase().includes("factura")),
    "Enlaza la factura a la reserva para poder rastrearla");

  acumularInventario(prod.banco);
}

// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  prepararEntorno();

  console.log("\n" + "█".repeat(74));
  console.log("  ETAPA 3 — despertar los mecanismos que solo actúan en producción");
  console.log("  Banco de pruebas aislado · NO se escribe nada en Airtable");
  console.log("█".repeat(74));

  await mecanismoInventario();
  await mecanismoReversoNotaCredito();
  await mecanismoAnulacion();
  await mecanismoRecibos();
  await mecanismoPuenteContable();
  await mecanismoReserva();

  // ── Campos que solo se escriben cuando algo falla ────────────────────────
  //
  // Los escenarios de arriba recorren el camino feliz, así que estos campos
  // nunca llegan a capturarse. Se declaran a mano para que el contraste de
  // esquema los verifique igual: si en producción falla el descuento de
  // inventario y ADEMÁS el campo donde se anota el error no existe, se pierde
  // la única pista de qué pasó.
  const camposDeError: Record<string, string[]> = {
    "Facturas Electrónicas":        ["Error Sincronización"],
    "Notas de Crédito Electrónicas": ["Error Reverso"],
    "Recibos":                       ["Error Inventario", "Error Contable"],
  };
  for (const [tabla, campos] of Object.entries(camposDeError)) {
    inventario[tabla] ??= [];
    for (const c of campos) if (!inventario[tabla].includes(c)) inventario[tabla].push(c);
  }

  // ── Inventario de tablas y campos, para el contraste de esquema ───────────
  console.log(`\n${"═".repeat(74)}\nTablas y campos que se escribirían en producción\n${"═".repeat(74)}`);
  for (const [tabla, campos] of Object.entries(inventario)) {
    console.log(`\n  ${tabla}`);
    for (const c of campos) console.log(`    · ${c}`);
  }

  const salida = path.join(process.cwd(), "scripts/etapa3/escrituras-capturadas.json");
  fs.writeFileSync(salida, JSON.stringify(inventario, null, 2) + "\n", "utf8");
  console.log(`\n  Guardado en ${path.relative(process.cwd(), salida)}`);
  console.log("  Siguiente paso: npx tsx scripts/etapa3/verificarEsquema.ts");

  console.log(`\n${"═".repeat(74)}`);
  if (fallos > 0) {
    console.error(`❌ ${fallos} comprobación(es) fallida(s) — NO pasar a producción sin resolverlas`);
    process.exit(1);
  }
  console.log("✅ Los 6 mecanismos se comportan como se espera con ambiente = producción");
  console.log(`${"═".repeat(74)}\n`);
}

main().catch((e) => {
  console.error("\n✗ Error inesperado:", e);
  process.exit(1);
});
