/**
 * Test — Entregar al cliente (auditoría ops, punto 6 · 6-nov-2026).
 * Sin crédito, siempre con documento, nada aprobado colgando, sin excepciones.
 * Ejecutar: npm test entrega
 */
import { armarPendientes, camposDeEntrega, evaluarEntrega, MOTIVOS_SIN_COBRO, type Pendiente } from "../reglas";
import { armarComprobanteEntrega } from "../comprobante";
import { fechaHoraEntrega } from "../formato";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const base = { estadoOrden: "Completado", saldo: 0, totalCobrable: 45, enGarantia: 0, documento: { tipo: "recibo" as const, numero: "REC-000090" }, pendientes: [] as Pendiente[] };
const datos = { retiradoPor: "Ana Pérez" };

// ─── Lo normal ──────────────────────────────────────────────────────────────
let r = evaluarEntrega({ ...base, datos });
assert(r.puedeEntregar && r.comprobante === "venta", "pagado y con recibo: se entrega");
assert(r.revisiones.map((x) => x.clave).join(",") === "pendientes,cobro,documento", "revisa en orden: pendientes, cobro, documento");

// ─── 1. Sin crédito ─────────────────────────────────────────────────────────
r = evaluarEntrega({ ...base, saldo: 15, datos });
assert(!r.puedeEntregar && r.faltas.includes("Falta cobrar $15.00"), "debe $15 → no se entrega, dice cuánto falta");
r = evaluarEntrega({ ...base, saldo: -10, datos });
assert(!r.puedeEntregar && r.faltas.some((f) => f.startsWith("Sobran $10.00")), "sobran $10 → se resuelve antes (saldo a favor o devolver)");
assert(evaluarEntrega({ ...base, saldo: 0.004, datos }).puedeEntregar, "un centavo de redondeo no frena");

// ─── 2. Siempre con documento ───────────────────────────────────────────────
r = evaluarEntrega({ ...base, documento: null, datos });
assert(!r.puedeEntregar && r.faltas.includes("Falta emitir la factura o el recibo"), "pagado pero sin documento → no se entrega");
r = evaluarEntrega({ ...base, totalCobrable: 0, enGarantia: 1, documento: null, datos });
assert(r.puedeEntregar && r.comprobante === "garantia", "solo garantía: va con el comprobante GAR");
r = evaluarEntrega({ ...base, totalCobrable: 0, documento: null, datos });
assert(!r.puedeEntregar && r.comprobante === "sin-cobro" && r.faltas.includes("Elige el motivo sin cobro."), "sin cobro: pide el motivo");
r = evaluarEntrega({ ...base, totalCobrable: 0, documento: null, datos: { ...datos, motivoSinCobro: "Diagnóstico sin costo" } });
assert(r.puedeEntregar, "sin cobro con motivo: se entrega con el comprobante ENT");
r = evaluarEntrega({ ...base, totalCobrable: 0, documento: null, datos: { ...datos, motivoSinCobro: "Otro" } });
assert(!r.puedeEntregar && r.faltas.some((f) => f.includes("Otro")), "\"Otro\" pide el detalle");
r = evaluarEntrega({ ...base, totalCobrable: 0, documento: null, datos: { ...datos, motivoSinCobro: "Regalo" } });
assert(!r.puedeEntregar, "un motivo inventado no vale");
assert(MOTIVOS_SIN_COBRO.length === 4, "los 4 motivos del dueño");
r = evaluarEntrega({ ...base, totalCobrable: 30, enGarantia: 1, documento: null, datos });
assert(!r.puedeEntregar && r.comprobante === "venta", "garantía + algo pagado: el documento es la factura/recibo de lo pagado");

// ─── 3. Nada aprobado colgando (OR000517) ───────────────────────────────────
const pendientes = armarPendientes({
  aprobadoSinArticulo: [{ id: "recLinea1", nombre: "Teclado Lenovo T450" }, { id: "recOp1", nombre: "Mouse" }],
  lineaIds: new Set(["recLinea1", "recLinea2"]),
  solicitudes: [
    { lineaId: "recLinea1", operacionId: null, descripcion: "Teclado Lenovo T450", clave: "falta_pedir", texto: "Falta pedir · 4 días" },
    { lineaId: "recLinea2", operacionId: null, descripcion: "Batería", clave: "en_camino", texto: "En camino" },
    { lineaId: "recLinea3", operacionId: null, descripcion: "Pantalla", clave: "llego", texto: "Llegó ✓" },
    { lineaId: null, operacionId: "recOp2", descripcion: "Cargador", clave: "cancelado", texto: "Cancelado" },
  ],
  operaciones: [
    { id: "recOp1", codigo: "OP-2026-000119", estado: "Aprobado", producto: "Mouse" },
    { id: "recOp3", codigo: "OP-2026-000140", estado: "Entregado", producto: "Funda" },
    { id: "recOp4", codigo: "OP-2026-000141", estado: "Rechazado", producto: "SSD" },
  ],
});
assert(pendientes.length === 3, "teclado sin pedir + batería en camino + pedido abierto; lo que llegó o se canceló no cuenta");
assert(pendientes[0].refId === "recLinea1" && pendientes[0].detalle.startsWith("Falta pedir"), "la línea dice exactamente qué falta (chip de compras)");
assert(pendientes.filter((p) => p.refId === "recLinea1").length === 1, "sin repetir: la solicitud y el aprobado sin artículo son lo mismo");
assert(pendientes.find((p) => p.refId === "recOp1")?.tipo === "pedido", "el pedido se resuelve en su Operación");
r = evaluarEntrega({ ...base, pendientes, datos });
assert(!r.puedeEntregar && r.faltas[0].startsWith("3 cosas aprobadas"), "con algo pendiente no se entrega");

// ─── Punto 5B: licencias con su PDF ─────────────────────────────────────────
r = evaluarEntrega({ ...base, licencias: [{ sku: "DIG-000081", tienePdf: false }], datos });
assert(!r.puedeEntregar && r.faltas.includes("Falta generar el PDF de DIG-000081"), "una licencia sin PDF frena la entrega");
r = evaluarEntrega({ ...base, licencias: [{ sku: "DIG-000081", tienePdf: true }], datos });
assert(r.puedeEntregar && r.revisiones.some((x) => x.clave === "licencias" && x.ok), "licencia con PDF: ✓");
assert(!evaluarEntrega({ ...base, datos }).revisiones.some((x) => x.clave === "licencias"), "sin licencias no se muestra esa revisión");

// ─── 4. Sin excepciones / estados ───────────────────────────────────────────
assert(!evaluarEntrega({ ...base, estadoOrden: "Finalizado Entregado", datos }).puedeEntregar, "no se entrega dos veces");
assert(!evaluarEntrega({ ...base, estadoOrden: "Enviado a Reciclaje", datos }).puedeEntregar, "una orden a reciclaje no se entrega");
assert(evaluarEntrega({ ...base, estadoOrden: "Esperando Respuesta", totalCobrable: 0, documento: null, datos: { ...datos, motivoSinCobro: "El cliente no aprobó la reparación" } }).puedeEntregar, "se puede entregar desde Esperando Respuesta (cliente no aprobó)");
assert(!evaluarEntrega({ ...base, datos: { retiradoPor: "  " } }).puedeEntregar, "hay que decir quién retira");
assert(evaluarEntrega({ ...base, saldo: 15 }).faltas.length === 1, "sin datos (solo revisar al abrir el panel) no pide el formulario");

// ─── Campos ─────────────────────────────────────────────────────────────────
const c = camposDeEntrega({ datos: { retiradoPor: " Luis Pérez ", accesoriosDevueltos: "Cargador", motivoSinCobro: "Otro", detalleSinCobro: "x" }, comprobante: "venta", entregadoPor: "Maritza", ahora: "2026-11-06T15:00:00.000Z" });
assert(c["Retirado por"] === "Luis Pérez" && c["Motivo sin cobro"] === null && c["Detalle sin cobro"] === "", "con cobro no se guarda motivo sin cobro");
const c2 = camposDeEntrega({ datos: { retiradoPor: "Ana", motivoSinCobro: "No se pudo reparar" }, comprobante: "sin-cobro", entregadoPor: "Maritza", ahora: "2026-11-06T15:00:00.000Z" });
assert(c2["Motivo sin cobro"] === "No se pudo reparar" && c2["Fecha de entrega"] === "2026-11-06T15:00:00.000Z" && c2["Entregado por"] === "Maritza", "sin cobro guarda motivo, fecha y quién entregó");

// ─── Comprobante ENT ────────────────────────────────────────────────────────
const cliente = { nombre: "Ana Pérez", identificacion: "1002003004", telefono: "0999999999" };
const ent = armarComprobanteEntrega({ ordenCodigo: "OR000530", estadoOrden: "Finalizado Entregado", equipo: "Laptop HP", cliente, campos: { ...c2, "Accesorios devueltos": "Cargador" } });
assert(ent.ok && ent.comprobante.numero === "ENT-OR000530" && ent.comprobante.motivo === "No se pudo reparar" && ent.comprobante.retiradoPor === "Ana", "ENT-<orden> con motivo y quién retiró");
assert(!armarComprobanteEntrega({ ordenCodigo: "OR000530", estadoOrden: "Completado", equipo: "", cliente, campos: c2 }).ok, "antes de entregar no hay comprobante de entrega");
assert(!armarComprobanteEntrega({ ordenCodigo: "OR000530", estadoOrden: "Finalizado Entregado", equipo: "", cliente, campos: c }).ok, "una entrega con cobro no tiene ENT (su documento es la factura/recibo)");
const sinRetira = armarComprobanteEntrega({ ordenCodigo: "OR1", estadoOrden: "Finalizado Entregado", equipo: "", cliente, campos: { "Motivo sin cobro": { name: "Diagnóstico sin costo" } } });
assert(sinRetira.ok && sinRetira.comprobante.retiradoPor === "Ana Pérez", "sin dato de quién retira: el cliente (y lee el select de Airtable)");

assert(fechaHoraEntrega("2026-11-06T20:05:00.000Z") === "06/11/2026 15:05" && fechaHoraEntrega("") === "", "fecha y hora de Ecuador en el comprobante");

if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nEntregar al cliente: todo OK");
