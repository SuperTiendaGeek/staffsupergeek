/**
 * Test — anular un pago de la cuenta (auditoría ops, punto 11 · 21-nov-2026).
 * Ejecutar: npm test anular
 *
 * Caso real que motivó la regla: cualquier sesión de Técnicos podía anular
 * cualquier abono, aunque ya hubiera recibo, e incluso un pago PayPhone.
 */
import fs from "fs";
import {
  MOTIVOS_ANULACION, esPagoEnLinea, revisarAnulacion, textoHistorialAnulacion,
  textoMotivoAnulacion, validarMotivoAnulacion, type PagoParaAnular,
} from "../anular";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const pago = (o: Partial<PagoParaAnular> = {}): PagoParaAnular => ({
  estado: "Registrado", metodoPago: "Efectivo", observacion: null, enLinea: false, ...o,
});
const recibo = { tipo: "recibo" as const, numero: "REC-000112" };

// ── Quién y cuándo ──────────────────────────────────────────────────────────
{
  const r = revisarAnulacion({ esAdmin: true, pago: pago(), documento: null });
  assert(r.ok, "un administrador anula un pago en efectivo de una cuenta sin documento");
}
{
  const r = revisarAnulacion({ esAdmin: false, pago: pago(), documento: null });
  assert(!r.ok && r.bloqueo === "no_admin", "un técnico o staff ya no puede anular (antes podía cualquiera)");
}
{
  const r = revisarAnulacion({ esAdmin: true, pago: pago(), documento: recibo });
  assert(!r.ok && r.bloqueo === "documento" && r.mensaje.includes("REC-000112"),
    "con recibo vigente ni el administrador anula: primero se anula el recibo (y se dice cuál)");
}
{
  const r = revisarAnulacion({ esAdmin: true, pago: pago(), documento: { tipo: "factura", numero: "001-002-000000818" } });
  assert(!r.ok && r.mensaje.includes("la factura 001-002-000000818"), "con factura vigente, igual");
}
{
  const r = revisarAnulacion({ esAdmin: true, pago: pago({ metodoPago: "PayPhone", enLinea: true }), documento: null });
  assert(!r.ok && r.bloqueo === "en_linea", "un pago en línea no se anula aquí: se devuelve en Pagos en línea");
}
{
  const r = revisarAnulacion({ esAdmin: true, pago: pago({ metodoPago: "Traspaso" }), documento: null });
  assert(!r.ok && r.bloqueo === "traspaso", "un traspaso a pedido aparte no se anula suelto");
  const r2 = revisarAnulacion({ esAdmin: true, pago: pago({ metodoPago: "Efectivo", observacion: "Traspaso desde OR000541" }), documento: null });
  assert(!r2.ok && r2.bloqueo === "traspaso", "la copia del traspaso en el pedido tampoco");
}
{
  const r = revisarAnulacion({ esAdmin: true, pago: pago({ estado: "Anulado" }), documento: null });
  assert(!r.ok && r.bloqueo === "ya_anulado", "no se anula dos veces");
  const r2 = revisarAnulacion({ esAdmin: false, pago: pago({ estado: "Anulado" }), documento: recibo });
  assert(!r2.ok && r2.bloqueo === "ya_anulado", "'ya anulado' se dice antes que el permiso");
}
{
  const r = revisarAnulacion({ esAdmin: false, pago: pago({ metodoPago: "PayPhone", enLinea: true }), documento: recibo });
  assert(!r.ok && r.bloqueo === "no_admin", "sin permiso, lo primero que se dice es el permiso");
}

// ── Pago en línea ───────────────────────────────────────────────────────────
assert(esPagoEnLinea({ metodoPago: "PayPhone" }), "PayPhone siempre es en línea");
assert(esPagoEnLinea({ metodoPago: "DeUna", conPagoEnLinea: true }), "lo enlazado a 'Pagos en línea' es en línea");
assert(!esPagoEnLinea({ metodoPago: "DeUna" }), "DeUna registrado a mano en el mostrador no es en línea");
assert(!esPagoEnLinea({ metodoPago: null }), "sin método no es en línea");

// ── Motivo ──────────────────────────────────────────────────────────────────
assert(MOTIVOS_ANULACION.length === 4 && MOTIVOS_ANULACION[0] === "Registrado dos veces", "cuatro motivos, el más común primero");
assert(validarMotivoAnulacion("", "") !== null, "sin motivo no se anula");
assert(validarMotivoAnulacion("Me equivoqué", "") !== null, "solo se aceptan los motivos de la lista");
assert(validarMotivoAnulacion("Registrado dos veces", "") === null, "un motivo de la lista basta");
assert(validarMotivoAnulacion("Otro", "") !== null && validarMotivoAnulacion("Otro", "ok") !== null, "'Otro' exige un detalle de verdad");
assert(validarMotivoAnulacion("Otro", "El cliente pidió cambiar el método") === null, "'Otro' con detalle vale");
assert(textoMotivoAnulacion("Registrado dos veces", "") === "Registrado dos veces", "motivo solo");
assert(textoMotivoAnulacion("Monto equivocado", "Era $20, no $25") === "Monto equivocado: Era $20, no $25", "motivo + detalle");
assert(textoMotivoAnulacion("Otro", "Cliente pidió otro método") === "Cliente pidió otro método", "'Otro' guarda solo el detalle");

// ── Historial ───────────────────────────────────────────────────────────────
assert(
  textoHistorialAnulacion({ id: "recX", idAbono: "322", monto: 25, motivo: "Registrado dos veces" }) ===
    "Pago ABO-000322 de $25.00 anulado: Registrado dos veces.",
  "la línea del historial dice qué pago, cuánto y por qué (mismo número que el comprobante)",
);

// ── El servidor usa la regla ───────────────────────────────────────────────
const ruta = fs.readFileSync("app/api/tecnicos/abonos-por-orden/[id]/route.ts", "utf8");
assert(ruta.includes("revisarAnulacion(") && ruta.includes("validarMotivoAnulacion("), "la ruta de anular aplica la misma regla");
assert(ruta.includes("isAdministratorRole("), "la ruta revisa que sea administrador");
assert(ruta.includes("documentoDeLaCuenta("), "la ruta busca el documento vigente de la cuenta completa");
assert(ruta.indexOf("revisarAnulacion(") < ruta.indexOf("anularAbonoPorOrden("), "revisa ANTES de anular");

if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo OK");
