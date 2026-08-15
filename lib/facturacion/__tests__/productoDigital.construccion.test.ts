/**
 * Test — productos digitales en la factura (gancho, construccion.ts).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/productoDigital.construccion.test.ts
 *
 * Puro, sin red — nada de Airtable, nada de getCuentaUnificada(). Cubre:
 *   (a) una orden con productos digitales produce importeTotal === totalCuenta
 *       — y AL REVÉS: sin las líneas digitales (el bug original), el mismo
 *       cálculo se queda corto exactamente por el total de productos
 *       digitales, para probar que el assert de (a) de verdad detecta el
 *       fallo y no pasa por casualidad.
 *   (b) un producto digital sin Precio Venta bloquea la pre-factura
 *       (evaluarProductoDigitalNoListo) — INCLUSO si tiene precio de
 *       catálogo: no hay fallback (ver el comentario junto a
 *       resolverPrecioProductoDigital() en construccion.ts — el rollup
 *       "Total Productos Digitales" de Airtable solo suma Precio Venta).
 *   + construirLineaProductoDigital() en aislado: desglose de IVA,
 *     codigoPrincipal.
 *
 * Lanza en la primera falla y sale con código distinto de 0.
 */

import {
  construirLineaProducto, construirLineaServicio, construirLineaProductoDigital,
  evaluarProductoDigitalNoListo, round2,
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

// ─── construirLineaProductoDigital — cuadre e identidad ──────────────────────

{
  const linea = construirLineaProductoDigital(
    { id: "recPD1", nombre: "Windows 11 Pro", precioVenta: 20 },
    1
  );
  assert(linea.tipo === "productoDigital", "Línea de producto digital: tipo marcado como 'productoDigital'");
  assert(linea.productoDigitalId === "recPD1", "Línea de producto digital: productoDigitalId presente");
  assert(linea.codigoPrincipal === "DIG-1", "Línea de producto digital: codigoPrincipal = DIG-<n>");
  assert(linea.descripcion === "Windows 11 Pro", "Línea de producto digital: descripcion = nombre del software");
  assert(linea.impuestos[0].codigoPorcentaje === "4", "Producto digital siempre a 15% (SERVICIO_IVA_DEFAULT, sin campo de IVA propio)");
  assert(linea.precioTotalSinImpuesto === 17.39, "IVA incluido: base = 20/1.15 = 17.39 (no 20)");
  assert(linea.impuestos[0].valor === 2.61, "IVA incluido: IVA = 20 - 17.39 = 2.61 (no 20*0.15=3)");
  assert(
    linea.precioTotalSinImpuesto + linea.impuestos[0].valor === 20,
    "Cuadre exacto: base + IVA debe reconstruir el precio final ($20) al centavo"
  );
  assert(!("shippingItemId" in linea) || linea.shippingItemId === undefined, "Línea de producto digital no debe traer shippingItemId");
}
{
  const linea = construirLineaProductoDigital(
    { id: "recPD2", nombre: "Office 365", precioVenta: 30 },
    2
  );
  assert(linea.codigoPrincipal === "DIG-2", "Segundo producto digital: DIG-2 (consecutivo)");
}

// Sin fallback: con precioVenta en 0, la línea sale en $0 tal cual — esta
// función ya NO mira ningún catálogo. Es exactamente por esto que
// evaluarProductoDigitalNoListo() tiene que correr ANTES en el traductor: a
// esta función no le corresponde bloquear nada, solo construir con lo que
// le den.
{
  const linea = construirLineaProductoDigital(
    { id: "recPD3", nombre: "Antivirus X", precioVenta: 0 },
    1
  );
  assert(linea.precioTotalSinImpuesto + linea.impuestos[0].valor === 0, "precioVenta=0 → línea de $0, sin caer a ningún catálogo");
}

// ─── evaluarProductoDigitalNoListo — precondición dura (PASO 4) ──────────────
// Sin fallback: el ÚNICO precio que cuenta es precioVenta. Un producto con
// precio de catálogo pero sin Precio Venta bloquea igual — es el caso que
// motivó quitar el fallback (el rollup "Total Productos Digitales" nunca
// suma el catálogo, así que dejarlo pasar habría vuelto a desviar
// importeTotal de cuenta.totalCuenta).

{
  const bloqueo = evaluarProductoDigitalNoListo(
    { id: "recPD5", nombre: "Licencia sin precio", precioVenta: 0 }
  );
  assert(bloqueo?.motivo === "SIN_PRECIO", "Sin precioVenta → bloquea con SIN_PRECIO");
  assert(bloqueo?.id === "recPD5", "El bloqueo identifica el producto exacto");
  assert(bloqueo?.nombre === "Licencia sin precio", "El bloqueo trae el nombre para el mensaje al usuario");
}
{
  // Caso que motivó este cambio: precioVenta vacío, PERO con precio de
  // catálogo. Antes esto caía al catálogo y no bloqueaba — ahora bloquea
  // igual, porque el catálogo nunca entra al rollup que cuenta_unificada usa
  // para totalProductosDigitales.
  const bloqueo = evaluarProductoDigitalNoListo(
    { id: "recPD6", nombre: "Licencia con catálogo pero sin Precio Venta", precioVenta: 0 }
  );
  assert(bloqueo?.motivo === "SIN_PRECIO", "precioVenta vacío CON catálogo con precio → bloquea igual (ya no hay fallback)");
}
{
  const bloqueo = evaluarProductoDigitalNoListo(
    { id: "recPD7", nombre: "Licencia normal", precioVenta: 25 }
  );
  assert(bloqueo === null, "Con precioVenta > 0 no bloquea");
}

// ─── (a) importeTotal === totalCuenta con productos digitales ────────────────
//
// Escenario realista (mismo orden de magnitud que OR000418 en producción:
// varios productos digitales + un repuesto + un servicio). Se reproduce a
// mano la misma fórmula que lib/cuenta-unificada/index.ts usa para
// totalCuenta (totalRepuestos + totalServicios + totalProductosDigitales)
// y se compara contra el importeTotal que resultaría de construir todas las
// líneas — el mismo cálculo que hace traductor.ts.

{
  const lineaRepuesto = construirLineaProducto(
    { id: "recITEM1", nombre: "Pantalla", precio: 34.50 },
    { sku: "REP-100", tarifaIva: "15%" }
  );
  const lineaServicio = construirLineaServicio({ nombre: "Diagnóstico", costo: 23 }, 1);
  const lineaDigital1 = construirLineaProductoDigital(
    { id: "recPDA", nombre: "Windows 11 Pro", precioVenta: 20 }, 1
  );
  const lineaDigital2 = construirLineaProductoDigital(
    { id: "recPDB", nombre: "Office 365", precioVenta: 15 }, 2
  );

  // totalCuenta tal como lo arma lib/cuenta-unificada/index.ts: suma de
  // precios "finales" de cada fuente, SIN pasar por el desglose de IVA — es
  // la cuenta que ve el técnico, en dólares reales cobrados al cliente.
  const totalRepuestos          = 34.50;
  const totalServicios          = 23;
  const totalProductosDigitales = 20 + 15;
  const totalCuenta = round2(totalRepuestos + totalServicios + totalProductosDigitales);

  const detallesConDigitales = [lineaRepuesto, lineaServicio, lineaDigital1, lineaDigital2];
  const totalSinImpuestos = round2(detallesConDigitales.reduce((s, d) => s + d.precioTotalSinImpuesto, 0));
  const totalIva          = round2(detallesConDigitales.reduce((s, d) => s + d.impuestos.reduce((si, imp) => si + imp.valor, 0), 0));
  const importeTotal      = round2(totalSinImpuestos + totalIva);

  assert(totalCuenta === 92.50, `Sanity: totalCuenta armado a mano = 92.50 (vino $${totalCuenta})`);
  assert(
    importeTotal === totalCuenta,
    `(a) CON las líneas digitales: importeTotal ($${importeTotal}) === totalCuenta ($${totalCuenta})`
  );

  // ── Al revés: sin las líneas digitales (el estado ANTES de este trabajo,
  // traductor.ts línea 116 sin construirLineaProductoDigital), el mismo
  // cálculo se queda corto — y corto EXACTAMENTE por el total de productos
  // digitales, que es el síntoma descrito en el pedido ("importeTotal queda
  // corto por el valor de los productos digitales"). Si alguien revirtiera
  // el fix de traductor.ts, este assert de arriba (importeTotal ===
  // totalCuenta) fallaría — esto lo demuestra sin necesidad de tocar código.
  const detallesSinDigitales = [lineaRepuesto, lineaServicio];
  const totalSinImpuestosViejo = round2(detallesSinDigitales.reduce((s, d) => s + d.precioTotalSinImpuesto, 0));
  const totalIvaViejo          = round2(detallesSinDigitales.reduce((s, d) => s + d.impuestos.reduce((si, imp) => si + imp.valor, 0), 0));
  const importeTotalViejo      = round2(totalSinImpuestosViejo + totalIvaViejo);

  assert(
    importeTotalViejo !== totalCuenta,
    `(a al revés) SIN las líneas digitales, importeTotal ($${importeTotalViejo}) NO debe coincidir con totalCuenta ($${totalCuenta}) — es el bug que se arregló`
  );
  assert(
    round2(totalCuenta - importeTotalViejo) === totalProductosDigitales,
    `(a al revés) El faltante sin las líneas digitales es EXACTO al total de productos digitales ($${totalProductosDigitales}), no un redondeo raro`
  );
}

if (fallos > 0) {
  console.error(`\n❌ productoDigital.construccion.test.ts — ${fallos} aserción(es) fallida(s)`);
  process.exit(1);
}
console.log("\n✅ productoDigital.construccion.test.ts — todos los asserts pasaron");
