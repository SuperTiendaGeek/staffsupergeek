/**
 * Test — historia del cliente en una sola lista (auditoría ops, punto 13C).
 * Ejecutar: npm test historial
 */
import { armarHistorial, resumirCliente, estadoDeCuenta, tonoDeDocumento, type EntradasHistorial } from "../historial";
import { validarDevolverSaldo } from "../../saldo-favor/reglas";
import { etiquetaAbono } from "../../cobros/metodos";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const vacio: EntradasHistorial = { ordenes: [], operaciones: [], reservas: [], documentos: [], pagos: [], saldo: [] };

// ── Aaron Narvaez: la cadena completa, en orden ─────────────────────────────
{
  const h = armarHistorial({
    ...vacio,
    documentos: [
      { id: "fac", tipo: "factura", codigo: "001-002-000000790", fecha: "2026-10-20", total: 320, estado: "AUTORIZADO", ambiente: "PRODUCCIÓN" },
      { id: "nc", tipo: "nota_credito", codigo: "001-002-000000005", fecha: "2026-10-23", total: 320, estado: "AUTORIZADO", ambiente: "PRODUCCIÓN", destino: "Cambio de equipo", estadoCredito: "Consumido" },
      { id: "rec", tipo: "recibo", codigo: "REC-000085", fecha: "2026-11-01", total: 320, estado: "Vigente" },
      { id: "prueba", tipo: "factura", codigo: "001-001-000000003", fecha: "2026-10-25", total: 5, estado: "AUTORIZADO", ambiente: "PRUEBAS" },
    ],
    saldo: [
      { id: "s3", codigo: "SAF-000003", tipo: "Generado", monto: 320, fecha: "2026-10-23T16:12:45.000Z", vence: "2027-04-23", estado: "Vigente", referencia: "NC 001-002-000000005" },
      { id: "s4", codigo: "SAF-000004", tipo: "Usado", monto: 320, fecha: "2026-11-02T01:34:20.000Z", vence: null, estado: "Vigente", referencia: "REC-000085" },
    ],
  });
  assert(!h.some((e) => e.id === "prueba"), "la factura de PRUEBAS del SRI no aparece");
  assert(h[0].id === "s4" && h[0].monto === -320, "arriba lo más nuevo: Usado −$320");
  assert(h.map((e) => e.id).join(",") === "s4,rec,nc,s3,fac", "orden: Usado, recibo, NC, Generado (mismo día que la NC, después), factura");
  assert(h.find((e) => e.id === "s3")!.detalle.includes("vence 23 abr 2027"), "el Generado dice cuándo vence");
  assert(h.find((e) => e.id === "nc")!.detalle === "Cambio de equipo · crédito consumido", "la NC dice su destino y qué pasó con el crédito");
}

// ── Cuentas: orden con su pedido; el pedido no repite lo que se debe ────────
{
  const e: EntradasHistorial = {
    ...vacio,
    ordenes: [
      { id: "o1", codigo: "OR000517", fecha: "2026-10-01T10:00:00Z", equipo: "HP 240 G8", estado: "En reparación", cuenta: { totalCuenta: 120, porCobrar: 35, aFavor: 0, estadoPago: "pago_parcial" } },
      { id: "o2", codigo: "OR000400", fecha: "2026-08-01T10:00:00Z", equipo: "Dell", estado: "Finalizado Entregado", cuenta: { totalCuenta: 80, porCobrar: 0, aFavor: 0, estadoPago: "pagado" } },
    ],
    operaciones: [
      { id: "p1", codigo: "OP-2026-000119", fecha: "2026-10-02T10:00:00Z", producto: "Teclado", estado: "Pedido", ordenCodigo: "OR000517", cuenta: { totalCuenta: 120, porCobrar: 35, aFavor: 0, estadoPago: "pago_parcial" } },
      { id: "p2", codigo: "OP-2026-000150", fecha: "2026-10-10T10:00:00Z", producto: "Mouse", estado: "Entregado", ordenCodigo: null, cuenta: { totalCuenta: 15, porCobrar: 15, aFavor: 0, estadoPago: "sin_pago" } },
    ],
    pagos: [
      { id: "a1", fecha: "2026-10-01T11:00:00Z", monto: 85, metodo: "Efectivo", estado: "Registrado", referencia: "", cuentaCodigo: "OR000517" },
      { id: "a1", fecha: "2026-10-01T11:00:00Z", monto: 85, metodo: "Efectivo", estado: "Registrado", referencia: "", cuentaCodigo: "OP-2026-000119" },
      { id: "a2", fecha: "2026-10-05T11:00:00Z", monto: -20, metodo: "Saldo a favor", estado: "Registrado", referencia: "", cuentaCodigo: "OR000400" },
      { id: "a3", fecha: "2026-10-06T11:00:00Z", monto: 50, metodo: "Transferencia Banco Pichincha", estado: "Anulado", referencia: "123", cuentaCodigo: "OR000517" },
    ],
  };
  const h = armarHistorial(e);
  const o1 = h.find((x) => x.id === "o1")!;
  assert(o1.estado === "Debe $35.00" && o1.tono === "pendiente", "la orden con saldo dice 'Debe $35.00'");
  assert(h.find((x) => x.id === "o2")!.tono === "ok", "la orden pagada va en verde");
  const p1 = h.find((x) => x.id === "p1")!;
  assert(p1.monto === null && p1.estado === "" && p1.detalle.includes("cuenta de OR000517"), "el pedido de la orden no repite la deuda: dice a qué cuenta pertenece");
  assert(h.find((x) => x.id === "p2")!.estado === "Debe $15.00", "el pedido suelto sí muestra lo que debe");
  assert(h.filter((x) => x.id === "a1").length === 1, "el mismo abono por la orden y por el pedido sale una sola vez");
  assert(h.find((x) => x.id === "a2")!.detalle === "Pasado a saldo a favor", "abono negativo de saldo: 'Pasado a saldo a favor'");
  assert(h.find((x) => x.id === "a3")!.tono === "anulado", "el pago anulado se ve tachado");
  const r = resumirCliente(e);
  assert(r.porCobrar === 50 && r.cuentasConDeuda === 2, "debe $50 en 2 cuentas (OR000517 $35 + pedido suelto $15), sin contar dos veces el pedido de la orden");
  assert(r.ordenes === 2 && r.ordenesActivas === 1, "2 órdenes, 1 activa");
}

// ── Sobrante sin procesar y estados ─────────────────────────────────────────
{
  const r = resumirCliente({ ordenes: [{ id: "o", codigo: "OR1", fecha: "", equipo: "", estado: "Completado", cuenta: { totalCuenta: 80, porCobrar: 0, aFavor: 20, estadoPago: "saldo_a_favor" } }], operaciones: [] });
  assert(r.sobranteEnCuentas === 20, "si una cuenta quedó con $20 de más, se avisa arriba");
  assert(estadoDeCuenta({ totalCuenta: 80, porCobrar: 0, aFavor: 20, estadoPago: "saldo_a_favor" }) === "Sobra $20.00", "cuenta con sobrante: 'Sobra $20.00'");
  assert(tonoDeDocumento({ tipo: "factura", estado: "AUTORIZADO", estadoAnulacion: "Anulada" }) === "anulado", "factura con anulación aprobada: tachada");
  assert(tonoDeDocumento({ tipo: "factura", estado: "DEVUELTA" }) === "alerta", "factura devuelta por el SRI: alerta");
  assert(tonoDeDocumento({ tipo: "recibo", estado: "Vigente" }) === "ok", "recibo vigente: ok");
  assert(tonoDeDocumento({ tipo: "factura", estado: "NO AUTORIZADO" }) === "alerta", "NO AUTORIZADO no se confunde con autorizado");
  assert(tonoDeDocumento({ tipo: "factura", estado: "AUTORIZADO", estadoAnulacion: "Solicitada" }) === "pendiente", "anulación solicitada: pendiente");
}

// ── Devolver desde la ficha ─────────────────────────────────────────────────
assert(!validarDevolverSaldo({ monto: 20, disponible: 20, esAdministrador: false }).ok, "un empleado no puede devolver el saldo");
assert(validarDevolverSaldo({ monto: 20, disponible: 20, esAdministrador: true }).ok, "Elvis: el administrador devuelve sus $20");
{
  const parcial = validarDevolverSaldo({ monto: 10, disponible: 20, esAdministrador: true });
  assert(parcial.ok && parcial.monto === 10, "se puede devolver una parte ($10 de $20)");
}
assert(!validarDevolverSaldo({ monto: 25, disponible: 20, esAdministrador: true }).ok, "no se devuelve más de lo que tiene");
assert(!validarDevolverSaldo({ monto: 0, disponible: 20, esAdministrador: true }).ok, "monto $0 → no");

// ── Etiqueta única de los pagos ─────────────────────────────────────────────
assert(etiquetaAbono("Saldo a favor", 20) === "Pagado con saldo a favor" && etiquetaAbono("Devolución", -20) === "Devuelto al cliente" && etiquetaAbono("", 5) === "Sin método", "etiquetas de pago compartidas con la cuenta de la orden");

if (fallos > 0) { console.error(`\n${fallos} prueba(s) fallaron.`); process.exit(1); }
