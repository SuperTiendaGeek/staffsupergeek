import type { CategoriaMovimiento, EstadoDistribucion, Rubro } from "@/types/finanzas";
import { airtableRequest, fetchRecordsByIds, getClient, tableUrl, type AirtableListResponse } from "./airtable-client";
import { fetchCuentaById } from "./cuentas";
import { ESTADOS_QUE_CUENTAN_PARA_SALDO, MOVIMIENTOS_FIELDS, mapMovimiento } from "./movimientos-fields";
import { conResolucionDeTablaMovimientos } from "./table-names";
import { round2 } from "./validaciones";

/**
 * §2.3b — todos los movimientos (Confirmado/Acreditado, con fecha ≥ Fecha de
 * Corte de la cuenta) donde la cuenta participa, ya sea como origen o como
 * destino. Se leen por RECORD_ID() a partir de los ids que ya trae la propia
 * Cuenta en sus campos inversos — nunca se filtra Movimientos por campo de
 * link.
 */
async function fetchMovimientosConfirmadosDeCuenta(cuentaId: string, fechaCorte: string | null) {
  const cuenta = await fetchCuentaById(cuentaId);
  if (!cuenta) throw new Error(`Cuenta financiera ${cuentaId} no encontrada.`);

  const ids = Array.from(new Set([...cuenta.movimientosOrigenIds, ...cuenta.movimientosDestinoIds]));
  if (!ids.length) return [];

  const registros = await conResolucionDeTablaMovimientos(getClient(), (nombreTabla) =>
    fetchRecordsByIds(tableUrl(nombreTabla), ids)
  );

  const movimientos = registros.map(mapMovimiento);
  return movimientos.filter((mov) => {
    if (!ESTADOS_QUE_CUENTAN_PARA_SALDO.includes(mov.estado as (typeof ESTADOS_QUE_CUENTAN_PARA_SALDO)[number])) return false;
    if (fechaCorte && mov.fecha && mov.fecha < fechaCorte) return false;
    return true;
  });
}

/** §2.3b — saldo(cuenta) = SaldoInicial + Σ Monto[destino] − Σ Monto[origen], solo movimientos ≥ Fecha de Corte. */
export async function calcularSaldoCuenta(cuentaId: string, options?: { hasta?: Date }): Promise<number> {
  const cuenta = await fetchCuentaById(cuentaId);
  if (!cuenta) throw new Error(`Cuenta financiera ${cuentaId} no encontrada.`);

  const movimientos = await fetchMovimientosConfirmadosDeCuenta(cuentaId, cuenta.fechaCorte);
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

  const movimientos = await fetchMovimientosConfirmadosDeCuenta(cuentaId, cuenta.fechaCorte);
  let saldo = 0;
  for (const mov of movimientos) {
    const valor = mov.rubros[rubro];
    if (mov.cuentaDestinoId === cuentaId) saldo += valor;
    if (mov.cuentaOrigenId === cuentaId) saldo -= valor;
  }
  return round2(saldo);
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
