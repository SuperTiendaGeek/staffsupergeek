/**
 * Test — catálogo único de métodos de cobro (auditoría ops, punto 7).
 * Ejecutar: npm test cobros/__tests__/metodos
 */
import {
  METODOS_COBRO, METODOS_VIGENTES, TODOS_LOS_METODOS, codigoSriDeMetodo, esMetodoVigente,
  etiquetaMetodo, mensajeCobroInvalido, mensajeCobrosInvalidos, metodoDesdeCodigoSri, normalizarCobrosNuevos,
} from "../metodos";
import fs from "fs";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// 1. Todo método vigente tiene cuenta: ningún cobro nuevo puede quedar sin cuenta.
for (const m of METODOS_VIGENTES) assert(!!METODOS_COBRO[m].cuenta, `${m} entra a una cuenta (${METODOS_COBRO[m].cuenta})`);
assert(!METODOS_VIGENTES.includes("Otro") && !METODOS_VIGENTES.includes("Tarjeta"), "'Otro' y 'Tarjeta' genérica ya no se ofrecen");
assert(TODOS_LOS_METODOS.includes("Otro") && TODOS_LOS_METODOS.includes("Tarjeta"), "…pero se siguen leyendo (abonos viejos)");

// 2. Decisiones del dueño (27/28-oct-2026).
assert(METODOS_COBRO.Transferencia.cuenta === "SGINGRESOS", "Transferencia Banco Pichincha → SGINGRESOS");
assert(METODOS_COBRO.DeUna.cuenta === "DeUna", "DeUna → cuenta DeUna");
assert(METODOS_COBRO["Transferencia Produbanco"].cuenta === "Produbanco Ahorros", "Produbanco → Produbanco Ahorros");
assert(METODOS_COBRO["Mercado Libre"].cuenta === "Mercado Pago" && METODOS_COBRO["Mercado Libre"].estado === "Pendiente", "Mercado Libre → Mercado Pago, por acreditar (comisión)");

// 3. El código SRI se deduce.
assert(codigoSriDeMetodo("Efectivo") === "01", "efectivo → 01");
assert(codigoSriDeMetodo("Tarjeta de crédito") === "19" && codigoSriDeMetodo("Tarjeta de débito") === "16", "tarjetas → 19 / 16");
for (const m of ["Transferencia", "Transferencia Produbanco", "DeUna", "PayPal", "Mercado Libre"] as const) {
  assert(codigoSriDeMetodo(m) === "20", `${m} → 20 (sistema financiero)`);
}
assert(codigoSriDeMetodo("inventado") === null, "método desconocido → sin código");

// 4. Validación del cobro.
assert(mensajeCobroInvalido({ metodoPago: "Efectivo", total: 20 }) === null, "efectivo sin número: válido");
assert(mensajeCobroInvalido({ metodoPago: "Transferencia", total: 25 })?.includes("número de transacción") === true, "transferencia sin número: no");
assert(mensajeCobroInvalido({ metodoPago: "Transferencia", referencia: "135808586" }) === null, "transferencia con número: válida");
assert(mensajeCobroInvalido({ metodoPago: "Mercado Libre", referencia: "" }) !== null, "Mercado Libre exige el número de venta");
assert(mensajeCobroInvalido({ metodoPago: "Otro" })?.includes("Elige cómo se cobró") === true, "'Otro' ya no es válido para cobros nuevos");
assert(mensajeCobroInvalido({ metodoPago: "" }) !== null && mensajeCobroInvalido({}) !== null, "sin método: no");
assert(esMetodoVigente("DeUna") && !esMetodoVigente("Tarjeta"), "vigencia");
assert(etiquetaMetodo("Transferencia") === "Transferencia Banco Pichincha → SGINGRESOS" && etiquetaMetodo("xyz") === "xyz", "etiquetas");

// 5. Lectura de cobros viejos por código SRI.
assert(metodoDesdeCodigoSri("01") === "Efectivo" && metodoDesdeCodigoSri("20") === "Transferencia" && metodoDesdeCodigoSri("15") === null, "códigos viejos → método");

// 6. Varios cobros de una venta (pago mixto).
assert(mensajeCobrosInvalidos([{ metodoPago: "Efectivo", total: 20 }, { metodoPago: "DeUna", total: 5, referencia: "123" }], 25) === null, "mixto efectivo + DeUna que suma el total: válido");
assert(mensajeCobrosInvalidos([{ metodoPago: "Efectivo", total: 20 }], 25)?.includes("suman $20.00") === true, "si no suman el total: no");
assert(mensajeCobrosInvalidos([], 25)?.includes("Falta registrar") === true, "sin cobros: no");

// 7. Servidor: los cobros nuevos traen método; el código SRI se deduce (no se confía en la pantalla).
{
  const r = normalizarCobrosNuevos([
    { formaPago: "01", total: 25, metodoPago: "Transferencia", referencia: " 135808586 " },
    { formaPago: "01", total: 10, origenPago: "abono" },
    { formaPago: "15", total: 700 },
  ]);
  assert(r.error === null && r.pagos[0].formaPago === "20" && r.pagos[0].referencia === "135808586", "transferencia → código 20 aunque la pantalla mande 01");
  assert(r.pagos[1].formaPago === "01" && r.pagos[2].formaPago === "15", "abonos ya registrados y compensación de NC no se tocan");
  assert(normalizarCobrosNuevos([{ formaPago: "20", total: 25 }]).error !== null, "el viejo 'código 20 sin método' ya no se acepta");
}

// 8. Ninguna pantalla de cobro ofrece códigos SRI; los servidores exigen método.
for (const f of ["components/facturacion/FacturacionForm.tsx", "components/facturacion/ReciboForm.tsx", "components/facturacion/ReservaForm.tsx"]) {
  assert(!fs.readFileSync(f, "utf8").includes("Otros (sist. financiero)"), `${f}: ya no ofrece "Otros (sist. financiero)"`);
}
assert(fs.readFileSync("app/api/facturacion/emitir/route.ts", "utf8").includes("normalizarCobrosNuevos(body.pagos)"), "emitir: cobros nuevos por método");
assert(fs.readFileSync("app/api/facturacion/recibos/route.ts", "utf8").includes("normalizarCobrosNuevos(pagosMostrador)"), "recibo de mostrador: cobros por método");
for (const f of ["app/api/facturacion/reservas/route.ts", "app/api/facturacion/reservas/[id]/abonos/route.ts"]) {
  assert(fs.readFileSync(f, "utf8").includes("mensajeCobroInvalido("), `${f}: abono de reserva por método`);
}
assert(fs.readFileSync("lib/finanzas/puentes/facturacion.ts", "utf8").includes("resolverMapeoMetodoPago(params.pago.metodoPago"), "puente de factura: la cuenta sale del método");
assert(fs.readFileSync("lib/facturacion/recibos/efectos.ts", "utf8").includes("resolverMapeoMetodoPago(cobro.metodoPago"), "puente de recibo: la cuenta sale del método");

if (fallos > 0) { console.error(`\n${fallos} prueba(s) fallaron.`); process.exit(1); }
console.log("\nTodas las pruebas pasaron.");
