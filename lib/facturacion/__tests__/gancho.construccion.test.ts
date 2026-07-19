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
  desglosarPrecioConIvaIncluido,
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

// ─── desglosarPrecioConIvaIncluido — cuadre al centavo ───────────────────────
// Decisión de negocio: los precios de la cuenta unificada son finales CON
// IVA incluido — el desglose debe reconstruir el precio final EXACTO
// (base + valorIva === precioFinal), sin importar la acumulación de
// redondeos de dividir por 1.15. Se prueba con precios "feos" a propósito.

for (const precioFinal of [100, 50, 80, 35, 20, 46, 33.33, 10, 1, 0.01, 115, 19.99, 7.77]) {
  const { base, valorIva } = desglosarPrecioConIvaIncluido(precioFinal, 15);
  const reconstruido = Math.round((base + valorIva) * 100) / 100;
  assert(
    reconstruido === Math.round(precioFinal * 100) / 100,
    `Cuadre al centavo (15%, precio $${precioFinal}): base ($${base}) + IVA ($${valorIva}) = $${reconstruido}, debe ser $${precioFinal}`
  );
}
// tarifa 0: el precio final YA es la base, nada que desglosar
{
  const { base, valorIva } = desglosarPrecioConIvaIncluido(46, 0);
  assert(base === 46, "Tarifa 0%: base = precio final tal cual");
  assert(valorIva === 0, "Tarifa 0%: IVA = 0");
}

// ─── construirLineaProducto ───────────────────────────────────────────────────

// Tarifa IVA explícita (0%) — precio final = base, sin nada que desglosar
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
  assert(linea.precioTotalSinImpuesto === 100, "0%: precioTotalSinImpuesto = precio final tal cual (nada que desglosar)");
  assert(linea.precioUnitario === 100, "0%: precioUnitario = precio final tal cual");
}

// Sin Tarifa IVA (vacía) → default 15% — precio $80 CON IVA incluido, se
// desglosa hacia adentro (no se suma IVA encima de 80)
{
  const linea = construirLineaProducto(
    { id: "recITEM2", nombre: "Pantalla", precio: 80 },
    { sku: "REP-002", tarifaIva: "" }
  );
  assert(linea.impuestos[0].codigoPorcentaje === "4", "Sin Tarifa IVA → default 15% (codigoPorcentaje '4')");
  assert(linea.precioTotalSinImpuesto === 69.57, "IVA incluido: base = 80/1.15 = 69.57 (no 80)");
  assert(linea.precioUnitario === 69.57, "IVA incluido: precioUnitario también en base, no en precio final");
  assert(linea.impuestos[0].valor === 10.43, "IVA incluido: IVA = 80 - 69.57 = 10.43 (no 80*0.15=12)");
  assert(
    linea.precioTotalSinImpuesto + linea.impuestos[0].valor === 80,
    "Cuadre exacto: base + IVA debe reconstruir el precio final ($80) al centavo"
  );
}

// Sin detalle en absoluto (undefined) → también default 15%
{
  const linea = construirLineaProducto({ id: "recITEM3", nombre: "Repuesto genérico", precio: 50 }, undefined);
  assert(linea.impuestos[0].codigoPorcentaje === "4", "Sin detalle (undefined) → default 15%");
  assert(linea.codigoPrincipal === undefined, "Sin detalle → sin codigoPrincipal (SKU desconocido)");
  assert(linea.precioTotalSinImpuesto === 43.48, "IVA incluido: base = 50/1.15 = 43.48");
}

// ─── construirLineaServicio ───────────────────────────────────────────────────
// costo también es precio final CON IVA incluido — mismo desglose.

{
  const linea = construirLineaServicio({ nombre: "Diagnóstico", costo: 35 }, 1);
  assert(linea.tipo === "servicio", "Línea de servicio: tipo marcado como 'servicio'");
  assert(linea.codigoPrincipal === "SRV-1", "Línea de servicio: codigoPrincipal = SRV-<n>");
  assert(linea.impuestos[0].codigoPorcentaje === "4", "Servicio siempre a 15% (SERVICIO_IVA_DEFAULT)");
  assert(linea.precioTotalSinImpuesto === 30.43, "IVA incluido: base = 35/1.15 = 30.43 (no 35)");
  assert(linea.impuestos[0].valor === 4.57, "IVA incluido: IVA = 35 - 30.43 = 4.57 (no 35*0.15=5.25)");
  assert(
    linea.precioTotalSinImpuesto + linea.impuestos[0].valor === 35,
    "Cuadre exacto: base + IVA debe reconstruir el costo final del servicio ($35) al centavo"
  );
  assert(!("shippingItemId" in linea) || linea.shippingItemId === undefined, "Línea de servicio no debe traer shippingItemId");
}
{
  const linea = construirLineaServicio({ nombre: "Mano de obra", costo: 20 }, 2);
  assert(linea.codigoPrincipal === "SRV-2", "Segundo servicio: SRV-2 (consecutivo)");
}

// ─── agruparTotalConImpuestos ─────────────────────────────────────────────────
// Mismos precios de antes, ahora interpretados como finales CON IVA incluido.

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
  assert(grupo15?.baseImponible === 147.83, "Grupo 15%: base desglosada = 86.96+43.48+17.39 = 147.83 (no 170)");
  assert(grupo15?.valor === 22.17, "Grupo 15%: IVA desglosado = 13.04+6.52+2.61 = 22.17 (no 170*0.15=25.5)");
  assert(!!grupo0, "Debe existir un grupo para 0%");
  assert(grupo0?.baseImponible === 30, "Grupo 0%: base = 30 (nada que desglosar)");
  assert(grupo0?.valor === 0, "Grupo 0%: IVA = 0");

  const totalSinImpuestos = Math.round(detalles.reduce((s, d) => s + d.precioTotalSinImpuesto, 0) * 100) / 100;
  const totalIva = Math.round(agrupado.reduce((s, t) => s + t.valor, 0) * 100) / 100;
  const importeTotal = Math.round((totalSinImpuestos + totalIva) * 100) / 100;
  assert(
    importeTotal === 200,
    `VALOR TOTAL debe reconstruir exacto la suma de precios finales (100+50+20+30=200) — vino $${importeTotal}`
  );
}

// ─── evaluarItemNoListo ────────────────────────────────────────────────────────

// Fase 17.b: la puerta principal ahora es el stock (cantidad). Un registro
// puede representar varias unidades y venderse en partes.
{
  const bloqueo = evaluarItemNoListo(
    { id: "recX", nombre: "Item sin reservar" },
    { reservado: false, tieneFacturaPrevia: false, cantidad: 1 }
  );
  assert(bloqueo?.motivo === "NO_RESERVADO", "Item con Reservado=false debe bloquear con NO_RESERVADO");
}
{
  // El caso clásico del registro-por-unidad: ya vendido = factura previa + cantidad 0
  const bloqueo = evaluarItemNoListo(
    { id: "recY", nombre: "Item ya facturado" },
    { reservado: true, tieneFacturaPrevia: true, cantidad: 0 }
  );
  assert(bloqueo?.motivo === "YA_FACTURADO", "Item agotado con link Factura previo debe bloquear con YA_FACTURADO");
}
{
  const bloqueo = evaluarItemNoListo(
    { id: "recZ", nombre: "Item listo" },
    { reservado: true, tieneFacturaPrevia: false, cantidad: 1 }
  );
  assert(bloqueo === null, "Item Reservado, con stock y sin Factura previa no debe bloquear");
}
{
  // Prioridad: agotado con AMBOS problemas reporta YA_FACTURADO (más específico/grave)
  const bloqueo = evaluarItemNoListo(
    { id: "recW", nombre: "Item con los dos problemas" },
    { reservado: false, tieneFacturaPrevia: true, cantidad: 0 }
  );
  assert(bloqueo?.motivo === "YA_FACTURADO", "Con ambos problemas, prioriza YA_FACTURADO sobre NO_RESERVADO");
}
{
  // Fase 17.b — sin stock y sin factura previa: SIN_STOCK
  const bloqueo = evaluarItemNoListo(
    { id: "recS", nombre: "Item agotado" },
    { reservado: true, tieneFacturaPrevia: false, cantidad: 0 }
  );
  assert(bloqueo?.motivo === "SIN_STOCK", "Item con Cantidad 0 sin factura previa debe bloquear con SIN_STOCK");
}
{
  // Fase 17.b — factura previa PERO stock restante: vendible (venta parcial previa)
  const bloqueo = evaluarItemNoListo(
    { id: "recP", nombre: "Item parcialmente vendido" },
    { reservado: true, tieneFacturaPrevia: true, cantidad: 3 }
  );
  assert(bloqueo === null, "Item con factura previa pero stock restante NO debe bloquear (venta parcial)");
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
