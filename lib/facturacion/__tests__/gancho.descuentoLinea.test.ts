/**
 * Test — el descuento de la cuenta llega a la factura y al recibo como
 * descuento de LÍNEA (auditoría ops, punto 4B).
 * Ejecutar: npm test gancho.descuentoLinea
 *
 * Caso OR000423: SSD de $40 (IVA 15 % incluido) con −$20 de descuento.
 *   · Factura (SRI): cantidad × precioUnitario − descuento = precioTotalSinImpuesto,
 *     y base + IVA = $20.00 exactos (lo que dice la cuenta).
 *   · Formularios: ven el precio de lista $40 y el descuento $20 (términos
 *     finales); el recibo suma $20.
 */
import fs from "fs";
import { aplicarDescuentoALinea, construirLineaProducto, construirLineaServicio } from "../gancho/construccion";
import { desglosarPrecioConIvaIncluido } from "../ivaIncluido";
import { precioYDescuentoFinal, lineasReciboDesdePrefactura, lineasProformaDesdePrefactura } from "../gancho/prefill";
import { totalRecibo } from "../recibos/calculos";
import { totalFinalLinea } from "../reglas/cobroDocumento";
import type { DatosVenta } from "../emitirFactura";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const ecuacionSri = (d: { cantidad: number; precioUnitario: number; descuento: number; precioTotalSinImpuesto: number }) =>
  r2(d.cantidad * d.precioUnitario - d.descuento) === d.precioTotalSinImpuesto;

// 1. SSD de $40 con −$20.
const ssd = construirLineaProducto({ id: "recSSD", nombre: "SSD 120GB", precio: 40, cantidad: 1 }, { sku: "REP-000017", tarifaIva: "15%" });
const conDesc = aplicarDescuentoALinea(ssd, 20);
assert(totalFinalLinea(conDesc) === 20, `la línea vale $20.00 final — vino ${totalFinalLinea(conDesc)}`);
assert(conDesc.precioUnitario === ssd.precioUnitario, "el precio unitario (de lista) no cambia");
assert(conDesc.descuento > 0 && ecuacionSri(conDesc), `SRI: cantidad × unitario − descuento = base (${conDesc.cantidad} × ${conDesc.precioUnitario} − ${conDesc.descuento} = ${conDesc.precioTotalSinImpuesto})`);
assert(conDesc.impuestos[0].baseImponible === conDesc.precioTotalSinImpuesto, "el IVA se calcula sobre la base neta");
assert(conDesc.precioFinalUnitario === 40 && conDesc.descuentoFinal === 20, "viajan precio de lista $40 y descuento $20 para los formularios");
assert(aplicarDescuentoALinea(ssd, undefined) === ssd && aplicarDescuentoALinea(ssd, 0) === ssd, "sin descuento la línea no cambia");

// 2. Varias unidades y servicio.
{
  const dos = aplicarDescuentoALinea(construirLineaProducto({ id: "recX", nombre: "RAM", precio: 60, cantidad: 2 }, { sku: "RAM", tarifaIva: "15%" }), 10);
  assert(totalFinalLinea(dos) === 50 && ecuacionSri(dos), "2 unidades de $30 con −$10 → $50, ecuación del SRI exacta");
  const serv = aplicarDescuentoALinea(construirLineaServicio({ nombre: "Limpieza", costo: 25 }, 1), 25);
  assert(totalFinalLinea(serv) === 0 && serv.precioTotalSinImpuesto === 0 && ecuacionSri(serv), "descuento del 100 % → línea en $0 (no negativa)");
  const cero = aplicarDescuentoALinea(construirLineaProducto({ id: "recZ", nombre: "Cable", precio: 10, cantidad: 1 }, { sku: "C", tarifaIva: "0%" }), 3);
  assert(totalFinalLinea(cero) === 7 && cero.impuestos[0].valor === 0, "tarifa 0 %: $10 − $3 = $7 sin IVA");
}

// 3. Formularios: precio de lista y descuento en términos finales.
{
  const pf = precioYDescuentoFinal(conDesc);
  assert(pf.precioUnitario === 40 && pf.descuento === 20, "precio $40 y descuento $20 para el formulario");
  const sinDesc = precioYDescuentoFinal(ssd);
  assert(sinDesc.precioUnitario === 40 && sinDesc.descuento === 0, "línea sin descuento: igual que antes");

  // Misma cuenta que hace FacturacionForm al emitir (precios con IVA incluido):
  const neto = r2(1 * pf.precioUnitario - pf.descuento);
  const { base } = desglosarPrecioConIvaIncluido(neto, 15);
  assert(base === conDesc.precioTotalSinImpuesto, "lo que arma el formulario coincide con la línea del servidor (no se rechaza como 'cuenta modificada')");

  const datosVenta = { detalles: [conDesc, ssd] } as unknown as DatosVenta;
  assert(totalRecibo(lineasReciboDesdePrefactura(datosVenta)) === 60, "recibo: $20 (SSD con descuento) + $40 = $60");
  assert(lineasProformaDesdePrefactura(datosVenta)[0].descuento === 20, "proforma: muestra el descuento de $20");
}

// 4. El gancho aplica el descuento a TODAS las clases de línea y suma totalDescuento.
{
  const src = fs.readFileSync("lib/facturacion/gancho/traductor.ts", "utf8");
  const usos = (src.match(/conDescuento\(/g) ?? []).length;
  assert(usos >= 4, `productos, servicios, históricos y digitales pasan por conDescuento (${usos})`);
  assert(src.includes("totalDescuento: round2(detalles.reduce((s, d) => s + (d.descuento || 0), 0))"), "totalDescuento = suma de los descuentos de línea");
  assert(src.includes("descuentoPorCargo(cuenta.descuentos)"), "usa la MISMA lista de descuentos que la calculadora");
  const form = fs.readFileSync("components/facturacion/FacturacionForm.tsx", "utf8");
  assert(form.includes("...precioYDescuentoFinal(d)"), "FacturacionForm precarga con la misma función que recibo y proforma");
}

if (fallos > 0) { console.error(`\n${fallos} prueba(s) fallaron.`); process.exit(1); }
console.log("\nTodas las pruebas pasaron.");
