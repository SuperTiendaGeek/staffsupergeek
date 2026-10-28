/**
 * Test — ajuste de datos del punto 13A: las 47 órdenes con "saldo a favor"
 * que en realidad tenían cargos sin registrar.
 * Ejecutar: npm test ajuste-auditoria-ops-punto13a
 */
import {
  CARGO_SISTEMA_ANTERIOR,
  CASOS_PUNTO13A,
  MARCA_PUNTO13A,
  NC_PRUEBA,
  esOrdenVieja,
  planPunto13A,
  saldoDespuesDelAjuste,
  type LecturaNC,
  type LecturaOrden,
} from "../ajuste-auditoria-ops-punto13a";
import { calcularEstadoCuenta } from "../reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const LEGACY = "Abono legacy interfaz Airtable\n";
const orden = (o: Partial<LecturaOrden> = {}): LecturaOrden => ({
  id: "recORDEN0000074x", codigo: "OR000074", estado: "Finalizado Entregado", cliente: "Yilber Castro",
  aFavor: 150, abonos: [{ monto: 150, observacion: LEGACY }], ...o,
});
const ncPrueba = (o: Partial<LecturaNC> = {}): LecturaNC => ({ existe: true, saldoDisponible: 5, estadoCredito: "", motivo: "Nota de credito de prueba", ...o });
const ncYaHecha = ncPrueba({ saldoDisponible: 0, estadoCredito: "Consumido" });

// ── Orden vieja: un solo cargo por exactamente lo que sobra ──────────────────
{
  const p = planPunto13A({ ordenesConSaldoAFavor: [orden()], cargosMarcados: [], nc: ncYaHecha });
  assert(p.bloqueos.length === 0 && p.acciones.length === 1, "orden vieja → una sola acción");
  const a = p.acciones[0];
  assert(a.tipo === "crear-cargo" && a.nombre === CARGO_SISTEMA_ANTERIOR && a.costo === 150, "cargo 'Trabajo del sistema anterior' por $150");
  assert(a.tipo === "crear-cargo" && a.observacion.startsWith(MARCA_PUNTO13A), "el cargo lleva la marca del ajuste");
}
// Orden vieja con cargos incompletos (OR000061: cobró $123, cargado $60): solo la diferencia.
{
  const p = planPunto13A({ ordenesConSaldoAFavor: [orden({ codigo: "OR000061", aFavor: 63, abonos: [{ monto: 123, observacion: LEGACY }] })], cargosMarcados: [], nc: ncYaHecha });
  assert(p.acciones[0]?.tipo === "crear-cargo" && p.acciones[0].costo === 63, "orden vieja incompleta → cargo solo por la diferencia ($63)");
}

// ── Lo que NO es orden vieja no se toca ──────────────────────────────────────
assert(!esOrdenVieja(orden({ estado: "En Reparación" })), "una orden sin entregar no es 'vieja'");
assert(!esOrdenVieja(orden({ abonos: [{ monto: 150, observacion: "" }] })), "un abono del portal no es 'legacy'");
assert(!esOrdenVieja(orden({ abonos: [{ monto: 100, observacion: LEGACY }, { monto: 50, observacion: "" }] })), "si mezcla un abono del portal, no es 'vieja'");
{
  const p = planPunto13A({ ordenesConSaldoAFavor: [orden({ codigo: "OR000999", abonos: [{ monto: 150, observacion: "" }] })], cargosMarcados: [], nc: ncYaHecha });
  assert(p.acciones.length === 0 && p.bloqueos.length === 1, "saldo a favor desconocido → bloqueo, no se inventa un cargo");
}

// ── Casos revisados con el dueño ─────────────────────────────────────────────
{
  const caso = CASOS_PUNTO13A.find((c) => c.orden === "OR000366")!;
  const p = planPunto13A({ ordenesConSaldoAFavor: [orden({ codigo: "OR000366", aFavor: 165, abonos: [{ monto: 215, observacion: "" }] })], cargosMarcados: [], nc: ncYaHecha });
  assert(p.bloqueos.length === 0 && p.acciones.length === caso.cargos.length, "OR000366 → sus 5 cargos");
  assert(saldoDespuesDelAjuste(165, caso.cargos) === 0, "OR000366 queda en $0");
}
{
  const p = planPunto13A({ ordenesConSaldoAFavor: [orden({ codigo: "OR000397", aFavor: 85, abonos: [{ monto: 85, observacion: "" }] })], cargosMarcados: [], nc: ncYaHecha });
  assert(p.acciones[0]?.tipo === "crear-cargo" && p.acciones[0].nombre === "Batería Dell Original 3HWPP" && p.acciones[0].costo === 85, "OR000397 → batería Dell 3HWPP $85");
}
{
  const p = planPunto13A({ ordenesConSaldoAFavor: [orden({ codigo: "OR000443", aFavor: 40, abonos: [{ monto: 60, observacion: "" }] })], cargosMarcados: [], nc: ncYaHecha });
  assert(p.acciones.length === 0 && p.bloqueos.length === 1, "si el monto del caso cambió → bloqueo");
}
for (const c of CASOS_PUNTO13A) {
  assert(c.cargos.every((x) => x.costo > 0 && x.nombre.trim().length > 0), `${c.orden}: cargos con nombre y monto positivo`);
}

// ── Reanudar: cargo ya creado sin su línea ───────────────────────────────────
{
  const p = planPunto13A({
    ordenesConSaldoAFavor: [],
    cargosMarcados: [
      { id: "recCARGO1", ordenId: "recO1", ordenCodigo: "OR000074", nombre: CARGO_SISTEMA_ANTERIOR, costo: 150, tieneLinea: false },
      { id: "recCARGO2", ordenId: "recO2", ordenCodigo: "OR000058", nombre: CARGO_SISTEMA_ANTERIOR, costo: 93, tieneLinea: true },
    ],
    nc: ncYaHecha,
  });
  assert(p.acciones.length === 1 && p.acciones[0].tipo === "crear-linea" && p.acciones[0].cargoId === "recCARGO1", "solo completa la línea que falta");
}
// ── Ya aplicado → 0 acciones ─────────────────────────────────────────────────
assert(planPunto13A({ ordenesConSaldoAFavor: [], cargosMarcados: [], nc: ncYaHecha }).acciones.length === 0, "ya aplicado → 0 acciones");

// ── NC de prueba ─────────────────────────────────────────────────────────────
{
  const p = planPunto13A({ ordenesConSaldoAFavor: [], cargosMarcados: [], nc: ncPrueba() });
  const a = p.acciones[0];
  assert(a?.tipo === "nc-sin-credito" && a.ncId === NC_PRUEBA.id && a.campos["Saldo Disponible"] === 0, "NC de prueba → crédito $0");
}
assert(planPunto13A({ ordenesConSaldoAFavor: [], cargosMarcados: [], nc: ncPrueba({ saldoDisponible: 3 }) }).bloqueos.length === 1, "NC con otro saldo → bloqueo");
assert(planPunto13A({ ordenesConSaldoAFavor: [], cargosMarcados: [], nc: ncPrueba({ motivo: "Devolución" }) }).bloqueos.length === 1, "NC cuyo motivo ya no dice 'prueba' → bloqueo");

// ── Con la calculadora única: después del cargo, la orden queda "Pagado" ─────
{
  const sinCargos = { servicios: 0, productosDigitales: 0, repuestosHistoricos: 0, items: [], aprobadoSinArticulo: [], descuentos: [], cargosExistentes: new Set<string>() };
  const abonos = [{ id: "recA", monto: 150, estado: "Registrado" }];
  const antes = calcularEstadoCuenta({ cargos: sinCargos, abonos });
  const despues = calcularEstadoCuenta({ cargos: { ...sinCargos, servicios: 150 }, abonos });
  assert(antes.estadoPago === "saldo_a_favor" && antes.aFavor === 150, "antes: saldo a favor $150");
  assert(despues.estadoPago === "pagado" && despues.saldo === 0, "después: pagado, saldo $0");
}

if (fallos > 0) { console.error(`\n${fallos} prueba(s) fallaron.`); process.exit(1); }
