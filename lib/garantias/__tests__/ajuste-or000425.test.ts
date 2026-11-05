/**
 * Test — ajuste de datos de OR000425 (Garantía SUPER GEEK, punto 20).
 * Ejecutar: npm test ajuste-or000425
 */
import { planOR000425, type EstadoLeidoOR000425 } from "../ajuste-or000425";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// Lo que hay hoy (vista previa del 5-nov): la batería enlazada a OP-122
// ("Pedido", $1) y la línea vieja del presupuesto "Cargada" por esa operación.
const hoy: EstadoLeidoOR000425 = {
  ordenId: "reciAdij2hZ6ctjDE",
  operacion: { id: "recaR8eG6i36m4K2A", estado: "Pedido", observacion: "" },
  articulo: { id: "recOEONNFQTNjbI7F", operaciones: ["recaR8eG6i36m4K2A"], ordenesStock: [], estado: "En revisión" },
  linea: { id: "recikS11bO34qQ6sd", estado: "Cargada", garantia: "", precio: 1, operacionId: "recaR8eG6i36m4K2A" },
};
{
  const p = planOR000425(hoy);
  assert(p.bloqueos.length === 0, "sin bloqueos");
  assert(p.acciones.map((a) => a.tipo).join(",") === "soltar_de_operacion,completar_linea_garantia,rechazar_operacion",
    "3 acciones, en orden: soltar de OP-122, convertir la línea vieja en garantía (aparta la batería), OP-122 → Rechazado");
  const c = p.acciones[1];
  assert(c.tipo === "completar_linea_garantia" && c.lineaId === "recikS11bO34qQ6sd" && c.cargar && c.soltarOperacion,
    "usa la línea que ya existe (no crea otra), le quita OP-122 y aparta la batería");
  assert(planOR000425({ ...hoy, linea: null }).acciones[1]?.tipo === "crear_linea_garantia", "si no hubiera línea, la crea");
}
{
  const despues: EstadoLeidoOR000425 = {
    ...hoy,
    operacion: { ...hoy.operacion!, estado: "Rechazado" },
    articulo: { ...hoy.articulo!, operaciones: [], ordenesStock: ["reciAdij2hZ6ctjDE"], estado: "Reservado" },
    linea: { id: "recikS11bO34qQ6sd", estado: "Cargada", garantia: "Confirmada", precio: 0, operacionId: null },
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
