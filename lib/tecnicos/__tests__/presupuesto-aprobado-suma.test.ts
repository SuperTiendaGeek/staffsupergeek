/**
 * Presupuesto único, fase 3b — regla del dueño (27-sep):
 *   · Basta que el cliente apruebe para que la línea sume al Resumen financiero
 *     (repuesto de stock o bajo pedido, servicio o producto digital).
 *   · La factura y el recibo SIEMPRE esperan a que exista el artículo.
 * Ejecutar: npm test presupuesto-aprobado-suma
 */
import fs from "fs";
import { aprobadoSinArticulo, cargasPerdidas, fueQuitadaPorLaTienda, type LineaPresupuesto, type CargosDeLaCuenta } from "../presupuesto/reglas";
import { clasificarOrden, comprometidoDeOrden, CATEGORIAS } from "../cobros/reglas";
import { mensajeAprobadoSinArticulo } from "../../facturacion/reglas/aprobadoSinArticulo";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const L = (o: Partial<LineaPresupuesto>): LineaPresupuesto => ({
  id: "recL", tipo: "Servicio", descripcion: "x", cantidad: 1, precioUnitario: 10, estado: "Aprobada", notaCarga: "",
  servicioCatalogoId: null, itemId: null, productoCatalogoId: null, cargoServicioId: null, cargoProductoDigitalId: null, operacionId: null,
  bajoPedido: false, proveedorId: null, urlProveedor: "", costoProveedor: null, tiempoEstimado: "", categoria: "", historial: "",
  aprobadoPor: "", fechaAprobacion: "", creadoPor: "", ...o,
});
const vacio: CargosDeLaCuenta = { servicios: new Set(), digitales: new Set(), itemsStock: new Set(), operacionesConArticulo: new Set() };

// ─── Qué suma ────────────────────────────────────────────────────────────────
{
  const r = aprobadoSinArticulo([
    L({ id: "bp", tipo: "Repuesto", bajoPedido: true, operacionId: "recOP", precioUnitario: 140, descripcion: "Pantalla" }),
    L({ id: "st", tipo: "Repuesto", itemId: "recIT", precioUnitario: 45, descripcion: "SSD" }),
    L({ id: "dg", tipo: "Producto digital", precioUnitario: 25, descripcion: "Office" }),
    L({ id: "sv", tipo: "Servicio", cantidad: 2, precioUnitario: 15, descripcion: "Respaldo" }),
  ], vacio);
  assert(r.length === 4, "todo lo aprobado sin artículo suma: bajo pedido, sin stock, digital y servicio");
  assert(r.find((x) => x.lineaId === "bp")!.motivo === "falta_pedir" && r.find((x) => x.lineaId === "bp")!.monto === 140, "bajo pedido sin pedir: suma su precio aprobado");
  assert(r.find((x) => x.lineaId === "st")!.motivo === "sin_stock", "repuesto de stock sin unidad: sin_stock");
  assert(r.find((x) => x.lineaId === "sv")!.monto === 30, "monto = cantidad × precio");
}

// ─── Nunca dos veces ─────────────────────────────────────────────────────────
{
  const conCargos: CargosDeLaCuenta = {
    servicios: new Set(["recSPO"]), digitales: new Set(["recPD"]), itemsStock: new Set(["recIT"]), operacionesConArticulo: new Set(["recOP"]),
  };
  const r = aprobadoSinArticulo([
    L({ id: "bp", tipo: "Repuesto", bajoPedido: true, operacionId: "recOP" }),
    L({ id: "st", tipo: "Repuesto", itemId: "recIT" }),
    L({ id: "dg", tipo: "Producto digital", cargoProductoDigitalId: "recPD" }),
    L({ id: "sv", cargoServicioId: "recSPO" }),
  ], conCargos);
  assert(r.length === 0, "si el cargo real ya está en la cuenta (aunque la línea no se haya puesto al día), la línea NO se cuenta otra vez");
}
{
  const r = aprobadoSinArticulo([
    L({ id: "c", estado: "Cargada" }), L({ id: "p", estado: "Propuesta" }), L({ id: "r", estado: "Rechazada" }),
  ], vacio);
  assert(r.length === 0, "Cargada (se cuenta por su cargo), Propuesta y Rechazada no entran aquí");
}

// ─── Cobros: el total incluye lo aprobado sin artículo ───────────────────────
{
  const o = clasificarOrden({
    recordId: "recO", idVisible: "OR", cliente: "", equipo: "", estado: "En Proceso", fechaIngreso: "2026-09-27",
    totalCuenta: 25, abonos: [{ id: "a", monto: 60, estado: "Registrado" }], facturas: [], recibos: [],
    estadoPresupuesto: "aprobado", comprometidoPresupuesto: 140,
  });
  assert(o.totalCuenta === 165 && o.saldo === 105 && o.porCobrar === 105, "Cobros: $25 cargado + $140 aprobado sin artículo = $165; con $60 abonados falta $105");
  assert(!CATEGORIAS.abonos_sin_respaldo.pertenece(o), "el anticipo no se ve como dinero de más");
  const soloAprobado = clasificarOrden({
    recordId: "recO2", idVisible: "OR2", cliente: "", equipo: "", estado: "En Proceso", fechaIngreso: "2026-09-27",
    totalCuenta: 0, abonos: [], facturas: [], recibos: [], estadoPresupuesto: "aprobado", comprometidoPresupuesto: 90,
  });
  assert(soloAprobado.conCargos && soloAprobado.estadoCobro === "sin_abonos", "una orden con solo un repuesto aprobado por pedir ya tiene cargos que cobrar");
}

// ─── Cobros usa la MISMA regla (revisión de Claude Code, fase 3b) ────────────
{
  const ctx = {
    ordenesDeItem: new Map([["recITok", ["recO"]], ["recITotra", ["recOTRA"]]]),
    ordenesDeDigital: new Map([["recPDok", ["recO"]]]),
    operacionesConArticulo: new Set(["recOPart"]),
  };
  // Reproducción: servicio de $25 ya cobrado y la línea todavía "Aprobada".
  const servicioYaCobrado = comprometidoDeOrden("recO", [L({ id: "s", cargoServicioId: "recSPO", precioUnitario: 25 })], ctx);
  assert(servicioYaCobrado === 0, "servicio ya cobrado con la línea todavía Aprobada → NO se suma otra vez (antes daba $50)");
  const o = clasificarOrden({
    recordId: "recO", idVisible: "OR", cliente: "", equipo: "", estado: "En Proceso", fechaIngreso: "2026-09-27",
    totalCuenta: 25, abonos: [], facturas: [], recibos: [], estadoPresupuesto: "aprobado", comprometidoPresupuesto: servicioYaCobrado,
  });
  assert(o.totalCuenta === 25, `Cobros: total $25, no $50 — vino ${o.totalCuenta}`);
  assert(comprometidoDeOrden("recO", [L({ tipo: "Repuesto", itemId: "recITok", precioUnitario: 45 })], ctx) === 0, "artículo ya reservado a ESTA orden → no se suma otra vez");
  assert(comprometidoDeOrden("recO", [L({ tipo: "Repuesto", itemId: "recITotra", precioUnitario: 45 })], ctx) === 45, "artículo reservado a OTRA orden → sin stock para esta: sí suma");
  assert(comprometidoDeOrden("recO", [L({ tipo: "Producto digital", cargoProductoDigitalId: "recPDok", precioUnitario: 25 })], ctx) === 0, "código ya asignado a esta orden → no se suma otra vez");
  assert(comprometidoDeOrden("recO", [L({ tipo: "Repuesto", bajoPedido: true, operacionId: "recOPart", precioUnitario: 90 })], ctx) === 0, "pedido con artículo → se cuenta por el artículo");
  assert(comprometidoDeOrden("recO", [L({ tipo: "Repuesto", bajoPedido: true, operacionId: "recOPsin", precioUnitario: 70 })], ctx) === 70, "pedido sin artículo → suma");
}

// ─── Factura y recibo esperan al artículo ────────────────────────────────────
assert(mensajeAprobadoSinArticulo([], "factura") === null, "sin pendientes se puede emitir");
{
  const m = mensajeAprobadoSinArticulo([{ nombre: "Pantalla 15.6" }], "recibo");
  assert(!!m && m.includes("Pantalla 15.6") && m.includes("el recibo"), "con pendientes, el recibo se frena y dice qué falta");
}
{
  const traductor = fs.readFileSync("lib/facturacion/gancho/traductor.ts", "utf8");
  assert(traductor.includes("cuenta.aprobadoSinArticulo.length > 0") && traductor.includes('"PRESUPUESTO_PENDIENTE"'), "la pre-factura bloquea con la MISMA lista que suma la cuenta");
  for (const ruta of ["app/api/facturacion/emitir/route.ts", "app/api/facturacion/recibos/route.ts"]) {
    const src = fs.readFileSync(ruta, "utf8");
    assert(src.includes("mensajeAprobadoSinArticulo(") && src.includes("MENSAJE_NO_SE_PUDO_VERIFICAR"), `${ruta}: re-verificación server-side, y si no se puede leer la cuenta NO emite`);
  }
  const cuenta = fs.readFileSync("lib/cuenta-unificada/index.ts", "utf8");
  assert(/totalCuenta = totalRepuestos \+ totalServicios \+ totalProductosDigitales \+ totalAprobadoSinArticulo/.test(cuenta), "la cuenta unificada suma lo aprobado sin artículo al total");
}

// ─── Un cargo borrado desde las tarjetas viejas no se vuelve deuda ───────────
{
  const presentes = { servicios: new Set<string>(), digitales: new Set<string>(), itemsEnOrden: new Set<string>() };
  const [p] = cargasPerdidas([L({ id: "x", estado: "Cargada", cargoServicioId: "recBORRADO" })], presentes);
  assert(!!p && fueQuitadaPorLaTienda({ estado: "Rechazada", notaCarga: p.nota }), "el cargo desapareció → la línea queda \"Quitada\" (no \"Aprobada\", que sumaría como deuda)");
  const cargar = fs.readFileSync("lib/tecnicos/presupuesto/cargar.ts", "utf8");
  const sinc = cargar.slice(cargar.indexOf("export async function sincronizarConLasTarjetas"));
  assert(sinc.includes('estado: "Rechazada"') && !sinc.includes('estado: "Aprobada"'), "sincronizarConLasTarjetas escribe Rechazada (Quitada), nunca Aprobada");
}

if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo OK");
