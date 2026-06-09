import "server-only";

import { COTIZACIONES_TABLES } from "@/lib/cotizaciones/airtable";
import { SHIPPING_V2_TABLES } from "@/lib/shipping-v2/schema.generated";
import { AIRTABLE_TABLES as TECNICOS_TABLES } from "@/lib/tecnicos/config/airtable";

const AIRTABLE_RECORD_LIMIT = 50_000;
const FAST_GROWTH_TABLES = new Set(["Shipping Eventos", "Registro Accesos", "Horarios Marcaciones"]);
const RECENT_DAYS = 7;

type AirtableListResponse = {
  records?: Array<{ id: string }>;
  offset?: string;
};

type AirtableMetadataResponse = {
  tables?: Array<{ id: string; name: string }>;
};

export type AirtableUsageLevel = "normal" | "warning" | "risk" | "critical";

export type AirtableUsageTable = {
  name: string;
  recordCount: number;
  percentageOfLimit: number;
  level: AirtableUsageLevel;
  monitoredForGrowth: boolean;
  recent7DayCount: number | null;
  projected30DayCount: number | null;
  growthAlert: string | null;
  error: string | null;
};

export type AirtableUsageReport = {
  baseId: string;
  limit: number;
  totalRecords: number;
  percentageUsed: number;
  level: AirtableUsageLevel;
  generatedAt: string;
  tables: AirtableUsageTable[];
  alerts: string[];
  errors: string[];
};

function requiredEnv(name: "AIRTABLE_API_KEY" | "AIRTABLE_BASE_ID") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name}.`);
  return value;
}

function airtableClient() {
  const baseId = requiredEnv("AIRTABLE_BASE_ID");
  return {
    baseId,
    baseUrl: `https://api.airtable.com/v0/${baseId}`,
    headers: {
      Authorization: `Bearer ${requiredEnv("AIRTABLE_API_KEY")}`,
      "Content-Type": "application/json",
    },
  };
}

function unique(values: Array<string | undefined | null>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function configuredTables() {
  return unique([
    ...Object.values(SHIPPING_V2_TABLES),
    "Horarios Marcaciones",
    "Horarios Registros",
    "Horarios Pagos",
    "Horarios Periodos de Pago",
    "Horarios Ajustes",
    process.env.AIRTABLE_ACCESS_LOG_TABLE || "Registro Accesos",
    process.env.AIRTABLE_USERS_TABLE,
    process.env.AIRTABLE_2FA_CODES_TABLE,
    process.env.AIRTABLE_NOTIFICACIONES_TABLE || "Notificaciones",
    ...Object.values(COTIZACIONES_TABLES),
    ...Object.values(TECNICOS_TABLES),
  ]);
}

function usageLevel(percentage: number): AirtableUsageLevel {
  if (percentage >= 90) return "critical";
  if (percentage >= 75) return "risk";
  if (percentage >= 60) return "warning";
  return "normal";
}

async function airtableGet<T>(url: string) {
  const response = await fetch(url, {
    headers: airtableClient().headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}

async function metadataTableNames() {
  const { baseId } = airtableClient();
  const data = await airtableGet<AirtableMetadataResponse>(`https://api.airtable.com/v0/meta/bases/${encodeURIComponent(baseId)}/tables`);
  return (data.tables || []).map((table) => table.name);
}

async function countRecords(tableName: string, filterByFormula?: string) {
  let count = 0;
  let offset: string | null = null;

  do {
    const url = new URL(`${airtableClient().baseUrl}/${encodeURIComponent(tableName)}`);
    url.searchParams.set("pageSize", "100");
    if (filterByFormula) url.searchParams.set("filterByFormula", filterByFormula);
    if (offset) url.searchParams.set("offset", offset);
    const data = await airtableGet<AirtableListResponse>(url.toString());
    count += data.records?.length || 0;
    offset = data.offset || null;
  } while (offset);

  return count;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>) {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function recentFormula(days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  return `IS_AFTER(CREATED_TIME(), '${since}')`;
}

function growthAlertFor(tableName: string, current: number, recent7: number | null, projected30: number | null) {
  if (!FAST_GROWTH_TABLES.has(tableName) || recent7 === null || projected30 === null) return null;
  if (recent7 >= 1_000) return `${tableName} creó ${recent7.toLocaleString("en-US")} records en los últimos ${RECENT_DAYS} días.`;
  if (projected30 >= 2_500) return `${tableName} proyecta ${projected30.toLocaleString("en-US")} records/mes al ritmo actual.`;
  if (current >= 10_000) return `${tableName} ya acumula ${current.toLocaleString("en-US")} records. Revisar retención o archivado.`;
  return null;
}

async function tableUsage(tableName: string): Promise<AirtableUsageTable> {
  try {
    const recordCount = await countRecords(tableName);
    let recent7DayCount: number | null = null;
    let projected30DayCount: number | null = null;

    if (FAST_GROWTH_TABLES.has(tableName)) {
      recent7DayCount = await countRecords(tableName, recentFormula(RECENT_DAYS));
      projected30DayCount = Math.round((recent7DayCount / RECENT_DAYS) * 30);
    }

    const percentageOfLimit = (recordCount / AIRTABLE_RECORD_LIMIT) * 100;
    const growthAlert = growthAlertFor(tableName, recordCount, recent7DayCount, projected30DayCount);

    return {
      name: tableName,
      recordCount,
      percentageOfLimit,
      level: usageLevel(percentageOfLimit),
      monitoredForGrowth: FAST_GROWTH_TABLES.has(tableName),
      recent7DayCount,
      projected30DayCount,
      growthAlert,
      error: null,
    };
  } catch (error) {
    return {
      name: tableName,
      recordCount: 0,
      percentageOfLimit: 0,
      level: "normal",
      monitoredForGrowth: FAST_GROWTH_TABLES.has(tableName),
      recent7DayCount: null,
      projected30DayCount: null,
      growthAlert: null,
      error: error instanceof Error ? error.message : "Error desconocido",
    };
  }
}

export async function getAirtableUsageReport(): Promise<AirtableUsageReport> {
  const { baseId } = airtableClient();
  const errors: string[] = [];
  let tableNames = configuredTables();

  try {
    tableNames = unique([...tableNames, ...(await metadataTableNames())]);
  } catch (error) {
    errors.push(`No se pudo leer Metadata API; se usará lista configurada. ${error instanceof Error ? error.message : String(error)}`);
  }

  const tables = await mapWithConcurrency(tableNames, 4, tableUsage);
  const sortedTables = tables.sort((a, b) => b.recordCount - a.recordCount || a.name.localeCompare(b.name));
  const totalRecords = sortedTables.reduce((sum, table) => sum + table.recordCount, 0);
  const percentageUsed = (totalRecords / AIRTABLE_RECORD_LIMIT) * 100;
  const alerts = sortedTables.map((table) => table.growthAlert).filter((alert): alert is string => Boolean(alert));

  return {
    baseId,
    limit: AIRTABLE_RECORD_LIMIT,
    totalRecords,
    percentageUsed,
    level: usageLevel(percentageUsed),
    generatedAt: new Date().toISOString(),
    tables: sortedTables,
    alerts,
    errors: [...errors, ...sortedTables.filter((table) => table.error).map((table) => `${table.name}: ${table.error}`)],
  };
}
