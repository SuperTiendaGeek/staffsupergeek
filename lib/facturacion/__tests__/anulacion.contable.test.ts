/**
 * Test — FALLO 3: la anulación no inventa una forma de pago.
 *
 * Ejecutar:
 *   NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/anulacion.contable.test.ts
 */

import fs from "fs";
import path from "path";
import { obtenerFactura } from "../airtable/facturas";
import { revertirContableFacturaAnulada } from "../anulaciones/reverso";
import { crearMovimiento } from "../../finanzas/movimientos";
import { MOVIMIENTOS_FIELDS } from "../../finanzas/movimientos-fields";
import { __resetCacheNombreTablaParaPruebas } from "../../finanzas/table-names";
import {
  activarEnvFalso,
  construirFetchDouble,
  crearCuentaDouble,
  crearEstadoDouble,
  crearRegistroDouble,
  limpiarEnvFalso,
  registrarTablaDouble,
  type AirtableDoubleState,
} from "../../finanzas/__tests__/_airtableDouble";

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

function prepararDouble(): AirtableDoubleState {
  activarEnvFalso();
  __resetCacheNombreTablaParaPruebas();
  const state = crearEstadoDouble("Movimientos Financieros");
  registrarTablaDouble(state, "Facturas Electrónicas");
  global.fetch = construirFetchDouble(state) as typeof fetch;
  return state;
}

function limpiarDouble() {
  global.fetch = fetchOriginal;
  limpiarEnvFalso();
  __resetCacheNombreTablaParaPruebas();
}

function crearFacturaDouble(state: AirtableDoubleState, fields: Record<string, unknown> = {}): string {
  return crearRegistroDouble(state, "Facturas Electrónicas", {
    "Clave de Acceso": "0709202601179239494400120010020000007071234567817",
    "Número de Factura": "001-002-000000707",
    "Estado": "AUTORIZADO",
    "Estado Correo": "NO_ENVIADO",
    "Ambiente": "PRODUCCIÓN",
    "Fecha de Emisión": "2026-09-04",
    "Cliente - Nombre": "Cliente prueba",
    "Cliente - Identificación": "0912345678",
    "Subtotal": 426.09,
    "IVA": 63.91,
    "Total": 490,
    ...fields,
  });
}

function movimientosCreados(state: AirtableDoubleState) {
  return [...state.movimientos.values()];
}

async function pruebaSinMovimientoNoCreaEgreso() {
  const state = prepararDouble();
  try {
    const facturaId = crearFacturaDouble(state);
    const factura = await obtenerFactura(facturaId);

    assert(!!factura, "La factura de prueba se lee desde el doble");
    assert(factura!.movimientosFinancierosIds.length === 0, "La factura sin link financiero expone cero movimientos");

    const resultado = await revertirContableFacturaAnulada({
      numeroFactura: factura!.numeroFactura,
      movimientosFinancierosIds: factura!.movimientosFinancierosIds,
      registradoPor: "Admin Test",
      ambiente: "2",
    });

    assert(resultado.estado === "OMITIDO", "Sin movimiento financiero, el reverso contable queda OMITIDO");
    assert(resultado.detalle?.includes("no tiene movimiento financiero enlazado") === true, "La omisión explica que no hay ingreso real enlazado");
    assert(movimientosCreados(state).length === 0, "Sin ingreso real enlazado no se crea ningún egreso");
  } finally {
    limpiarDouble();
  }
}

async function pruebaConMovimientoRevierteMontoReal() {
  const state = prepararDouble();
  try {
    const cajaId = crearCuentaDouble(state, {
      nombre: "Caja Registradora",
      tipo: "Principal",
      saldoInicial: 1000,
      fechaCorte: "2026-01-01",
    });
    const facturaId = crearFacturaDouble(state, { "Líneas JSON": "" });

    const ingreso = await crearMovimiento({
      tipo: "Ingreso",
      origen: "Facturación",
      categoria: "Venta Mostrador",
      monto: 490,
      cuentaDestinoId: cajaId,
      estado: "Confirmado",
      metodo: "Efectivo",
      fecha: "2026-09-04T10:00:00.000Z",
      registradoPor: "Caja Test",
      facturaElectronicaId: facturaId,
    });

    const factura = await obtenerFactura(facturaId);
    assert(factura!.lineasJson === "", "El caso con ingreso real puede no tener Líneas JSON");
    assert(factura!.movimientosFinancierosIds.includes(ingreso.id), "La factura lee el ingreso real desde el link inverso de Finanzas");

    const resultado = await revertirContableFacturaAnulada({
      numeroFactura: factura!.numeroFactura,
      movimientosFinancierosIds: factura!.movimientosFinancierosIds,
      registradoPor: "Admin Test",
      ambiente: "2",
    });

    const movimientos = movimientosCreados(state);
    const egresos = movimientos.filter((m) => m.fields[MOVIMIENTOS_FIELDS.tipo] === "Egreso");
    const egreso = egresos[0];

    assert(resultado.estado === "OK", "Con ingreso financiero real, el reverso contable queda OK");
    assert(resultado.movimientosRevertidos === 1, "Se revierte exactamente un movimiento");
    assert(resultado.totalRevertido === 490, "El total revertido usa el monto real del movimiento financiero");
    assert(egresos.length === 1, "Se crea un solo egreso de devolución");
    assert(egreso.fields[MOVIMIENTOS_FIELDS.monto] === 490, "El egreso usa $490, no el total inventado desde otra fuente");
    assert((egreso.fields[MOVIMIENTOS_FIELDS.cuentaOrigen] as string[])[0] === cajaId, "El egreso sale de la misma cuenta donde entró el ingreso");
    assert(egreso.fields[MOVIMIENTOS_FIELDS.cuentaDestino] === undefined, "El egreso no puebla Cuenta Destino");
    assert((egreso.fields[MOVIMIENTOS_FIELDS.reversaA] as string[])[0] === ingreso.id, "El egreso queda trazado con Reversa a → ingreso original");

    const resultadoRepetido = await revertirContableFacturaAnulada({
      numeroFactura: factura!.numeroFactura,
      movimientosFinancierosIds: factura!.movimientosFinancierosIds,
      registradoPor: "Admin Test",
      ambiente: "2",
    });
    const egresosTrasRepetir = movimientosCreados(state).filter((m) => m.fields[MOVIMIENTOS_FIELDS.tipo] === "Egreso");
    assert(resultadoRepetido.estado === "OK", "Repetir el reverso sobre el mismo ingreso no falla");
    assert(resultadoRepetido.movimientosRevertidos === 0, "El segundo intento detecta la devolución activa existente");
    assert(egresosTrasRepetir.length === 1, "El reverso contable no duplica egresos");
  } finally {
    limpiarDouble();
  }
}

function pruebaRutaNoUsaPagoInventado() {
  const fuente = fs.readFileSync(path.join(process.cwd(), "app/api/facturacion/anulaciones/[recordId]/route.ts"), "utf8");

  assert(!fuente.includes("formaPago: \"01\", total: factura.total"), "La ruta ya no crea un pago efectivo inventado por el total de la factura");
  assert(fuente.includes("movimientosFinancierosIds: factura.movimientosFinancierosIds"), "La ruta pasa los movimientos financieros enlazados al reverso contable");
  assert(fuente.includes("avisos"), "La respuesta de anulación incluye avisos visibles para la UI");
}

async function main() {
  await pruebaSinMovimientoNoCreaEgreso();
  await pruebaConMovimientoRevierteMontoReal();
  pruebaRutaNoUsaPagoInventado();

  if (fallos > 0) {
    console.error(`\n❌ anulacion.contable.test.ts — ${fallos} aserción(es) fallida(s)`);
    process.exit(1);
  }
  console.log("\n✅ anulacion.contable.test.ts — todos los asserts pasaron");
}

main();
