/**
 * Test — plazos, origen, pieza retirada y comprobante de una Garantía SUPER
 * GEEK (auditoría ops, punto 20, segunda parte · 4-nov-2026).
 * Plazos del dueño: Laptop/Desktop/All in One 6 meses; lo demás 3 meses
 * (fundas, mochilas y similares sin garantía: aviso); mano de obra según el
 * catálogo.
 * Ejecutar: npm test plazos
 */
import {
  armarOrigenes, nuevaGarantia, plazoDeArticulo, plazoDeServicio, textoOrigen, venceGarantia, vigente,
  type DocumentoLeido,
} from "../plazos";
import { errorPiezaRetirada, evaluarGarantia, reclamosPendientes, sinDestinoDePieza } from "../reglas";
import { armarComprobanteGarantia, type LineaParaComprobante } from "../comprobante";
import { MOTIVOS_KARDEX, grupoDeMotivo } from "@/lib/shipping-v2/kardex";
import { tipoOperacionPermitido, TIPO_PIEZA_RETIRADA_GARANTIA, ORIGEN_TIENDA } from "@/lib/shipping-v2/item-origen";
import type { LineaPresupuesto } from "@/lib/tecnicos/presupuesto/reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// ─── Plazos ─────────────────────────────────────────────────────────────────
assert(plazoDeArticulo("Laptop").meses === 6 && plazoDeArticulo("All in One").meses === 6 && plazoDeArticulo("Desktop").meses === 6, "Laptop, Desktop y All in One: 6 meses");
assert(plazoDeArticulo("Batería").meses === 3 && plazoDeArticulo("Monitor").meses === 3, "los demás electrónicos: 3 meses");
assert(!!plazoDeArticulo("Accesorio").aviso, "accesorios: aviso (fundas y mochilas no tienen garantía)");
assert(plazoDeServicio(30).dias === 30 && !!plazoDeServicio(null).aviso && plazoDeServicio(0).dias === 0, "mano de obra: según el catálogo; sin plazo = aviso");
assert(venceGarantia("2026-08-13", { meses: 6 }) === "2027-02-13", "6 meses desde el 13-ago-2026 → 13-feb-2027");
assert(venceGarantia("2026-08-31", { meses: 6 }) === "2027-02-28", "fin de mes: 31-ago + 6 meses → 28-feb");
assert(venceGarantia("2026-11-04", { dias: 30 }) === "2026-12-04", "30 días");
assert(venceGarantia("2026-11-04", { dias: 0 }) === null, "sin garantía no vence: no hay plazo");
assert(vigente("2026-11-04", "2026-11-04") && !vigente("2026-11-03", "2026-11-04"), "vigente hasta el último día inclusive");

// ─── Lo que el cliente puede reclamar ───────────────────────────────────────
{
  const docs: DocumentoLeido[] = [
    { id: "recREC", etiqueta: "REC-000075", fecha: "2026-10-14", articulos: [{ id: "recCAR", sku: "OTR-000215", nombre: "Cargador HP 45W", categoria: "Cargador", proveedorId: "recHELP" }], servicios: [{ id: "recSV", nombre: "Limpieza", diasCatalogo: 30 }] },
    { id: "recFAC", etiqueta: "Factura 001-002-000000500", fecha: "2026-01-10", articulos: [{ id: "recLAP", sku: "LAP-000020", nombre: "Dell XPS 13 9300", categoria: "Laptop", proveedorId: null }], servicios: [] },
  ];
  const o = armarOrigenes({ documentos: docs, garantias: [], hoy: "2026-11-04" });
  assert(o.length === 3, "artículos y servicios de cada documento");
  const cargador = o.find((x) => x.sku === "OTR-000215")!;
  assert(cargador.vigente && cargador.vence === "2027-01-14" && cargador.proveedorId === "recHELP", "cargador del 14-oct: 3 meses, vigente, con su proveedor para el reclamo");
  const laptop = o.find((x) => x.sku === "LAP-000020")!;
  assert(!laptop.vigente && laptop.vence === "2026-07-10", "laptop de enero: 6 meses, ya venció");
  assert(o[o.length - 1].clave === laptop.clave, "las vencidas van al final");
  assert(textoOrigen(cargador) === "OTR-000215 · Cargador HP 45W · REC-000075 · 14/10/2026", "texto que queda en la línea");
  const conAnterior = armarOrigenes({ documentos: [], hoy: "2026-11-04", garantias: [
    { lineaId: "recG", ordenCodigo: "OR000425", nombre: "Batería Dell XPS", sku: "REP-000135", categoria: "Batería", tipoLinea: "Repuesto", diasCatalogo: null, fechaEntrega: "2026-11-04T15:00:00.000Z", itemId: "recREP135", proveedorId: "recEBAY" },
  ] });
  assert(conAnterior[0].tipo === "garantia" && conAnterior[0].vence === "2027-02-04", "una pieza dada en garantía también tiene garantía (3 meses desde su entrega)");
}

// ─── Proponer con origen: vigente o cortesía ────────────────────────────────
{
  const L = { tipo: "Repuesto" as const, estado: "Propuesta" as const, garantia: "" as const, grupoAlternativas: "", motivoGarantia: "" };
  const vig = evaluarGarantia(L, "proponer", { esAdmin: false, nombre: "Joseph", motivo: "No carga", origen: { clave: "articulo:recCAR@recREC", texto: "OTR-000215 · Cargador", vence: "2027-01-14", vigente: true } });
  assert(vig.ok && vig.cambios.garantiaCortesia === false && vig.cambios.garantiaOrigenId === "articulo:recCAR@recREC" && vig.cambios.garantiaVence === "2027-01-14", "vigente: queda enlazada a su venta");
  const venc = evaluarGarantia(L, "proponer", { esAdmin: true, nombre: "Alex", motivo: "Cliente frecuente", origen: { clave: "articulo:recLAP@recFAC", texto: "LAP-000020", vence: "2026-07-10", vigente: false } });
  assert(venc.ok && venc.cambios.garantiaCortesia === true && venc.historial.includes("cortesía") && venc.historial.includes("10/07/2026"), "vencida: el administrador la da como cortesía y queda dicho");
  const sinDoc = evaluarGarantia(L, "proponer", { esAdmin: false, nombre: "Joseph", motivo: "Comprada antes del sistema", origen: null });
  assert(sinDoc.ok && sinDoc.cambios.garantiaCortesia === true && sinDoc.cambios.garantiaDe === "", "sin documento: cortesía, la confirma un administrador");
}

// ─── Pieza retirada ─────────────────────────────────────────────────────────
{
  const base = { tipo: "Repuesto" as const, garantia: "Confirmada" as const, estado: "Cargada" as const, piezaRetiradaSku: "" };
  assert(errorPiezaRetirada(base, "Reclamar al proveedor") === null, "se elige qué pasa con la pieza mala");
  assert(errorPiezaRetirada({ ...base, tipo: "Servicio" }, "Se desecha") !== null, "un servicio no tiene pieza retirada");
  assert(errorPiezaRetirada({ ...base, piezaRetiradaSku: "REP-000150" }, "Se desecha") !== null, "ya registrada para el reclamo: no se cambia");
  assert(errorPiezaRetirada(base, "Otra cosa") !== null, "solo los 3 destinos");
  const lineas = [
    { ...base, garantiaEntregada: true, piezaRetirada: "Reclamar al proveedor" as const, descripcion: "A" },
    { ...base, garantiaEntregada: true, piezaRetirada: "Reclamar al proveedor" as const, piezaRetiradaSku: "REP-1", descripcion: "B" },
    { ...base, garantiaEntregada: false, piezaRetirada: "Reclamar al proveedor" as const, descripcion: "C" },
    { ...base, garantiaEntregada: true, piezaRetirada: "Se desecha" as const, descripcion: "D" },
  ];
  assert(reclamosPendientes(lineas).map((l) => l.descripcion).join() === "A", "al entregar se registra una vez y solo lo que se reclama");
  assert(sinDestinoDePieza([{ ...base, piezaRetirada: "", descripcion: "Batería" }]).join() === "Batería", "si falta el destino, se avisa al entregar");
}

// ─── Comprobante de entrega en garantía ─────────────────────────────────────
{
  const linea = (o: Partial<LineaParaComprobante>): LineaParaComprobante => ({
    id: "recL", descripcion: "Batería Dell XPS 13 9300", tipo: "Repuesto", estado: "Cargada", garantia: "Confirmada", garantiaDe: "LAP-000020 · Dell XPS",
    motivoGarantia: "No carga", garantiaCortesia: false, piezaRetirada: "Se desecha", garantiaEntregada: true, fechaEntregaGarantia: "2026-11-04T15:00:00.000Z",
    sku: "REP-000135", categoria: "Batería", diasCatalogo: null, ...o,
  });
  const c = armarComprobanteGarantia({ ordenCodigo: "OR000425", equipo: "Dell XPS 13 9300", cliente: { nombre: "Aida Marcillo", identificacion: "1002518841", telefono: "" }, hoy: "2026-11-04",
    lineas: [linea({}), linea({ id: "recN", garantia: "", descripcion: "Limpieza" }) as LineaParaComprobante] });
  assert(c !== null && c.numero === "GAR-OR000425" && c.lineas.length === 1, "lleva solo lo que va en garantía");
  assert(c!.lineas[0].nuevaGarantia === "3 meses, hasta el 04/02/2027" && c!.entregado, "la batería nueva: 3 meses desde la entrega");
  const previo = armarComprobanteGarantia({ ordenCodigo: "OR1", equipo: "", cliente: { nombre: "X", identificacion: "", telefono: "" }, hoy: "2026-11-04",
    lineas: [linea({ garantiaEntregada: false, fechaEntregaGarantia: "" })] });
  assert(!previo!.entregado && previo!.lineas[0].nuevaGarantia.includes("cuenta desde la entrega"), "antes de entregar: constancia previa");
  assert(armarComprobanteGarantia({ ordenCodigo: "OR2", equipo: "", cliente: { nombre: "X", identificacion: "", telefono: "" }, hoy: "2026-11-04", lineas: [linea({ garantia: "Propuesta" })] }) === null, "sin garantía confirmada no hay comprobante");
  const sv = nuevaGarantia({ tipoLinea: "Servicio", categoria: "", diasCatalogo: 15, entrega: "2026-11-04" });
  assert(sv.vence === "2026-11-19", "un servicio en garantía: su plazo del catálogo");
}

// ─── Shipping V2 conoce la pieza retirada ───────────────────────────────────
assert(tipoOperacionPermitido(ORIGEN_TIENDA, TIPO_PIEZA_RETIRADA_GARANTIA), "\"Pieza retirada en garantía\" entra como artículo de la tienda");
assert((MOTIVOS_KARDEX as readonly string[]).includes("Pieza retirada en garantía") && grupoDeMotivo("Salida por garantía") === "garantias" && grupoDeMotivo("Pieza retirada en garantía") === "garantias",
  "el Kardex tiene el atajo \"Garantías\" (gasto de garantía)");

void ({} as LineaPresupuesto);
if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nPlazos y origen: todo OK");
