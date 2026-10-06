/**
 * Mejoras (punto 3 de la auditoría, 6-oct-2026).
 * Ejecutar: npx tsx lib/shipping-v2/__tests__/mejoras.test.ts
 */
import {
  CATEGORIAS_REPUESTO_STOCK,
  cambiosPiezaTrasConsumo,
  costoSugeridoMejora,
  decidirCostoMejora,
  esCategoriaDeRepuesto,
  evaluarEquipoParaIntervencion,
  evaluarPiezaParaMejora,
  validarPiezaRetirada,
} from "../mejoras";

let fallos = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { fallos++; console.error("✗", msg); } else console.log("✓", msg);
}

const ram = { id: "recRAM", sku: "RAM-000099", categoria: "RAM", recibido: true, estado: "Disponible", cantidad: 3, cantidadReservada: 1 };

console.log("— Categorías: las mismas del buscador de técnicos —");
assert(CATEGORIAS_REPUESTO_STOCK.length === 13, "13 categorías");
assert(esCategoriaDeRepuesto("Batería") && esCategoriaDeRepuesto("bateria"), "Batería (con o sin tilde)");
assert(!esCategoriaDeRepuesto("Laptop") && !esCategoriaDeRepuesto("Disco externo"), "Laptop y Disco externo no son piezas");

console.log("\n— Qué pieza se puede usar —");
assert(evaluarPiezaParaMejora(ram, { equipoId: "recLAP" }).ok, "RAM en la tienda con unidades libres: sí");
const r2 = evaluarPiezaParaMejora(ram, { equipoId: "recLAP", cantidad: 2 });
assert(r2.ok && r2.libres === 2, "Se pueden usar las 2 libres (1 está reservada)");
assert(!evaluarPiezaParaMejora(ram, { equipoId: "recLAP", cantidad: 3 }).ok, "La reservada no se toca");
assert(!evaluarPiezaParaMejora({ ...ram, recibido: false }, { equipoId: "recLAP" }).ok, "Sin Recibido: no");
assert(!evaluarPiezaParaMejora({ ...ram, categoria: "Laptop" }, { equipoId: "recLAP" }).ok, "Otra categoría: no");
assert(!evaluarPiezaParaMejora({ ...ram, estado: "Con novedad" }, { equipoId: "recLAP" }).ok, "Con novedad: no");
assert(!evaluarPiezaParaMejora({ ...ram, estadoRevision: "Dañado" }, { equipoId: "recLAP" }).ok, "Veredicto Dañado: no");
assert(!evaluarPiezaParaMejora({ ...ram, usoLocal: true }, { equipoId: "recLAP" }).ok, "Uso local (activo fijo): no");
assert(!evaluarPiezaParaMejora({ ...ram, estado: "Agotado", cantidad: 0, cantidadReservada: 0 }, { equipoId: "recLAP" }).ok, "Agotado: no");
assert(!evaluarPiezaParaMejora(ram, { equipoId: "recRAM" }).ok, "No puede usarse a sí misma");
assert(!evaluarPiezaParaMejora(ram, { equipoId: "recLAP", cantidad: 1.5 }).ok, "Cantidad decimal: no");
assert(evaluarPiezaParaMejora({ ...ram, estado: "En revisión" }, { equipoId: "recLAP" }).ok, "No hace falta la inspección firmada de la pieza");

console.log("\n— Después de consumir —");
assert(JSON.stringify(cambiosPiezaTrasConsumo(3, 2)) === JSON.stringify({ cantidad: 1, agotada: false }), "Quedan unidades: no se agota");
assert(JSON.stringify(cambiosPiezaTrasConsumo(2, 2)) === JSON.stringify({ cantidad: 0, agotada: true }), "Última unidad → Agotado");

console.log("\n— A qué equipo se le puede registrar algo —");
assert(evaluarEquipoParaIntervencion({ recibido: true, estado: "Disponible", cantidad: 1 }).ok, "En la tienda: sí");
assert(evaluarEquipoParaIntervencion({ recibido: true, estado: "Con novedad", cantidad: 1 }).ok, "Con novedad: sí (arreglarla es un mantenimiento)");
assert(!evaluarEquipoParaIntervencion({ recibido: false, estado: "En tránsito", cantidad: 1 }).ok, "En camino: no");
assert(!evaluarEquipoParaIntervencion({ recibido: true, estado: "Vendido", cantidad: 0 }).ok, "Vendido: no");

console.log("\n— Costo —");
assert(costoSugeridoMejora(25, 2) === 50, "Sugerido = costo por unidad × unidades usadas");
assert(costoSugeridoMejora(null, 2) === 0, "Pieza sin costo → sugiere 0");
const d1 = decidirCostoMejora({ cantidadEquipo: 1, costoSumado: 25, valorPiezaRetirada: 8 });
assert(d1.costoSumado === 25 && d1.valorRestado === 8 && d1.ajuste === 17 && !d1.aviso, "1 unidad: +25 por la RAM nueva, −8 por la vieja = +17");
const d2 = decidirCostoMejora({ cantidadEquipo: 9, costoSumado: 25, valorPiezaRetirada: 8 });
assert(d2.ajuste === 0 && d2.costoSumado === 0 && Boolean(d2.aviso), "9 unidades (LAP-000076): no se toca el costo y se avisa");
assert(decidirCostoMejora({ cantidadEquipo: 1, costoSumado: 0 }).ajuste === 0, "Quien registra puede decidir no sumar nada");
let lanzo = false; try { decidirCostoMejora({ cantidadEquipo: 1, costoSumado: -1 }); } catch { lanzo = true; }
assert(lanzo, "Costo negativo: error");

console.log("\n— Pieza retirada —");
const pr = validarPiezaRetirada({ nombre: "RAM 4GB DDR4", categoria: "RAM" }, { sku: "LAP-000013" }, "2026-10-06T23:00:00.000Z");
assert(pr.cantidad === 1 && pr.valor === 0, "Por defecto 1 unidad y valor $0");
assert(pr.nota === "Retirada de LAP-000013 en una mejora (2026-10-06).", "La nota dice de dónde salió");
lanzo = false; try { validarPiezaRetirada({ nombre: "", categoria: "RAM" }, { sku: "LAP-1" }, "2026-10-06"); } catch { lanzo = true; }
assert(lanzo, "Sin nombre: error");

if (fallos > 0) { console.error(`\n${fallos} assert(s) fallaron.`); process.exit(1); }
console.log("\n✅ mejoras.test.ts — todos los asserts pasaron");
