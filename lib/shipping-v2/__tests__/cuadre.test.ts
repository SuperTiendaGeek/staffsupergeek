/**
 * Cuadrar unidades desde Revisión (punto 10c-4).
 * Ejecutar: npx tsx lib/shipping-v2/__tests__/cuadre.test.ts
 */
import { diferenciaCuadre, estadoTrasCuadre, planCuadre, type DatosCuadre } from "../cuadre";

let fallos = 0;
function assert(condicion: unknown, mensaje: string) {
  if (condicion) console.log(`✓ ${mensaje}`);
  else { fallos++; console.error(`✗ ${mensaje}`); }
}
const d = (x: Partial<DatosCuadre>): DatosCuadre => ({ compradas: 1, tienda: 0, reservadas: 0, vendidas: 0, bajas: 0, fuera: 0, salidas: 0, otro: 0, unidad: false, ...x });

// LAP-000016: 1 comprada, 0 vendidas, 0 en tienda (facturada en el sistema anterior).
const lap16 = d({ unidad: true });
assert(diferenciaCuadre(lap16, 0) === 1, "LAP-000016: falta 1");
let p = planCuadre(lap16, { n: 0 });
assert(!p.ok && p.motivo.includes("qué pasó"), "Sin causa no se aplica");
p = planCuadre(lap16, { n: 0, causa: "llegaron-mas" });
assert(!p.ok, "Una causa de 'sobran' no sirve para un faltante");
p = planCuadre(lap16, { n: 0, causa: "fuera" });
assert(p.ok && p.cambios.fuera === 1 && p.cambios.cantidad === undefined, "Vendida fuera del sistema: se anota 1 y el stock no cambia");
assert(estadoTrasCuadre({ estado: "Agotado", n: 0, causa: "fuera", usoLocal: false, requiereInspeccion: true, inspeccionFirmada: true }) === null, "Si ya estaba fuera de la tienda, el estado no cambia");
assert(estadoTrasCuadre({ estado: "Disponible", n: 0, causa: "fuera", usoLocal: false, requiereInspeccion: false, inspeccionFirmada: false }) === "Vendido", "Si figuraba disponible, pasa a Vendido");
p = planCuadre(lap16, { n: 1 });
assert(p.ok && p.cambios.cantidad === 1 && !p.causa, "Si la encuentran: vuelve 1 a la tienda y ya cuadra");
assert(estadoTrasCuadre({ estado: "Vendido", n: 1, usoLocal: false, requiereInspeccion: true, inspeccionFirmada: false }) === "En revisión", "Encontrada sin inspección firmada: En revisión");
assert(!planCuadre(lap16, { n: 2 }).ok, "Un equipo no puede tener 2 en la tienda");

// OTR-000027: compradas 7, en tienda 6.
const otr27 = d({ compradas: 7, tienda: 6 });
p = planCuadre(otr27, { n: 6, causa: "perdida" });
assert(p.ok && p.cambios.bajas === 1 && p.cambios.cantidad === undefined, "Se perdió 1: queda como baja");
p = planCuadre(otr27, { n: 7 });
assert(p.ok && p.cambios.cantidad === 7, "Aparecieron las 7: se suma 1 y cuadra");
p = planCuadre(otr27, { n: 5, causa: "interna" });
assert(p.ok && p.cambios.cantidad === 5 && p.cambios.salidas === 2, "Hay 5 y 2 se usaron en la tienda");
p = planCuadre(otr27, { n: 7, causa: "fuera" });
assert(p.ok && !p.causa, "Si con el conteo ya cuadra, la causa se ignora");

// OTR-000028: compradas 3, vendidas 2, en tienda 2 (1 más de lo comprado).
const otr28 = d({ compradas: 3, vendidas: 2, tienda: 2 });
p = planCuadre(otr28, { n: 1 });
assert(p.ok && p.cambios.cantidad === 1 && !p.causa, "Hay 1: el sistema tenía 1 de más; se corrige el stock");
p = planCuadre(otr28, { n: 2, causa: "llegaron-mas" });
assert(p.ok && p.cambios.compradas === 4, "Hay 2: llegaron 4, se corrige compradas");
p = planCuadre(otr28, { n: 2, causa: "baja-error" });
assert(!p.ok, "No se revierte una baja que no existe");

// LAP-000062: compradas 1, vendidas 3.
p = planCuadre(d({ compradas: 1, vendidas: 3, unidad: true }), { n: 0, causa: "venta-otro" });
assert(p.ok && p.cambios.otro === 2, "2 ventas eran de otras laptops: se anotan, la factura no se toca");

// Reservas y casos sin dato.
assert(!planCuadre(d({ compradas: 5, tienda: 5, reservadas: 2 }), { n: 1, causa: "perdida" }).ok, "No puede haber menos que lo reservado");
p = planCuadre(d({ compradas: null, tienda: 2 }), { n: 3 });
assert(p.ok && p.cambios.cantidad === 3, "Sin 'Unidades compradas' solo se corrige el stock");
assert(!planCuadre(d({ compradas: 2, tienda: 2 }), { n: 2 }).ok, "Si ya cuadra no hay nada que aplicar");
p = planCuadre(d({ compradas: 5, tienda: 5, bajas: 2 }), { n: 5, causa: "baja-error" });
assert(p.ok && p.cambios.bajas === 0, "Baja registrada por error: se quita de las bajas");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo bien.");
