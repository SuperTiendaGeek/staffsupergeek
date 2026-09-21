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
  validarLinea, fasePedido, sincronizarConPedido, planDeCarga,
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
  operacionId: "recOP", aprobadoPor: "", fechaAprobacion: "", creadoPor: "", ...o,
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

// ─── Cobros: el anticipo por un repuesto aprobado no es dinero de más ────────
const conAnticipo = clasificarOrden({
  recordId: "recO", idVisible: "OR", cliente: "", equipo: "", estado: "En Proceso", fechaIngreso: "2026-09-21",
  totalCuenta: 25, abonos: [{ id: "a", monto: 60, estado: "Registrado" }], facturas: [], recibos: [],
  estadoPresupuesto: "aprobado", comprometidoPresupuesto: 90,
});
assert(!CATEGORIAS.abonos_sin_respaldo.pertenece(conAnticipo), "Abono de $60 con $25 cargados + $90 aprobados sin cargar → NO es de más");

// ─── Un solo camino a "Pedido" ───────────────────────────────────────────────
const raiz = path.join(__dirname, "..", "..", "..");
const rutaEstado = fs.readFileSync(path.join(raiz, "app", "api", "operaciones", "[id]", "estado", "route.ts"), "utf8");
const cargar = fs.readFileSync(path.join(raiz, "lib", "tecnicos", "presupuesto", "cargar.ts"), "utf8");
assert(rutaEstado.includes("pasarOperacionAPedido(") && cargar.includes("pasarOperacionAPedido("),
  "El tablero de Operaciones y la tarjeta Presupuesto pasan a Pedido por la misma función");
const opsAirtable = fs.readFileSync(path.join(raiz, "lib", "operaciones", "airtable.ts"), "utf8");
assert(opsAirtable.includes('opRec.fields["Presupuesto por Orden"]'),
  "El artículo nace como compra pendiente de pago cuando la operación viene del presupuesto, sin importar desde dónde se pidió");

if (fallos > 0) { console.error(`\n${fallos} fallo(s).`); process.exit(1); }
console.log("\nOK — repuesto bajo pedido.");
