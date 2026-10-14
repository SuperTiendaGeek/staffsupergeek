/**
 * Pagos de logística (punto 9c, 13-oct-2026).
 * Ejecutar: npx tsx lib/shipping-v2/__tests__/logistica-pagos.test.ts
 */
import { categoriaFinanzasDe, conceptoDePago, pagadoAPor, pendienteLogistica, situacionGasto, validarPagoLogistica, valorTrasPago } from "../logistica-pagos";

let fallos = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { fallos++; console.error("✗", msg); } else console.log("✓", msg);
}

console.log("— Concepto —");
assert(conceptoDePago(null) === "Compra" && conceptoDePago("") === "Compra", "Pagos anteriores (sin concepto) son compras");
assert(conceptoDePago("flete") === "Flete" && conceptoDePago("Arancel") === "Arancel", "Lee el concepto");
assert(categoriaFinanzasDe("Flete") === "Logística Shipping" && categoriaFinanzasDe("Compra") === "Compra Proveedor Shipping", "Categoría de Finanzas según concepto");
assert(pagadoAPor("Arancel", "Laarbox") === "SENAE", "El arancel siempre se paga a la SENAE");

console.log("\n— Situación de un gasto —");
assert(situacionGasto(308.17, 0).estado === "falta" && situacionGasto(308.17, 0).pendiente === 308.17, "Flete escrito sin pago: falta");
assert(situacionGasto(300, 300).estado === "pagado", "Pagado completo");
assert(situacionGasto(null, 0).estado === "sin-valor" && situacionGasto(0, 0).estado === "sin-valor", "Sin valor y sin pago: nada pendiente");
assert(situacionGasto(10, 3).pendiente === 7, "Otros: pagado en parte, falta el resto");
assert(situacionGasto(null, 5).estado === "pagado", "Pagado sin valor escrito: pagado");

console.log("\n— Manda lo pagado —");
assert(valorTrasPago(0, 300) === 300, "Flete escrito 308,17, pagado 300 → la caja queda en 300");
assert(valorTrasPago(3, 4.5) === 7.5, "Otros se van sumando");

console.log("\n— Validación —");
const ok = { concepto: "Flete", packingId: "recPK", monto: 120, proveedorId: "recLaarbox", fechaPagoReal: "2026-10-13", metodoPago: "Transferencia bancaria", cuentaOrigen: "Caja" };
assert(validarPagoLogistica(ok) === null, "Flete completo: válido");
assert(validarPagoLogistica({ ...ok, concepto: "Compra" }) !== null, "Compra no es logística");
assert(validarPagoLogistica({ ...ok, itemId: "recIT" }) !== null, "Caja y artículo a la vez: inválido");
assert(validarPagoLogistica({ ...ok, packingId: "" }) !== null, "Sin caja ni artículo: inválido");
assert(validarPagoLogistica({ ...ok, monto: 0 }) !== null, "Monto 0: inválido");
assert(validarPagoLogistica({ ...ok, proveedorId: "" }) !== null, "Flete sin empresa logística: inválido");
assert(validarPagoLogistica({ ...ok, concepto: "Arancel", proveedorId: "" }) === null, "Arancel no necesita proveedor (SENAE)");
assert(validarPagoLogistica({ ...ok, concepto: "Otros", proveedorId: "" }) === null, "Otros no necesita proveedor");
assert(validarPagoLogistica({ ...ok, cuentaOrigen: "No aplica" }) !== null, "Cuenta obligatoria");

console.log("\n— Qué le falta (fase 1, 14-oct) —");
const vacio = situacionGasto(null, 0);
const fila = (o: Partial<Parameters<typeof pendienteLogistica>[0]>) => pendienteLogistica({ tipo: "caja", estadoLogistico: "En tránsito", aplicaArancel: true, flete: vacio, arancel: vacio, otros: vacio, ...o });
assert(fila({}).sinFlete === true, "Caja en tránsito sin flete pagado: avisa");
assert(fila({ estadoLogistico: "En proceso" }).sinFlete === false, "Caja armándose: todavía no avisa");
assert(fila({ estadoLogistico: "Cerrado final" }).sinFlete === false, "Ciclo cerrado: no avisa");
assert(fila({ flete: situacionGasto(120, 120) }).sinFlete === false, "Flete pagado: no avisa");
assert(fila({ flete: situacionGasto(308.17, 0) }).falta === 308.17 && fila({ flete: situacionGasto(308.17, 0) }).sinFlete === false, "Caja anterior con flete escrito sin pago: falta $308,17");
assert(fila({ tipo: "suelto", aplicaArancel: false, estadoLogistico: "Recibido" }).sinFlete === false, "Suelto local sin flete: no avisa");
assert(fila({ tipo: "suelto", aplicaArancel: true, estadoLogistico: "Recibido" }).sinFlete === true, "Suelto del extranjero que llegó sin flete: avisa");
assert(fila({ aplicaArancel: false, arancel: situacionGasto(10, 0) }).falta === 0, "Arancel que no aplica no cuenta");
assert(fila({ flete: situacionGasto(100, 100), otros: situacionGasto(null, 5) }).pagado === 105, "Suma lo pagado");

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1); }
console.log("\nTodas las pruebas pasaron.");
