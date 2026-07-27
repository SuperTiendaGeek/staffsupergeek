/**
 * Línea de factura de un repuesto histórico ("Repuestos por Orden").
 * Ejecutar: npx tsx lib/facturacion/__tests__/gancho.repuestoHistorico.test.ts
 *
 * Antes del fix, el traductor armaba las líneas SOLO con Shipping Items y
 * servicios. Los repuestos de la tabla histórica sumaban al total de la cuenta
 * pero no generaban línea, así que la factura salía por menos de lo cobrado:
 *
 *   OR000031 → $160 de repuestos + $25 de servicio = $185 en pantalla,
 *              factura de $25.
 *
 * 47 órdenes en esa situación por $3.234. Ninguna se había facturado todavía
 * (las dos facturas emitidas, OR000342 y OR000368, no tenían históricos).
 */

import { construirLineaRepuestoHistorico, agruparTotalConImpuestos, round2 } from "../gancho/construccion";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

const IVA = 0.15;

// ── Caso real: la motherboard de OR000031 ───────────────────────────────────
{
  const linea = construirLineaRepuestoHistorico(
    { nombre: "TP412U Asus Motherboard i5-8250u 60NB0J70-MB1020", cantidad: 1, subtotal: 160 },
    1
  );

  assert(linea.descripcion.startsWith("TP412U Asus"), "Conserva el nombre del repuesto tal como se anotó");
  assert(linea.cantidad === 1, "Cantidad 1");
  assert(linea.tipo === "producto", "Se factura como producto, no como servicio");
  assert(linea.codigoPrincipal === "REP-H1", "Lleva un código propio para distinguirlo en la factura");

  // $160 es precio final CON IVA incluido → base 139.13, IVA 20.87
  const baseEsperada = round2(160 / (1 + IVA));
  assert(
    Math.abs(linea.precioTotalSinImpuesto - baseEsperada) < 0.01,
    `El precio se desglosa hacia adentro: base ${baseEsperada} (vino ${linea.precioTotalSinImpuesto})`
  );
  const conIva = round2(linea.precioTotalSinImpuesto + linea.impuestos[0].valor);
  assert(Math.abs(conIva - 160) < 0.02, `Base + IVA vuelve a dar los $160 cobrados (vino ${conIva})`);
  assert(linea.impuestos[0].tarifa === 15, "Tarifa de IVA 15%");
}

// ── Cantidad mayor que 1: el unitario se deriva del subtotal ─────────────────
{
  const linea = construirLineaRepuestoHistorico({ nombre: "Memoria RAM 8GB", cantidad: 2, subtotal: 90 }, 3);
  assert(linea.cantidad === 2, "Respeta la cantidad del renglón (un histórico puede traer varias unidades)");
  const totalDesdeUnitario = round2(linea.precioUnitario * linea.cantidad);
  assert(
    Math.abs(totalDesdeUnitario - linea.precioTotalSinImpuesto) < 0.02,
    `unitario × cantidad = total del renglón (${totalDesdeUnitario} vs ${linea.precioTotalSinImpuesto})`
  );
  assert(linea.codigoPrincipal === "REP-H3", "El código sigue el índice del renglón");
}

// ── Cantidad ausente o inválida ─────────────────────────────────────────────
{
  const sinCantidad = construirLineaRepuestoHistorico({ nombre: "Cable", cantidad: null, subtotal: 12 }, 1);
  assert(sinCantidad.cantidad === 1, "Sin cantidad registrada asume 1");
  const cero = construirLineaRepuestoHistorico({ nombre: "Cable", cantidad: 0, subtotal: 12 }, 1);
  assert(cero.cantidad === 1, "Cantidad 0 se trata como 1 (no puede dividir por cero)");
}

// ── La factura completa vuelve a cuadrar con lo cobrado ─────────────────────
{
  // OR000031: repuesto histórico $160 + servicio $25 = $185
  const repuesto = construirLineaRepuestoHistorico({ nombre: "Motherboard", cantidad: 1, subtotal: 160 }, 1);
  const servicio = {
    ...construirLineaRepuestoHistorico({ nombre: "Mano de obra", cantidad: 1, subtotal: 25 }, 2),
    tipo: "servicio" as const,
  };
  const detalles = [repuesto, servicio];

  const totalSinImpuestos = round2(detalles.reduce((s, d) => s + d.precioTotalSinImpuesto, 0));
  const totalIva = round2(agruparTotalConImpuestos(detalles).reduce((s, t) => s + t.valor, 0));
  const importeTotal = round2(totalSinImpuestos + totalIva);

  assert(
    Math.abs(importeTotal - 185) < 0.02,
    `FIX: la factura de OR000031 sale por $185, no por $25 (vino ${importeTotal})`
  );
}

if (fallos > 0) {
  console.error(`\n${fallos} assert(s) fallaron.`);
  process.exit(1);
}
console.log("\n✅ gancho.repuestoHistorico.test.ts — todos los asserts pasaron");
