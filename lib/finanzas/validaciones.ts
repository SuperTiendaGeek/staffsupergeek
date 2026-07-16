// Reglas de integridad puras — sin red, testeables directo. Ver
// docs/DISENO_FASE20_1_FUNDACION.md §8/§2.2/§2.3b para la justificación de
// cada regla.

import type { CategoriaMovimiento, CuentaFinanciera, EstadoDistribucion, RubrosMonto, TipoMovimiento } from "@/types/finanzas";

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export const RUBROS_VACIOS: RubrosMonto = { capital: 0, utilidad: 0, iva: 0, repuestoExterno: 0 };

export function sumaRubros(rubros: RubrosMonto): number {
  return round2(rubros.capital + rubros.utilidad + rubros.iva + rubros.repuestoExterno);
}

/**
 * §2.2 — por defecto: Anticipo Cliente siempre "Sin distribuir"; si ya
 * vinieron rubros que suman el monto, "Distribuido"; un Ingreso nuevo sin
 * rubros queda "Pendiente de clasificar" (20.3 aún no existe); el resto
 * (egresos, movimientos internos) "No aplica".
 */
export function inferirEstadoDistribucion(
  tipo: TipoMovimiento,
  categoria: CategoriaMovimiento,
  monto: number,
  rubros: RubrosMonto
): EstadoDistribucion {
  if (categoria === "Anticipo Cliente") return "Sin distribuir";
  if (Math.abs(sumaRubros(rubros) - round2(monto)) <= 0.01 && sumaRubros(rubros) !== 0) return "Distribuido";
  if (tipo === "Ingreso") return "Pendiente de clasificar";
  return "No aplica";
}

/** §0 — identidad de integridad: rubros deben sumar el monto exacto (tolerancia $0.01) cuando Distribuido; vacíos en cualquier otro estado. */
export function validarSumaRubros(monto: number, rubros: RubrosMonto, estadoDistribucion: EstadoDistribucion): void {
  const suma = sumaRubros(rubros);
  if (estadoDistribucion === "Distribuido") {
    if (Math.abs(suma - round2(monto)) > 0.01) {
      throw new Error(`La suma de rubros ($${suma.toFixed(2)}) no coincide con el monto ($${monto.toFixed(2)}).`);
    }
    return;
  }
  if (suma !== 0) {
    throw new Error(`Los rubros deben venir vacíos cuando Estado Distribución es "${estadoDistribucion}".`);
  }
}

/** Ingreso: solo destino. Egreso: solo origen. Movimiento Interno: ambos, distintos entre sí. Ajuste: al menos uno. */
export function validarCuentasPorTipo(
  tipo: TipoMovimiento,
  cuentaOrigenId: string | null | undefined,
  cuentaDestinoId: string | null | undefined,
  options: { permitirCuentaFaltante?: boolean } = {}
): void {
  if (tipo === "Ingreso") {
    if (!cuentaDestinoId && !options.permitirCuentaFaltante) throw new Error("Un Ingreso requiere Cuenta Destino.");
    if (cuentaOrigenId) throw new Error("Un Ingreso no debe tener Cuenta Origen.");
    return;
  }
  if (tipo === "Egreso") {
    if (!cuentaOrigenId && !options.permitirCuentaFaltante) throw new Error("Un Egreso requiere Cuenta Origen.");
    if (cuentaDestinoId) throw new Error("Un Egreso no debe tener Cuenta Destino.");
    return;
  }
  if (tipo === "Movimiento Interno") {
    if (!cuentaOrigenId || !cuentaDestinoId) throw new Error("Un Movimiento Interno requiere Cuenta Origen y Cuenta Destino.");
    if (cuentaOrigenId === cuentaDestinoId) throw new Error("Cuenta Origen y Cuenta Destino no pueden ser la misma cuenta.");
    return;
  }
  // Ajuste
  if (!cuentaOrigenId && !cuentaDestinoId && !options.permitirCuentaFaltante) {
    throw new Error("Un Ajuste requiere al menos una cuenta (Origen o Destino).");
  }
}

/** §3 — la matriz de permisos vive como datos en Cuentas Financieras, no hardcodeada. */
export function validarTransferenciaPermitida(cuentaOrigen: CuentaFinanciera, cuentaDestino: CuentaFinanciera): void {
  const permitido =
    cuentaOrigen.permiteTransferirAIds.includes(cuentaDestino.id) ||
    cuentaDestino.permiteRecibirDeIds.includes(cuentaOrigen.id);
  if (!permitido) {
    throw new Error(`"${cuentaOrigen.nombre}" no puede transferir directamente a "${cuentaDestino.nombre}".`);
  }
}

export function validarCuentaActiva(cuenta: CuentaFinanciera): void {
  if (!cuenta.activa) throw new Error(`La cuenta "${cuenta.nombre}" está inactiva.`);
}

/**
 * §2.3b/§8 — política dividida por tipo:
 * - Movimiento Interno: rechaza si no hay saldo (100% virtual, no representa
 *   un hecho real que deba respetarse).
 * - Egreso/Ajuste con origen: nunca rechaza — devuelve si debe marcarse
 *   Alerta Descuadre, porque un Egreso siempre es un hecho ya ocurrido y el
 *   sistema es un espejo, no un guardián que pueda negarse a reflejarlo.
 *
 * Fase 20.5 §4.2 — una cuenta Tipo de Cuenta = "Tarjeta de Crédito" vive con
 * saldo negativo por diseño (es deuda, no dinero disponible): la deuda
 * normal de un Egreso/Ajuste NUNCA dispara Alerta Descuadre en una tarjeta
 * (con la lógica genérica de abajo, dispararía siempre — una alerta que
 * nunca se apaga no es una alerta). Lo único que se marca es superar
 * `TC Cupo`, si el dueño lo definió — mismo criterio "nunca bloquea,
 * alerta" que el resto de Egresos, solo que el umbral es el cupo, no $0.
 */
export function evaluarSaldoParaEgresoOMovimientoInterno(
  tipo: TipoMovimiento,
  saldoActualCuentaOrigen: number,
  monto: number,
  cuentaOrigen?: Pick<CuentaFinanciera, "tipo" | "tcCupo">
): { alertaDescuadre: boolean } {
  if ((tipo === "Egreso" || tipo === "Ajuste") && cuentaOrigen?.tipo === "Tarjeta de Crédito") {
    if (cuentaOrigen.tcCupo == null) return { alertaDescuadre: false };
    const deudaTrasElMovimiento = round2(-saldoActualCuentaOrigen + monto);
    return { alertaDescuadre: deudaTrasElMovimiento > cuentaOrigen.tcCupo };
  }

  const saldoInsuficiente = round2(saldoActualCuentaOrigen - monto) < 0;
  if (tipo === "Movimiento Interno") {
    if (saldoInsuficiente) {
      throw new Error(
        `Saldo insuficiente para el Movimiento Interno: se necesitan $${monto.toFixed(2)}, hay $${saldoActualCuentaOrigen.toFixed(2)} disponibles.`
      );
    }
    return { alertaDescuadre: false };
  }
  // Egreso / Ajuste con cuenta origen: se registra igual, solo se marca.
  return { alertaDescuadre: saldoInsuficiente };
}

export function validarComponentesPagoMixtoSumanTotal(componentes: number[], total: number): void {
  const suma = round2(componentes.reduce((acc, valor) => acc + valor, 0));
  if (Math.abs(suma - round2(total)) > 0.01) {
    throw new Error(`Los componentes de pago ($${suma.toFixed(2)}) no suman el total ($${total.toFixed(2)}).`);
  }
}
