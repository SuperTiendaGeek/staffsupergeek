/**
 * Test — ajuste de datos de OR000425 (Garantía SUPER GEEK, punto 20).
 * Ejecutar: npm test ajuste-or000425
 */
import { planOR000425, type EstadoLeidoOR000425 } from "../ajuste-or000425";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// Lo que hay hoy (4-nov): la batería enlazada a OP-122 ("Pedido", $1), sin
// línea de presupuesto ni apartado a la orden.
const hoy: EstadoLeidoOR000425 = {
  ordenId: "reciAdij2hZ6ctjDE",
  operacion: { id: "recaR8eG6i36m4K2A", estado: "Pedido", observacion: "" },
  articulo: { id: "recOEONNFQTNjbI7F", operaciones: ["recaR8eG6i36m4K2A"], ordenesStock: [], estado: "En revisión" },
  linea: null,
};
{
  const p = planOR000425(hoy);
  assert(p.bloqueos.length === 0, "sin bloqueos");
  assert(p.acciones.map((a) => a.tipo).join(",") === "soltar_de_operacion,crear_linea_garantia,rechazar_operacion",
    "3 acciones, en orden: soltar de OP-122, línea en garantía (aparta la batería), OP-122 → Rechazado");
}
{
  const despues: EstadoLeidoOR000425 = {
    ...hoy,
    operacion: { ...hoy.operacion!, estado: "Rechazado" },
    articulo: { ...hoy.articulo!, operaciones: [], ordenesStock: ["reciAdij2hZ6ctjDE"], estado: "Reservado" },
    linea: { id: "recLINEA", estado: "Cargada", garantia: "Confirmada", precio: 0 },
  };
  assert(planOR000425(despues).acciones.length === 0, "una segunda corrida no hace nada");
  const aMedias = { ...despues, linea: { ...despues.linea!, estado: "Propuesta" } };
  const aMediasSinApartar = { ...aMedias, articulo: { ...aMedias.articulo!, ordenesStock: [] } };
  const c = planOR000425(aMediasSinApartar).acciones[0];
  assert(c?.tipo === "completar_linea_garantia" && c.cargar, "si se cortó a medias, completa la línea (y aparta) sin crear otra");
  assert(planOR000425({ ...despues, articulo: { ...despues.articulo!, ordenesStock: [] } }).bloqueos.length === 1, "Cargada sin apartar: se detiene para revisar a mano");
}
assert(planOR000425({ ...hoy, articulo: { ...hoy.articulo!, estado: "Vendido" } }).bloqueos.length === 1, "si la batería se vendió, se detiene");
assert(planOR000425({ ...hoy, operacion: null }).bloqueos.length === 1, "si no encuentra OP-122, se detiene");

if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nOR000425: todo OK");
