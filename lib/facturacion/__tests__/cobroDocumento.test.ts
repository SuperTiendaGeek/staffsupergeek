/**
 * Auditoría Técnicos y Operaciones, punto 1 (27-oct-2026): el cobro al emitir
 * es un abono y el documento tiene dos bloques. Reproduce los casos reales.
 * Ejecutar: npm test cobroDocumento
 */
import {
  saldoPorCobrar, mensajeCuentaNoPagada, mensajeBloqueCuentaModificado, mensajePagosAdicionalesInvalidos,
  componerPagosDocumento, mensajeAbonoNoPermitido, totalFinalLinea, type LineaComparable,
} from "../reglas/cobroDocumento";
import type { Pago } from "../types/factura";
import { readFileSync } from "node:fs";
import path from "node:path";

let fallos = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { fallos++; console.error("✗", msg); } else console.log("✓", msg);
}

// ── OR000510: recibo de $25 emitido con la cuenta sin pagar ──
{
  const saldo = saldoPorCobrar(25, []);
  assert(saldo === 25, "OR000510: sin abonos, faltan $25");
  const msg = mensajeCuentaNoPagada(saldo, "orden");
  assert(!!msg && msg.includes("$25.00") && msg.includes("antes de emitir"), "OR000510: NO se puede emitir debiendo — primero el abono");
  assert(mensajeCuentaNoPagada(saldoPorCobrar(25, [{ monto: 25 }]), "orden") === null, "Con el abono de $25 registrado, se emite");
  assert(mensajeCuentaNoPagada(saldoPorCobrar(25, [{ monto: 10 }, { monto: 15 }]), "orden") === null, "Pagos mixtos ($10 + $15) también saldan la cuenta");
  assert(mensajeCuentaNoPagada(0.004, "orden") === null, "Un redondeo de centavo no bloquea");
  const aFavor = mensajeCuentaNoPagada(saldoPorCobrar(95, [{ monto: 100 }]), "orden");
  assert(!!aFavor && aFavor.includes("de más"), "Abonos de más → se resuelve antes de emitir (no se tapa en el documento)");
}

// ── El bloque de la cuenta no se cambia al emitir (OR000423) ──
{
  const cuenta: LineaComparable[] = [
    { descripcion: "Modulo DDR3 8GB Memoria RAM", cantidad: 1, total: 30, shippingItemId: "recRAM" },
    { descripcion: "Disco Duro Sólido Interno 120GB", cantidad: 1, total: 40, shippingItemId: "recSSD" },
    { descripcion: "Desktop Limpieza", cantidad: 1, total: 35 },
    { descripcion: "Windows 11 Home-Licencia", cantidad: 1, total: 25, productoDigitalId: "recWIN" },
  ];
  assert(mensajeBloqueCuentaModificado([...cuenta].reverse(), cuenta) === null, "Mismas líneas en otro orden → OK");
  const conRedondeo = cuenta.map((l) => (l.shippingItemId === "recSSD" ? { ...l, total: 40.01 } : l));
  assert(mensajeBloqueCuentaModificado(conRedondeo, cuenta) === null, "Un centavo de redondeo de IVA no bloquea");

  const ssdA20 = cuenta.map((l) => (l.shippingItemId === "recSSD" ? { ...l, total: 20 } : l));
  const msg = mensajeBloqueCuentaModificado(ssdA20, cuenta);
  assert(!!msg && msg.includes("$40.00 → $20.00"), "OR000423: el SSD cambiado de $40 a $20 se RECHAZA y se dice qué cambió");
  assert(!!msg && msg.includes("administrador"), "El mensaje explica que el descuento lo hace el administrador");

  const sinServicio = cuenta.filter((l) => l.descripcion !== "Desktop Limpieza");
  assert(mensajeBloqueCuentaModificado(sinServicio, cuenta)?.includes('falta "Desktop Limpieza"') === true, "Quitar una línea de la cuenta → rechazado");

  const conExtraEnCuenta = [...cuenta, { descripcion: "Mouse Lenovo", cantidad: 1, total: 15, shippingItemId: "recMOUSE" }];
  assert(mensajeBloqueCuentaModificado(conExtraEnCuenta, cuenta)?.includes("Venta adicional") === true, "Meter algo nuevo en el bloque de la cuenta → rechazado (va en Venta adicional)");

  const dos = cuenta.map((l) => (l.descripcion === "Desktop Limpieza" ? { ...l, cantidad: 2, total: 70 } : l));
  assert(mensajeBloqueCuentaModificado(dos, cuenta)?.includes("cantidad 1 → 2") === true, "Cambiar la cantidad → rechazado");
}

// ── Venta adicional (OR000431: mouse $15 + entrega $6) ──
{
  assert(mensajePagosAdicionalesInvalidos([], 0) === null, "Sin venta adicional no hacen falta pagos");
  assert(mensajePagosAdicionalesInvalidos([], 21)?.includes("$21.00") === true, "Venta adicional sin pago → bloquea");
  assert(mensajePagosAdicionalesInvalidos([{ metodoPago: "Transferencia", total: 21 }], 21)?.includes("obligatorio") === true, "Transferencia sin número → bloquea");
  assert(mensajePagosAdicionalesInvalidos([{ metodoPago: "DeUna", total: 21 }], 21)?.includes("DeUna") === true, "DeUna sin número → bloquea");
  assert(mensajePagosAdicionalesInvalidos([{ metodoPago: "Transferencia", total: 21, referencia: "123" }], 21) === null, "Transferencia con número → OK");
  assert(mensajePagosAdicionalesInvalidos([{ metodoPago: "Efectivo", total: 6 }, { metodoPago: "DeUna", total: 15, referencia: "9" }], 21) === null, "Pago mixto efectivo + DeUna → OK");
  assert(mensajePagosAdicionalesInvalidos([{ metodoPago: "Efectivo", total: 20 }], 21)?.includes("suman $20.00") === true, "Pagos que no suman el total → bloquea");
  assert(mensajePagosAdicionalesInvalidos([{ metodoPago: "Otro", total: 21 }], 21)?.includes("no dice a qué cuenta") === true, '"Otro" no sirve: no dice la cuenta');
  assert(mensajePagosAdicionalesInvalidos([{ metodoPago: "Efectivo", total: 5 }], 0) !== null, "Pagos adicionales sin líneas adicionales → bloquea");
}

// ── Las formas de pago del documento ──
{
  const deAbonos: Pago[] = [
    { formaPago: "20", total: 95, origenPago: "abono", metodoPago: "Transferencia", referencia: "777" },
    { formaPago: "01", total: 5, origenPago: "saldo" }, // nunca debe pasar
  ];
  const sri: Record<string, string> = { Efectivo: "01", DeUna: "20", Transferencia: "20" };
  const pagos = componerPagosDocumento(deAbonos, [{ metodoPago: "Efectivo", total: 15 }, { metodoPago: "DeUna", total: 6, referencia: "88" }], (m) => sri[m] ?? "01");
  assert(pagos.length === 3, "Abonos del servidor + 2 pagos adicionales (la línea 'saldo' se descarta)");
  assert(pagos[1].formaPago === "01" && pagos[1].origenPago === "adicional", "Efectivo adicional → SRI 01");
  assert(pagos[2].formaPago === "20" && pagos[2].metodoPago === "DeUna" && pagos[2].referencia === "88", "DeUna adicional → SRI 20 con su método y número (Finanzas sabe la cuenta)");
  assert(pagos.reduce((s, p) => s + p.total, 0) === 116, "Total del documento = $95 de la orden + $21 adicional");
}

// ── Abonos con documento vigente ──
{
  assert(mensajeAbonoNoPermitido({ documentoVigente: null, saldo: 0, monto: 50, etiqueta: "orden" }) === null, "Sin documento: anticipos permitidos");
  const doble = mensajeAbonoNoPermitido({ documentoVigente: "el recibo REC-000067", saldo: 0, monto: 25, etiqueta: "orden" });
  assert(!!doble && doble.includes("dos veces"), "OR000510: con recibo y saldo $0, un abono nuevo se RECHAZA (evita el doble ingreso)");
  assert(mensajeAbonoNoPermitido({ documentoVigente: "la factura 001-002-000000700", saldo: 10, monto: 10, etiqueta: "orden" }) === null, "Con documento y saldo real de $10, se acepta el abono de $10");
  assert(mensajeAbonoNoPermitido({ documentoVigente: "la factura X", saldo: 10, monto: 12, etiqueta: "operación" })?.includes("$10.00") === true, "…pero no por más del saldo");
}

// ── Total final de una línea ──
assert(totalFinalLinea({ precioTotalSinImpuesto: 34.78, impuestos: [{ codigo: "2", codigoPorcentaje: "4", tarifa: 15, baseImponible: 34.78, valor: 5.22 }] }) === 40, "Base $34.78 + IVA $5.22 = $40");

// ── Las cuatro puertas usan la misma regla (nadie la saltea) ──
{
  const leer = (ruta: string) => readFileSync(path.join(process.cwd(), ruta), "utf8");
  assert(leer("app/api/facturacion/emitir/route.ts").includes("validarEmisionDesdeOrigen("), "La factura valida cuenta pagada, líneas intactas y venta adicional");
  assert(leer("app/api/facturacion/recibos/route.ts").includes("validarEmisionDesdeOrigen("), "El recibo valida exactamente lo mismo");
  assert(leer("app/api/tecnicos/ordenes/[id]/abonos/route.ts").includes("verificarAbonoPermitido("), "El abono de la orden se bloquea con documento y saldo $0");
  assert(leer("app/api/operaciones/[id]/abonos/route.ts").includes("verificarAbonoPermitido("), "El abono de la operación también");
  assert(!leer("lib/finanzas/puentes/recibo.ts").includes("saldo cobrado al emitir —"), 'El puente del recibo ya no crea el "saldo cobrado al emitir"');
}

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1); }
console.log("\nTodas las pruebas pasaron.");
