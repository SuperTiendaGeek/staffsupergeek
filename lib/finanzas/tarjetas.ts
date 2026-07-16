import "server-only";

import type { CuentaFinanciera, EstadoTarjeta, Movimiento, ResultadoEstadoTarjeta } from "@/types/finanzas";
import { fetchCuentaById, fetchCuentasFinancieras } from "./cuentas";
import { ESTADOS_QUE_CUENTAN_PARA_SALDO } from "./movimientos-fields";
import { PreGoLiveError } from "./pre-go-live";
import { calcularSaldoCuenta, fetchMovimientosDeCuentaPorEstado } from "./saldos";
import { round2 } from "./validaciones";

// Fase 20.5 — Tarjetas de crédito (cuentas de deuda). Ver
// docs/DISENO_FASE20_5_TARJETAS.md §3 para el diseño completo aprobado.
// Todas las funciones de fecha usan UTC explícito (Date.UTC/getUTC*), nunca
// la zona horaria local del proceso — consistente con el resto de Finanzas,
// donde "Fecha del movimiento" se compara como string ISO 8601 (§3.2 del
// diseño). Esto hace que un corte del "día 5" caiga siempre en el mismo
// instante real sin importar en qué zona horaria corra el servidor o quien
// ejecute los tests localmente.

/** Días antes de la fecha de pago en que empieza a mostrarse la alerta. */
export const DIAS_ALERTA_PAGO_TARJETA = 3;

function diasEnMesUTC(anio: number, mesIndex: number): number {
  return new Date(Date.UTC(anio, mesIndex + 1, 0)).getUTCDate();
}

/**
 * "Clampea" un día deseado (1-31) al último día real del mes — resuelve el
 * día 31 en meses de 30 días y febrero (28 o 29, según año bisiesto) sin
 * ningún caso especial: simplemente nunca se pide un día que no existe.
 */
function fechaEnMesUTC(anio: number, mesIndex: number, diaDeseado: number): Date {
  const dia = Math.min(diaDeseado, diasEnMesUTC(anio, mesIndex));
  return new Date(Date.UTC(anio, mesIndex, dia));
}

/**
 * Corte más reciente ≤ hoy (hoy cuenta como corte si coincide exacto). El
 * mes puede irse a negativo (mesIndex - 1 en enero → -1) — Date.UTC
 * normaliza automáticamente el año (diciembre del año anterior); no hace
 * falta ningún caso especial de fin de año.
 */
export function fechaCorteMasReciente(hoy: Date, diaCorte: number): Date {
  const candidato = fechaEnMesUTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), diaCorte);
  if (candidato > hoy) return fechaEnMesUTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 1, diaCorte);
  return candidato;
}

/**
 * Próxima ocurrencia de "día de pago" que sea ≥ hoy. Deliberadamente
 * independiente del corte: no se intenta emparejar un corte específico con
 * su fecha de pago exacta (algunos bancos pagan el mismo mes, otros el
 * siguiente, y esa relación no es un dato que el sistema tenga) — el dueño
 * ya conoce ese emparejamiento de su propio estado de cuenta bancario; el
 * sistema solo refleja "cuándo cae la próxima vez ese día del mes".
 */
export function proximaFechaDePago(hoy: Date, diaPago: number): Date {
  const candidato = fechaEnMesUTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), diaPago);
  if (candidato >= hoy) return candidato;
  return fechaEnMesUTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, diaPago);
}

/** Diferencia de días de calendario en UTC — trunca ambas fechas a medianoche UTC antes de restar. */
function diasEntreUTC(a: Date, b: Date): number {
  const inicioA = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const inicioB = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((inicioB - inicioA) / 86_400_000);
}

/**
 * Pura — recibe el saldo y los movimientos ya resueltos, sin llamar a
 * Airtable. §3.1-§3.4 del diseño.
 */
export function calcularEstadoTarjetaPuro(
  cuenta: Pick<CuentaFinanciera, "id" | "tcDiaCorte" | "tcDiaPago" | "tcCupo">,
  saldoActual: number,
  movimientosDeLaCuenta: Movimiento[],
  hoy: Date
): EstadoTarjeta {
  const deudaActual = round2(-saldoActual);
  const cupoExcedido = cuenta.tcCupo != null && deudaActual > cuenta.tcCupo;

  if (!cuenta.tcDiaCorte) {
    // Sin TC Día de Corte configurado: se puede mostrar la deuda total,
    // pero no hay corte que calcular — ambos campos de período quedan
    // null/deudaActual (no hay forma de separar "período en curso").
    const pago = cuenta.tcDiaPago ? proximaFechaDePago(hoy, cuenta.tcDiaPago) : null;
    return {
      cuentaId: cuenta.id,
      deudaActual,
      fechaUltimoCorte: null,
      consumosPeriodoEnCurso: 0,
      saldoUltimoCorte: deudaActual,
      proximaFechaDePago: pago?.toISOString() ?? null,
      diasHastaPago: pago ? diasEntreUTC(hoy, pago) : null,
      cupo: cuenta.tcCupo,
      cupoExcedido,
    };
  }

  const corte = fechaCorteMasReciente(hoy, cuenta.tcDiaCorte);
  const corteISO = corte.toISOString();
  const consumosPeriodoEnCurso = round2(
    movimientosDeLaCuenta
      .filter((m) => m.tipo === "Egreso" && m.cuentaOrigenId === cuenta.id && m.fecha > corteISO)
      .reduce((acc, m) => acc + m.monto, 0)
  );
  const saldoUltimoCorte = round2(deudaActual - consumosPeriodoEnCurso);
  const pago = cuenta.tcDiaPago ? proximaFechaDePago(hoy, cuenta.tcDiaPago) : null;

  return {
    cuentaId: cuenta.id,
    deudaActual,
    fechaUltimoCorte: corteISO,
    consumosPeriodoEnCurso,
    saldoUltimoCorte,
    proximaFechaDePago: pago?.toISOString() ?? null,
    diasHastaPago: pago ? diasEntreUTC(hoy, pago) : null,
    cupo: cuenta.tcCupo,
    cupoExcedido,
  };
}

/**
 * Orquestador — fetch + delega en la función pura de arriba. Lanza
 * PreGoLiveError si la tarjeta no tiene Fecha de Corte (go-live) todavía —
 * mismo guard que cuadre/depósito/acreditación. Quien la llama para
 * construir una lista (ver listarEstadosTarjetas) debe capturar ese error
 * por tarjeta, no dejar que tumbe la lista completa.
 */
export async function calcularEstadoTarjeta(cuentaId: string, opciones?: { hoy?: Date }): Promise<EstadoTarjeta> {
  const cuenta = await fetchCuentaById(cuentaId);
  if (!cuenta) throw new Error(`Cuenta financiera ${cuentaId} no encontrada.`);
  if (!cuenta.fechaCorte) throw new PreGoLiveError();
  const hoy = opciones?.hoy ?? new Date();
  const [saldoActual, movimientos] = await Promise.all([
    calcularSaldoCuenta(cuentaId),
    fetchMovimientosDeCuentaPorEstado(cuentaId, cuenta.fechaCorte, ESTADOS_QUE_CUENTAN_PARA_SALDO),
  ]);
  return calcularEstadoTarjetaPuro(cuenta, saldoActual, movimientos, hoy);
}

/**
 * Fase 20.5 §6.1 (Corrección 2) — una tarjeta activa sin Fecha de Corte
 * (go-live) todavía no debe romper la lista completa: se marca
 * `disponible: false` y las demás se calculan normalmente. Cualquier error
 * que NO sea PreGoLiveError sí se propaga — no hay que esconder bugs reales
 * detrás de este guard.
 */
export async function listarEstadosTarjetas(hoy?: Date): Promise<ResultadoEstadoTarjeta[]> {
  const cuentas = await fetchCuentasFinancieras();
  const tarjetas = cuentas.filter((c) => c.tipo === "Tarjeta de Crédito" && c.activa);
  return Promise.all(
    tarjetas.map(async (cuenta): Promise<ResultadoEstadoTarjeta> => {
      try {
        const estado = await calcularEstadoTarjeta(cuenta.id, { hoy });
        return { cuentaId: cuenta.id, nombre: cuenta.nombre, disponible: true, estado };
      } catch (error) {
        if (error instanceof PreGoLiveError) {
          return { cuentaId: cuenta.id, nombre: cuenta.nombre, disponible: false };
        }
        throw error;
      }
    })
  );
}

/**
 * Fase 20.5 §3.6 (Corrección 3) — nunca se presenta un saldoUltimoCorte (ni
 * deudaActual) negativo crudo. `pendiente` es lo que falta pagar (≥0);
 * `saldoAFavor` es el sobrepago, si lo hay (≥0). Exactamente uno de los dos
 * es > 0, salvo que ambos sean $0 (cuadrado exacto).
 */
export function presentarPendienteDelCorte(saldoUltimoCorte: number): { pendiente: number; saldoAFavor: number } {
  return {
    pendiente: Math.max(0, round2(saldoUltimoCorte)),
    saldoAFavor: Math.max(0, round2(-saldoUltimoCorte)),
  };
}

/** Verdadero si esta tarjeta debe mostrarse en la alerta de pago próximo. */
export function estaEnVentanaDeAlerta(resultado: ResultadoEstadoTarjeta, diasAlerta: number = DIAS_ALERTA_PAGO_TARJETA): boolean {
  if (!resultado.disponible) return false;
  const { diasHastaPago, saldoUltimoCorte } = resultado.estado;
  if (diasHastaPago == null) return false;
  const { pendiente } = presentarPendienteDelCorte(saldoUltimoCorte);
  return diasHastaPago <= diasAlerta && pendiente > 0;
}
