/**
 * Test — datos y reglas del ajuste de la Fase 2B (2-nov-2026).
 * Ejecutar: npm test ajuste-fase2b
 */
import { COMPRAS, CORRECCIONES_PROVEEDOR, OR000522, PROVEEDOR, marcaCompra, revisarCompra, type ArticuloLeido } from "../ajuste-fase2b";
import { cuentaPago } from "@/lib/shipping-v2/cuentas-pago";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const r2 = (n: number) => Math.round(n * 100) / 100;
assert(COMPRAS.length === 8, "8 compras sin orden ni pago");
assert(r2(COMPRAS.reduce((s, c) => s + c.total, 0)) === 500.74, "suman $500,74 (9 artículos de la lista + OP-024 + OP-096)");
for (const c of COMPRAS) {
  if (c.pago) assert(cuentaPago(c.pago.cuenta)?.cuentaFinanzas != null, `compra ${c.clave}: la cuenta "${c.pago.cuenta.trim()}" tiene su cuenta en Finanzas`);
}
assert(COMPRAS.find((c) => c.clave === "2")?.pago?.cuenta === "Tarjeta C. Produbanco", "las 4 piezas de eBay: Mastercard Produbanco (dueño, 2-nov)");
assert(cuentaPago(COMPRAS.find((c) => c.clave === "3")!.pago!.cuenta)?.cuentaFinanzas === "SGINGRESOS", "la mainboard: débito Visa → SGINGRESOS");
assert(new Set(COMPRAS.map((c) => marcaCompra(c))).size === 8, "cada compra tiene su marca (no se crea dos veces)");
assert(OR000522.debiaAntes === OR000522.parteDePago.valor + OR000522.tarjeta.monto, "OR000522: $25 = $20 del SSD + $5 con tarjeta");

const art = (o: Partial<ArticuloLeido>): ArticuloLeido => ({ sku: "X", id: "recX", proveedorId: PROVEEDOR.ebay, costo: 86.34, ordenCompraId: null, requierePago: true, enPagoVivo: false, ...o });
const c3 = COMPRAS.find((c) => c.clave === "3")!;
{
  const r = revisarCompra(c3, new Map([["REP-000136", art({ sku: "REP-000136" })]]), null);
  assert(r.bloqueos.length === 0 && !r.listo && r.acciones.length === 3, "mainboard: crear la orden, meterla y pagar");
}
assert(revisarCompra(c3, new Map([["REP-000136", art({ costo: 80 })]]), null).bloqueos.some((b) => b.includes("Suma")), "si el costo no cuadra con el dueño, se bloquea");
assert(revisarCompra(c3, new Map([["REP-000136", art({ ordenCompraId: "recOtra" })]]), null).bloqueos.length === 1, "ya en otra orden: bloquea");
assert(revisarCompra(c3, new Map([["REP-000136", art({ enPagoVivo: true })]]), null).bloqueos.length === 1, "ya en un pago: bloquea");
assert(revisarCompra(c3, new Map(), null).bloqueos.length >= 1, "artículo que no existe: bloquea");
assert(revisarCompra(c3, new Map([["REP-000136", art({ ordenCompraId: "recOC", enPagoVivo: true })]]), { id: "recOC", pagada: true }).listo, "ya hecha: no repite nada");
{
  const c1 = COMPRAS.find((c) => c.clave === "1")!;
  const r = revisarCompra(c1, new Map([["SSD-000022", art({ sku: "SSD-000022", proveedorId: "recUPXMdSgPBhQZ21", costo: 48 })]]), null);
  assert(r.bloqueos.length === 0, "SSD-000022 dice 'Repuestos Laptop' pero la corrección lo pasa a Pixel PC");
  assert(CORRECCIONES_PROVEEDOR.some((x) => x.sku === "SSD-000022" && x.proveedorId === PROVEEDOR.pixelPc), "corrección registrada");
}
{
  const c5 = COMPRAS.find((c) => c.clave === "5")!;
  const r = revisarCompra(c5, new Map([["REP-000127", art({ sku: "REP-000127", proveedorId: "recUPXMdSgPBhQZ21", costo: 80 })]]), null);
  assert(r.bloqueos.length === 0 && r.acciones.some((a) => a.includes("regalo")), "batería MacBook + jack regalado (costo $0)");
}

// El script corre con tsx: nada de su cadena de imports puede arrastrar
// next/navigation (lib/airtable → lib/permissions/pantallas). Pasó el 3-nov.
{
  const fs = require("fs") as typeof import("fs");
  const servidor = fs.readFileSync("lib/compras/servidor.ts", "utf8");
  assert(!/^import .*from "@\/lib\/airtable";/m.test(servidor) && !/^import .*from "@\/lib\/notificaciones\/airtable";/m.test(servidor),
    "lib/compras/servidor.ts no importa lib/airtable ni notificaciones arriba (el script de datos se cae)");
}

if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo OK");
