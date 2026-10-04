/**
 * Test — calcularNoEntregables() (auditoría Shipping V2, punto 1)
 * Ejecutar: npm test entregables
 *
 * Solo se factura lo que ya está en la tienda: Recibido y, si requiere
 * inspección, con la ficha firmada. Aplica a todos los caminos (mostrador,
 * reserva, operación, orden).
 */

import { calcularNoEntregables, mensajeNoEntregables } from "../reglas/entregables";
import type { DetalleFactura } from "../types/factura";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

function linea(shippingItemId: string | undefined, descripcion = "Producto"): DetalleFactura {
  return {
    descripcion,
    cantidad: 1,
    precioUnitario: 10,
    descuento: 0,
    precioTotalSinImpuesto: 10,
    impuestos: [{ codigo: "2", codigoPorcentaje: "4", tarifa: 15, baseImponible: 10, valor: 1.5 }],
    ...(shippingItemId ? { tipo: "producto" as const, shippingItemId } : {}),
  };
}

const enTienda = { SKU: "LAP-000001", "Estado Item": "Disponible", Recibido: true, "Requiere inspección": true, "Revisado física/técnicamente": true };
const enCamino = { SKU: "LAP-000002", "Estado Item": "En tránsito", Recibido: false, "Requiere inspección": true };
const sinFirmar = { SKU: "LAP-000003", "Estado Item": "En revisión", Recibido: true, "Requiere inspección": true, "Revisado física/técnicamente": false };
const cable = { SKU: "CAB-000001", "Estado Item": "Disponible", Recibido: true, "Requiere inspección": false };
const conNovedad = { SKU: "LAP-000004", "Estado Item": "Con novedad", Recibido: true, "Requiere inspección": false };

const registros = new Map<string, Record<string, unknown>>([
  ["recA", enTienda],
  ["recB", enCamino],
  ["recC", sinFirmar],
  ["recD", cable],
  ["recE", conNovedad],
]);

{
  const r = calcularNoEntregables([linea("recA"), linea("recD")], registros);
  assert(r.length === 0, "Laptop inspeccionada y cable recibido → se facturan");
}
{
  const r = calcularNoEntregables([linea("recB", "Laptop Dell")], registros);
  assert(r.length === 1 && r[0].detalle.includes("todavía no llega"), "Artículo en tránsito → bloqueado: todavía no llega");
  const msg = mensajeNoEntregables(r);
  assert(msg.includes("Laptop Dell") && msg.includes("LAP-000002"), `Mensaje nombra el artículo y su SKU (${msg})`);
}
{
  const r = calcularNoEntregables([linea("recC")], registros);
  assert(r.length === 1 && r[0].detalle.includes("inspección"), "Llegó sin inspección firmada → bloqueado");
}
{
  const r = calcularNoEntregables([linea("recE")], registros);
  assert(r.length === 1 && r[0].detalle.startsWith("no se puede vender"), "Con novedad → bloqueado");
}
{
  const r = calcularNoEntregables([linea("recZ")], registros);
  assert(r.length === 1, "Ítem que no existe → falla cerrado");
}
{
  const r = calcularNoEntregables([linea(undefined, "Servicio técnico"), linea("recA")], registros);
  assert(r.length === 0, "Líneas sin vínculo a inventario (servicios) no se verifican");
}
{
  const r = calcularNoEntregables([linea("recB"), linea("recB")], registros);
  assert(r.length === 1, "Dos líneas del mismo ítem → se reporta una sola vez");
}

if (fallos > 0) {
  console.error(`\n${fallos} assert(s) fallaron.`);
  process.exit(1);
}
console.log("\n✅ reglas.entregables.test.ts — todos los asserts pasaron");
