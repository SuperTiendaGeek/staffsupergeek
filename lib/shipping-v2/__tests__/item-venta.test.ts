/**
 * Regla de venta de un Shipping Item (auditoría Shipping V2, punto 1).
 * Ejecutar: npm test item-venta
 *
 * Reservar se puede desde que el artículo existe; VENDER exige que haya
 * llegado (Recibido) y, si requiere inspección, que la ficha esté firmada.
 * Antes el buscador de Facturación solo miraba "Disponible para venta" y se
 * podían facturar artículos que seguían en eBay o en la caja de Roberto
 * (36 aparecían en el buscador el 3-oct-2026).
 */

import { estadoSegunLlegada, evaluarVentaItem, requiereInspeccionPorDefecto } from "../item-venta";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

type Entrada = Parameters<typeof evaluarVentaItem>[0];
const base: Entrada = {
  estado: "Disponible",
  estadoRevision: "Recibido correctamente",
  usoLocal: false,
  recibido: true,
  requiereInspeccion: true,
  inspeccionFirmada: true,
};

function vendible(caso: string, patch: Partial<Entrada>) {
  const r = evaluarVentaItem({ ...base, ...patch });
  assert(r.vendible === true, `${caso} → se puede vender${r.vendible ? "" : ` (vino: ${r.motivo})`}`);
}
function noVendible(caso: string, patch: Partial<Entrada>, motivo: string) {
  const r = evaluarVentaItem({ ...base, ...patch });
  assert(r.vendible === false && r.motivo === motivo, `${caso} → NO se vende por "${motivo}" (vino: ${r.vendible ? "vendible" : r.motivo})`);
}

console.log("— Vender —");
vendible("Llegó y la inspección está firmada", {});
vendible("Llegó y no requiere inspección (un cable)", { requiereInspeccion: false, inspeccionFirmada: false });
vendible("La etiqueta del estado no decide: llegó directo y sigue diciendo 'Pagado'", { estado: "Pagado" });
vendible("Reservado por un cliente que viene a retirarlo", { estado: "Reservado" });
noVendible("En tránsito (no marcado Recibido)", { estado: "En tránsito", recibido: false }, "no-llego");
noVendible("Recién registrado, aún en eBay", { estado: "Pendiente de pago", recibido: false, inspeccionFirmada: false }, "no-llego");
noVendible("Llegó pero falta firmar la inspección", { estado: "En revisión", inspeccionFirmada: false }, "falta-inspeccion");
noVendible("No llegó y además requiere inspección: primero avisa que no llegó", { recibido: false, inspeccionFirmada: false }, "no-llego");
noVendible("Llegó dañado (novedad crítica)", { estado: "Con novedad" }, "bloqueado");
noVendible("Veredicto de revisión Faltante", { estadoRevision: "Faltante" }, "bloqueado");
noVendible("Novedad abierta sin resolver", { novedadesAbiertas: 1 }, "bloqueado");
noVendible("Ya vendido", { estado: "Vendido" }, "bloqueado");
noVendible("Uso local", { usoLocal: true }, "bloqueado");

console.log("\n— Valor inicial de 'Requiere inspección' —");
assert(requiereInspeccionPorDefecto({ categoria: "Laptop" }) === true, "Laptop → requiere");
assert(requiereInspeccionPorDefecto({ categoria: "RAM" }) === true, "RAM → requiere");
assert(requiereInspeccionPorDefecto({ categoria: "Tarjeta gráfica" }) === true, "Tarjeta gráfica (con tilde) → requiere");
assert(requiereInspeccionPorDefecto({ categoria: "tarjeta grafica" }) === true, "Tarjeta grafica (sin tilde) → requiere");
assert(requiereInspeccionPorDefecto({ categoria: "Cable" }) === false, "Cable → no requiere");
assert(requiereInspeccionPorDefecto({ categoria: "Accesorio" }) === false, "Accesorio → no requiere");
assert(requiereInspeccionPorDefecto({ categoria: "" }) === false, "Sin categoría → no requiere");
assert(
  requiereInspeccionPorDefecto({ categoria: "Laptop", tipoOperacion: "Reajuste de inventario" }) === false,
  "Reajuste de inventario → no requiere aunque sea Laptop (ya está en la tienda, se vende directo)"
);

console.log("\n— Etiqueta automática al llegar / firmar —");
assert(estadoSegunLlegada({ estado: "En tránsito", recibido: false, requiereInspeccion: true }) === null, "Sin recibir no se toca la etiqueta");
assert(estadoSegunLlegada({ estado: "Recibido", recibido: true, requiereInspeccion: false }) === "Disponible", "Llega un cable → Disponible");
assert(estadoSegunLlegada({ estado: "Recibido", recibido: true, requiereInspeccion: true, inspeccionFirmada: false }) === "En revisión", "Llega una laptop → En revisión");
assert(estadoSegunLlegada({ estado: "En revisión", recibido: true, requiereInspeccion: true, inspeccionFirmada: true }) === "Disponible", "Se firma la inspección → Disponible");
assert(estadoSegunLlegada({ estado: "Pagado", recibido: true, requiereInspeccion: true, inspeccionFirmada: true }) === "Disponible", "C-1: llegó directo, recibido y revisado, seguía en 'Pagado' → Disponible");
assert(estadoSegunLlegada({ estado: "Pendiente de pago", recibido: true, requiereInspeccion: true, inspeccionFirmada: false }) === "En revisión", "C-1: llegó directo sin pagar, falta inspección → En revisión");
assert(estadoSegunLlegada({ estado: "Disponible", recibido: true, requiereInspeccion: true, inspeccionFirmada: false }) === "En revisión", "Se reabre la inspección → vuelve a En revisión");
assert(estadoSegunLlegada({ estado: "Disponible", recibido: true, requiereInspeccion: false }) === null, "Ya Disponible → sin cambio");
// Punto 6 (9-oct): "Reservado" también es parte del camino: con todo apartado
// no cambia; si ya hay unidades libres vuelve a Disponible.
assert(estadoSegunLlegada({ estado: "Reservado", recibido: true, requiereInspeccion: false, todasReservadas: true }) === null, "Reservado con todo apartado no cambia");
assert(estadoSegunLlegada({ estado: "Reservado", recibido: true, requiereInspeccion: false }) === "Disponible", "Reservado con unidades libres → Disponible");
assert(estadoSegunLlegada({ estado: "Vendido", recibido: true, requiereInspeccion: false }) === null, "Vendido no se toca");
assert(estadoSegunLlegada({ estado: "Con novedad", recibido: true, requiereInspeccion: false }) === null, "Con novedad no se toca");

if (fallos > 0) {
  console.error(`\n${fallos} assert(s) fallaron.`);
  process.exit(1);
}
console.log("\n✅ item-venta.test.ts — todos los asserts pasaron");
