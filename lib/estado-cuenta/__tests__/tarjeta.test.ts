/**
 * Test — tarjeta "Cuenta" de la orden y del pedido (auditoría ops, punto 11).
 * Ejecutar: npm test tarjeta
 *
 * La tarjeta reemplaza el "Resumen financiero" que mostraba el saldo tres
 * veces y los pagos en dos listas. Aquí se prueba que ordena lo que ya
 * calculó la calculadora única sin recalcular nada, y que dice qué toca hacer.
 */
import fs from "fs";
import type { CuentaUnificada, CuentaUnificadaAbono } from "@/types/cuenta-unificada";
import type { DescuentoCuenta } from "../descuentos";
import { calcularEstadoCuenta } from "../reglas";
import { armarTarjetaCuenta, momentoDeCuenta, textoDocumento } from "../tarjeta";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}
const casi = (a: number, b: number) => Math.abs(a - b) < 0.005;

const abono = (o: Partial<CuentaUnificadaAbono>): CuentaUnificadaAbono => ({
  id: "recA", idAbono: "318", fecha: "2026-11-18T15:00:00.000Z", monto: 80, metodoPago: "Transferencia",
  estado: "Registrado", origen: "orden", observacion: null, numeroTransaccion: "123", registradoPor: "Kevin", ...o,
});
const descuento = (o: Partial<DescuentoCuenta>): DescuentoCuenta => ({
  id: "recD", cargoId: "recPantalla", tipoCargo: "Repuesto", cargo: "Pantalla", precioCargo: 85, monto: 10,
  motivo: "Cliente frecuente", estado: "Vigente", autorizadoPor: "Alex", fecha: null, ...o,
});

/** Arma la cuenta como lo hace getCuentaUnificada: los totales salen de la calculadora única. */
function cuentaDe(base: Partial<CuentaUnificada> & Pick<CuentaUnificada, "abonos">): CuentaUnificada {
  const c = {
    ordenId: "recOrden", ordenIdVisible: "OR000571", operacionId: null, operacionCodigo: null, modoRepuestos: null,
    items: [], servicios: [], repuestosHistoricos: [], productosDigitales: [], repuestosHistoricosCuentanParaTotal: true,
    aprobadoSinArticulo: [], descuentos: [],
    ...base,
  };
  const e = calcularEstadoCuenta({
    cargos: {
      servicios: c.servicios.reduce((s, x) => s + x.costo, 0),
      productosDigitales: c.productosDigitales.reduce((s, x) => s + x.precioVenta, 0),
      repuestosHistoricos: c.repuestosHistoricosCuentanParaTotal ? c.repuestosHistoricos.reduce((s, x) => s + x.subtotal, 0) : 0,
      items: c.items.map((i) => ({ id: i.id, precio: i.precio })),
      aprobadoSinArticulo: c.aprobadoSinArticulo,
      descuentos: c.descuentos,
      cargosExistentes: new Set([...c.items.map((i) => i.id), ...c.servicios.map((s) => s.id), ...c.productosDigitales.map((p) => p.id), ...c.repuestosHistoricos.map((r) => r.id)]),
    },
    abonos: c.abonos,
  });
  return {
    ...c,
    totalRepuestos: e.totalRepuestos, totalServicios: e.totalServicios, totalProductosDigitales: e.totalProductosDigitales,
    totalAprobadoSinArticulo: e.totalAprobadoSinArticulo, totalCuenta: e.totalCuenta, totalAbonado: e.totalAbonado,
    saldo: e.saldo, estadoPago: e.estadoPago, totalDescuentos: e.totalDescuentos,
  };
}

// OR000571 (ejemplo de la maqueta): limpieza y diagnóstico, pantalla con descuento, batería aprobada en camino.
const servicios = [{ id: "recDiag", nombre: "Diagnóstico", costo: 15 }, { id: "recLimp", nombre: "Limpieza y pasta térmica", costo: 30 }];
const pantalla = { id: "recPantalla", nombre: 'Pantalla 15.6" FHD 30 pines', origen: "stock" as const, precio: 85 };
const bateria = { id: "recLinBat", nombre: "Batería HP HT03XL", tipo: "Repuesto" as const, monto: 35, motivo: "falta_pedir" as const };
const pagos = [
  abono({ id: "rec318", idAbono: "318", monto: 80, comprobantes: [{ id: "att1", url: "https://x/1.jpg", filename: "1.jpg", contentType: "image/jpeg", size: 10, thumbnailUrl: null }] }),
  abono({ id: "rec322", idAbono: "322", monto: 25, metodoPago: "Efectivo", registradoPor: "Maritza", fecha: "2026-11-20T15:00:00.000Z" }),
  abono({ id: "rec320", idAbono: "320", monto: 25, metodoPago: "Efectivo", estado: "Anulado", motivoAnulacion: "Registrado dos veces", anuladoPor: "Alex" }),
];

// ── 1. Falta cobrar ─────────────────────────────────────────────────────────
{
  const cuenta = cuentaDe({ servicios, items: [pantalla], aprobadoSinArticulo: [bateria], descuentos: [descuento({})], abonos: pagos });
  const t = armarTarjetaCuenta({ cuenta, documento: null, esAdmin: true });
  assert(casi(cuenta.totalCuenta, 155) && casi(cuenta.saldo, 50), "la cuenta de ejemplo: $155, pagado $105, faltan $50");
  assert(t.momento === "cobrar" && t.accion.tipo === "registrar_pago" && casi(t.accion.monto, 50), "falta cobrar → una sola acción: Registrar pago $50 (con el saldo escrito)");
  assert(t.saldo.etiqueta === "Falta cobrar" && casi(t.saldo.monto, 50) && t.saldo.tono === "ambar", "saldo grande: «Falta cobrar $50», en ámbar");
  assert(t.etiquetaEstado === "Pago parcial" && t.tono === "ambar", "estado de pago: Pago parcial");
  assert(t.grupos.map((g) => g.clave).join(",") === "servicios,repuestos,aprobado", "cargos agrupados: servicios, repuestos y lo aprobado sin artículo");
  const suma = t.grupos.reduce((s, g) => s + g.total, 0) - t.totalDescuentos;
  assert(casi(suma, t.totalCuenta), "los grupos menos los descuentos dan el total de la calculadora (no se recalcula nada)");
  assert(t.grupos.find((g) => g.clave === "aprobado")!.enEspera, "lo aprobado sin artículo va marcado: suma, pero no se factura aún");
  assert(t.numeroLineas === 4, "4 líneas en total para la fila cerrada");
  assert(t.pagos.length === 2 && t.anulados.length === 1, "una sola lista de pagos; el anulado sale de la lista");
  assert(t.pagos[0].numero === "ABO-000318" && t.pagos[0].comprobantes.length === 1, "cada pago con su número y su comprobante");
  assert(t.anulados[0].motivo === "Registrado dos veces" && t.anulados[0].anuladoPor === "Alex", "el anulado guarda quién y por qué");
  assert(t.pagos.every((p) => p.bloqueoAnular === null), "el administrador puede anular (no hay documento)");
  const linPantalla = t.grupos.find((g) => g.clave === "repuestos")!.lineas[0];
  assert(linPantalla.descontable && linPantalla.detalle === "Stock" && linPantalla.precio === 85, "la pantalla: de stock, descontable, precio de lista $85");
  assert(!t.grupos.find((g) => g.clave === "aprobado")!.lineas[0].descontable, "lo aprobado sin artículo no se descuenta (decisión del 27-oct)");
  const tecnico = armarTarjetaCuenta({ cuenta, documento: null, esAdmin: false });
  assert(tecnico.pagos.every((p) => p.bloqueoAnular === "no_admin"), "un técnico no ve 'Anular'");
}

// ── 2. Pagada, falta el documento ───────────────────────────────────────────
{
  const cuenta = cuentaDe({ servicios, items: [pantalla], aprobadoSinArticulo: [bateria], descuentos: [descuento({})],
    abonos: [...pagos, abono({ id: "rec325", idAbono: "325", monto: 50 })] });
  const t = armarTarjetaCuenta({ cuenta, documento: null, esAdmin: true });
  assert(t.momento === "emitir" && t.saldo.tono === "verde", "pagada sin documento → Emitir documento");
  assert(t.accion.tipo === "emitir" && !!t.accion.bloqueo && t.accion.bloqueo.includes("Batería HP HT03XL"),
    "si algo aprobado aún no tiene artículo, Emitir dice qué falta que llegue");
}
{
  const cuenta = cuentaDe({ servicios, abonos: [abono({ monto: 45 })] });
  const t = armarTarjetaCuenta({ cuenta, documento: null, esAdmin: true });
  assert(t.accion.tipo === "emitir" && t.accion.bloqueo === null, "todo llegó → Emitir sin bloqueo");
}

// ── 3. Cerrada ──────────────────────────────────────────────────────────────
{
  const cuenta = cuentaDe({ servicios, abonos: [abono({ monto: 45 })] });
  const t = armarTarjetaCuenta({ cuenta, documento: { tipo: "recibo", numero: "REC-000112", recordId: "recRec" }, esAdmin: true });
  assert(t.momento === "cerrada" && t.accion.tipo === "ninguna", "pagada y con recibo → Cuenta cerrada, sin botón (se entrega desde la cabecera)");
  assert(t.pagos[0].bloqueoAnular === "documento" && (t.pagos[0].mensajeAnular ?? "").includes("REC-000112"),
    "con recibo vigente el pago no se anula: primero el recibo");
  assert(t.alerta === null, "sin alerta");
}

// ── 4. Sobra dinero ─────────────────────────────────────────────────────────
{
  const cuenta = cuentaDe({ servicios, abonos: [abono({ monto: 65 })] });
  const t = armarTarjetaCuenta({ cuenta, documento: null, esAdmin: true });
  assert(t.momento === "favor" && t.accion.tipo === "saldo_a_favor" && casi(t.accion.sobrante, 20), "sobran $20 → Pasar a saldo a favor / Devolver");
  assert(t.saldo.etiqueta === "Sobra" && casi(t.saldo.monto, 20) && t.saldo.tono === "azul", "saldo grande: «Sobra $20», en azul");
}

// ── 5. Pagos que no se anulan aquí ──────────────────────────────────────────
{
  const cuenta = cuentaDe({ servicios, abonos: [
    abono({ id: "recPP", metodoPago: "PayPhone", enLinea: true, monto: 20 }),
    abono({ id: "recTr", metodoPago: "Traspaso", monto: -10 }),
  ] });
  const t = armarTarjetaCuenta({ cuenta, documento: null, esAdmin: true });
  assert(t.pagos[0].enLinea && t.pagos[0].bloqueoAnular === "en_linea", "PayPhone: «En línea», se devuelve en Pagos en línea");
  assert(t.pagos[1].bloqueoAnular === "traspaso" && t.pagos[1].etiqueta === "Pasado a pedido aparte", "traspaso: se lee qué pasó y no se anula suelto");
}

// ── 6. Sin cargos, pedido especial, históricos, garantía, alerta ───────────
{
  const t = armarTarjetaCuenta({ cuenta: cuentaDe({ abonos: [] }), documento: null, esAdmin: true });
  assert(t.momento === "sin_cargos" && t.grupos.length === 0 && t.accion.tipo === "ninguna", "sin cargos: nada que cobrar ni emitir");
}
{
  const cuenta = cuentaDe({ ordenId: null, ordenIdVisible: null, operacionId: "recOp", operacionCodigo: "OP-2026-000152",
    items: [{ id: "recCarg", nombre: "Cargador Lenovo 65 W USB-C", origen: "pedido", precio: 38 }],
    servicios: [{ id: "recargo:recOp", nombre: "Recargo por no retiro", costo: 5 }],
    abonos: [abono({ monto: 20, metodoPago: "DeUna" })] });
  const t = armarTarjetaCuenta({ cuenta, documento: null, esAdmin: true });
  assert(t.grupos[0].nombre === "Cargos del pedido" && t.grupos[0].lineas[0].detalle === "Cargo del pedido", "en el pedido: «Cargos del pedido»");
  assert(t.grupos[1].nombre === "Artículos" && t.grupos[1].lineas[0].detalle === "Pedido", "en el pedido: «Artículos»");
}
{
  const hist = [{ id: "recH", nombre: "Disco 240GB", cantidad: 1, precioCliente: 40, subtotal: 40 }];
  const suman = armarTarjetaCuenta({ cuenta: cuentaDe({ repuestosHistoricos: hist, abonos: [] }), documento: null, esAdmin: true });
  assert(suman.grupos[0].clave === "repuestos" && suman.grupos[0].lineas[0].detalle === "Sistema anterior" && suman.historicosReferencia.length === 0,
    "los repuestos del sistema anterior que suman van dentro de Repuestos");
  const noSuman = armarTarjetaCuenta({ cuenta: cuentaDe({ repuestosHistoricos: hist, repuestosHistoricosCuentanParaTotal: false, abonos: [] }), documento: null, esAdmin: true });
  assert(noSuman.grupos.length === 0 && noSuman.historicosReferencia.length === 1, "los que no suman quedan solo como referencia");
}
{
  const cuenta = cuentaDe({ items: [{ id: "recG", nombre: "Batería Dell 3HWPP", origen: "stock", precio: 0, garantia: true }], abonos: [] });
  const t = armarTarjetaCuenta({ cuenta, documento: null, esAdmin: true });
  assert(t.grupos[0].lineas[0].garantia && t.grupos[0].lineas[0].detalle === "Garantía SUPER GEEK", "una pieza en garantía se ve, a $0");
}
{
  const cuenta = cuentaDe({ servicios, abonos: [abono({ monto: 20 })] });
  const t = armarTarjetaCuenta({ cuenta, documento: { tipo: "recibo", numero: "REC-000099" }, esAdmin: true });
  assert(t.momento === "cobrar" && (t.alerta ?? "").includes("REC-000099"), "documento emitido y falta cobrar → alerta para revisar");
}
assert(momentoDeCuenta({ saldo: 0.004, totalCuenta: 45 }, null) === "emitir", "centavos de redondeo no cuentan como saldo");
assert(textoDocumento({ tipo: "recibo", numero: "REC-000112", estado: "Vigente" }) === "REC-000112", "recibo vigente: solo el número");
assert(textoDocumento({ tipo: "factura", numero: "001-002-000000818", estado: "DEVUELTA" }) === "001-002-000000818 · devuelta",
  "una factura que el SRI devolvió dice su estado (bloquea emitir otra, pero no es lo normal)");

// ── 7. Las pantallas usan la tarjeta ────────────────────────────────────────
const tarjeta = fs.readFileSync("components/cuenta/CuentaCard.tsx", "utf8");
assert(tarjeta.includes("armarTarjetaCuenta("), "el componente pinta lo que arma la regla");
const orden = fs.readFileSync("app/tecnicos/ordenes/[id]/OrdenDetalleClient.tsx", "utf8");
assert(orden.includes("<CuentaCard") && !orden.includes("<CuentaUnificadaPanel") && !orden.includes(">Total abonado</p>")
  && !orden.includes('text-[var(--sg-text-muted)]">Abonos</p>') && !orden.includes("Cobrada y documentada"),
  "la orden tiene UNA tarjeta Cuenta (sin el recuadro, la cuadrícula ni la segunda lista de abonos)");
const pedido = fs.readFileSync("components/operaciones/OperacionDetalleClient.tsx", "utf8");
assert(pedido.includes("<CuentaCard") && !pedido.includes("CuentaUnificadaPanel"), "el pedido usa el MISMO componente");

if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo OK");
