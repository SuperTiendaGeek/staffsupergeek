/**
 * Kardex del inventario (punto 12).
 * Ejecutar: npm test kardex
 */
import {
  agruparLineasKardex,
  camposDeMovimiento,
  causaDeBaja,
  conSaldo,
  costoUnitarioDeCampos,
  crearMovimiento,
  diferenciasKardex,
  gananciaDe,
  grupoDeMotivo,
  inventarioAFecha,
  movimientoDeCampos,
  movimientoPorCambio,
  movimientosDeDocumento,
  planAjusteCosto,
  registroDeCampos,
  resumenPeriodo,
  resumenProducto,
  saldosPorRegistro,
  sinCostos,
  textoAjusteCosto,
  tituloMovimiento,
  unidadesEnLibro,
  type MovimientoKardex,
  type RegistroKardex,
} from "../kardex";

let fallos = 0;
function assert(condicion: unknown, mensaje: string) {
  if (condicion) console.log(`✓ ${mensaje}`);
  else { fallos++; console.error(`✗ ${mensaje}`); }
}

// Dell LAP-000500 del boceto: …KQ3 y …QR1 de 3R ($210), SG00000014 de eBay ($203).
const campos = (x: Record<string, unknown> = {}) => ({
  SKU: "LAP-000500", "Nombre del item": "Dell Latitude 5420", "Categoría": "Laptop", Recibido: true, Cantidad: 1,
  "Estado Item": "Disponible", "Costo proveedor": 210, "Costo total unidad": 210, ...x,
});
const kq3 = registroDeCampos("recKQ3", campos({ "Número de serie": "7HX2KQ3" }));
const qr1 = registroDeCampos("recQR1", campos({ "Número de serie": "8PL4QR1" }));
const sg14 = registroDeCampos("recSG14", campos({ "Número de serie": "SG00000014", "Costo proveedor": 203, "Costo total unidad": 203 }));

assert(kq3.serie === "7HX2KQ3" && sg14.serie === "SG00000014", "La serie del fabricante o la interna identifican la unidad");
assert(kq3.ambito === "Mercadería" && registroDeCampos("x", campos({ "Es uso local": true })).ambito === "Activo", "Un activo de la tienda va en su propio ámbito");

// ─── Unidades en el libro ──
assert(unidadesEnLibro(campos()) === 1, "Recibido con 1 unidad: 1 en el libro");
assert(unidadesEnLibro(campos({ Recibido: false })) === 0, "Lo que viene en camino no entra al libro (decisión 1)");
assert(unidadesEnLibro(campos({ "Estado Item": "Pieza en espera" })) === 0, "Una pieza de despiece sin completar no entra");
assert(unidadesEnLibro(campos({ Cantidad: 0, "Estado Item": "Vendido" })) === 0, "Vendido: 0");

// ─── Costo ──
assert(costoUnitarioDeCampos({ "Costo total unidad": 231.004 }) === 231, "Costo total unidad redondeado");
assert(costoUnitarioDeCampos({ "Costo total unidad": 0, "Costo asignado por despiece": 15 }) === 15, "Pieza de despiece: usa su costo asignado");
assert(textoAjusteCosto({ proveedor: 210, flete: 0, arancel: 0, otros: 0, mejoras: 0 }, { proveedor: 210, flete: 12, arancel: 9, otros: 0, mejoras: 0 }) === "flete y arancel", "El ajuste dice qué cambió");

// ─── Movimientos y saldo ──
const m = (x: Partial<MovimientoKardex> & { registro: RegistroKardex; clave: string; motivo: MovimientoKardex["motivo"]; cantidad: number; fecha: string }) =>
  crearMovimiento({ ...x });
const movs: MovimientoKardex[] = [
  m({ registro: kq3, clave: "a", motivo: "Compra recibida", cantidad: 1, fecha: "2026-10-20T16:02:00Z", contraparte: "3R Technology" }),
  m({ registro: qr1, clave: "b", motivo: "Compra recibida", cantidad: 1, fecha: "2026-10-20T16:03:00Z", contraparte: "3R Technology" }),
];
assert(movs[0].tipo === "Entrada" && movs[0].valor === 210, "Entrada: valor = cantidad × costo");

// Flete y arancel después de llegar: +$21 por unidad.
const qr1ConFlete = { ...qr1, costoUnitario: 231, componentes: { ...qr1.componentes, flete: 12, arancel: 9 } };
const kq3ConFlete = { ...kq3, costoUnitario: 231, componentes: { ...kq3.componentes, flete: 12, arancel: 9 } };
let saldos = saldosPorRegistro(movs);
const ajuste = planAjusteCosto({ registro: kq3ConFlete, saldo: saldos.get("recKQ3"), clave: "c", fecha: "2026-10-21T09:30:00Z" });
assert(ajuste?.tipo === "Costo" && ajuste.cantidad === 0 && ajuste.valor === 21, "Ajuste de costo: sin unidades, +$21 de valor");
assert(ajuste?.nota.startsWith("flete y arancel"), "El ajuste explica que fue flete y arancel");
movs.push(ajuste!);
const ajusteQr1 = planAjusteCosto({ registro: qr1ConFlete, saldo: saldos.get("recQR1"), clave: "d", fecha: "2026-10-21T09:30:01Z" })!;
movs.push(ajusteQr1);
saldos = saldosPorRegistro(movs);
assert(planAjusteCosto({ registro: kq3ConFlete, saldo: saldos.get("recKQ3"), clave: "x" }) === null, "Sin cambio de costo no hay ajuste (nada se duplica)");
assert(planAjusteCosto({ registro: sg14, saldo: undefined, clave: "x" }) === null, "Lo que no entró a la tienda no lleva ajuste: entra con su costo al llegar");

// Venta de …KQ3 a María, $390.
movs.push(m({ registro: kq3ConFlete, clave: "e", motivo: "Venta con factura", cantidad: -1, fecha: "2026-10-24T12:21:00Z", contraparte: "María Andrade", precioVenta: 390 }));
assert(movs[movs.length - 1].valor === -231, "La venta sale al costo de esa unidad ($231)");
assert(gananciaDe(movs[movs.length - 1]) === 159, "Ganancia de la venta: $159");
movs.push(m({ registro: sg14, clave: "f", motivo: "Compra recibida", cantidad: 1, fecha: "2026-10-25T15:48:00Z", contraparte: "eBay" }));

const filas = conSaldo(movs);
assert(filas.map((f) => f.saldo).join(",") === "1,2,2,2,1,2", "Saldo corrido en unidades");
assert(filas[filas.length - 1].saldoValor === 434, "Saldo en dinero: $231 + $203 = $434");

const r = resumenProducto(movs, "2026-10-26T00:00:00Z");
assert(r.saldo === 2 && r.valor === 434 && r.entradas === 3 && r.salidas === 1, "Resumen: 3 entradas, 1 salida, saldo 2 / $434");
assert(r.ultimaCompra?.contraparte === "eBay" && r.ultimaCompra.costo === 203, "Última compra: eBay a $203");
assert(r.ultimaVenta?.contraparte === "María Andrade" && r.ultimaVenta.precio === 390, "Última venta: María a $390");
assert(r.agotadoDesde === null, "Con unidades no está agotado");

const agotado = resumenProducto(conSaldo([movs[0], movs[4]]));
assert(agotado.agotadoDesde === "2026-10-24T12:21:00Z", "Agotado desde la última salida que lo dejó en 0");

// ─── Cambio de unidades (caso general de los ganchos) ──
const baja = movimientoPorCambio({ clave: "g", motivo: "Dada de baja", registro: qr1ConFlete, antes: 1, despues: 0, causa: causaDeBaja("se perdió en el conteo") });
assert(baja?.cantidad === -1 && baja.causa === "Perdido" && baja.tipo === "Salida", "Baja: −1 con causa Perdido");
assert(movimientoPorCambio({ clave: "h", motivo: "Compra recibida", registro: kq3, antes: 0, despues: 0 }) === null, "Sin cambio de unidades no se escribe nada");

// ─── Causas ──
assert(causaDeBaja("Robo en mostrador") === "Robo", "Robo");
assert(causaDeBaja("Pantalla rota") === "Daño", "Daño");
assert(causaDeBaja("Conteo \"x\": dar de baja · error de registro") === "Error de registro", "Error de registro");
assert(causaDeBaja("Devuelto al proveedor por la novedad NOV-1") === "Devuelto al proveedor", "Devuelto al proveedor");
assert(causaDeBaja("Dañado Pantalla con rayas") === "Daño", "Novedad Dañado → Daño");
assert(causaDeBaja("Extraviado no aparece") === "Perdido", "Novedad Extraviado → Perdido");

// ─── Traslados ──
const sep = [
  crearMovimiento({ clave: "s1", motivo: "Separación de unidad", cantidad: -1, registro: kq3, fecha: "2026-10-22T00:00:00Z" }),
  crearMovimiento({ clave: "s2", motivo: "Separación de unidad", cantidad: 1, registro: qr1, fecha: "2026-10-22T00:00:00Z" }),
];
assert(sep[0].tipo === "Traslado" && grupoDeMotivo("Separación de unidad") === "traslados", "Separar una unidad es un traslado");
assert(resumenProducto(sep).entradas === 0 && resumenProducto(sep).salidas === 0, "Un traslado no cuenta como entrada ni salida del producto");

// ─── Resumen por periodo ──
const oct = resumenPeriodo(movs, { desde: "2026-10-21T00:00:00Z", hasta: "2026-11-01T00:00:00Z", agrupar: "categoria" });
const laptop = oct.filas[0];
assert(laptop.inicialU === 2 && laptop.inicialV === 420, "Saldo inicial del 21-oct: 2 u. / $420");
assert(laptop.ajustesV === 42 && laptop.entradasU === 1 && laptop.entradasV === 203, "Ajustes +$42 y 1 entrada de $203");
assert(laptop.salidasU === 1 && laptop.salidasV === 231, "1 salida de $231");
assert(laptop.finalU === 2 && laptop.finalV === 434, "Saldo final 2 u. / $434");
assert(oct.costoVendido === 231 && oct.ventas === 390 && oct.ganancia === 159, "Costo de lo vendido, ventas y ganancia del periodo");
assert(oct.total.finalV === 434, "Total = suma de las filas");
const porSku = resumenPeriodo(movs, { desde: "2026-10-01T00:00:00Z", hasta: "2026-11-01T00:00:00Z", agrupar: "sku" });
assert(porSku.filas.length === 1 && porSku.filas[0].etiqueta.startsWith("LAP-000500"), "Por SKU: una fila por producto");
assert(resumenPeriodo(movs, { desde: "2026-10-01T00:00:00Z", hasta: "2026-11-01T00:00:00Z", agrupar: "sku", ambito: "Activo" }).filas.length === 0, "Activos aparte");

const al23 = inventarioAFecha(movs, "2026-10-23T00:00:00Z");
assert(al23.unidades === 2 && al23.valor === 462, "Inventario al 23-oct: 2 u. / $462");

// ─── Control ──
const dif = diferenciasKardex([{ id: "recKQ3", sku: "LAP-000500", enLibro: 0 }, { id: "recQR1", sku: "LAP-000500", enLibro: 0 }], saldosPorRegistro(movs));
assert(dif.length === 1 && dif[0].registroId === "recQR1" && dif[0].libro === 1, "Kardex no cuadra: …QR1 dice 1 en el libro y 0 en el inventario");

// ─── Ida y vuelta con Airtable ──
const ida = camposDeMovimiento(movs[2]);
const vuelta = movimientoDeCampos("recK1", ida)!;
assert(vuelta.motivo === "Ajuste de costo" && vuelta.valor === 21 && vuelta.componentes?.flete === 12, "Los campos de Airtable se leen igual que se escriben");
assert(tituloMovimiento(movs[4]) === "LAP-000500 · Venta con factura · −1", "Título del renglón");
assert(movimientoDeCampos("x", { Motivo: "Inventado" }) === null, "Un motivo desconocido no se lee");
const staff = sinCostos({ ...filas[4] });
assert(staff.costoUnitario === null && staff.valor === 0 && staff.saldoValor === 0 && staff.precioVenta === null, "El Staff no recibe costos ni valores (decisión 3)");

// ─── Documentos ──
const grupos = agruparLineasKardex([
  { itemId: "recA", cantidad: 1, precio: 10 },
  { itemId: "recA", cantidad: 3, precio: 20 },
  { itemId: "recB", cantidad: 0, precio: 5 },
]);
assert(grupos.get("recA")?.cantidad === 4 && grupos.get("recA")?.precio === 17.5 && !grupos.has("recB"), "Líneas del mismo artículo se juntan con su precio promedio");
const docs = movimientosDeDocumento({
  tipo: "venta-recibo", documentoId: "recREC", numero: "REC-000061", cliente: "Carlos Vega", fecha: "2026-10-24T10:05:00Z",
  lineas: [{ itemId: "recKQ3", cantidad: 1, precio: 49 }],
  items: new Map([["recKQ3", campos({ "Número de serie": "7HX2KQ3" })]]),
});
assert(docs.length === 1 && docs[0].motivo === "Venta con recibo" && docs[0].cantidad === -1 && docs[0].documento === "Recibo REC-000061", "Recibo: salida con su número y cliente");
assert(docs[0].clave === "venta-recibo|recREC|recKQ3", "La clave evita registrar dos veces el mismo recibo");
const anula = movimientosDeDocumento({
  tipo: "anula-factura", documentoId: "recF", numero: "001-002-000000812", cliente: "María", fecha: "2026-10-25T00:00:00Z",
  lineas: [{ itemId: "recKQ3", cantidad: 1 }], items: new Map([["recKQ3", campos()]]),
});
assert(anula[0].cantidad === 1 && anula[0].motivo === "Factura anulada" && anula[0].precioVenta === null, "Factura anulada: vuelve 1, sin precio de venta");

if (fallos > 0) {
  console.error(`Fallaron ${fallos} comprobaciones.`);
  process.exit(1);
}
console.log("Kardex: OK");
