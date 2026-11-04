/**
 * Test — repuesto BAJO PEDIDO en el presupuesto de la orden (vía Operación
 * Comercial). Casos borde que no pueden quedar sueltos:
 *
 *   · Validación: proveedor obligatorio (sin él no hay pago pendiente en
 *     Shipping), una unidad por línea (una operación = un artículo).
 *   · El estado se lee de la operación real: si avanza desde el tablero de
 *     Operaciones, la línea se pone al día; si se rechaza (o la vence el cron
 *     de 15 días), la línea lo muestra y se puede reactivar.
 *   · Aprobar pasa la operación a Aprobado; el SKU nace recién al pedir.
 *   · No se factura un repuesto bajo pedido que no llegó.
 *   · Un abono adelantado por un repuesto aprobado no es "dinero de más".
 *
 * Ejecutar: npm test presupuesto-bajo-pedido
 */

import fs from "fs";
import path from "path";
import {
  validarLinea, fasePedido, sincronizarConPedido, planDeCarga, reversasDisponibles,
  type InfoPedido, type LineaPresupuesto,
} from "../presupuesto/reglas";
import { evaluarItemNoListo } from "../../facturacion/gancho/construccion";
import { clasificarOrden, CATEGORIAS } from "../cobros/reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const linea = (o: Partial<LineaPresupuesto>): LineaPresupuesto => ({
  id: "recL", tipo: "Repuesto", descripcion: "Pantalla 15.6 FHD", cantidad: 1, precioUnitario: 90, estado: "Propuesta", notaCarga: "",
  servicioCatalogoId: null, itemId: null, productoCatalogoId: null, cargoServicioId: null, cargoProductoDigitalId: null,
  operacionId: "recOP", bajoPedido: true, proveedorId: "recPROV", urlProveedor: "", costoProveedor: 40, tiempoEstimado: "", categoria: "Pantalla", historial: "",
  aprobadoPor: "", fechaAprobacion: "", creadoPor: "", ...o,
});
const pedido = (o: Partial<InfoPedido>): InfoPedido => ({
  operacionId: "recOP", codigo: "OP-2026-000120", estadoOperacion: "Cotizado", opcionElegidaId: "recOPC",
  proveedorNombre: "eBay", urlProveedor: "", costoProveedor: 40, precioCliente: 90, tiempoEstimado: "7-10 días", item: null, ...o,
});

// ─── Validación ──────────────────────────────────────────────────────────────
const bp = { proveedorId: "recPROV", categoria: "Pantalla", costoProveedor: 40 };
assert(validarLinea({ tipo: "Repuesto", descripcion: "Pantalla", cantidad: 1, precioUnitario: 90, bajoPedido: bp }) === null, "Bajo pedido completo es válido");
assert(validarLinea({ tipo: "Repuesto", descripcion: "Pantalla", cantidad: 1, precioUnitario: 90, bajoPedido: { ...bp, proveedorId: "" } }) !== null,
  "Sin proveedor se rechaza (no habría pago pendiente en Shipping)");
assert(validarLinea({ tipo: "Repuesto", descripcion: "Pantalla", cantidad: 2, precioUnitario: 90, bajoPedido: bp }) !== null,
  "Bajo pedido va de a una unidad (una operación = un artículo)");
assert(validarLinea({ tipo: "Repuesto", descripcion: "Pantalla", cantidad: 1, precioUnitario: 0, bajoPedido: bp }) !== null, "Sin precio al cliente se rechaza");
assert(validarLinea({ tipo: "Repuesto", descripcion: "Pantalla", cantidad: 1, precioUnitario: 90, bajoPedido: { ...bp, categoria: "Laptop" } }) !== null,
  "Un equipo completo no es un repuesto bajo pedido");
assert(validarLinea({ tipo: "Repuesto", descripcion: "Pantalla", cantidad: 1, precioUnitario: 90, bajoPedido: { ...bp, costoProveedor: -5 } }) !== null, "Costo negativo se rechaza");
assert(validarLinea({ tipo: "Repuesto", descripcion: "Pantalla", cantidad: 1, precioUnitario: 90, bajoPedido: { ...bp, costoProveedor: null } }) !== null,
  "Sin costo se rechaza (el pago pendiente en Shipping quedaría en $0)");

// ─── Fase ────────────────────────────────────────────────────────────────────
assert(fasePedido(pedido({})) === "cotizado", "Cotizado → cotizado");
assert(fasePedido(pedido({ estadoOperacion: "Rechazado" })) === "vencido", "Rechazado (cliente o cron de 15 días) → vencido");
assert(fasePedido(pedido({ estadoOperacion: "Aprobado" })) === "esperando_pedido", "Aprobado → falta pedirlo");
assert(fasePedido(pedido({ estadoOperacion: "Pedido", item: { id: "recI", sku: "REP-000200", recibido: false } })) === "en_camino", "Pedido con SKU sin llegar → en camino");
assert(fasePedido(pedido({ estadoOperacion: "Pedido", item: { id: "recI", sku: "REP-000200", recibido: true } })) === "recibido", "Recibido → llegó");
assert(fasePedido(pedido({ estadoOperacion: "Pedido" })) === "sin_articulo", "Pedido sin artículo → revisar (no queda escondido)");

// ─── Sincronización con Operaciones ──────────────────────────────────────────
assert(sincronizarConPedido(linea({}), pedido({})) === null, "Todo al día → no escribe nada");
const aprobadaFuera = sincronizarConPedido(linea({}), pedido({ estadoOperacion: "Aprobado" }));
assert(aprobadaFuera?.estado === "Aprobada", "Aprobada desde el tablero de Operaciones → la línea queda Aprobada");
const pedidaFuera = sincronizarConPedido(linea({ estado: "Aprobada" }), pedido({ estadoOperacion: "Pedido", item: { id: "recI", sku: "REP-000200", recibido: false } }));
assert(pedidaFuera?.estado === "Cargada" && pedidaFuera.itemId === "recI", "Pedida desde Operaciones → la línea queda Cargada con el SKU");
assert(sincronizarConPedido(linea({ estado: "Rechazada" }), pedido({ estadoOperacion: "Aprobado" })) === null, "Lo rechazado en la tarjeta se respeta");
const rechazadaFuera = sincronizarConPedido(linea({ estado: "Aprobada" }), pedido({ estadoOperacion: "Rechazado" }));
assert(!!rechazadaFuera?.notaCarga && !rechazadaFuera.estado, "Rechazada en Operaciones tras aprobar → aviso, no se borra nada");
assert(sincronizarConPedido(linea({ estado: "Aprobada", notaCarga: rechazadaFuera!.notaCarga! }), pedido({ estadoOperacion: "Rechazado" })) === null,
  "…y el aviso no se reescribe en cada lectura");

// ─── Plan de carga ───────────────────────────────────────────────────────────
const ctx = (p: InfoPedido) => ({ items: new Map(), unidadesDigitales: new Map(), pedidos: new Map([[p.operacionId, p]]) });
assert(planDeCarga([linea({})], ctx(pedido({})))[0].accion.tipo === "aprobar_pedido", "Aprobar → la operación pasa a Aprobado");
assert(planDeCarga([linea({})], ctx(pedido({ estadoOperacion: "Rechazado" })))[0].accion.tipo === "pendiente", "Cotización vencida → pendiente hasta reactivarla");
assert(planDeCarga([linea({})], ctx(pedido({ opcionElegidaId: null })))[0].accion.tipo === "pendiente", "Sin opción elegida → pendiente, no error");
assert(planDeCarga([linea({ estado: "Aprobada" })], ctx(pedido({ estadoOperacion: "Pedido", item: { id: "recI", sku: "REP-1", recibido: false } })))[0].accion.tipo === "ya_en_inventario",
  "Si ya tiene SKU, se da por cargada (nunca se reserva dos veces)");

// ─── Facturación: no se cobra lo que no llegó ───────────────────────────────
const detalleBase = { reservado: true, tieneFacturaPrevia: false, cantidad: 1, cantidadReservada: 1 };
assert(evaluarItemNoListo({ id: "i", nombre: "Pantalla", precio: 90 }, { ...detalleBase, bajoPedidoSinLlegar: true })?.motivo === "NO_RECIBIDO",
  "Repuesto bajo pedido sin llegar → la pre-factura se bloquea");
assert(evaluarItemNoListo({ id: "i", nombre: "Pantalla", precio: 90 }, { ...detalleBase, bajoPedidoSinLlegar: false }) === null,
  "Cuando llega (Recibido) se puede facturar");
// Auditoría Shipping V2, punto 1: vale para todo artículo, no solo bajo pedido.
assert(evaluarItemNoListo({ id: "i", nombre: "RAM", precio: 40 }, { ...detalleBase, pendienteDeEntrega: "no-llego" })?.motivo === "NO_RECIBIDO",
  "Repuesto de stock cargado en camino → no se factura hasta que llegue");
assert(evaluarItemNoListo({ id: "i", nombre: "SSD", precio: 40 }, { ...detalleBase, pendienteDeEntrega: "falta-inspeccion" })?.motivo === "SIN_INSPECCION",
  "Llegó pero falta firmar la inspección → no se factura todavía");
assert(evaluarItemNoListo({ id: "i", nombre: "SSD", precio: 40 }, { ...detalleBase, pendienteDeEntrega: null }) === null,
  "En tienda e inspeccionado → se factura");

// ─── Cobros: el anticipo por un repuesto aprobado no es dinero de más ────────
const conAnticipo = clasificarOrden({
  recordId: "recO", idVisible: "OR", cliente: "", equipo: "", estado: "En Proceso", fechaIngreso: "2026-09-21",
  totalCuenta: 25, abonos: [{ id: "a", monto: 60, estado: "Registrado" }], facturas: [], recibos: [],
  estadoPresupuesto: "aprobado", comprometidoPresupuesto: 90,
});
assert(!CATEGORIAS.abonos_sin_respaldo.pertenece(conAnticipo), "Abono de $60 con $25 cargados + $90 aprobados sin cargar → NO es de más");

// ─── Fase 2 (2-nov-2026): "Pedido" ya no crea artículos ──────────────────────
// Lo aprobado nace como solicitud de compra y se compra en Shipping V2 (la
// única pantalla de compras). Ni el tablero de Operaciones ni la tarjeta
// Presupuesto crean artículos por su cuenta (caso OR000432).
const raiz = path.join(__dirname, "..", "..", "..");
const rutaEstado = fs.readFileSync(path.join(raiz, "app", "api", "operaciones", "[id]", "estado", "route.ts"), "utf8");
const rutaPedido = fs.readFileSync(path.join(raiz, "app", "api", "tecnicos", "ordenes", "[id]", "presupuesto", "[lineaId]", "pedido", "route.ts"), "utf8");
assert(!rutaEstado.includes("pasarOperacionAPedido(") && rutaEstado.includes("asegurarSolicitudDeOpcion("),
  "Operaciones: aprobar crea la solicitud de compra; \"Pedido\" no crea artículos");
assert(!rutaPedido.includes("marcarPedidoAlProveedor("), "\"Ya se pidió al proveedor\" ya no crea artículos desde la orden");
// Fase 2B: se retiró la segunda puerta de compras (crear artículos desde la operación o el presupuesto).
const opsAirtable = fs.readFileSync(path.join(raiz, "lib", "operaciones", "airtable.ts"), "utf8");
const shipAirtable = fs.readFileSync(path.join(raiz, "lib", "shipping-v2", "airtable.ts"), "utf8");
const cargarTs = fs.readFileSync(path.join(raiz, "lib", "tecnicos", "presupuesto", "cargar.ts"), "utf8");
assert(!opsAirtable.includes("function crearShippingItemDesdeOpcion") && !opsAirtable.includes("function pasarOperacionAPedido")
  && !shipAirtable.includes("function createShippingV2ItemFromOperacion"), "Operaciones ya no crea artículos (solo \"Registrar compra\")");
assert(!cargarTs.includes("function marcarPedidoAlProveedor") && !cargarTs.includes("function crearOperacionAprobada"),
  "El presupuesto ya no crea operaciones ni artículos");

// ─── La operación NO existe hasta que el cliente aprueba ─────────────────────
const soloPresupuesto = linea({ operacionId: null });
assert(planDeCarga([soloPresupuesto], { items: new Map(), unidadesDigitales: new Map(), pedidos: new Map() })[0].accion.tipo === "crear_solicitud",
  "Bajo pedido sin operación → al aprobar se CREA la operación (antes no existe)");
assert(planDeCarga([linea({ operacionId: null, proveedorId: null })], { items: new Map(), unidadesDigitales: new Map() })[0].accion.tipo === "pendiente",
  "Sin proveedor no se crea nada: queda pendiente");
const rutaPost = fs.readFileSync(path.join(__dirname, "..", "..", "..", "app", "api", "tecnicos", "ordenes", "[id]", "presupuesto", "route.ts"), "utf8");
assert(!rutaPost.includes("crearOperacion("), "Agregar la línea al presupuesto NO crea la operación comercial (no consume código)");

// ─── Reversas: ningún escenario sin salida ───────────────────────────────────
const en = (o: Partial<InfoPedido>) => pedido({ estadoOperacion: "Pedido", ...o });
const art = (o: Partial<NonNullable<InfoPedido["item"]>>) => ({ id: "recI", sku: "REP-000300", recibido: false, estado: "Pendiente de pago", pagos: [], ...o });

let r = reversasDisponibles(linea({ estado: "Propuesta", operacionId: null }), undefined);
assert(!r.cancelar.permitido && !r.recotizar.permitido, "Propuesta: se borra o se rechaza, no hay nada que revertir");

r = reversasDisponibles(linea({ estado: "Aprobada" }), pedido({ estadoOperacion: "Aprobado" }));
assert(r.cancelar.permitido && r.recotizar.permitido, "Aprobado sin pedir: el cliente puede desistir y se puede recotizar");

r = reversasDisponibles(linea({ estado: "Cargada" }), en({ item: art({}) }));
assert(r.cancelar.permitido && r.recotizar.permitido && !r.liberar.permitido, "Pedido en camino sin pago al proveedor: se cancela o recotiza");

r = reversasDisponibles(linea({ estado: "Cargada" }), en({ item: art({ pagos: [{ id: "p", codigo: "PAG-000050", estado: "Pendiente" }] }) }));
assert(!r.cancelar.permitido && (r.cancelar.motivo ?? "").includes("PAG-000050"), "Incluido en un pago pendiente → dice cuál pago y dónde quitarlo");

r = reversasDisponibles(linea({ estado: "Cargada" }), en({ item: art({ pagos: [{ id: "p", codigo: "PAG-000051", estado: "Pagado" }] }) }));
assert(!r.cancelar.permitido && (r.cancelar.motivo ?? "").includes("reembolso"), "Ya pagado al proveedor → explica el camino (liberar al llegar o reembolso)");

r = reversasDisponibles(linea({ estado: "Cargada" }), en({ item: art({ recibido: true, estado: "Recibido" }) }));
assert(r.liberar.permitido && !r.cancelar.permitido, "Ya llegó y el cliente desiste → liberar a inventario");

r = reversasDisponibles(linea({ estado: "Cargada" }), en({ item: art({ estado: "Cancelado" }) }));
assert(r.recotizar.permitido && r.cancelar.permitido, "Artículo cancelado en Shipping (el proveedor no lo tenía) → recotizar");

r = reversasDisponibles(linea({ estado: "Cargada" }), en({ item: art({ estado: "Vendido", recibido: true }) }));
assert(!r.cancelar.permitido && (r.cancelar.motivo ?? "").includes("nota de crédito"), "Ya facturado → el camino es la nota de crédito");

r = reversasDisponibles(linea({ estado: "Cargada", bajoPedido: false, operacionId: null, tipo: "Servicio" }), undefined);
assert(!r.cancelar.permitido && (r.cancelar.motivo ?? "").includes("Quitar"), "Servicio ya cargado → se quita con \"Quitar\" en la línea (fase 2)");
r = reversasDisponibles(linea({ estado: "Aprobada", bajoPedido: false, operacionId: null, tipo: "Servicio" }), undefined);
assert(!r.cancelar.permitido && !r.recotizar.permitido, "Servicio aprobado sin cargar → tampoco usa reversas de compra (usa Quitar/Modificar)");

assert(fasePedido(en({ item: art({ estado: "Cancelado" }) })) === "articulo_cancelado", "Artículo cancelado se reconoce como tal");
assert(sincronizarConPedido(linea({ estado: "Cargada", itemId: "recI" }), en({ item: art({ estado: "Cancelado" }) }))?.notaCarga?.includes("canceló") === true,
  "Si se cancela en Shipping, la línea avisa (no se queda 'Cargada' en silencio)");

if (fallos > 0) { console.error(`\n${fallos} fallo(s).`); process.exit(1); }
console.log("\nOK — repuesto bajo pedido.");
