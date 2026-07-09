/**
 * Test — piezas puras del traductor (gancho Fase 16 PR2, construccion.ts).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/gancho.construccion.test.ts
 *
 * Puro, sin red — nada de Airtable, nada de getCuentaUnificada(). Cubre
 * exactamente los casos pedidos: línea producto con Tarifa IVA explícita y
 * con default; línea servicio; derivación 05/04/07; cuadre de formas de
 * pago con y sin saldo pendiente; bloqueo por item no Reservado y por item
 * con Factura previa.
 *
 * Lanza en la primera falla y sale con código distinto de 0.
 */

import {
  derivarTipoIdentificacion,
  construirLineaProducto,
  construirLineaServicio,
  agruparTotalConImpuestos,
  evaluarItemNoListo,
  calcularFormasPago,
} from "../gancho/construccion";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

// ─── derivarTipoIdentificacion ────────────────────────────────────────────────

assert(derivarTipoIdentificacion("1003710272") === "05", "10 dígitos → cédula (05)");
assert(derivarTipoIdentificacion("1792146739001") === "04", "13 dígitos terminados en 001 → RUC (04)");
assert(derivarTipoIdentificacion("1792146739999") === "07", "13 dígitos NO terminados en 001 → consumidor final (07)");
assert(derivarTipoIdentificacion("") === "07", "cédula vacía → consumidor final (07)");
assert(derivarTipoIdentificacion("123") === "07", "longitud rara → consumidor final (07)");

// ─── construirLineaProducto ───────────────────────────────────────────────────

// Tarifa IVA explícita (0%)
{
  const linea = construirLineaProducto(
    { id: "recITEM1", nombre: "Laptop reparada", precio: 100 },
    { sku: "REP-001", tarifaIva: "0%" }
  );
  assert(linea.tipo === "producto", "Línea de producto: tipo marcado como 'producto'");
  assert(linea.shippingItemId === "recITEM1", "Línea de producto: shippingItemId presente");
  assert(linea.codigoPrincipal === "REP-001", "Línea de producto: codigoPrincipal = SKU");
  assert(linea.impuestos[0].codigoPorcentaje === "2", "Tarifa IVA '0%' explícita → codigoPorcentaje '2'");
  assert(linea.impuestos[0].valor === 0, "Tarifa IVA '0%' explícita → IVA en $0");
  assert(linea.precioTotalSinImpuesto === 100, "precioTotalSinImpuesto = precio (cantidad siempre 1)");
}

// Sin Tarifa IVA (vacía) → default 15%
{
  const linea = construirLineaProducto(
    { id: "recITEM2", nombre: "Pantalla", precio: 80 },
    { sku: "REP-002", tarifaIva: "" }
  );
  assert(linea.impuestos[0].codigoPorcentaje === "4", "Sin Tarifa IVA → default 15% (codigoPorcentaje '4')");
  assert(linea.impuestos[0].valor === 12, "Sin Tarifa IVA → IVA calculado sobre 15% (80 * 0.15 = 12)");
}

// Sin detalle en absoluto (undefined) → también default 15%
{
  const linea = construirLineaProducto({ id: "recITEM3", nombre: "Repuesto genérico", precio: 50 }, undefined);
  assert(linea.impuestos[0].codigoPorcentaje === "4", "Sin detalle (undefined) → default 15%");
  assert(linea.codigoPrincipal === undefined, "Sin detalle → sin codigoPrincipal (SKU desconocido)");
}

// ─── construirLineaServicio ───────────────────────────────────────────────────

{
  const linea = construirLineaServicio({ nombre: "Diagnóstico", costo: 35 }, 1);
  assert(linea.tipo === "servicio", "Línea de servicio: tipo marcado como 'servicio'");
  assert(linea.codigoPrincipal === "SRV-1", "Línea de servicio: codigoPrincipal = SRV-<n>");
  assert(linea.impuestos[0].codigoPorcentaje === "4", "Servicio siempre a 15% (SERVICIO_IVA_DEFAULT)");
  assert(linea.impuestos[0].valor === 5.25, "IVA de servicio calculado correctamente (35 * 0.15 = 5.25)");
  assert(!("shippingItemId" in linea) || linea.shippingItemId === undefined, "Línea de servicio no debe traer shippingItemId");
}
{
  const linea = construirLineaServicio({ nombre: "Mano de obra", costo: 20 }, 2);
  assert(linea.codigoPrincipal === "SRV-2", "Segundo servicio: SRV-2 (consecutivo)");
}

// ─── agruparTotalConImpuestos ─────────────────────────────────────────────────

{
  const detalles = [
    construirLineaProducto({ id: "a", nombre: "A", precio: 100 }, { sku: "A", tarifaIva: "15%" }),
    construirLineaProducto({ id: "b", nombre: "B", precio: 50 }, { sku: "B", tarifaIva: "15%" }),
    construirLineaServicio({ nombre: "Servicio", costo: 20 }, 1), // también 15%
    construirLineaProducto({ id: "c", nombre: "C", precio: 30 }, { sku: "C", tarifaIva: "0%" }),
  ];
  const agrupado = agruparTotalConImpuestos(detalles);
  const grupo15 = agrupado.find((t) => t.codigoPorcentaje === "4");
  const grupo0  = agrupado.find((t) => t.codigoPorcentaje === "2");
  assert(!!grupo15, "Debe existir un grupo para 15%");
  assert(grupo15?.baseImponible === 170, "Grupo 15%: base = 100+50+20 = 170");
  assert(Math.abs((grupo15?.valor ?? 0) - 25.5) < 0.001, "Grupo 15%: IVA = 170*0.15 = 25.5");
  assert(!!grupo0, "Debe existir un grupo para 0%");
  assert(grupo0?.baseImponible === 30, "Grupo 0%: base = 30");
  assert(grupo0?.valor === 0, "Grupo 0%: IVA = 0");
}

// ─── evaluarItemNoListo ────────────────────────────────────────────────────────

{
  const bloqueo = evaluarItemNoListo(
    { id: "recX", nombre: "Item sin reservar" },
    { reservado: false, tieneFacturaPrevia: false }
  );
  assert(bloqueo?.motivo === "NO_RESERVADO", "Item con Reservado=false debe bloquear con NO_RESERVADO");
}
{
  const bloqueo = evaluarItemNoListo(
    { id: "recY", nombre: "Item ya facturado" },
    { reservado: true, tieneFacturaPrevia: true }
  );
  assert(bloqueo?.motivo === "YA_FACTURADO", "Item con link Factura previo debe bloquear con YA_FACTURADO");
}
{
  const bloqueo = evaluarItemNoListo(
    { id: "recZ", nombre: "Item listo" },
    { reservado: true, tieneFacturaPrevia: false }
  );
  assert(bloqueo === null, "Item Reservado y sin Factura previa no debe bloquear");
}
{
  // Prioridad: si tiene AMBOS problemas, reporta YA_FACTURADO (más específico/grave)
  const bloqueo = evaluarItemNoListo(
    { id: "recW", nombre: "Item con los dos problemas" },
    { reservado: false, tieneFacturaPrevia: true }
  );
  assert(bloqueo?.motivo === "YA_FACTURADO", "Con ambos problemas, prioriza YA_FACTURADO sobre NO_RESERVADO");
}

// ─── calcularFormasPago ────────────────────────────────────────────────────────

// Sin saldo pendiente: abonos cubren el total exacto
{
  const pagos = calcularFormasPago(
    [{ metodoPago: "Efectivo", monto: 60 }, { metodoPago: "Transferencia", monto: 40 }],
    100
  );
  assert(pagos.length === 2, "Sin saldo pendiente: no se agrega línea extra");
  assert(pagos[0].formaPago === "01", "Efectivo → forma de pago 01");
  assert(pagos[1].formaPago === "20", "Transferencia → forma de pago 20");
  const suma = pagos.reduce((s, p) => s + p.total, 0);
  assert(Math.abs(suma - 100) < 0.01, "La suma de formas de pago debe cuadrar exacto con el total");
}

// Con saldo pendiente: se agrega la forma de pago default por el saldo
{
  const pagos = calcularFormasPago([{ metodoPago: "Efectivo", monto: 60 }], 100);
  assert(pagos.length === 2, "Con saldo pendiente: se agrega una línea extra");
  assert(pagos[1].formaPago === "01", "La línea de saldo usa la forma de pago default (01)");
  assert(Math.abs(pagos[1].total - 40) < 0.01, "La línea de saldo es exactamente el pendiente (100-60=40)");
  const suma = pagos.reduce((s, p) => s + p.total, 0);
  assert(Math.abs(suma - 100) < 0.01, "La suma con saldo agregado cuadra exacto con el total");
}

// Sin abonos en absoluto (cuenta recién creada, sin pagos): una sola línea por el total
{
  const pagos = calcularFormasPago([], 46);
  assert(pagos.length === 1, "Sin abonos: una sola línea");
  assert(pagos[0].total === 46, "Sin abonos: la única línea es el total completo");
}

// Método de pago sin mapeo conocido → fallback (no debería pasar con los 7
// valores reales de Abonos, pero no debe romper si aparece uno nuevo)
{
  const pagos = calcularFormasPago([{ metodoPago: "Bitcoin", monto: 10 }], 10);
  assert(pagos[0].formaPago === "01", "Método de pago desconocido cae al fallback (01)");
}

if (fallos > 0) {
  console.error(`\n❌ gancho.construccion.test.ts — ${fallos} aserción(es) fallida(s)`);
  process.exit(1);
}
console.log("\n✅ gancho.construccion.test.ts — todos los asserts pasaron");
