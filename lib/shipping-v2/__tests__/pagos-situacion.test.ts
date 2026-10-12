/**
 * Pagos a proveedor (punto 9 de la auditoría, 12-oct-2026).
 * Ejecutar: npx tsx lib/shipping-v2/__tests__/pagos-situacion.test.ts
 */
import {
  ESTADOS_DE_PAGO_RETIRADOS,
  esPagoHistorico,
  estadoSinEtapaDePago,
  faltaRespaldo,
  situacionPago,
  validarRespaldo,
} from "../pagos-situacion";
import { getDefaultItemFlowByOperation } from "../item-operation-rules";
import { ESTADOS_CORREGIBLES } from "../correccion-estado";

let fallos = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { fallos++; console.error("✗", msg); } else console.log("✓", msg);
}

console.log("— Situación del pago (sale de los pagos, no del estado) —");
assert(situacionPago({ requierePago: true }) === "falta-respaldo", "Compra sin pago registrado: falta respaldo");
assert(situacionPago({ requierePago: true, pagos: [{ estado: "Pagado" }] }) === "pagado", "Con pago Pagado: pagado");
assert(situacionPago({ requierePago: true, pagos: [{ estado: "Pendiente" }] }) === "pago-en-curso", "Pago a medio registrar: en curso");
assert(situacionPago({ requierePago: false }) === "sin-pago", "Reajuste: no requiere pago");
assert(situacionPago({ requierePago: true, esRegalo: true }) === "sin-pago", "Regalo: no requiere pago");

console.log("\n— Lista 'Falta respaldo' —");
assert(faltaRespaldo({ requierePago: true }), "Compra sin pago → aparece");
assert(!faltaRespaldo({ requierePago: true, enPagoVivo: true }), "Ya en un pago → no aparece");
assert(!faltaRespaldo({ requierePago: true, cancelado: true }), "Cancelada → no aparece");
assert(!faltaRespaldo({ requierePago: true, esRegalo: true }), "Regalo → no aparece");
assert(!faltaRespaldo({ requierePago: true, faltaProveedor: true }), "Sin proveedor → no aparece (no se puede agrupar)");

console.log("\n— El estado ya no lleva el pago (F-8d) —");
const compra = getDefaultItemFlowByOperation({ tipoOperacion: "Compra a proveedor" });
assert(compra.estadoItemSugerido === "Registrado" && compra.requierePago, "Compra nace Registrado y requiere pago");
assert(compra.disponibleParaVenta === true, "…y se puede reservar desde que nace");
assert(getDefaultItemFlowByOperation({ tipoOperacion: "Compra ya pagada" }).estadoItemSugerido === "Registrado", "Compra ya pagada (datos viejos) también Registrado");
for (const e of ESTADOS_DE_PAGO_RETIRADOS) assert(!ESTADOS_CORREGIBLES.includes(e), `"${e}" no se elige al corregir estado`);
assert(estadoSinEtapaDePago("Pendiente de pago") === "Registrado" && estadoSinEtapaDePago("Pagado") === "Registrado", "Datos viejos: etapas de pago → Registrado");
assert(estadoSinEtapaDePago("En tránsito") === null, "Las etapas logísticas no cambian");

console.log("\n— Pago histórico —");
assert(esPagoHistorico({ estadoPago: "Pagado", estadoIntegracionFinanzas: "No aplica", movimientoFinanzasIds: [] }), "Pagado + No aplica + sin egreso = histórico");
assert(!esPagoHistorico({ estadoPago: "Pagado", estadoIntegracionFinanzas: "Pendiente de sincronizar", movimientoFinanzasIds: ["rec1"] }), "Pago real con egreso: no es histórico");
assert(!esPagoHistorico({ estadoPago: "Pendiente", estadoIntegracionFinanzas: "No aplica" }), "Pendiente: no es histórico");

console.log("\n— Respaldo al registrar —");
const ok = { fechaPagoReal: "2026-10-12", metodoPago: "Tarjeta", cuentaOrigen: "Tarjeta C. Pichincha", transaccionId: "123" };
assert(validarRespaldo(ok) === null, "Con fecha, método, cuenta y transacción: válido");
assert(validarRespaldo({ ...ok, transaccionId: "", comprobanteUrl: "https://x/y.pdf" }) === null, "Con enlace en vez de transacción: válido");
assert(validarRespaldo({ ...ok, transaccionId: "" }) === null, "Punto 9b: sin comprobante también vale (queda Sin comprobante)");
assert(validarRespaldo({ ...ok, cuentaOrigen: "No aplica" }) !== null, "Cuenta 'No aplica': inválida");
assert(validarRespaldo({ ...ok, fechaPagoReal: "" }) !== null, "Sin fecha: inválido");

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1); }
console.log("\nTodas las pruebas pasaron.");
