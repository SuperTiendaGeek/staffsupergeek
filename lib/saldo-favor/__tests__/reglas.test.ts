/**
 * Test — saldo a favor del cliente (auditoría ops, punto 13B).
 * Ejecutar: npm test saldo-favor
 */
import {
  calcularSaldoCliente,
  maximoUsable,
  validarDevolverSobrante,
  validarPasarASaldo,
  validarUsoDeSaldo,
  venceDe,
  fechaLiberacionDeHistorial,
  type MovimientoSaldo,
} from "../reglas";
import { calcularEstadoCuenta } from "../../estado-cuenta/reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const mov = (o: Partial<MovimientoSaldo>): MovimientoSaldo => ({ id: "rec" + Math.random(), tipo: "Generado", monto: 20, fecha: "2026-10-09T16:30:00.000Z", estado: "Vigente", ...o });

// ── Vence a los 6 meses ──────────────────────────────────────────────────────
assert(venceDe("2026-10-09T16:30:00.000Z") === "2027-04-09", "liberada el 9-oct → vence el 9-abr-2027");
assert(venceDe("2026-08-31") === "2027-02-28", "31-ago → 28-feb (no se regalan días)");

// ── Saldo con lotes ──────────────────────────────────────────────────────────
{
  // Elvis: Generado $20 (reserva liberada 9-oct). Usa $20 el 15-nov.
  const s0 = calcularSaldoCliente([mov({ id: "g1" })], "2026-11-01");
  assert(s0.disponible === 20 && s0.proximoVence === "2027-04-09", "Elvis tiene $20, vence 9-abr-2027");
  const s1 = calcularSaldoCliente([mov({ id: "g1" }), mov({ tipo: "Usado", monto: 20, fecha: "2026-11-15T15:00:00Z" })], "2026-11-16");
  assert(s1.disponible === 0 && s1.lotes.length === 0, "después de usarlo todo, $0");
}
{
  // Dos lotes: se gasta primero el que vence antes.
  const movs = [
    mov({ id: "viejo", monto: 20, fecha: "2026-10-09T00:00:00Z" }),
    mov({ id: "nuevo", monto: 50, fecha: "2026-11-01T00:00:00Z" }),
    mov({ tipo: "Usado", monto: 30, fecha: "2026-11-02T00:00:00Z" }),
  ];
  const s = calcularSaldoCliente(movs, "2026-11-03");
  assert(s.disponible === 40, "$70 generados − $30 usados = $40");
  assert(s.lotes.length === 1 && s.lotes[0].id === "nuevo" && s.lotes[0].restante === 40, "el lote viejo se gastó primero; queda $40 del nuevo");
}
{
  // Un lote vencido sin su movimiento "Vencido": no se puede usar y queda por vencer.
  const s = calcularSaldoCliente([mov({ id: "g", monto: 10, fecha: "2026-04-01T00:00:00Z" })], "2026-10-02");
  assert(s.disponible === 0 && s.porVencer.length === 1 && s.porVencer[0].restante === 10, "pasados 6 meses: $0 disponible y $10 por registrar como vencido");
  const el = calcularSaldoCliente([mov({ id: "g", monto: 10, fecha: "2026-04-01T00:00:00Z" })], "2026-10-01");
  assert(el.disponible === 10, "el mismo día del vencimiento todavía vale");
}
{
  // Anulados no cuentan; NC con su propia fecha de vencimiento.
  const s = calcularSaldoCliente([
    mov({ id: "nc", monto: 320, fecha: "2026-10-23T16:13:00Z", vence: "2027-04-23" }),
    mov({ id: "x", monto: 100, estado: "Anulado" }),
  ], "2026-11-01");
  assert(s.disponible === 320 && s.proximoVence === "2027-04-23", "Aaron: $320 de la NC, vence 23-abr-2027; el anulado no suma");
}
{
  const s = calcularSaldoCliente([mov({ monto: 50 }), mov({ tipo: "Devuelto", monto: 50, fecha: "2026-11-01T00:00:00Z" })], "2026-11-02");
  assert(s.disponible === 0, "devuelto todo → $0");
}

// ── Pasar a saldo a favor ────────────────────────────────────────────────────
{
  const ok = validarPasarASaldo({ aFavorCuenta: 20, clienteId: "recCliente" });
  assert(ok.ok && ok.monto === 20, "le sobran $20 → pasa $20");
  assert(!validarPasarASaldo({ aFavorCuenta: 0, clienteId: "recCliente" }).ok, "sin sobrante → no");
  assert(!validarPasarASaldo({ aFavorCuenta: 20, clienteId: null }).ok, "sin cliente → no");
  // La cuenta queda en $0 con el abono negativo.
  const sinCargos = { servicios: 80, productosDigitales: 0, repuestosHistoricos: 0, items: [], aprobadoSinArticulo: [], descuentos: [], cargosExistentes: new Set<string>() };
  const antes = calcularEstadoCuenta({ cargos: sinCargos, abonos: [{ id: "a1", monto: 100, estado: "Registrado" }] });
  const despues = calcularEstadoCuenta({ cargos: sinCargos, abonos: [{ id: "a1", monto: 100, estado: "Registrado" }, { id: "a2", monto: -20, estado: "Registrado" }] });
  assert(antes.estadoPago === "saldo_a_favor" && antes.aFavor === 20, "antes: saldo a favor $20");
  assert(despues.estadoPago === "pagado" && despues.saldo === 0, "después del −$20: pagado, $0");
}

// ── Devolver ─────────────────────────────────────────────────────────────────
assert(!validarDevolverSobrante({ aFavorCuenta: 20, esAdministrador: false }).ok, "un empleado no puede devolver");
{
  const d = validarDevolverSobrante({ aFavorCuenta: 20, esAdministrador: true });
  assert(d.ok && d.monto === 20, "el administrador devuelve los $20");
}

// ── Usar el saldo como pago ──────────────────────────────────────────────────
assert(validarUsoDeSaldo({ monto: 20, disponible: 20, porCobrar: 35 }).ok, "tiene $20, debe $35 → usa $20");
assert(!validarUsoDeSaldo({ monto: 25, disponible: 20, porCobrar: 35 }).ok, "no puede usar más de lo que tiene");
assert(!validarUsoDeSaldo({ monto: 40, disponible: 50, porCobrar: 35 }).ok, "no puede usar más de lo que falta cobrar");
assert(!validarUsoDeSaldo({ monto: 0, disponible: 50, porCobrar: 35 }).ok, "monto $0 → no");
assert(maximoUsable(50, 35) === 35 && maximoUsable(20, 35) === 20 && maximoUsable(0, 35) === 0, "propone lo máximo usable");

// ── Migración de reservas liberadas ──────────────────────────────────────────
{
  const elvis = "[2026-10-09 11:30] Claude (autorizado por el dueño): Liberada por decisión del dueño (venció el 2026-09-30). El equipo DES-000010 vuelve a estar disponible. Saldo a favor del cliente: $20.00.";
  const f = fechaLiberacionDeHistorial(elvis);
  assert(f === "2026-10-09T16:30:00.000Z", "RES-000001: liberada el 9-oct 11:30 (Ecuador)");
  assert(venceDe(f) === "2027-04-09", "RES-000001: vence el 9-abr-2027");
  const karina = "[2026-10-20 07:59] Sistema (proceso diario): Liberada sola: venció el 2026-10-17 y pasaron 3 días sin extenderla ni liberarla. Saldo a favor: $10.00.";
  assert(venceDe(fechaLiberacionDeHistorial(karina)) === "2027-04-20", "RES-000002: vence el 20-abr-2027");
  assert(fechaLiberacionDeHistorial("[2026-10-01 10:00] Extendida 7 días") === "", "sin línea de liberación → sin fecha");
}

if (fallos > 0) { console.error(`\n${fallos} prueba(s) fallaron.`); process.exit(1); }
