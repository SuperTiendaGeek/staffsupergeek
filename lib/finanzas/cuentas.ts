import type { CuentaFinanciera } from "@/types/finanzas";
import {
  airtableRequest,
  cleanString,
  fetchRecordById,
  firstNumber,
  linkedIds,
  tableUrl,
  type AirtableListResponse,
  type AirtableRecord,
} from "./airtable-client";
import { TABLA_CUENTAS_FINANCIERAS } from "./table-names";

// Nombres de campo de "Cuentas Financieras" — ver docs/DISENO_FASE20_1_FUNDACION.md §3.
// `movimientosOrigen`/`movimientosDestino` son los inversos que Airtable crea
// automáticamente al crear los links "Cuenta Origen"/"Cuenta Destino" en
// Movimientos Financieros — se renombran a estos nombres en el checklist (§6)
// para que el código pueda referenciarlos de forma estable.
export const CUENTAS_FIELDS = {
  nombre: "Nombre",
  tipo: "Tipo de Cuenta",
  permiteRecibirDe: "Permite Recibir De",
  permiteTransferirA: "Permite Transferir A",
  activa: "Activa",
  saldoInicial: "Saldo Inicial",
  fechaCorte: "Fecha de Corte",
  movimientosOrigen: "Movimientos (Origen)",
  movimientosDestino: "Movimientos (Destino)",
  // Fase 20.4 — inverso automático del link "Cuenta" en Finanzas Cuadres.
  cuadres: "Cuadres",
  // Fase 20.5 — solo tienen dato en cuentas Tipo de Cuenta = "Tarjeta de
  // Crédito". No confundir "TC Día de Corte" (día del mes, recurrente, del
  // corte del estado de cuenta bancario) con "Fecha de Corte" (arriba —
  // fecha única de go-live contable de la cuenta): son campos distintos,
  // sin relación entre sí. Ver docs/DISENO_FASE20_5_TARJETAS.md §2.1.
  tcDiaCorte: "TC Día de Corte",
  tcDiaPago: "TC Día de Pago",
  tcCupo: "TC Cupo",
} as const;

export const NOMBRES_CUENTAS_INICIALES = [
  "Caja Registradora",
  "SGINGRESOS",
  "SGCAPITAL",
  "SGUTILIDAD",
  "SGIVA",
  "PayPal",
  "Tarjetas en Tránsito",
] as const;

function mapCuenta(record: AirtableRecord): CuentaFinanciera {
  const f = record.fields;
  return {
    id: record.id,
    nombre: cleanString(f[CUENTAS_FIELDS.nombre]) || record.id,
    tipo: cleanString(f[CUENTAS_FIELDS.tipo]),
    permiteTransferirAIds: linkedIds(f[CUENTAS_FIELDS.permiteTransferirA]),
    permiteRecibirDeIds: linkedIds(f[CUENTAS_FIELDS.permiteRecibirDe]),
    activa: f[CUENTAS_FIELDS.activa] === true,
    saldoInicial: firstNumber(f[CUENTAS_FIELDS.saldoInicial]) ?? 0,
    fechaCorte: cleanString(f[CUENTAS_FIELDS.fechaCorte]) || null,
    movimientosOrigenIds: linkedIds(f[CUENTAS_FIELDS.movimientosOrigen]),
    movimientosDestinoIds: linkedIds(f[CUENTAS_FIELDS.movimientosDestino]),
    cuadresIds: linkedIds(f[CUENTAS_FIELDS.cuadres]),
    tcDiaCorte: firstNumber(f[CUENTAS_FIELDS.tcDiaCorte]),
    tcDiaPago: firstNumber(f[CUENTAS_FIELDS.tcDiaPago]),
    tcCupo: firstNumber(f[CUENTAS_FIELDS.tcCupo]),
  };
}

export async function fetchCuentasFinancieras(): Promise<CuentaFinanciera[]> {
  const records: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(tableUrl(TABLA_CUENTAS_FINANCIERAS));
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const data = await airtableRequest<AirtableListResponse>(url.toString());
    records.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);
  return records.map(mapCuenta);
}

export async function fetchCuentaById(id: string): Promise<CuentaFinanciera | null> {
  const record = await fetchRecordById(TABLA_CUENTAS_FINANCIERAS, id);
  return record ? mapCuenta(record) : null;
}

/**
 * `Nombre` no es un campo de link — filtrar por él directamente con
 * filterByFormula no viola el patrón seguro del proyecto (ese patrón es
 * específicamente para no filtrar por campos de link).
 */
export async function fetchCuentaPorNombre(nombre: string): Promise<CuentaFinanciera | null> {
  const nombreLimpio = cleanString(nombre);
  if (!nombreLimpio) return null;
  const url = new URL(tableUrl(TABLA_CUENTAS_FINANCIERAS));
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("filterByFormula", `{${CUENTAS_FIELDS.nombre}}='${nombreLimpio.replace(/'/g, "\\'")}'`);
  const data = await airtableRequest<AirtableListResponse>(url.toString());
  const record = data.records?.[0];
  return record ? mapCuenta(record) : null;
}

function normalizarNombreCuenta(texto: string): string {
  return texto.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Fase 20.5 §4.3 (Corrección 1) — resolución tolerante a espacios/mayúsculas,
 * para textos que vienen de selects legacy fuera de este módulo (el select
 * de "Cuenta origen" de Shipping Pagos) y no se pueden garantizar
 * carácter-por-carácter iguales al Nombre real de la Cuenta Financiera.
 * Solo considera cuentas activas — una tarjeta desactivada nunca resuelve,
 * mismo criterio que "no encontrada".
 */
export async function fetchCuentaPorNombreNormalizado(texto: string): Promise<CuentaFinanciera | null> {
  const objetivo = normalizarNombreCuenta(texto);
  if (!objetivo) return null;
  const cuentas = await fetchCuentasFinancieras();
  return cuentas.find((c) => c.activa && normalizarNombreCuenta(c.nombre) === objetivo) ?? null;
}
