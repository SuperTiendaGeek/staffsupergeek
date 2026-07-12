// Cliente Airtable de bajo nivel para lib/finanzas/. Mismo patrón que
// lib/shipping-v2/airtable.ts: sin librería, fetch directo, sin filtrar
// nunca una tabla por campo de link (fetchRecordsByIds usa RECORD_ID()).

export type AirtableRecord = { id: string; createdTime?: string; fields: Record<string, unknown> };
export type AirtableListResponse = { records?: AirtableRecord[]; offset?: string };
export type AirtableMutationResponse = { records?: AirtableRecord[] };

function getRequiredEnv(name: "AIRTABLE_API_KEY" | "AIRTABLE_BASE_ID") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name}. Definir en .env.local para habilitar Finanzas.`);
  return value;
}

export function getClient() {
  const baseId = getRequiredEnv("AIRTABLE_BASE_ID");
  return {
    baseUrl: `https://api.airtable.com/v0/${baseId}`,
    headers: {
      Authorization: `Bearer ${getRequiredEnv("AIRTABLE_API_KEY")}`,
      "Content-Type": "application/json",
    },
  };
}

export function tableUrl(tableName: string) {
  return `${getClient().baseUrl}/${encodeURIComponent(tableName)}`;
}

export async function airtableRequest<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: getClient().headers, cache: "no-store" });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable Finanzas error ${response.status}: ${text}`);
  }
  return (await response.json()) as T;
}

export async function airtableMutation<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: getClient().headers, cache: "no-store" });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable Finanzas escritura ${response.status}: ${text}`);
  }
  return (await response.json()) as T;
}

export function escapeFormulaString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Patrón seguro del proyecto: nunca filtrar una tabla por campo de link.
 * Se usa para leer, a partir de los ids ya presentes en un campo inverso
 * (p. ej. `Cuenta.movimientosDestinoIds`), los registros reales por
 * `RECORD_ID()`.
 */
export async function fetchRecordsByIds(tableNameOrUrl: string, ids: string[]): Promise<AirtableRecord[]> {
  const uniqueIds = Array.from(new Set(ids.map((id) => id?.trim()).filter(Boolean))) as string[];
  if (!uniqueIds.length) return [];

  const baseUrl = tableNameOrUrl.startsWith("http") ? tableNameOrUrl : tableUrl(tableNameOrUrl);
  const formula =
    uniqueIds.length === 1
      ? `RECORD_ID()='${escapeFormulaString(uniqueIds[0])}'`
      : `OR(${uniqueIds.map((id) => `RECORD_ID()='${escapeFormulaString(id)}'`).join(",")})`;

  const records: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(baseUrl);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("filterByFormula", formula);
    if (offset) url.searchParams.set("offset", offset);
    const data = await airtableRequest<AirtableListResponse>(url.toString());
    records.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);
  return records;
}

export async function fetchRecordById(tableNameOrUrl: string, id: string): Promise<AirtableRecord | null> {
  const cleanId = id?.trim();
  if (!cleanId) return null;
  const baseUrl = tableNameOrUrl.startsWith("http") ? tableNameOrUrl : tableUrl(tableNameOrUrl);
  const response = await fetch(`${baseUrl}/${encodeURIComponent(cleanId)}`, {
    headers: getClient().headers,
    cache: "no-store",
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable Finanzas error ${response.status}: ${text}`);
  }
  return (await response.json()) as AirtableRecord;
}

/** Filtra undefined/null/"" y arreglos vacíos antes de un POST/PATCH — mismo criterio que compactFields de lib/shipping-v2/airtable.ts. */
export function compactFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => {
      if (value === undefined || value === null) return false;
      if (typeof value === "string") return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      return true;
    })
  );
}

export function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function firstNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim().replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function firstLinkedId(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const first = value.find((item): item is string => typeof item === "string" && item.trim().length > 0);
  return first ?? null;
}

export function linkedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function attachmentFromUrl(urlValue?: string) {
  const url = cleanString(urlValue);
  return url ? [{ url }] : undefined;
}
