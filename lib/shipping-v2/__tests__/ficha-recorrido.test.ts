/**
 * Ficha del artículo, bloque "Recorrido" (rediseño 15-oct-2026), contra el
 * doble de Airtable en memoria: de dónde vino (orden de compra, pedido, orden
 * de reparación, artículo padre) y a dónde fue (factura, recibo, reserva).
 * Ejecutar: npm test ficha-recorrido
 */
import { getShippingV2TrazabilidadDeItem } from "../airtable";
import { ORDEN_COMPRA_FIELDS } from "../ordenes-compra";
import { SHIPPING_V2_ITEM_FIELDS, SHIPPING_V2_TABLES } from "../schema.generated";
import {
  activarEnvFalso,
  construirFetchDouble,
  crearEstadoDouble,
  crearRegistroDouble,
  limpiarEnvFalso,
  registrarTablaDouble,
} from "../../finanzas/__tests__/_airtableDouble";

let fallos = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { fallos++; console.error("✗", msg); } else console.log("✓", msg);
}

const T = SHIPPING_V2_TABLES;
const FI = SHIPPING_V2_ITEM_FIELDS;
const OC = ORDEN_COMPRA_FIELDS;

activarEnvFalso();
const state = crearEstadoDouble("Movimientos Financieros");
// "Notas de Crédito Electrónicas" NO se registra a propósito: simula una tabla que no se puede leer.
for (const t of [T.items, T.ordenesCompra, "Operación Comercial", "Órdenes de Reparación", "Facturas Electrónicas", "Recibos", "Reservas"]) registrarTablaDouble(state, t);
global.fetch = construirFetchDouble(state) as unknown as typeof fetch;

const orden = crearRegistroDouble(state, T.ordenesCompra, { [OC.ocId]: "OC-000031", [OC.numeroProveedor]: "113-4455120", [OC.fechaCompra]: "2026-09-28" });
const operacion = crearRegistroDouble(state, "Operación Comercial", { "Código Operación": "OP-2026-000054" });
const reparacion = crearRegistroDouble(state, "Órdenes de Reparación", { ID: "OR000179" });
const factura = crearRegistroDouble(state, "Facturas Electrónicas", { "Número de Factura": "001-002-000000722", Estado: "AUTORIZADO", "Fecha de Emisión": "2026-09-11" });
const recibo = crearRegistroDouble(state, "Recibos", { Número: "REC-000032", Estado: "Vigente", Fecha: "2026-10-02" });
const reserva = crearRegistroDouble(state, "Reservas", { Número: "RES-000001", Estado: "Liberada", Fecha: "2026-09-23" });
const padre = crearRegistroDouble(state, T.items, { [FI.sku]: "LAP-000100", [FI.nombre]: "Laptop para despiece" });
const vendido = crearRegistroDouble(state, T.items, {
  [FI.sku]: "LAP-000412",
  Factura: [factura],
  Recibo: [recibo],
  Reservas: [reserva],
  "Nota de Crédito": ["recNOTAINEXISTE01"],
  "Orden de Reparación (Stock)": [reparacion],
});
const nuevo = crearRegistroDouble(state, T.items, { [FI.sku]: "RAM-000001" });

async function main() {
  try {
    const r = await getShippingV2TrazabilidadDeItem({ id: vendido, ordenCompraId: orden, operacionComercialId: operacion, itemPadreId: padre });
    assert(r.ordenCompra?.codigo === "OC-000031" && r.ordenCompra.numeroProveedor === "113-4455120" && r.ordenCompra.fechaCompra === "2026-09-28" && r.ordenCompra.anulada === false, "Orden de compra con su código, número del proveedor y fecha");
    assert(r.operacion?.codigo === "OP-2026-000054" && r.operacion.id === operacion, "Pedido de cliente con su código");
    assert(r.ordenReparacion?.codigo === "OR000179", "Orden de reparación con su ID");
    assert(r.itemPadre?.sku === "LAP-000100" && r.itemPadre.nombre === "Laptop para despiece", "Artículo del que salió (despiece)");
    const tipos = r.documentos.map((d) => `${d.tipo}:${d.numero}:${d.estado}`).join(" | ");
    assert(tipos === "factura:001-002-000000722:AUTORIZADO | recibo:REC-000032:Vigente | reserva:RES-000001:Liberada", `Documentos de venta en orden (${tipos})`);
    assert(r.documentos[0].fecha === "2026-09-11" && r.documentos[1].fecha === "2026-10-02", "Cada documento trae su fecha");
    assert(!r.documentos.some((d) => d.tipo === "nota-credito"), "Una tabla que no se puede leer no tumba la ficha (se omite)");

    const vacio = await getShippingV2TrazabilidadDeItem({ id: nuevo });
    assert(!vacio.ordenCompra && !vacio.operacion && !vacio.ordenReparacion && !vacio.itemPadre && vacio.documentos.length === 0, "Artículo sin enlaces: recorrido vacío, sin errores");
  } catch (error) {
    fallos++;
    console.error("✗ Error inesperado:", error);
  } finally {
    limpiarEnvFalso();
  }
  if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
  console.log("\nTodo OK");
}

void main();
