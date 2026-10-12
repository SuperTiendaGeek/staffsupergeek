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
import { camposPagoHistorico, planAjustePunto9, type RegistroAjuste9 } from "../ajuste-punto9";
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
assert(validarRespaldo({ ...ok, transaccionId: "" }) !== null, "Sin transacción ni comprobante: inválido");
assert(validarRespaldo({ ...ok, cuentaOrigen: "No aplica" }) !== null, "Cuenta 'No aplica': inválida");
assert(validarRespaldo({ ...ok, fechaPagoReal: "" }) !== null, "Sin fecha: inválido");

console.log("\n— Ajuste de datos —");
const base: RegistroAjuste9 = {
  id: "rec1", sku: "LAP-000091", estado: "En tránsito", tipoOperacion: "Compra a proveedor", requierePago: true, esRegalo: false,
  recibido: false, proveedorId: "recRoberto", proveedorNombre: "Roberto", costoProveedor: 110, cantidad: 1, unidadesEnPacking: null,
  fechaRegistro: "2026-09-24T02:09:56.000Z", pagosVivos: 0,
};
const corte = { corteISO: "2026-10-13T05:00:00.000Z" };
const plan = planAjustePunto9([
  base,
  { ...base, id: "rec2", sku: "ACC-000187", costoProveedor: 5, cantidad: 2 },
  { ...base, id: "rec3", sku: "LAP-000062", estado: "Vendido", cantidad: 0, costoProveedor: 174, proveedorId: "rec3R", proveedorNombre: "3R" },
  { ...base, id: "rec4", sku: "REP-000103", estado: "Pendiente de pago", proveedorId: "receBay", proveedorNombre: "eBay", costoProveedor: 29 },
  { ...base, id: "rec5", sku: "OTR-000010", pagosVivos: 1 },
  { ...base, id: "rec6", sku: "LAP-000079", tipoOperacion: "Reajuste de inventario", estado: "Vendido", proveedorId: "", proveedorNombre: "" },
  { ...base, id: "rec7", sku: "LAP-000110", estado: "Pendiente de pago" },
  { ...base, id: "rec8", sku: "REG-1", esRegalo: true },
  { ...base, id: "rec9", sku: "NUEVO-1", fechaRegistro: "2026-10-14T15:00:00.000Z" },
  { ...base, id: "rec10", sku: "MON-000002", tipoOperacion: "Compra ya pagada", estado: "Disponible", recibido: true, proveedorId: "recML", proveedorNombre: "Mercado Libre", costoProveedor: 85 },
  { ...base, id: "rec11", sku: "SINPROV-1", proveedorId: "", proveedorNombre: "" },
  { ...base, id: "rec12", sku: "VIEJO-PAGADO", estado: "Pagado", recibido: true },
], corte);
const roberto = plan.pagosHistoricos.find((p) => p.proveedorId === "recRoberto");
assert(roberto?.skus.join(",") === "LAP-000091,ACC-000187,VIEJO-PAGADO", "Roberto: sus compras sin pago, en un solo pago histórico");
assert(roberto?.totalAproximado === 230, "Total aproximado = costo × unidades (110 + 5×2 + 110)");
assert(plan.pagosHistoricos.find((p) => p.proveedorId === "rec3R")?.totalAproximado === 174, "Lo vendido (Cantidad 0) cuenta 1 unidad");
assert(plan.pagosHistoricos.some((p) => p.skus.includes("MON-000002")), "'Compra ya pagada' también entra");
assert(!plan.pagosHistoricos.some((p) => p.skus.includes("OTR-000010")), "Lo que ya tiene pago no se toca");
assert(!plan.pagosHistoricos.some((p) => p.skus.includes("LAP-000110")), "Artículo de prueba: fuera");
assert(!plan.pagosHistoricos.some((p) => p.skus.includes("REG-1")), "Regalo: fuera");
assert(!plan.pagosHistoricos.some((p) => p.skus.includes("NUEVO-1")), "Registrado después del corte: sigue el camino normal");
assert(!plan.pagosHistoricos.some((p) => p.skus.includes("LAP-000079")), "Reajuste: no entra a un pago");
assert(plan.cambiosItems.find((c) => c.sku === "LAP-000079")?.fields["Requiere pago"] === false, "Reajuste: se apaga 'Requiere pago'");
assert(plan.cambiosItems.find((c) => c.sku === "REP-000103")?.fields["Estado Item"] === "Registrado", "Pendiente de pago sin llegar → Registrado");
assert(!plan.cambiosItems.some((c) => c.sku === "LAP-000110"), "Artículo de prueba: estado sin tocar");
assert(plan.aRevisar.some((r) => r.sku === "VIEJO-PAGADO"), "'Pagado' que ya llegó: a revisar a mano (no se adivina)");
assert(plan.aRevisar.some((r) => r.sku === "SINPROV-1"), "Compra sin proveedor: a revisar a mano");
const campos = camposPagoHistorico(roberto!, { pagoId: "PAY-HIST-20261012-01", ahoraISO: "2026-10-12T20:00:00.000Z", registradoPor: "Claude" });
assert(campos["Estado Pago"] === "Pagado" && campos["Estado de integración con Finanzas"] === "No aplica" && !("Shipping Finanzas Movimientos" in campos), "El pago histórico no crea egreso");
assert(esPagoHistorico({ estadoPago: String(campos["Estado Pago"]), estadoIntegracionFinanzas: String(campos["Estado de integración con Finanzas"]), movimientoFinanzasIds: [] }), "…y el sistema lo reconoce como histórico");

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1); }
console.log("\nTodas las pruebas pasaron.");
