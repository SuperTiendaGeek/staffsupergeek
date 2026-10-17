/**
 * Órdenes de compra (punto 9d, 14-oct-2026).
 * Ejecutar: npx tsx lib/shipping-v2/__tests__/ordenes-compra.test.ts
 */
import {
  aplicarATodas,
  duplicarLinea,
  etiquetaSituacionOrden,
  faltantesLinea,
  seguimientoDeLinea,
  seriesDeLinea,
  lineaEnBlanco,
  nuevaLinea,
  ocIdDesdeNumero,
  resumenOrden,
  subtotalLinea,
  totalesLineas,
  validarAnularPago,
  validarArticuloParaOrden,
  validarCabeceraOrden,
  validarQuitarDeOrden,
  type ArticuloDeOrden,
} from "../ordenes-compra";

let fallos = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { fallos++; console.error("✗", msg); } else console.log("✓", msg);
}

console.log("— Código de la orden —");
assert(ocIdDesdeNumero(1) === "OC-000001" && ocIdDesdeNumero(45) === "OC-000045", "OC-000001 a partir del número");
assert(ocIdDesdeNumero(0) === "" && ocIdDesdeNumero(null) === "", "Sin número no hay código");

console.log("\n— Situación de la orden (ejemplo eBay: RAM 40 + SSD 60 + cargador 20) —");
const ram: ArticuloDeOrden = { id: "r", sku: "RAM-1", requierePago: true, costoProveedor: 40, unidadesCompradas: 1 };
const ssd: ArticuloDeOrden = { id: "s", sku: "SSD-1", requierePago: true, costoProveedor: 60, unidadesCompradas: 1 };
const car: ArticuloDeOrden = { id: "c", sku: "CAR-1", requierePago: true, costoProveedor: 20, unidadesCompradas: 1 };
let r = resumenOrden({ articulos: [ram, ssd, car] });
assert(r.situacion === "falta-respaldo" && r.total === 120 && r.falta === 120, "Sin pago: falta respaldo de $120");
assert(r.porPagarIds.join() === "r,s,c", "El pago llevará los 3 artículos");
r = resumenOrden({ articulos: [ram, ssd, car].map((a) => ({ ...a, enPagoVivo: true })), pagos: [{ id: "p", estado: "Pagado", total: 120 }] });
assert(r.situacion === "pagada" && r.falta === 0 && r.pagado === 120, "Pagada: cuadra con el total");
const olvidado: ArticuloDeOrden = { id: "o", sku: "CAB-1", requierePago: true, costoProveedor: 8, unidadesCompradas: 2 };
r = resumenOrden({ articulos: [...[ram, ssd, car].map((a) => ({ ...a, enPagoVivo: true })), olvidado], pagos: [{ id: "p", estado: "Pagado", total: 120 }] });
assert(r.situacion === "falta" && r.falta === 16 && r.total === 136 && r.porPagarIds.join() === "o", "Artículo olvidado (2 × $8): falta $16 y el pago por la diferencia lleva solo ese");
r = resumenOrden({ articulos: [ram, ssd].map((a) => ({ ...a, enPagoVivo: false })), pagos: [{ id: "p", estado: "Anulado", total: 100 }] });
assert(r.situacion === "falta-respaldo" && r.pagado === 0, "Pago anulado no cuenta");

console.log("\n— Regalos, multiunidad y cancelados —");
const regalo: ArticuloDeOrden = { id: "g", sku: "ACC-1", esRegalo: true, costoProveedor: 0, unidadesCompradas: 1 };
r = resumenOrden({ articulos: [regalo] });
assert(r.situacion === "sin-pago" && r.total === 0 && r.regalos === 1, "Solo regalos: sin pago");
r = resumenOrden({ articulos: [ram, regalo] });
assert(r.total === 40 && r.regalosPorAdjuntarIds.join() === "g", "El regalo no suma y se adjunta al pago");
const vendido: ArticuloDeOrden = { id: "v", sku: "LAP-1", requierePago: true, costoProveedor: 310, unidadesCompradas: 2, cantidad: 0 };
r = resumenOrden({ articulos: [vendido] });
assert(r.total === 620, "Se paga lo comprado (2 × $310) aunque ya se vendió");
r = resumenOrden({ articulos: [ram, { ...ssd, cancelado: true }] });
assert(r.total === 40 && r.articulos === 1, "Lo cancelado no cuenta");
r = resumenOrden({ articulos: [{ ...ram, costoProveedor: 0 }] });
assert(r.sinCosto.join() === "RAM-1" && r.situacion === "falta-respaldo", "Sin costo: no se puede pagar y queda pendiente");
r = resumenOrden({ articulos: [] });
assert(r.situacion === "vacia", "Orden sin artículos");
assert(resumenOrden({ anulada: true, articulos: [ram] }).situacion === "anulada", "Orden anulada");
assert(etiquetaSituacionOrden({ situacion: "falta", falta: 16 }, (n) => `$${n.toFixed(2)}`) === "Falta $16.00", "Chip: Falta $16.00");
assert(etiquetaSituacionOrden({ situacion: "pagada", falta: 0 }, (n) => `$${n}`) === "Pagada", "Chip: Pagada");

console.log("\n— Validaciones —");
assert(validarCabeceraOrden({ proveedorId: "" }) !== null, "La orden pide proveedor");
assert(validarCabeceraOrden({ proveedorId: "recEbay", fechaCompra: "2026-10-14" }) === null, "Cabecera completa");
assert(validarCabeceraOrden({ proveedorId: "recEbay", fechaCompra: "14/10/2026" }) !== null, "Fecha con formato inválido");
assert(validarArticuloParaOrden({ proveedorId: "a" }, { proveedorId: "a", tipoOperacion: "Compra a proveedor" }) === null, "Compra del mismo proveedor: entra");
assert(validarArticuloParaOrden({ proveedorId: "a" }, { proveedorId: "b", tipoOperacion: "Compra a proveedor" }) !== null, "Otro proveedor: no entra");
assert(validarArticuloParaOrden({ proveedorId: "a" }, { proveedorId: "a", tipoOperacion: "Reajuste de inventario" }) !== null, "Un reajuste no es compra");
assert(validarArticuloParaOrden({ proveedorId: "a", anulada: true }, { proveedorId: "a", tipoOperacion: "Regalo de proveedor" }) !== null, "Orden anulada no acepta artículos");
assert(validarQuitarDeOrden({ enPagoVivo: true, motivo: "error de registro" }) !== null, "Artículo pagado: primero anular el pago");
assert(validarQuitarDeOrden({ enPagoVivo: false, motivo: "no" }) !== null, "Quitar pide motivo");
assert(validarQuitarDeOrden({ enPagoVivo: false, motivo: "Se registró en la orden equivocada" }) === null, "Quitar con motivo");
assert(validarAnularPago({ estado: "Anulado", motivo: "duplicado" }) !== null, "No se anula dos veces");
assert(validarAnularPago({ estado: "Pagado", motivo: "Pago duplicado" }) === null, "Anular con motivo");

console.log("\n— Filas de Registrar compra —");
const l1 = nuevaLinea("1", { nombre: "HP EliteBook 840 G8", categoria: "Laptop", condicion: "Usado", cantidad: "2", costoProveedor: "310" });
assert(subtotalLinea(l1) === 620, "Subtotal 2 × $310");
assert(subtotalLinea({ ...l1, regalo: true }) === 0, "Regalo: subtotal 0");
assert(subtotalLinea({ ...l1, cantidad: "1.5" }) === null, "Cantidad no entera: incompleta");
const t = totalesLineas([l1, nuevaLinea("2", { cantidad: "1", costoProveedor: "385,00" })]);
assert(t.total === 1005 && t.unidades === 3 && t.incompletas === 0, "Total y unidades (acepta coma decimal)");
const d = duplicarLinea({ ...l1, sku: "LAP-9", numeroSerie: "ABC" }, "3");
assert(d.key === "3" && d.sku === "" && d.numeroSerie === "" && d.nombre === l1.nombre, "Duplicar limpia SKU y serie");
const aplicadas = aplicarATodas([l1, nuevaLinea("4", { requiereInspeccion: false })], { categoria: "Tablet", condicion: "Nuevo" });
assert(aplicadas.every((l) => l.categoria === "Tablet" && l.condicion === "Nuevo"), "Aplicar a todas pone categoría y condición");
assert(aplicadas[1].requiereInspeccion === null, "Al cambiar la categoría la inspección vuelve a proponerse");
assert(lineaEnBlanco(nuevaLinea("5")), "Fila vacía se ignora");
assert(!lineaEnBlanco(l1), "Fila con datos no se ignora");
assert(faltantesLinea(l1, { esCompra: true }).length === 0, "Fila completa");
assert(faltantesLinea(nuevaLinea("6", { nombre: "Surface" }), { esCompra: true }).join() === "categoría,costo", "Falta categoría y costo");
assert(faltantesLinea({ ...l1, regalo: true, costoProveedor: "" }, { esCompra: true }).length === 0, "Regalo sin costo: completo");
assert(faltantesLinea({ ...l1, regalo: true }, { esCompra: true }).includes("regalo sin costo"), "Regalo con costo: error");
assert(faltantesLinea({ ...l1, costoProveedor: "" }, { esCompra: false }).length === 0, "Reajuste no exige costo");
assert(seguimientoDeLinea(l1) === "Unidad" && seguimientoDeLinea(nuevaLinea("7", { categoria: "Cable" })) === "Lote", "Unidad o lote por categoría");
assert(seguimientoDeLinea({ ...l1, seguimiento: "Lote" }) === "Lote", "El empleado puede cambiarlo");
assert(seriesDeLinea({ numeroSerie: "abc123  DEF456" }).join() === "ABC123,DEF456", "Series de la fila");
assert(faltantesLinea({ ...l1, numeroSerie: "A1234 B1234 C1234" }, { esCompra: true }).includes("series"), "3 series para 2 laptops → por completar");
assert(faltantesLinea({ ...l1, numeroSerie: "A1234 B1234" }, { esCompra: true }).length === 0, "2 series para 2 laptops → completa");
const d2 = duplicarLinea({ ...l1, skuExistente: "LAP-000500" }, "8");
assert(d2.skuExistente === "", "Duplicar no arrastra el producto elegido");
const otraCat = aplicarATodas([{ ...l1, skuExistente: "LAP-000500", seguimiento: "Lote" }], { categoria: "Desktop" });
assert(otraCat[0].skuExistente === "" && otraCat[0].seguimiento === null, "Otra categoría: se suelta el producto y se vuelve a proponer unidad/lote");

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1); }
console.log("\nTodas las pruebas pasaron.");
