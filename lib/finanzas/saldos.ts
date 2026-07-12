import type { CategoriaMovimiento, EstadoDistribucion, Rubro } from "@/types/finanzas";
import { airtableRequest, fetchRecordsByIds, getClient, tableUrl, type AirtableListResponse } from "./airtable-client";
import { fetchCuentaById } from "./cuentas";
import { ESTADOS_QUE_CUENTAN_PARA_SALDO, MOVIMIENTOS_FIELDS, mapMovimiento } from "./movimientos-fields";
import { conResolucionDeTablaMovimientos } from "./table-names";
import { round2 } from "./validaciones";

/**
 * §2.3b — todos los movimientos (en alguno de `estados`, con fecha ≥ Fecha
 * de Corte de la cuenta) donde la cuenta participa, ya sea como origen o
 * como destino. Se leen por RECORD_ID() a partir de los ids que ya trae la
 * propia Cuenta en sus campos inversos — nunca se filtra Movimientos por
 * campo de link.
 *
 * Sin `Fecha de Corte` todavía (cuenta no ha pasado por el go-live del
 * checklist, §6 paso 9), la cuenta no está "viva" para el sistema — ningún
 * movimiento cuenta, ni siquiera los legacy ya Confirmado. Antes de este fix,
 * `fechaCorte` vacío hacía que el filtro de fecha nunca excluyera nada (el
 * `&&` cortocircuitaba a `false`), así que una cuenta sin corte mostraba la
 * suma de TODO su histórico en vez de $0.
 *
 * Generalizada en la Fase 20.2 (antes solo aceptaba
 * `ESTADOS_QUE_CUENTAN_PARA_SALDO`) para que `calcularPorAcreditarCuenta`
 * pueda reusarla con `["Pendiente"]` sin duplicar el fetch — mismo
 * comportamiento exacto para los llamadores existentes (`calcularSaldoCuenta`/
 * `calcularSaldoRubroCuenta` siguen pasando `ESTADOS_QUE_CUENTAN_PARA_SALDO`,
 * sin cambio de resultado; cubierto por el test de no-regresión §7 #11).
 */
async function fetchMovimientosDeCuentaPorEstado(cuentaId: string, fechaCorte: string | null, estados: readonly string[]) {
  if (!fechaCorte) return [];

  const cuenta = await fetchCuentaById(cuentaId);
  if (!cuenta) throw new Error(`Cuenta financiera ${cuentaId} no encontrada.`);

  const ids = Array.from(new Set([...cuenta.movimientosOrigenIds, ...cuenta.movimientosDestinoIds]));
  if (!ids.length) return [];

  const registros = await conResolucionDeTablaMovimientos(getClient(), (nombreTabla) =>
    fetchRecordsByIds(tableUrl(nombreTabla), ids)
  );

  const movimientos = registros.map(mapMovimiento);
  return movimientos.filter((mov) => {
    if (!estados.includes(mov.estado)) return false;
    if (mov.fecha && mov.fecha < fechaCorte) return false;
    return true;
  });
}

/**
 * §2.3b — saldo(cuenta) = SaldoInicial + Σ Monto[destino] − Σ Monto[origen],
 * solo movimientos ≥ Fecha de Corte.
 *
 * Sin `Fecha de Corte` (cuenta que todavía no pasó por el go-live, §6 paso
 * 9), el saldo es $0 explícitamente — no se suma ni siquiera `Saldo
 * Inicial`, para no dar un número engañoso si alguien lo llena antes que la
 * fecha de corte (ambos se cargan juntos, en el mismo paso).
 */
export async function calcularSaldoCuenta(cuentaId: string, options?: { hasta?: Date }): Promise<number> {
  const cuenta = await fetchCuentaById(cuentaId);
  if (!cuenta) throw new Error(`Cuenta financiera ${cuentaId} no encontrada.`);
  if (!cuenta.fechaCorte) return 0;

  const movimientos = await fetchMovimientosDeCuentaPorEstado(cuentaId, cuenta.fechaCorte, ESTADOS_QUE_CUENTAN_PARA_SALDO);
  let saldo = cuenta.saldoInicial;
  for (const mov of movimientos) {
    if (options?.hasta && mov.fecha && new Date(mov.fecha) > options.hasta) continue;
    if (mov.cuentaDestinoId === cuentaId) saldo += mov.monto;
    if (mov.cuentaOrigenId === cuentaId) saldo -= mov.monto;
  }
  return round2(saldo);
}

/** §2.3b — saldo por rubro dentro de una cuenta, sin saldo inicial (el dinero contado a mano nace sin clasificar). */
export async function calcularSaldoRubroCuenta(cuentaId: string, rubro: Rubro): Promise<number> {
  const cuenta = await fetchCuentaById(cuentaId);
  if (!cuenta) throw new Error(`Cuenta financiera ${cuentaId} no encontrada.`);

  const movimientos = await fetchMovimientosDeCuentaPorEstado(cuentaId, cuenta.fechaCorte, ESTADOS_QUE_CUENTAN_PARA_SALDO);
  let saldo = 0;
  for (const mov of movimientos) {
    const valor = mov.rubros[rubro];
    if (mov.cuentaDestinoId === cuentaId) saldo += valor;
    if (mov.cuentaOrigenId === cuentaId) saldo -= valor;
  }
  return round2(saldo);
}

/**
 * Fase 20.2 §4.3 (Corrección 2) — dinero "en camino" de una cuenta de
 * tránsito: movimientos `Pendiente` que la tienen como destino/origen, sin
 * sumar `Saldo Inicial` (un saldo inicial nunca es "pendiente", es un hecho
 * ya contado a mano el día del corte). No cuenta para ningún saldo
 * disponible — es puramente informativo para que el dueño sepa cuánto
 * dinero real está en camino de acreditarse (Fase 20.4).
 */
export async function calcularPorAcreditarCuenta(cuentaId: string): Promise<number> {
  const cuenta = await fetchCuentaById(cuentaId);
  if (!cuenta) throw new Error(`Cuenta financiera ${cuentaId} no encontrada.`);

  const movimientos = await fetchMovimientosDeCuentaPorEstado(cuentaId, cuenta.fechaCorte, ["Pendiente"]);
  let total = 0;
  for (const mov of movimientos) {
    if (mov.cuentaDestinoId === cuentaId) total += mov.monto;
    if (mov.cuentaOrigenId === cuentaId) total -= mov.monto;
  }
  return round2(total);
}

/** Dinero de la cuenta que hoy no está clasificado en ningún rubro (anticipos + pendientes de clasificar + el propio saldo inicial). */
export async function calcularSaldoSinClasificarCuenta(cuentaId: string): Promise<number> {
  const [saldo, capital, utilidad, iva, repuestoExterno] = await Promise.all([
    calcularSaldoCuenta(cuentaId),
    calcularSaldoRubroCuenta(cuentaId, "capital"),
    calcularSaldoRubroCuenta(cuentaId, "utilidad"),
    calcularSaldoRubroCuenta(cuentaId, "iva"),
    calcularSaldoRubroCuenta(cuentaId, "repuestoExterno"),
  ]);
  return round2(saldo - (capital + utilidad + iva + repuestoExterno));
}

function buildFilterByFormula(filtros: {
  categoria?: CategoriaMovimiento;
  estadoDistribucion?: EstadoDistribucion;
  estados?: readonly string[];
}) {
  const partes: string[] = [];
  if (filtros.categoria) partes.push(`{${MOVIMIENTOS_FIELDS.categoria}}='${filtros.categoria}'`);
  if (filtros.estadoDistribucion) partes.push(`{${MOVIMIENTOS_FIELDS.estadoDistribucion}}='${filtros.estadoDistribucion}'`);
  if (filtros.estados?.length) {
    partes.push(`OR(${filtros.estados.map((estado) => `{${MOVIMIENTOS_FIELDS.estado}}='${estado}'`).join(",")})`);
  }
  if (!partes.length) return undefined;
  return partes.length === 1 ? partes[0] : `AND(${partes.join(",")})`;
}

/**
 * §2.3b — global, no por cuenta. `Categoría`/`Estado Distribución`/`Estado
 * del Movimiento` no son campos de link, así que filtrar la tabla completa
 * por ellos no viola el patrón seguro (ese patrón es solo para campos de link).
 */
export async function calcularAnticiposSinFacturar(): Promise<number> {
  const formula = buildFilterByFormula({
    categoria: "Anticipo Cliente",
    estadoDistribucion: "Sin distribuir",
    estados: ESTADOS_QUE_CUENTAN_PARA_SALDO,
  });

  const registros = await conResolucionDeTablaMovimientos(getClient(), async (nombreTabla) => {
    const records: Awaited<ReturnType<typeof airtableRequest<AirtableListResponse>>>["records"] = [];
    let offset: string | undefined;
    do {
      const url = new URL(tableUrl(nombreTabla));
      url.searchParams.set("pageSize", "100");
      if (formula) url.searchParams.set("filterByFormula", formula);
      if (offset) url.searchParams.set("offset", offset);
      const data = await airtableRequest<AirtableListResponse>(url.toString());
      records?.push(...(data.records ?? []));
      offset = data.offset;
    } while (offset);
    return records ?? [];
  });

  const total = registros.map(mapMovimiento).reduce((sum, mov) => sum + mov.monto, 0);
  return round2(total);
}
