import "server-only";

import type { Movimiento } from "@/types/finanzas";
import { fetchCuentaById, fetchCuentaPorNombre } from "./cuentas";
import { acreditarMovimientoPendiente, crearMovimiento, fetchMovimientoById } from "./movimientos";
import { algunaCuentaSinFechaCorte, PreGoLiveError } from "./pre-go-live";
import { round2 } from "./validaciones";

const CUENTA_DESTINO_ACREDITACION = "SGINGRESOS";

export type ResultadoAcreditacion = {
  movimiento: Movimiento;
  interno: Movimiento;
  // null exactamente cuando la comisión es $0 — no hay nada que ajustar
  // (Corrección 2, §3.4 del diseño: la completitud lo contempla, no se
  // crea un movimiento de monto $0).
  ajuste: Movimiento | null;
};

/**
 * Fase 20.3 §3.3/§3.4 — orquesta la acreditación completa de un pago en
 * tránsito (tarjeta/PayPhone): el movimiento original Pendiente pasa a
 * Acreditado (Paso A, `acreditarMovimientoPendiente`, sin tocar Monto/Cuenta/
 * Tipo/Categoría — inmutables) y se completan, por TIPO y no por cantidad
 * (Corrección 2), los movimientos compensatorios que falten: un Movimiento
 * Interno por el neto (Tránsito → SGINGRESOS) y, solo si la comisión es
 * mayor a $0, un Ajuste por la comisión (sale de Tránsito, se reconoce como
 * reducción de Rubro Utilidad — la única clasificación de rubro que esta
 * fase hace directamente, porque la regla de negocio ya es 100%
 * determinística: la comisión SIEMPRE es Rubro Utilidad).
 *
 * A diferencia de los Puentes 1/2 de la Fase 20.2 (que nunca lanzan, porque
 * son efectos secundarios de un hecho que ya ocurrió en otro lugar), esta
 * función SÍ puede lanzar — es la acción principal que el usuario ejecuta
 * en ese momento, no hay ningún hecho previo que proteger de un rollback, y
 * el usuario está presente para reintentar. El flujo es idempotente y
 * recuperable: un segundo intento con el mismo `montoNeto` completa
 * exactamente lo que faltó, sin duplicar nada.
 */
export async function procesarAcreditacion(
  movimientoId: string,
  input: { montoNeto: number; fecha: string; registradoPor: string }
): Promise<ResultadoAcreditacion> {
  // Corrección 3 — chequeo PRE_GO_LIVE explícito, antes de CUALQUIER lectura
  // que pudiera preceder a una mutación: ni el original ni ningún hijo se
  // tocan si el sistema contable todavía no está en vivo.
  const movimientoPrevio = await fetchMovimientoById(movimientoId);
  if (!movimientoPrevio) throw new Error(`Movimiento ${movimientoId} no encontrado.`);
  if (!movimientoPrevio.cuentaDestinoId) throw new Error("El movimiento no tiene Cuenta Destino resuelta.");

  const [cuentaTransito, sgIngresos] = await Promise.all([
    fetchCuentaById(movimientoPrevio.cuentaDestinoId),
    fetchCuentaPorNombre(CUENTA_DESTINO_ACREDITACION),
  ]);
  if (algunaCuentaSinFechaCorte([cuentaTransito, sgIngresos])) {
    throw new PreGoLiveError();
  }
  if (!sgIngresos) throw new Error(`Cuenta financiera "${CUENTA_DESTINO_ACREDITACION}" no encontrada.`);

  // Paso A o recuperación — flujo unificado (Corrección 2): no se separa en
  // ramas por cantidad de hijos, solo por el estado real del movimiento.
  let movimiento: Movimiento;
  if (movimientoPrevio.estado === "Pendiente") {
    movimiento = await acreditarMovimientoPendiente(movimientoId, { montoNeto: input.montoNeto, fecha: input.fecha });
  } else if (movimientoPrevio.estado === "Acreditado") {
    if (movimientoPrevio.montoNeto != null && round2(movimientoPrevio.montoNeto) !== round2(input.montoNeto)) {
      throw new Error(
        `El movimiento ${movimientoPrevio.movimientoId} ya fue acreditado con un Monto Neto distinto ($${movimientoPrevio.montoNeto.toFixed(2)}) — no se puede reintentar con $${input.montoNeto.toFixed(2)}.`
      );
    }
    movimiento = movimientoPrevio;
  } else {
    throw new Error(`No se puede acreditar un movimiento en estado "${movimientoPrevio.estado}".`);
  }

  // Completitud por TIPO de hijo, no por cantidad (Corrección 2).
  const hijosActuales = (await Promise.all(movimiento.compensadoPorIds.map((id) => fetchMovimientoById(id)))).filter(
    (h): h is Movimiento => !!h
  );
  const internoExistente = hijosActuales.find((h) => h.tipo === "Movimiento Interno") ?? null;
  const ajusteExistente = hijosActuales.find((h) => h.tipo === "Ajuste") ?? null;
  const comision = round2(movimiento.comision ?? 0);
  const necesitaAjuste = comision > 0;

  const interno =
    internoExistente ??
    (await crearMovimiento({
      tipo: "Movimiento Interno",
      origen: "Sistema",
      categoria: "Acreditación Pasarela",
      monto: movimiento.montoNeto!,
      cuentaOrigenId: movimiento.cuentaDestinoId!,
      cuentaDestinoId: sgIngresos.id,
      estado: "Confirmado",
      estadoDistribucion: "No aplica",
      fecha: input.fecha,
      registradoPor: input.registradoPor,
      reversaAId: movimiento.id,
    }));

  const ajuste = !necesitaAjuste
    ? null
    : (ajusteExistente ??
      (await crearMovimiento({
        tipo: "Ajuste",
        origen: "Sistema",
        categoria: "Acreditación Pasarela",
        monto: comision,
        cuentaOrigenId: movimiento.cuentaDestinoId!,
        estado: "Confirmado",
        estadoDistribucion: "Distribuido",
        rubros: { utilidad: comision, capital: 0, iva: 0, repuestoExterno: 0 },
        fecha: input.fecha,
        registradoPor: input.registradoPor,
        reversaAId: movimiento.id,
      })));

  return { movimiento, interno, ajuste };
}
