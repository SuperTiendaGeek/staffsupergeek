/**
 * Presupuesto único, fase 2: quitar o modificar una línea ya aprobada desde la
 * propia línea (ya no desde las tarjetas Servicios / Repuestos / Digitales).
 * Ejecutar: npm test presupuesto-retiro
 */
import fs from "fs";
import {
  planRetiro, lineaTrasRetiro, fueQuitadaPorLaTienda, NOTA_QUITADA,
  type LineaPresupuesto, type CargosPresentes,
} from "../presupuesto/reglas";
import { construirVista } from "../presupuesto/enlace-reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const L = (o: Partial<LineaPresupuesto>): LineaPresupuesto => ({
  id: "recL", tipo: "Servicio", descripcion: "Limpieza", cantidad: 1, precioUnitario: 35, estado: "Cargada", notaCarga: "",
  servicioCatalogoId: "recS", itemId: null, productoCatalogoId: null, cargoServicioId: "recSPO", cargoProductoDigitalId: null, operacionId: null,
  bajoPedido: false, proveedorId: null, urlProveedor: "", costoProveedor: null, tiempoEstimado: "", categoria: "", historial: "",
  aprobadoPor: "Cliente: Ana (enlace)", fechaAprobacion: "", creadoPor: "", ...o,
});
const todos: CargosPresentes = { servicios: new Set(["recSPO"]), digitales: new Set(["recPD"]), itemsEnOrden: new Set(["recIT"]) };
const nadaPresente: CargosPresentes = { servicios: new Set(), digitales: new Set(), itemsEnOrden: new Set() };
const sinLeer: CargosPresentes = { servicios: null, digitales: null, itemsEnOrden: null };

// ─── Qué se deshace por tipo ────────────────────────────────────────────────
{
  const p = planRetiro(L({}), null, todos);
  assert(p.permitido && p.deshacer.tipo === "borrar_servicio" && p.deshacer.servicioPorOrdenId === "recSPO", "servicio cargado → se borra su Servicio por Orden");
}
{
  const p = planRetiro(L({ tipo: "Repuesto", cargoServicioId: null, itemId: "recIT" }), null, todos);
  assert(p.permitido && p.deshacer.tipo === "soltar_repuesto" && p.deshacer.itemId === "recIT", "repuesto de stock cargado → se suelta la reserva");
}
{
  const p = planRetiro(L({ tipo: "Producto digital", cargoServicioId: null, cargoProductoDigitalId: "recPD" }), null, todos);
  assert(p.permitido && p.deshacer.tipo === "desasignar_digital" && p.deshacer.productoId === "recPD", "digital cargado → se desasigna el código");
}
{
  const p = planRetiro(L({ estado: "Aprobada", cargoServicioId: null }), null, todos);
  assert(p.permitido && p.deshacer.tipo === "nada", "aprobada que no se pudo cargar → no hay nada que deshacer");
}
{
  const p = planRetiro(L({}), null, nadaPresente);
  assert(p.permitido && p.deshacer.tipo === "nada", "el cargo ya no está en la orden (se quitó antes) → no se intenta borrar dos veces");
}
{
  const p = planRetiro(L({}), null, sinLeer);
  assert(p.permitido && p.deshacer.tipo === "borrar_servicio", "si no se pudo leer la orden, se deshace igual (no se asume que ya no está)");
}

// ─── Lo que NO se permite ───────────────────────────────────────────────────
{
  const p = planRetiro(L({}), { tipo: "factura", numero: "001-001-000000123" }, todos);
  assert(!p.permitido && p.motivo.includes("nota de crédito") && p.motivo.includes("000000123"), "con factura emitida → nota de crédito");
}
{
  const p = planRetiro(L({}), { tipo: "recibo", numero: "R-45" }, todos);
  assert(!p.permitido && p.motivo.includes("anúlalo"), "con recibo vigente → anular el recibo primero");
}
{
  const p = planRetiro(L({ tipo: "Repuesto", bajoPedido: true, operacionId: "recOP", cargoServicioId: null }), null, todos);
  assert(!p.permitido && p.motivo.includes("desiste"), "bajo pedido → usa sus reversas de compra");
}
{
  const p1 = planRetiro(L({ estado: "Propuesta" }), null, todos);
  const p2 = planRetiro(L({ estado: "Rechazada" }), null, todos);
  assert(!p1.permitido && !p2.permitido, "propuesta o rechazada → no aplica");
}
{
  const p = planRetiro(L({ cargoServicioId: null }), null, todos);
  assert(!p.permitido && p.motivo.includes("administrador"), "cargada sin referencia al cargo → se frena y se avisa");
}

// ─── Cómo queda la línea ────────────────────────────────────────────────────
{
  const q = lineaTrasRetiro("quitar", "cambió de opinión");
  assert(q.estado === "Rechazada" && q.notaCarga === `${NOTA_QUITADA}: cambió de opinión`, "quitar → Rechazada con la marca y el motivo");
  const m = lineaTrasRetiro("modificar", "");
  assert(m.estado === "Propuesta" && m.notaCarga === "" && m.historial.includes("volver a aprobar"), "modificar → vuelve a Propuesta");
}

// ─── Cómo lo ve el cliente en el enlace ─────────────────────────────────────
{
  const quitada = L({ estado: "Rechazada", notaCarga: `${NOTA_QUITADA}: x`, respuestaCliente: "Aprobó" });
  assert(fueQuitadaPorLaTienda(quitada), "se reconoce la línea quitada por la tienda");
  const v = construirVista([quitada], []).lineas[0];
  assert(v.situacion === "anulada" && !v.puedeResponder, "el cliente la ve anulada y NO puede volver a aprobarla");
  const noAprobo = construirVista([L({ estado: "Rechazada", notaCarga: "No aprobada por el cliente desde el enlace." })], []).lineas[0];
  assert(noAprobo.situacion === "no_aprobada" && noAprobo.puedeResponder, "lo que el cliente rechazó sigue pudiendo cambiarlo");
}

// ─── El servidor usa estas reglas ───────────────────────────────────────────
const cargar = fs.readFileSync("lib/tecnicos/presupuesto/cargar.ts", "utf8");
const retirar = cargar.slice(cargar.indexOf("export async function retirarLinea"), cargar.indexOf("// ─── Sincronizar con las tarjetas"));
assert(retirar.includes("withLock(`presupuesto:${opts.ordenId}`"), "retirarLinea usa el turno de la orden");
assert(retirar.includes("cargarOrdenesCobro(") && retirar.includes("planRetiro("), "verifica documento emitido con la misma lectura que Cobros");
assert(retirar.indexOf("deleteServicioPorOrdenById(") < retirar.indexOf("actualizarLinea("), "primero deshace el cargo, después cambia la línea");
const ruta = fs.readFileSync("app/api/tecnicos/ordenes/[id]/presupuesto/[lineaId]/route.ts", "utf8");
assert(/accion === "quitar" \|\| body\.accion === "modificar"/.test(ruta) && ruta.includes("retirarLinea("), "la ruta de la línea expone quitar y modificar");

if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo OK");
