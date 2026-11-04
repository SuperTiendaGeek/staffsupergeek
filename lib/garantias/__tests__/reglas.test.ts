/**
 * Test — Garantías SUPER GEEK (auditoría ops, punto 20 · 4-nov-2026).
 * Caso real: OR000425 (Aida Marcillo), batería REP-000135. El sistema no
 * aceptaba $0 (el dueño puso $1) y una pieza de stock apartada para la orden
 * cobraba su "Precio venta final" aunque la línea dijera $0.
 * Ejecutar: npm test garantias
 */
import {
  camposReversaGarantia, camposSalidaGarantia, cargosEnGarantia, errorPrecioEnGarantia, evaluarGarantia,
  garantiaTrasModificar, normalizarGarantia, planGarantiasDeLaOrden, sinGarantia, visibleParaCliente,
  ESTADO_ITEM_SALIDA_GARANTIA, MOTIVO_KARDEX_REVERSA, MOTIVO_KARDEX_SALIDA, type ArticuloParaGarantia,
} from "../reglas";
import { aprobadoSinArticulo, planDeCarga, validarLinea, type LineaPresupuesto } from "@/lib/tecnicos/presupuesto/reglas";
import { calcularEstadoCuenta } from "@/lib/estado-cuenta/reglas";
import { construirVista, validarEnvio } from "@/lib/tecnicos/presupuesto/enlace-reglas";
import { MOTIVOS_KARDEX } from "@/lib/shipping-v2/kardex";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const L = (o: Partial<LineaPresupuesto>): LineaPresupuesto => ({
  id: "recL", tipo: "Repuesto", descripcion: "Batería Dell XPS 13 9300", cantidad: 1, precioUnitario: 85, estado: "Propuesta", notaCarga: "",
  servicioCatalogoId: null, itemId: "recREP135", productoCatalogoId: null, cargoServicioId: null, cargoProductoDigitalId: null, operacionId: null,
  bajoPedido: false, proveedorId: null, urlProveedor: "", costoProveedor: null, tiempoEstimado: "", categoria: "", historial: "",
  aprobadoPor: "", fechaAprobacion: "", creadoPor: "", ...o,
});
const tecnico = { esAdmin: false, nombre: "Joseph", motivo: "Batería de OR000425 salió mala" };
const admin = { esAdmin: true, nombre: "Alex", motivo: "Batería de OR000425 salió mala" };

// ─── Proponer / confirmar / quitar ──────────────────────────────────────────
{
  const r = evaluarGarantia(L({}), "proponer", tecnico);
  assert(r.ok && r.cambios.garantia === "Propuesta" && r.cambios.precioUnitario === 0 && !r.aprobar, "un técnico PROPONE: queda propuesta, a $0, sin aprobar");
  const a = evaluarGarantia(L({}), "proponer", admin);
  assert(a.ok && a.cambios.garantia === "Confirmada" && a.cambios.garantiaConfirmadaPor === "Alex" && a.aprobar, "un administrador la deja confirmada y se aprueba ya (sin el cliente)");
  assert(!evaluarGarantia(L({}), "proponer", { ...tecnico, motivo: "  " }).ok, "sin motivo no hay garantía");
  assert(!evaluarGarantia(L({ tipo: "Producto digital" }), "proponer", admin).ok, "una licencia no va en garantía");
  assert(evaluarGarantia(L({ tipo: "Servicio" }), "proponer", tecnico).ok, "la mano de obra sí puede ir en garantía");
  assert(!evaluarGarantia(L({ estado: "Cargada" }), "proponer", admin).ok, "lo ya aprobado no se pone en garantía (se usa Modificar)");
  assert(!evaluarGarantia(L({ grupoAlternativas: "g1" }), "proponer", admin).ok, "una alternativa no va en garantía");
  assert(!evaluarGarantia(L({ garantia: "Propuesta" }), "confirmar", tecnico).ok, "un técnico NO confirma");
  const c = evaluarGarantia(L({ garantia: "Propuesta", motivoGarantia: "x" }), "confirmar", admin);
  assert(c.ok && c.cambios.garantia === "Confirmada" && c.aprobar, "el administrador confirma la propuesta y se carga");
  assert(!evaluarGarantia(L({}), "confirmar", admin).ok, "no se confirma lo que nadie propuso");
  const q = evaluarGarantia(L({ garantia: "Propuesta" }), "quitar", tecnico);
  assert(q.ok && q.cambios.garantia === "" && !q.aprobar, "quitar la garantía la deja como línea normal");
  assert(normalizarGarantia({ name: "Confirmada" }) === "Confirmada" && normalizarGarantia("otra") === "", "lee el valor de Airtable");
  assert(errorPrecioEnGarantia(L({ garantia: "Confirmada" }), 10) !== null && errorPrecioEnGarantia(L({ garantia: "Confirmada" }), 0) === null, "una línea en garantía no acepta precio");
  assert(garantiaTrasModificar(L({ garantia: "Confirmada" })) === "Propuesta", "Modificar una garantía confirmada la deja propuesta (se confirma otra vez)");
}

// ─── Bajo pedido a $0 ───────────────────────────────────────────────────────
{
  const bp = { proveedorId: "recP", categoria: "Batería", costoProveedor: 35.68 };
  const base = { tipo: "Repuesto" as const, descripcion: "Batería", cantidad: 1, precioUnitario: 0, bajoPedido: bp };
  assert(validarLinea(base) !== null, "un repuesto bajo pedido normal a $0 sigue sin aceptarse");
  assert(validarLinea({ ...base, garantia: true }) === null, "en garantía, bajo pedido a $0 sí se acepta");
  const l = L({ itemId: null, bajoPedido: true, proveedorId: "recP", costoProveedor: 35.68, precioUnitario: 0, garantia: "Confirmada" });
  const plan = planDeCarga([l], { items: new Map(), unidadesDigitales: new Map() });
  assert(plan[0].accion.tipo === "crear_solicitud", "garantía bajo pedido confirmada → nace su solicitud de compra (anticipo cubierto: $0)");
  const sinG = planDeCarga([{ ...l, garantia: "" }], { items: new Map(), unidadesDigitales: new Map() });
  assert(sinG[0].accion.tipo === "pendiente", "sin garantía, bajo pedido a $0 queda pendiente (falta el precio)");
}

// ─── La cuenta cobra $0 por la pieza ────────────────────────────────────────
{
  const lineas = [L({ estado: "Cargada", garantia: "Confirmada" }), L({ id: "recS", tipo: "Servicio", itemId: null, cargoServicioId: "recSV", estado: "Cargada", garantia: "Confirmada" })];
  const g = cargosEnGarantia(lineas);
  assert(g.items.has("recREP135") && g.servicios.has("recSV"), "la pieza y el servicio de la garantía se reconocen");
  assert(cargosEnGarantia([L({ estado: "Cargada", garantia: "Propuesta" })]).items.size === 0, "una garantía solo propuesta no baja el precio");
  assert(cargosEnGarantia([L({ estado: "Rechazada", garantia: "Confirmada" })]).items.size === 0, "una línea quitada ya no protege su pieza");

  const datos = {
    servicios: 25, productosDigitales: 0, repuestosHistoricos: 0,
    items: [{ id: "recREP135", precio: 80.67 }], aprobadoSinArticulo: [], descuentos: [],
    cargosExistentes: new Set(["recREP135"]),
  };
  const antes = calcularEstadoCuenta({ cargos: datos, abonos: [] });
  assert(antes.totalCuenta === 105.67, "reproduce el error: sin la regla, la batería de stock cobraba su precio de venta");
  const ahora = calcularEstadoCuenta({ cargos: { ...datos, itemsEnGarantia: g.items }, abonos: [] });
  assert(ahora.totalCuenta === 25, "con la garantía, la cuenta solo cobra lo demás (limpieza $25)");
  const soloG = calcularEstadoCuenta({ cargos: { ...datos, servicios: 0, itemsEnGarantia: g.items }, abonos: [] });
  assert(soloG.totalCuenta === 0 && soloG.estadoPago === "sin_cargos", "OR000425: solo la garantía → cuenta en $0");

  const pend = aprobadoSinArticulo([L({ estado: "Aprobada", itemId: null, bajoPedido: true, precioUnitario: 0, garantia: "Confirmada" })],
    { servicios: new Set(), digitales: new Set(), itemsStock: new Set(), operacionesConArticulo: new Set() });
  assert(pend.length === 0, "una garantía que espera su compra no frena el documento de lo pagado");

  const cuenta = { items: [{ id: "a", garantia: true }, { id: "b" }], servicios: [{ id: "s", garantia: true }, { id: "t" }] };
  const doc = sinGarantia(cuenta);
  assert(doc.items.length === 1 && doc.items[0].id === "b" && doc.servicios.length === 1 && doc.servicios[0].id === "t", "el documento lleva solo lo pagado");
}

// ─── Lo que ve el cliente ───────────────────────────────────────────────────
{
  const propuesta = L({ id: "recP", garantia: "Propuesta", precioUnitario: 0 });
  const confirmada = L({ id: "recC", estado: "Cargada", garantia: "Confirmada", precioUnitario: 0 });
  const normal = L({ id: "recN", tipo: "Servicio", servicioCatalogoId: "recS", itemId: null, precioUnitario: 25 });
  assert(!visibleParaCliente(propuesta) && visibleParaCliente(confirmada), "solo la confirmada se le muestra");
  const v = construirVista([propuesta, confirmada, normal], [[{ lineaId: "recP", descripcion: "x", cantidad: 1, precioUnitario: 85, huella: "h", decision: "aprobar" }]]);
  assert(!v.lineas.some((x) => x.id === "recP"), "la propuesta no aparece en el enlace ni en el PDF");
  assert(v.retiradas.length === 0, "y tampoco sale como \"retirada por el taller\"");
  const c = v.lineas.find((x) => x.id === "recC")!;
  assert(c.garantia === true && !c.puedeResponder && !c.pendiente && c.subtotal === 0, "la confirmada es informativa, $0, no se responde");
  assert(v.pendientes === 1 && v.totalPendiente === 25, "solo lo normal queda pendiente de respuesta");
  const aprobada = L({ id: "recA", estado: "Aprobada", itemId: null, bajoPedido: true, garantia: "Confirmada", precioUnitario: 0 });
  const va = construirVista([aprobada], []);
  const env = validarEnvio(va.lineas, { decisiones: [{ lineaId: "recA", decision: "no", huella: va.lineas[0].huella }], nombre: "Aida Marcillo", cedula4: "", acepta: true }, "");
  assert(!env.ok, "el cliente no puede rechazar una garantía desde el enlace");
}

// ─── Al entregar: la pieza sale; al reabrir: vuelve ─────────────────────────
{
  const salida = camposSalidaGarantia({ cantidad: 1, cantidadReservada: 1, reservado: true });
  assert(salida.cantidad === 0 && salida.cantidadReservada === 0 && !salida.reservado && salida.estado === ESTADO_ITEM_SALIDA_GARANTIA && salida.disponibleVenta === false,
    "una unidad: sale y queda \"Usado en reparación\"");
  const lote = camposSalidaGarantia({ cantidad: 5, cantidadReservada: 1, reservado: false });
  assert(lote.cantidad === 4 && lote.cantidadReservada === 0 && lote.estado === undefined, "un registro de varias unidades sigue vivo con las que quedan");
  const vuelve = camposReversaGarantia({ cantidad: 0, cantidadReservada: 0, reservado: false, estado: ESTADO_ITEM_SALIDA_GARANTIA });
  assert(vuelve.cantidad === 1 && vuelve.cantidadReservada === 1 && vuelve.reservado && vuelve.estado === "Reservado", "al reabrir vuelve apartada para la orden");

  const art = (o: Partial<ArticuloParaGarantia> = {}): ArticuloParaGarantia => ({
    id: "recREP135", sku: "REP-000135", estado: "Reservado", recibido: true, cantidad: 1, cantidadReservada: 1, reservado: true, ordenesStock: ["recOR425"], ...o,
  });
  const linea = L({ estado: "Cargada", garantia: "Confirmada", precioUnitario: 0 });
  const plan = (l: LineaPresupuesto, a: ArticuloParaGarantia, nuevoEstado: string) =>
    planGarantiasDeLaOrden({ ordenId: "recOR425", nuevoEstado, lineas: [l], articulos: new Map([[a.id, a]]) });

  const p1 = plan(linea, art(), "Finalizado Entregado");
  assert(p1.length === 1 && p1[0].tipo === "salida", "entregar la orden saca la batería del inventario");
  assert(plan({ ...linea, garantiaEntregada: true }, art({ cantidad: 0 }), "Finalizado Entregado").length === 0, "no sale dos veces");
  assert(plan(linea, art(), "En Proceso").length === 0, "otro estado sin haber salido: nada que hacer");
  const p2 = plan({ ...linea, garantiaEntregada: true }, art({ cantidad: 0, cantidadReservada: 0, reservado: false, estado: ESTADO_ITEM_SALIDA_GARANTIA }), "Pendiente");
  assert(p2.length === 1 && p2[0].tipo === "revertir", "reabrir la orden devuelve la pieza");
  const p3 = plan(linea, art({ recibido: false }), "Finalizado Entregado");
  assert(p3[0].tipo === "omitir", "si la pieza todavía no llega, no se inventa la salida (queda aviso)");
  const p4 = plan(linea, art({ ordenesStock: [] }), "Finalizado Entregado");
  assert(p4[0].tipo === "omitir", "si la pieza ya no está apartada para la orden, no se toca");
  assert(plan({ ...linea, garantia: "Propuesta" }, art(), "Finalizado Entregado").length === 0, "una garantía solo propuesta no mueve inventario");
  assert(plan({ ...linea, tipo: "Servicio", itemId: null }, art(), "Finalizado Entregado").length === 0, "la mano de obra en garantía no mueve inventario");

  assert((MOTIVOS_KARDEX as readonly string[]).includes(MOTIVO_KARDEX_SALIDA) && (MOTIVOS_KARDEX as readonly string[]).includes(MOTIVO_KARDEX_REVERSA),
    "el Kardex conoce \"Salida por garantía\" y \"Garantía revertida\"");
}

if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nGarantías: todo OK");
