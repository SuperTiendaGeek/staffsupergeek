/**
 * Test — ajuste de datos del punto 7 (ingresos de mostrador sin cuenta).
 * Ejecutar: npm test ajuste-auditoria-ops-punto7
 */
import { planPunto7, resumenPorCuenta, type LecturaMovimiento } from "../ajuste-auditoria-ops-punto7";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}
const mov = (o: Partial<LecturaMovimiento> = {}): LecturaMovimiento => ({
  existe: true, tipo: "Ingreso", origen: "Facturación", monto: 25, cuentaDestinoIds: [], estado: "Confirmado", observacion: "", ...o,
});
const cuentas = new Map([["SGINGRESOS", "recSGI"], ["Mercado Pago", "recMP"], ["DeUna", "recDU"]]);

{
  const p = planPunto7({
    asignaciones: [
      { movimientoId: "m1", cuenta: "SGINGRESOS", monto: 25, documento: "Factura 799" },
      { movimientoId: "m2", cuenta: "Mercado Pago", monto: 55 },
    ],
    movimientos: new Map([["m1", mov()], ["m2", mov({ monto: 55, estado: "Pendiente", observacion: "nota" })]]),
    cuentas, fecha: "2026-10-28",
  });
  assert(p.acciones.length === 2 && p.bloqueos.length === 0, "dos movimientos sin cuenta → dos acciones");
  const c1 = p.acciones[0].campos;
  assert(JSON.stringify(c1["Cuenta Destino (Finanzas)"]) === '["recSGI"]' && c1["Método"] === "Transferencia bancaria", "SGINGRESOS: cuenta y método de transferencia");
  const c2 = p.acciones[1].campos;
  assert(c2["Método"] === "Mercado Pago" && c2["Estado del Movimiento"] === "Confirmado", "Mercado Pago viejo: Confirmado (ya se acreditó hace tiempo)");
  assert(String(c2["Observación"]).startsWith("nota\n") && String(c2["Observación"]).includes("punto 7"), "deja nota sin borrar la anterior");
  assert(resumenPorCuenta(p.acciones, [{ movimientoId: "m1", cuenta: "SGINGRESOS", monto: 25 }, { movimientoId: "m2", cuenta: "Mercado Pago", monto: 55 }]).get("Mercado Pago")?.monto === 55, "resumen por cuenta");
}
{
  const p = planPunto7({
    asignaciones: [
      { movimientoId: "ok", cuenta: "SGINGRESOS", monto: 25 },
      { movimientoId: "otra", cuenta: "SGINGRESOS", monto: 25 },
      { movimientoId: "monto", cuenta: "SGINGRESOS", monto: 30 },
      { movimientoId: "cuentaMala", cuenta: "Banco Inventado", monto: 25 },
      { movimientoId: "ok", cuenta: "SGINGRESOS", monto: 25 },
      { movimientoId: "falta", cuenta: "DeUna", monto: 25 },
      { movimientoId: "egreso", cuenta: "DeUna", monto: 25 },
    ],
    movimientos: new Map([
      ["ok", mov({ cuentaDestinoIds: ["recSGI"] })],
      ["otra", mov({ cuentaDestinoIds: ["recDU"] })],
      ["monto", mov()],
      ["cuentaMala", mov()],
      ["egreso", mov({ tipo: "Egreso" })],
    ]),
    cuentas, fecha: "2026-10-28",
  });
  assert(p.acciones.length === 0, "ningún caso dudoso se escribe");
  assert(p.yaBien === 1, "ya tiene la misma cuenta → ya está bien (idempotente)");
  assert(p.bloqueos.length === 6, `bloquea: otra cuenta, monto distinto, cuenta inexistente, repetido, no existe, no es ingreso (${p.bloqueos.length})`);
}

if (fallos > 0) { console.error(`\n${fallos} prueba(s) fallaron.`); process.exit(1); }
console.log("\nTodas las pruebas pasaron.");
