import "server-only";

import type { Cuadre, CrearCuadreInput, EstadoAjusteCuadre, EstadoCuadre, Movimiento } from "@/types/finanzas";
import {
  airtableMutation,
  cleanString,
  compactFields,
  firstLinkedId,
  firstNumber,
  fetchRecordById,
  fetchRecordsByIds,
  tableUrl,
  type AirtableMutationResponse,
  type AirtableRecord,
} from "./airtable-client";
import { fetchCuentaById } from "./cuentas";
import { crearMovimiento, fetchMovimientoById } from "./movimientos";
import { algunaCuentaSinFechaCorte, PreGoLiveError } from "./pre-go-live";
import { calcularSaldoCuenta } from "./saldos";
import { round2 } from "./validaciones";

// Fase 20.4 — tabla nueva "Finanzas Cuadres" (arqueo de caja). Un cuadre NUNCA
// mueve dinero por sí mismo — es una verificación histórica; cuando sí hay
// que mover dinero (registrar la diferencia), eso vuelve a pasar por
// crearMovimiento, la única puerta de escritura de movimientos.
const TABLA_CUADRES = "Finanzas Cuadres";

const CUADRES_FIELDS = {
  cuadreId: "Cuadre ID",
  cuenta: "Cuenta",
  saldoEsperado: "Saldo Esperado",
  montoContado: "Monto Contado",
  diferencia: "Diferencia",
  estado: "Estado",
  estadoAjuste: "Estado de Ajuste",
  movimientoAjuste: "Movimiento de Ajuste",
  observacion: "Observación",
  realizadoPor: "Realizado Por",
  fecha: "Fecha",
  fechaCreacion: "Fecha de creación",
} as const;

function generarCuadreId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = String(now.getTime()).slice(-5);
  return `CUADRE-${date}-${time}`;
}

function mapCuadre(record: AirtableRecord): Cuadre {
  const f = record.fields;
  const F = CUADRES_FIELDS;
  return {
    id: record.id,
    cuadreId: cleanString(f[F.cuadreId]) || record.id,
    cuentaId: firstLinkedId(f[F.cuenta]),
    saldoEsperado: firstNumber(f[F.saldoEsperado]) ?? 0,
    montoContado: firstNumber(f[F.montoContado]) ?? 0,
    diferencia: firstNumber(f[F.diferencia]) ?? 0,
    estado: cleanString(f[F.estado]),
    estadoAjuste: cleanString(f[F.estadoAjuste]),
    movimientoAjusteId: firstLinkedId(f[F.movimientoAjuste]),
    observacion: cleanString(f[F.observacion]) || undefined,
    realizadoPor: cleanString(f[F.realizadoPor]) || undefined,
    fecha: cleanString(f[F.fecha]) || record.createdTime || "",
    fechaCreacion: cleanString(f[F.fechaCreacion]) || record.createdTime || undefined,
  };
}

/**
 * Única puerta de escritura de cuadres nuevos — mismo criterio que
 * `crearMovimiento`: valida todo antes de tocar Airtable. `Saldo Esperado`/
 * `Diferencia`/`Estado` se calculan una sola vez aquí y quedan congelados —
 * un cuadre es un hecho histórico ("esto fue lo que el sistema decía a las
 * 18:40"), no un valor que deba recalcularse cada vez que se lee.
 */
export async function crearCuadre(input: CrearCuadreInput): Promise<Cuadre> {
  const cuenta = await fetchCuentaById(input.cuentaId);
  if (!cuenta) throw new Error(`Cuenta financiera ${input.cuentaId} no encontrada.`);
  if (algunaCuentaSinFechaCorte([cuenta])) throw new PreGoLiveError();

  const saldoEsperado = await calcularSaldoCuenta(input.cuentaId);
  const diferencia = round2(input.montoContado - saldoEsperado);
  const estado: EstadoCuadre = diferencia === 0 ? "Cuadrado" : diferencia > 0 ? "Sobrante" : "Faltante";
  if (diferencia !== 0 && !cleanString(input.observacion)) {
    throw new Error("La observación es obligatoria cuando el cuadre tiene una diferencia.");
  }
  const estadoAjuste: EstadoAjusteCuadre = diferencia === 0 ? "Sin diferencia" : "Pendiente de revisión";

  const F = CUADRES_FIELDS;
  const fields = compactFields({
    [F.cuadreId]: generarCuadreId(),
    [F.cuenta]: [input.cuentaId],
    [F.saldoEsperado]: saldoEsperado,
    [F.montoContado]: input.montoContado,
    [F.diferencia]: diferencia,
    [F.estado]: estado,
    [F.estadoAjuste]: estadoAjuste,
    [F.observacion]: cleanString(input.observacion),
    [F.realizadoPor]: input.realizadoPor,
    [F.fecha]: cleanString(input.fecha) || new Date().toISOString(),
    [F.fechaCreacion]: new Date().toISOString(),
  });

  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(TABLA_CUADRES), {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }] }),
  });
  const created = response.records?.[0];
  if (!created) throw new Error("Airtable no devolvió el cuadre creado.");
  return mapCuadre(created);
}

export async function fetchCuadreById(id: string): Promise<Cuadre | null> {
  const recordId = cleanString(id);
  if (!recordId) return null;
  const record = await fetchRecordById(TABLA_CUADRES, recordId);
  return record ? mapCuadre(record) : null;
}

/**
 * Registra el movimiento de ajuste correspondiente a la diferencia de un
 * cuadre — faltante → Ajuste con Cuenta Origen (se comporta como Egreso
 * para el saldo); sobrante → Ajuste con Cuenta Destino (se comporta como
 * Ingreso). Clasifica su rubro al nacer (Rubro Utilidad = |diferencia|,
 * Distribuido) — mismo precedente que el Ajuste-hijo de comisión de la
 * acreditación (20.3 §3.3): la regla de negocio ya es 100% determinística
 * ("faltante reduce Utilidad, sobrante la aumenta"), no requiere ninguna UI
 * de clasificación general.
 *
 * Idempotente: si el cuadre ya tiene un `Movimiento de Ajuste` vinculado
 * (recuperación de un intento anterior que falló después de crear el
 * movimiento pero antes del PATCH final), no crea un segundo — solo
 * asegura que `Estado de Ajuste` quede en "Ajustado".
 */
export async function registrarAjusteDeCuadre(
  cuadreId: string,
  input: { fecha?: string; registradoPor: string }
): Promise<{ cuadre: Cuadre; movimiento: Movimiento }> {
  const cuadre = await fetchCuadreById(cuadreId);
  if (!cuadre) throw new Error(`Cuadre ${cuadreId} no encontrado.`);
  if (cuadre.diferencia === 0) throw new Error("Este cuadre no tiene diferencia — no hay nada que ajustar.");
  if (!cuadre.cuentaId) throw new Error("El cuadre no tiene Cuenta resuelta.");

  let movimiento: Movimiento;
  if (cuadre.movimientoAjusteId) {
    const existente = await fetchMovimientoById(cuadre.movimientoAjusteId);
    if (!existente) throw new Error(`Movimiento de ajuste ${cuadre.movimientoAjusteId} no encontrado.`);
    movimiento = existente;
  } else {
    const monto = round2(Math.abs(cuadre.diferencia));
    const esFaltante = cuadre.diferencia < 0;
    movimiento = await crearMovimiento({
      tipo: "Ajuste",
      origen: "Manual",
      categoria: "Ajuste de Caja",
      monto,
      cuentaOrigenId: esFaltante ? cuadre.cuentaId : undefined,
      cuentaDestinoId: esFaltante ? undefined : cuadre.cuentaId,
      estado: "Confirmado",
      estadoDistribucion: "Distribuido",
      rubros: { utilidad: monto, capital: 0, iva: 0, repuestoExterno: 0 },
      fecha: input.fecha,
      observacion: `Ajuste de ${esFaltante ? "faltante" : "sobrante"} — ${cuadre.cuadreId}`,
      registradoPor: input.registradoPor,
    });
  }

  const F = CUADRES_FIELDS;
  const fields = compactFields({
    [F.movimientoAjuste]: [movimiento.id],
    [F.estadoAjuste]: "Ajustado" as EstadoAjusteCuadre,
  });
  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(TABLA_CUADRES), {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id: cuadre.id, fields }] }),
  });
  const updated = response.records?.[0];
  if (!updated) throw new Error("Airtable no devolvió el cuadre actualizado.");
  return { cuadre: mapCuadre(updated), movimiento };
}

/**
 * Patrón seguro de siempre: nunca se filtra `Finanzas Cuadres` por su campo
 * de link `Cuenta` — se lee el inverso (`cuadresIds`) ya presente en la
 * Cuenta y se resuelve por `fetchRecordsByIds`.
 */
export async function listarCuadresDeCuenta(cuentaId: string, limit?: number): Promise<Cuadre[]> {
  const cuenta = await fetchCuentaById(cuentaId);
  if (!cuenta) throw new Error(`Cuenta financiera ${cuentaId} no encontrada.`);
  const registros = await fetchRecordsByIds(TABLA_CUADRES, cuenta.cuadresIds);
  const cuadres = registros.map(mapCuadre).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  return typeof limit === "number" ? cuadres.slice(0, limit) : cuadres;
}

export async function fetchUltimoCuadre(cuentaId: string): Promise<Cuadre | null> {
  const [ultimo] = await listarCuadresDeCuenta(cuentaId, 1);
  return ultimo ?? null;
}

export { CUADRES_FIELDS, TABLA_CUADRES };
