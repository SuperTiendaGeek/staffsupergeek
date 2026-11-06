/**
 * Test — ajuste de OP-2026-000135 (cargador Asus 45/65W, Gabriel Peralta · 6-nov-2026).
 * Ejecutar: npm test ajuste-op135
 */
import { OP135, abonadoTrasAjuste, bloqueosOp135, pasosOp135, type EstadoOp135 } from "../ajuste-op135";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// Hoy en Airtable (6-nov, 08:00).
const hoy: EstadoOp135 = {
  operacion: {
    id: "reccprdf2G3hNmfYr", estado: "Aprobado", facturaIds: [], opcionElegida: true,
    abonos: [
      { id: "receWoPceewVgxX49", monto: 30, metodo: "Transferencia", estado: "Registrado", saldoIds: [] },
      { id: "rec05sAtHLxpkzI0H", monto: -30, metodo: "Saldo a favor", estado: "Registrado", saldoIds: ["rececHq49GdBtRt8s"] },
    ],
  },
  solicitud: { id: "recoSAYZLpUrDJQ2b", estado: "Por comprar", itemId: null, operacionId: "reccprdf2G3hNmfYr" },
  factura: { id: "rec9wwtNW2F5TgrEF", estado: "AUTORIZADO", total: 30, lineaConArticulo: false },
  saldo: { id: "reczOXJxafDZqTqef", tipo: "Usado", estado: "Vigente", monto: 30, facturaIds: ["rec9wwtNW2F5TgrEF"], abonoIds: [] },
  articulo: null,
};

assert(bloqueosOp135(hoy).length === 0, "hoy no hay nada que impida el ajuste");
assert(pasosOp135(hoy).join(",") === "compra,pago,venta,linea-factura,enlace-factura,abono-saldo,entregado", "hoy faltan los 7 pasos, en orden");
assert(abonadoTrasAjuste(hoy) === 30, "tras el ajuste el pedido tiene $30 abonados = su cargo de $30 (cuenta en $0)");
assert(abonadoTrasAjuste({ ...hoy, operacion: { ...hoy.operacion!, abonos: hoy.operacion!.abonos.slice(0, 1) } }) === 60, "si el traspaso a saldo no existiera, se vería el doble (control)");

// El abono "-30 Saldo a favor" (el traspaso) NO cuenta como el abono de pago con saldo.
const soloTraspaso = { ...hoy, saldo: { ...hoy.saldo!, abonoIds: ["rec05sAtHLxpkzI0H"] } };
assert(pasosOp135(soloTraspaso).includes("abono-saldo"), "el traspaso de −$30 no cuenta como el pago con saldo");

// Todo hecho.
const hecho: EstadoOp135 = {
  ...hoy,
  operacion: {
    ...hoy.operacion!, estado: "Entregado", facturaIds: ["rec9wwtNW2F5TgrEF"],
    abonos: [...hoy.operacion!.abonos, { id: "recNuevo000000001", monto: 30, metodo: "Saldo a favor", estado: "Registrado", saldoIds: [] }],
  },
  solicitud: { ...hoy.solicitud!, estado: "Comprada", itemId: "recItem0000000001" },
  factura: { ...hoy.factura!, lineaConArticulo: true },
  saldo: { ...hoy.saldo!, abonoIds: ["recNuevo000000001"] },
  articulo: { id: "recItem0000000001", sku: "CAR-000010", estado: "Vendido", facturaIds: ["rec9wwtNW2F5TgrEF"], ordenCompraId: "recOC000000000001", pagado: true },
};
assert(pasosOp135(hecho).length === 0, "corrido el ajuste: 0 pasos (idempotente)");
assert(bloqueosOp135(hecho).length === 0, "corrido el ajuste: sin bloqueos");
assert(abonadoTrasAjuste(hecho) === 30, "corrido el ajuste: $30 abonados, no se suma otra vez");

// A medias (se cortó después del pago): sigue desde la venta.
const aMedias: EstadoOp135 = { ...hoy, solicitud: hecho.solicitud, articulo: { ...hecho.articulo!, estado: "Reservado", facturaIds: [] } };
assert(pasosOp135(aMedias)[0] === "venta" && !pasosOp135(aMedias).includes("compra"), "si se cortó, retoma donde quedó sin volver a comprar");

// Protecciones.
assert(bloqueosOp135({ ...hoy, factura: { ...hoy.factura!, estado: "ANULADO" } }).some((b) => b.includes("AUTORIZADO")), "factura anulada → no se toca nada");
assert(bloqueosOp135({ ...hoy, saldo: { ...hoy.saldo!, facturaIds: [] } }).some((b) => b.includes(OP135.saldoUsado)), "el uso de saldo debe ser el de la factura 818");
assert(bloqueosOp135({ ...hoy, solicitud: { ...hoy.solicitud!, estado: "Comprada", itemId: "recOtro0000000001" } }).some((b) => b.includes(OP135.solicitud)), "si alguien ya compró otro cargador con SOL-000014 → revisar a mano");
assert(bloqueosOp135({ ...hoy, operacion: { ...hoy.operacion!, facturaIds: ["recOtraFactura001"] } }).some((b) => b.includes("otra factura")), "si el pedido ya tiene otra factura → revisar a mano");
assert(bloqueosOp135({ ...hoy, articulo: { ...hecho.articulo!, facturaIds: ["recOtraFactura001"] } }).some((b) => b.includes("otra factura")), "un cargador vendido con otra factura no se toca");

if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nAjuste OP-2026-000135: todo OK");
