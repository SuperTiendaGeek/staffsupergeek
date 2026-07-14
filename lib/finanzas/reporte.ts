import "server-only";

import type { Cuadre } from "@/types/finanzas";
import { fetchRecordsByIds, firstLinkedId, type AirtableRecord } from "./airtable-client";
import { fetchCuentasFinancieras } from "./cuentas";
import { listarCuadresDeCuenta } from "./cuadres";
import { listarMovimientos } from "./movimientos";
import { ESTADOS_QUE_CUENTAN_PARA_SALDO } from "./movimientos-fields";
import { ABONOS_FIELDS, ABONOS_TABLE } from "./puentes/abonos";
import { calcularAnticiposSinFacturar, calcularPorAcreditarCuenta, calcularSaldoCuenta } from "./saldos";
import { round2 } from "./validaciones";

const ESTADOS_VALIDOS = ESTADOS_QUE_CUENTAN_PARA_SALDO as readonly string[];

export type OrigenNegocio = "mostrador" | "ordenes" | "operaciones" | "otros";

export type MovimientoInternoDelDia = {
  id: string;
  movimientoId: string;
  monto: number;
  categoria: string;
  fecha: string;
  cuentaOrigenNombre: string | null;
  cuentaDestinoNombre: string | null;
};

export type ReporteDiario = {
  desde: string;
  hasta: string;
  ingresos: {
    total: number;
    porOrigenNegocio: Record<OrigenNegocio, number>;
    porMetodo: Record<string, number>;
  };
  egresos: {
    total: number;
    porCategoria: Record<string, number>;
  };
  // Con signo: negativo = costo neto del día (comisiones + faltantes),
  // positivo = ganancia neta (sobrantes) — ver §3.4 del diseño.
  ajustes: {
    total: number;
    porCategoria: Record<string, number>;
  };
  movimientosInternos: MovimientoInternoDelDia[];
  saldoCajaActual: number;
  cuadreDelDia: Cuadre | null;
  anticiposSinFacturar: number;
  porAcreditar: number;
};

/**
 * §3.2 del diseño — mapeo directo por Categoría, salvo "Anticipo Cliente"
 * (resuelto aparte, ver `resolverBucketAnticipos`).
 */
function bucketPorCategoria(categoria: string): OrigenNegocio | null {
  if (categoria === "Venta Mostrador") return "mostrador";
  if (categoria === "Servicio Reparación" || categoria === "Repuesto") return "ordenes";
  if (categoria === "Venta Producto" || categoria === "Producto Digital") return "operaciones";
  return null;
}

/**
 * §3.2 — un solo `fetchRecordsByIds` para todos los anticipos del rango,
 * nunca N+1 ni parseo de `Observación`. Precedencia: si el Abono está
 * aplicado a Orden Y Operación a la vez (caso combinado, 20.2 §1.2), va a
 * Órdenes — mismo criterio que la referencia legible del Puente 1 ("Abono
 * sobre Orden #X (Operación #Y)", Orden primero). Sin Abono resoluble →
 * Otros ingresos, nunca lanza.
 */
async function resolverBucketAnticipos(abonoIds: string[]): Promise<Map<string, OrigenNegocio>> {
  const idsUnicos = Array.from(new Set(abonoIds));
  const resultado = new Map<string, OrigenNegocio>();
  if (!idsUnicos.length) return resultado;

  const abonos = await fetchRecordsByIds(ABONOS_TABLE, idsUnicos);
  const abonoPorId = new Map<string, AirtableRecord>(abonos.map((a) => [a.id, a]));

  for (const abonoId of idsUnicos) {
    const abono = abonoPorId.get(abonoId);
    if (!abono) {
      resultado.set(abonoId, "otros");
      continue;
    }
    const tieneOrden = !!firstLinkedId(abono.fields[ABONOS_FIELDS.aplicadoAOrden]);
    const tieneOperacion = !!firstLinkedId(abono.fields[ABONOS_FIELDS.aplicadoAOperacion]);
    resultado.set(abonoId, tieneOrden ? "ordenes" : tieneOperacion ? "operaciones" : "otros");
  }
  return resultado;
}

/**
 * §3.1 del diseño — parametrizada por rango de fechas, no por "hoy": la UI
 * de esta fase solo expone un día, pero un reporte mensual futuro sería la
 * misma función con otros límites, sin tocar este archivo.
 *
 * Consulta con margen de ±1 día (evita depender de la semántica exacta de
 * IS_AFTER/IS_BEFORE en el borde) + filtro exacto en memoria:
 * `desde <= fecha < hasta`.
 *
 * §3.7 (Corrección 1) — comportamiento intencional con acreditaciones
 * cruzadas de día: el bucket de Ingresos agrupa por `Fecha del movimiento`
 * (la fecha de la venta, inmutable). Una venta acreditada días después de
 * su propia fecha aparece retroactivamente en el reporte de SU día de venta
 * una vez que su Estado pasa a Acreditado — nunca en el día de la
 * acreditación. Los hijos (Interno/Ajuste) sí llevan la fecha de la
 * acreditación. Por eso la identidad `Ingresos − Egresos + Ajustes = cambio
 * neto de cuentas` solo cierra exacta dentro de un mismo reporte cuando
 * venta y acreditación caen el mismo día — no es un bug, es la fecha real
 * de cada hecho económico.
 */
export async function calcularReporteDiario(input: { desde: string; hasta: string }): Promise<ReporteDiario> {
  const cuentas = await fetchCuentasFinancieras();
  const nombrePorCuenta = new Map(cuentas.map((c) => [c.id, c.nombre]));
  const cajaId = cuentas.find((c) => c.nombre === "Caja Registradora")?.id ?? null;

  const margenMs = 24 * 60 * 60 * 1000;
  const desdeAmplio = new Date(new Date(input.desde).getTime() - margenMs).toISOString();
  const hastaAmplio = new Date(new Date(input.hasta).getTime() + margenMs).toISOString();

  const movimientosAmplios = await listarMovimientos({ desde: desdeAmplio, hasta: hastaAmplio, maxRecords: 500 });
  const movimientos = movimientosAmplios.filter(
    (mov) => mov.fecha >= input.desde && mov.fecha < input.hasta && ESTADOS_VALIDOS.includes(mov.estado)
  );

  // --- Ingresos ---
  const ingresosMovs = movimientos.filter((mov) => mov.tipo === "Ingreso");
  const anticipoAbonoIds = ingresosMovs
    .filter((mov) => mov.categoria === "Anticipo Cliente")
    .map((mov) => mov.abonoIds[0])
    .filter((id): id is string => !!id);
  const bucketPorAbono = await resolverBucketAnticipos(anticipoAbonoIds);

  const porOrigenNegocio: Record<OrigenNegocio, number> = { mostrador: 0, ordenes: 0, operaciones: 0, otros: 0 };
  const porMetodo: Record<string, number> = {};
  let ingresosTotal = 0;

  for (const mov of ingresosMovs) {
    ingresosTotal = round2(ingresosTotal + mov.monto);
    const metodoKey = mov.metodo || "Sin método";
    porMetodo[metodoKey] = round2((porMetodo[metodoKey] ?? 0) + mov.monto);

    let bucket = bucketPorCategoria(mov.categoria);
    if (!bucket) {
      if (mov.categoria === "Anticipo Cliente") {
        const abonoId = mov.abonoIds[0];
        bucket = (abonoId && bucketPorAbono.get(abonoId)) || "otros";
      } else {
        bucket = "otros";
      }
    }
    porOrigenNegocio[bucket] = round2(porOrigenNegocio[bucket] + mov.monto);
  }

  // --- Egresos ---
  const egresosMovs = movimientos.filter((mov) => mov.tipo === "Egreso");
  const egresosPorCategoria: Record<string, number> = {};
  let egresosTotal = 0;
  for (const mov of egresosMovs) {
    egresosTotal = round2(egresosTotal + mov.monto);
    egresosPorCategoria[mov.categoria] = round2((egresosPorCategoria[mov.categoria] ?? 0) + mov.monto);
  }

  // --- Ajustes (línea propia, con signo — §3.4) ---
  const ajusteMovs = movimientos.filter((mov) => mov.tipo === "Ajuste");
  const ajustesPorCategoria: Record<string, number> = {};
  let ajustesTotal = 0;
  for (const mov of ajusteMovs) {
    const signo = mov.cuentaDestinoId ? mov.monto : -mov.monto;
    ajustesTotal = round2(ajustesTotal + signo);
    ajustesPorCategoria[mov.categoria] = round2((ajustesPorCategoria[mov.categoria] ?? 0) + signo);
  }

  // --- Movimientos internos ---
  const movimientosInternos: MovimientoInternoDelDia[] = movimientos
    .filter((mov) => mov.tipo === "Movimiento Interno")
    .map((mov) => ({
      id: mov.id,
      movimientoId: mov.movimientoId,
      monto: mov.monto,
      categoria: mov.categoria,
      fecha: mov.fecha,
      cuentaOrigenNombre: mov.cuentaOrigenId ? (nombrePorCuenta.get(mov.cuentaOrigenId) ?? null) : null,
      cuentaDestinoNombre: mov.cuentaDestinoId ? (nombrePorCuenta.get(mov.cuentaDestinoId) ?? null) : null,
    }));

  // --- Saldo Caja actual + cuadre del día ---
  let saldoCajaActual = 0;
  let cuadreDelDia: Cuadre | null = null;
  if (cajaId) {
    saldoCajaActual = await calcularSaldoCuenta(cajaId);
    const cuadresCaja = await listarCuadresDeCuenta(cajaId);
    cuadreDelDia = cuadresCaja.find((c) => c.fecha >= input.desde && c.fecha < input.hasta) ?? null;
  }

  // --- Globales, reutilizados tal cual (nunca acotados al rango) ---
  const cuentasTransito = cuentas.filter((c) => c.tipo === "Tránsito");
  const porAcreditarPorCuenta = await Promise.all(cuentasTransito.map((c) => calcularPorAcreditarCuenta(c.id)));
  const porAcreditar = round2(porAcreditarPorCuenta.reduce((acc, v) => acc + v, 0));
  const anticiposSinFacturar = await calcularAnticiposSinFacturar();

  return {
    desde: input.desde,
    hasta: input.hasta,
    ingresos: { total: ingresosTotal, porOrigenNegocio, porMetodo },
    egresos: { total: egresosTotal, porCategoria: egresosPorCategoria },
    ajustes: { total: ajustesTotal, porCategoria: ajustesPorCategoria },
    movimientosInternos,
    saldoCajaActual,
    cuadreDelDia,
    anticiposSinFacturar,
    porAcreditar,
  };
}
