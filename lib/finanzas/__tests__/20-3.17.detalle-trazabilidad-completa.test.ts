/**
 * Test §9 #17 (Fase 20.3) — fetchMovimientoConTrazabilidad(): trazabilidad
 * completa. Un movimiento con Abono→Orden (+Cliente) resuelve
 * ordenCodigo/clienteNombre; uno con Factura Electrónica resuelve
 * facturaNumero; un movimiento Acreditado con sus 2 hijos resuelve
 * compensadoPorIds con tipo/categoría/monto correctos.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-3.17.detalle-trazabilidad-completa.test.ts
 */

import { procesarAcreditacion } from "../acreditacion";
import { crearMovimiento } from "../movimientos";
import { fetchMovimientoConTrazabilidad } from "../trazabilidad";
import { __resetCacheNombreTablaParaPruebas } from "../table-names";
import { activarEnvFalso, construirFetchDouble, crearCuentaDouble, crearEstadoDouble, crearRegistroDouble, limpiarEnvFalso, permitirTransferencia } from "./_airtableDouble";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

async function main() {
  activarEnvFalso();
  __resetCacheNombreTablaParaPruebas();
  const state = crearEstadoDouble("Movimientos Financieros");
  const cajaId = crearCuentaDouble(state, { nombre: "Caja Registradora", tipo: "Temporal", fechaCorte: "2026-01-01" });
  const transitoId = crearCuentaDouble(state, { nombre: "Tarjetas en Tránsito", tipo: "Tránsito", fechaCorte: "2026-01-01" });
  const sgIngresosId = crearCuentaDouble(state, { nombre: "SGINGRESOS", tipo: "Principal", fechaCorte: "2026-01-01" });
  permitirTransferencia(state, transitoId, sgIngresosId);
  global.fetch = construirFetchDouble(state) as typeof fetch;

  // Caso 1: Abono → Orden → Cliente.
  const clienteId = crearRegistroDouble(state, "Clientes", { Nombre: "Juan Pérez" });
  const ordenId = crearRegistroDouble(state, "Órdenes de Reparación", { ID: "OR000342", Cliente: [clienteId] });
  const abonoId = crearRegistroDouble(state, "Abonos", { Monto: 80, "Aplicado a: Orden": [ordenId] });
  const movAbono = await crearMovimiento({
    tipo: "Ingreso",
    origen: "Abonos",
    categoria: "Anticipo Cliente",
    monto: 80,
    cuentaDestinoId: cajaId,
    estado: "Confirmado",
    estadoDistribucion: "Sin distribuir",
    fecha: "2026-07-15T10:00:00.000Z",
    registradoPor: "Test",
    abonoId,
  });

  const resultado1 = await fetchMovimientoConTrazabilidad(movAbono.id);
  assert(!!resultado1, "Resuelve el movimiento del abono");
  assert(resultado1!.trazabilidad.ordenCodigo === "OR000342", `Resuelve ordenCodigo (obtenido: "${resultado1!.trazabilidad.ordenCodigo}")`);
  assert(resultado1!.trazabilidad.clienteNombre === "Juan Pérez", `Resuelve clienteNombre vía la Orden (obtenido: "${resultado1!.trazabilidad.clienteNombre}")`);

  // Caso 2: Factura Electrónica.
  const facturaId = crearRegistroDouble(state, "Facturas Electrónicas", { "Número de Factura": "001-001-000000099" });
  const movFactura = await crearMovimiento({
    tipo: "Ingreso",
    origen: "Facturación",
    categoria: "Venta Mostrador",
    monto: 45,
    cuentaDestinoId: cajaId,
    estado: "Confirmado",
    fecha: "2026-07-15T10:00:00.000Z",
    registradoPor: "Test",
    facturaElectronicaId: facturaId,
  });
  const resultado2 = await fetchMovimientoConTrazabilidad(movFactura.id);
  assert(resultado2!.trazabilidad.facturaNumero === "001-001-000000099", `Resuelve facturaNumero (obtenido: "${resultado2!.trazabilidad.facturaNumero}")`);

  // Caso 3: Acreditado con 2 hijos.
  const pendiente = await crearMovimiento({
    tipo: "Ingreso",
    origen: "Facturación",
    categoria: "Venta Mostrador",
    monto: 30,
    cuentaDestinoId: transitoId,
    estado: "Pendiente",
    fecha: "2026-07-15T10:00:00.000Z",
    registradoPor: "Test",
  });
  const { movimiento: original, interno, ajuste } = await procesarAcreditacion(pendiente.id, {
    montoNeto: 28.8,
    fecha: "2026-07-17T10:00:00.000Z",
    registradoPor: "Test",
  });
  const resultado3 = await fetchMovimientoConTrazabilidad(original.id);
  assert(resultado3!.trazabilidad.movimientosCompensadores.length === 2, "compensadoPorIds resuelve exactamente 2 registros");
  const tipos = resultado3!.trazabilidad.movimientosCompensadores.map((h) => h.tipo).sort();
  assert(JSON.stringify(tipos) === JSON.stringify(["Ajuste", "Movimiento Interno"]), "Los 2 hijos resueltos tienen los tipos correctos");
  const hijoInterno = resultado3!.trazabilidad.movimientosCompensadores.find((h) => h.id === interno.id);
  const hijoAjuste = resultado3!.trazabilidad.movimientosCompensadores.find((h) => h.id === ajuste!.id);
  assert(!!hijoInterno && hijoInterno.categoria === "Acreditación Pasarela" && hijoInterno.monto === 28.8, "El hijo Interno resuelve categoría/monto correctos");
  assert(!!hijoAjuste && hijoAjuste.categoria === "Acreditación Pasarela" && hijoAjuste.monto === 1.2, "El hijo Ajuste resuelve categoría/monto correctos");

  // Y desde un hijo, "compensaA" apunta de vuelta al original.
  const resultadoHijo = await fetchMovimientoConTrazabilidad(interno.id);
  assert(resultadoHijo!.trazabilidad.compensaA?.id === original.id, "Desde el hijo, compensaA resuelve el original");

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — trazabilidad completa resuelta correctamente en los 3 casos.");
}

const fetchOriginal = global.fetch;
main();
