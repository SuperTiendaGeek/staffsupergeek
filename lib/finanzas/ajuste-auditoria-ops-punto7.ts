// Ajuste de datos de UNA SOLA VEZ — auditoría Técnicos y Operaciones, punto 7.
// Reglas PURAS; el script scripts/ajuste-auditoria-ops-punto7.ts lee, muestra
// la vista previa y, con --aplicar, escribe.
//
// 80 ingresos de ventas de mostrador (agosto–octubre 2026) quedaron sin
// "Cuenta Destino": el formulario pedía el código SRI "20" y no la cuenta. El
// dueño revisó una hoja con la cuenta sugerida para cada uno (por la
// referencia que escribió el vendedor) y la corrigió; este ajuste asigna la
// cuenta de su hoja. Los 3 de compensación con crédito de nota de crédito
// (código 15) no se tocan: no entró dinero nuevo.
//
// Son ingresos viejos: se marcan "Confirmado" aunque la cuenta sea de las
// que acreditan después (Mercado Pago, tarjetas). Ese dinero ya se acreditó
// hace tiempo; dejarlos "Pendiente" los mostraría "por acreditar" hoy.

export const MARCA_PUNTO7 = "Regularización auditoría ops punto 7";

/** Cuenta → opción del campo "Método" de Movimientos Financieros. */
export const METODO_POR_CUENTA: Record<string, string> = {
  "SGINGRESOS": "Transferencia bancaria",
  "Produbanco Ahorros": "Transferencia bancaria",
  "DeUna": "DeUna",
  "Mercado Pago": "Mercado Pago",
  "Caja Registradora": "Efectivo",
  "Tarjetas en Tránsito": "Tarjeta",
  "PayPal": "PayPal",
};

export type Asignacion = { movimientoId: string; cuenta: string; monto: number; documento?: string };

export type LecturaMovimiento = {
  existe: boolean;
  tipo: string;
  origen: string;
  monto: number;
  cuentaDestinoIds: string[];
  estado: string;
  observacion: string;
};

export type AccionPunto7 = { movimientoId: string; descripcion: string; campos: Record<string, unknown> };
export type PlanPunto7 = { acciones: AccionPunto7[]; bloqueos: string[]; yaBien: number };

export function planPunto7(input: {
  asignaciones: readonly Asignacion[];
  movimientos: ReadonlyMap<string, LecturaMovimiento>;
  cuentas: ReadonlyMap<string, string>; // nombre → record id
  fecha: string;
}): PlanPunto7 {
  const acciones: AccionPunto7[] = [];
  const bloqueos: string[] = [];
  let yaBien = 0;
  const vistos = new Set<string>();
  for (const a of input.asignaciones) {
    const etiqueta = a.documento ? `${a.documento} ($${a.monto.toFixed(2)})` : a.movimientoId;
    if (vistos.has(a.movimientoId)) { bloqueos.push(`${etiqueta}: aparece dos veces en la hoja`); continue; }
    vistos.add(a.movimientoId);
    const cuentaId = input.cuentas.get(a.cuenta);
    const metodo = METODO_POR_CUENTA[a.cuenta];
    if (!cuentaId || !metodo) { bloqueos.push(`${etiqueta}: la cuenta "${a.cuenta}" no existe en Finanzas`); continue; }
    const m = input.movimientos.get(a.movimientoId);
    if (!m || !m.existe) { bloqueos.push(`${etiqueta}: el movimiento ya no existe`); continue; }
    if (m.tipo !== "Ingreso" || m.origen !== "Facturación") { bloqueos.push(`${etiqueta}: no es un ingreso de Facturación`); continue; }
    if (Math.abs(m.monto - a.monto) > 0.005) { bloqueos.push(`${etiqueta}: el monto cambió ($${m.monto.toFixed(2)})`); continue; }
    if (m.estado === "Anulado") { bloqueos.push(`${etiqueta}: el movimiento está anulado`); continue; }
    if (m.cuentaDestinoIds.length > 0) {
      if (m.cuentaDestinoIds[0] === cuentaId) { yaBien++; continue; }
      bloqueos.push(`${etiqueta}: ya tiene otra cuenta (no se pisa)`);
      continue;
    }
    const nota = `[${input.fecha}] ${MARCA_PUNTO7}: cuenta ${a.cuenta} asignada según la hoja revisada por el dueño.`;
    acciones.push({
      movimientoId: a.movimientoId,
      descripcion: `${etiqueta} → ${a.cuenta}`,
      campos: {
        "Cuenta Destino (Finanzas)": [cuentaId],
        "Método": metodo,
        "Estado del Movimiento": "Confirmado",
        "Alerta Descuadre": false,
        "Observación": m.observacion.trim() ? `${m.observacion.trim()}\n${nota}` : nota,
      },
    });
  }
  return { acciones, bloqueos, yaBien };
}

/** Resumen por cuenta (cantidad y monto) para la vista previa. */
export function resumenPorCuenta(acciones: readonly AccionPunto7[], asignaciones: readonly Asignacion[]) {
  const porId = new Map(asignaciones.map((a) => [a.movimientoId, a]));
  const out = new Map<string, { cantidad: number; monto: number }>();
  for (const ac of acciones) {
    const a = porId.get(ac.movimientoId);
    if (!a) continue;
    const r = out.get(a.cuenta) ?? { cantidad: 0, monto: 0 };
    r.cantidad++; r.monto = Math.round((r.monto + a.monto) * 100) / 100;
    out.set(a.cuenta, r);
  }
  return out;
}
