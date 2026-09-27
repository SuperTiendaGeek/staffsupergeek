/**
 * Mudanza de órdenes viejas al presupuesto (fase 3): qué líneas se crean, qué
 * vínculos se reparan y cuándo una orden NO se toca.
 * Ejecutar: npm test presupuesto-mudanza
 */
import fs from "fs";
import { planMudanza, resumirMudanza, type OrdenMudanza } from "../presupuesto/mudanza";
import { cargosSinDueno, type LineaPresupuesto } from "../presupuesto/reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const L = (o: Partial<LineaPresupuesto>): LineaPresupuesto => ({
  id: "recL", tipo: "Servicio", descripcion: "Limpieza", cantidad: 1, precioUnitario: 35, estado: "Cargada", notaCarga: "",
  servicioCatalogoId: "recCAT", itemId: null, productoCatalogoId: null, cargoServicioId: null, cargoProductoDigitalId: null, operacionId: null,
  bajoPedido: false, proveedorId: null, urlProveedor: "", costoProveedor: null, tiempoEstimado: "", categoria: "", historial: "",
  aprobadoPor: "", fechaAprobacion: "", creadoPor: "", ...o,
});
const O = (o: Partial<OrdenMudanza>): OrdenMudanza => ({
  ordenId: "recO", idVisible: "OR000100", servicios: [], itemsStock: [], digitales: [], pedidos: [], historicos: [],
  rollups: { servicios: null, digitales: null }, lineas: [], ...o,
});

// ─── Orden vieja típica: todo por tarjetas, sin presupuesto ────────────────
{
  const p = planMudanza(O({
    servicios: [{ id: "recS1", catalogoId: "recCAT", nombre: "Formateo", costo: 20 }],
    itemsStock: [{ id: "recI1", nombre: "SSD 512", precio: 45 }],
    digitales: [{ id: "recD1", catalogoId: "recPC", nombre: "Office 2021", precio: 25 }],
    rollups: { servicios: 20, digitales: 25 },
  }));
  assert(!p.bloqueada, "se puede aplicar");
  assert(p.crear.length === 3, "crea una línea por cargo");
  const s = p.crear.find((c) => c.tipo === "Servicio")!;
  assert(s.cargoServicioId === "recS1" && s.servicioCatalogoId === "recCAT" && s.precioUnitario === 20, "servicio: apunta a su cargo, con catálogo y precio del cargo");
  assert(p.crear.find((c) => c.tipo === "Repuesto")!.itemId === "recI1", "repuesto: apunta a su artículo");
  assert(p.crear.find((c) => c.tipo === "Producto digital")!.cargoProductoDigitalId === "recD1", "digital: apunta a su código");
}

// ─── Idempotente: correrla dos veces no duplica ────────────────────────────
{
  const p = planMudanza(O({
    servicios: [{ id: "recS1", catalogoId: "recCAT", nombre: "Formateo", costo: 20 }],
    lineas: [L({ cargoServicioId: "recS1" })],
    rollups: { servicios: 20, digitales: 0 },
  }));
  assert(p.crear.length === 0 && p.vincular.length === 0, "un cargo que ya tiene línea no se vuelve a mudar");
}

// ─── OR000486: línea Cargada sin vínculo y su servicio sigue cobrado ───────
{
  const p = planMudanza(O({
    servicios: [
      { id: "recLIMP", catalogoId: "recCLIMP", nombre: "All-in-One Limpieza", costo: 30 },
      { id: "recDESM", catalogoId: "recCDESM", nombre: "Desmontaje de pantalla HP All-in-One", costo: 25 },
    ],
    lineas: [
      L({ id: "recL1", descripcion: "All-in-One Limpieza", servicioCatalogoId: "recCLIMP", cargoServicioId: "recLIMP", precioUnitario: 30 }),
      L({ id: "recL2", descripcion: "Desmontaje de pantalla HP All-in-One", servicioCatalogoId: "recCDESM", cargoServicioId: null, precioUnitario: 25, historial: "[2026-09-24 15:14] Técnico: Aprobada." }),
    ],
    rollups: { servicios: 55, digitales: 0 },
  }));
  assert(p.vincular.length === 1 && p.vincular[0].lineaId === "recL2" && p.vincular[0].cargoId === "recDESM", "OR000486: se VINCULA la línea huérfana a su servicio");
  assert(p.crear.length === 0, "OR000486: NO se crea otra línea para ese servicio (sería doble)");
  assert(p.vincular[0].historialAnterior.includes("Aprobada."), "el vínculo conserva el historial anterior de la línea (se agrega, no se reemplaza)");
}

// ─── Huérfana ambigua: dos servicios iguales sin dueño ─────────────────────
{
  const p = planMudanza(O({
    servicios: [
      { id: "recA", catalogoId: "recCAT", nombre: "Limpieza", costo: 35 },
      { id: "recB", catalogoId: "recCAT", nombre: "Limpieza", costo: 35 },
    ],
    lineas: [L({ id: "recH", cargoServicioId: null })],
    rollups: { servicios: 70, digitales: 0 },
  }));
  assert(p.vincular.length === 0 && p.crear.length === 0, "ambigua: no se vincula ni se crea nada de servicios");
  assert(p.avisos.some((a) => a.includes("no se toca")), "…y se avisa para revisar a mano");
}
{
  // El precio desempata.
  const p = planMudanza(O({
    servicios: [
      { id: "recA", catalogoId: "recCAT", nombre: "Limpieza", costo: 35 },
      { id: "recB", catalogoId: "recCAT", nombre: "Limpieza", costo: 50 },
    ],
    lineas: [L({ id: "recH", cargoServicioId: null, precioUnitario: 50 })],
    rollups: { servicios: 85, digitales: 0 },
  }));
  assert(p.vincular.length === 1 && p.vincular[0].cargoId === "recB", "dos candidatos: el precio desempata");
  assert(p.crear.length === 1 && p.crear[0].cargoServicioId === "recA", "y el otro servicio recibe su línea nueva");
}

// ─── OR000368: la línea huérfana y la orden sin servicios ──────────────────
{
  const p = planMudanza(O({ lineas: [L({ cargoServicioId: null })], rollups: { servicios: 0, digitales: 0 } }));
  assert(p.crear.length === 0 && p.vincular.length === 0 && !p.bloqueada, "OR000368: nada que mudar (la línea se pone al día sola al abrir la orden)");
}

// ─── Lectura que no cuadra → la orden entera no se toca ────────────────────
{
  const p = planMudanza(O({ servicios: [{ id: "recS1", catalogoId: null, nombre: "X", costo: 20 }], rollups: { servicios: 35, digitales: 0 } }));
  assert(!!p.bloqueada && p.crear.length === 0, "si lo leído no suma lo que dice Airtable, la orden se bloquea");
}

// ─── Solo las líneas vigentes son dueñas ───────────────────────────────────
{
  const p = planMudanza(O({
    itemsStock: [{ id: "recI1", nombre: "SSD", precio: 45 }],
    lineas: [L({ tipo: "Repuesto", estado: "Rechazada", itemId: "recI1", cargoServicioId: null })],
  }));
  assert(p.crear.length === 1 && p.crear[0].itemId === "recI1", "una línea Rechazada con el mismo itemId NO es dueña del repuesto reservado");
  const presentes = { servicios: new Set<string>(), digitales: new Set<string>(), itemsEnOrden: new Set(["recI1"]) };
  assert(cargosSinDueno([L({ tipo: "Repuesto", estado: "Rechazada", itemId: "recI1" })], presentes, "Repuesto") === 1, "cargosSinDueno tampoco cuenta la Rechazada (revisión #119)");
}

// ─── Pedidos de Operaciones ────────────────────────────────────────────────
{
  const p = planMudanza(O({
    pedidos: [
      { operacionId: "recOP1", codigo: "OP-1", itemIds: ["recIP1"], nombre: "Pantalla 15.6", precio: 140 },
      { operacionId: "recOP2", codigo: "OP-2", itemIds: ["recIP2"], nombre: "Teclado", precio: 65 },
      { operacionId: "recOP3", codigo: "OP-3", itemIds: ["a", "b"], nombre: "Kit", precio: 90 },
    ],
    lineas: [L({ tipo: "Repuesto", operacionId: "recOP2", cargoServicioId: null, estado: "Rechazada" })],
  }));
  assert(p.crear.length === 1 && p.crear[0].operacionId === "recOP1" && p.crear[0].itemId === "recIP1", "pedido sin línea → línea bajo pedido con su operación y artículo");
  assert(!p.crear.some((c) => c.operacionId === "recOP2"), "una operación que el presupuesto ya conoce no se duplica");
  assert(p.avisos.some((a) => a.includes("OP-3")), "operación con varios artículos → revisar a mano");
}

// ─── Históricos: se informan, no se mudan ──────────────────────────────────
{
  const p = planMudanza(O({ historicos: [{ nombre: "Batería", subtotal: 40 }, { nombre: "Cargador", subtotal: 25 }] }));
  assert(p.crear.length === 0 && p.resumen.historicos === 2 && p.resumen.totalHistoricos === 65, "repuestos del sistema antiguo: se cuentan en el reporte, no se crean líneas");
}

// ─── Resumen ───────────────────────────────────────────────────────────────
{
  const r = resumirMudanza([
    planMudanza(O({ servicios: [{ id: "a", catalogoId: null, nombre: "X", costo: 10 }], rollups: { servicios: 10, digitales: 0 } })),
    planMudanza(O({ servicios: [{ id: "b", catalogoId: null, nombre: "Y", costo: 10 }], rollups: { servicios: 99, digitales: 0 } })),
  ]);
  assert(r.ordenes === 2 && r.bloqueadas === 1 && r.lineasNuevas === 1, "el resumen no cuenta lo que tienen las órdenes bloqueadas");
}

// ─── Crear líneas no puede duplicar (revisión 27-sep) ──────────────────────
{
  const air = fs.readFileSync("lib/tecnicos/presupuesto/airtable.ts", "utf8");
  const bloque = air.slice(air.indexOf("export async function crearLineaMudanza"), air.indexOf("export async function crearLinea("));
  assert(/pedir<Registro>\([^;]*REINTENTO_SEGURO\)/.test(bloque), "crearLineaMudanza solo reintenta ante 429 (un 5xx podría haber creado la línea)");
  assert(/REINTENTO_SEGURO = new Set\(\[429\]\)/.test(air), "el reintento seguro es SOLO 429");
}

// ─── La regla no depende de Airtable ───────────────────────────────────────
const src = fs.readFileSync("lib/tecnicos/presupuesto/mudanza.ts", "utf8");
assert(!src.includes("server-only") && !/from "\.\/airtable"/.test(src), "mudanza.ts es pura (se prueba sin red)");

if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo OK");
