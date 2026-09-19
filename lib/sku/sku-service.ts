type AirtableRecord = {
  id: string;
  fields: Record<string, unknown>;
};

type AirtableListResponse = {
  records?: AirtableRecord[];
  offset?: string;
};

export type SkuAvailability = {
  sku: string;
  exists: boolean;
  available: boolean;
  matchingRecordId?: string;
};

export type SkuValidationResult = SkuAvailability & {
  valid: boolean;
  message?: string;
};

const ITEM_TABLE = process.env.AIRTABLE_ITEM_TABLE?.trim() || "Item";
const SKU_PATTERN = /^[A-Z0-9][A-Z0-9-]*$/;
const SEQUENCE_PATTERN = /^([A-Z]{3})-(\d{6})$/;

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name}. Definir en .env.local.`);
  return value;
}

function getClient() {
  const token =
    process.env.AIRTABLE_COTIZACIONES_TOKEN?.trim() ||
    process.env.AIRTABLE_ADM_TOKEN?.trim() ||
    getRequiredEnv("AIRTABLE_API_KEY");
  const baseId =
    process.env.AIRTABLE_COTIZACIONES_BASE_ID?.trim() ||
    process.env.AIRTABLE_ADM_BASE_ID?.trim() ||
    getRequiredEnv("AIRTABLE_BASE_ID");

  return {
    baseUrl: `https://api.airtable.com/v0/${baseId}`,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
}

function airtableUrl(recordId?: string) {
  const client = getClient();
  return {
    client,
    url: `${client.baseUrl}/${encodeURIComponent(ITEM_TABLE)}${recordId ? `/${encodeURIComponent(recordId)}` : ""}`,
  };
}

function escapeFormulaString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function firstString(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    const found = value.find((item) => typeof item === "string" || typeof item === "number");
    return found === undefined ? fallback : String(found);
  }
  return fallback;
}

async function airtableRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const { client } = airtableUrl();
  const response = await fetch(url, {
    ...init,
    headers: { ...client.headers, ...(init?.headers || {}) },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable error ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}

export function normalizeSku(sku: string): string {
  return sku.trim().toUpperCase().replace(/\s+/g, "");
}

// Prefijo de SKU por categoría. La clave va sin tildes y en minúsculas.
//
// Hasta 2026-09 este mapa conocía 8 de las 20 categorías de Shipping Items y
// todo lo demás caía en OTR: había monitores con SKU OTR-000161 y unos 70
// cargadores con OTR-0000xx. El SKU existe para decir qué es la cosa de un
// vistazo, y en medio catálogo decía "otro".
//
// Cambiar este mapa SOLO afecta a items nuevos. Los SKU ya emitidos no se
// tocan nunca: están impresos en etiquetas, cotizaciones y facturas.
//
// Categoría nueva en Airtable → agregarla aquí, o nacerá con OTR.
const PREFIJO_POR_CATEGORIA: Record<string, string> = {
  // Equipos
  "laptop": "LAP",
  "desktop": "DES",
  "imac": "DES",
  "all in one": "AIO",
  "monitor": "MON",
  "tablet": "TAB",
  "consola": "CON",
  "celular": "CEL",
  // Componentes
  "ram": "RAM",
  "ssd": "SSD",
  "hdd": "HDD",
  "tarjeta grafica": "GPU",
  "fuente de poder": "FUE",
  "pantalla": "PAN",
  "teclado": "TEC",
  "cargador": "CAR",
  "cable": "CAB",
  // Repuestos: se mantienen en REP como siempre
  "repuesto": "REP",
  "mainboard": "REP",
  "bateria": "REP",
  // Categorías creadas en 2026-09 al vaciar "Otro"
  "smart home": "SMT",
  "audio": "AUD",
  "adaptador / dock / lector": "ADP",
  "disco externo": "DEX",
  "insumo": "INS",
  "impresora": "IMP",
  "energia / proteccion": "ENE",
  "red / wi-fi": "RED",
  "camara / seguridad": "CAM",
  // Otros
  "accesorio": "ACC",
  "electronico": "ELE",
};

export function getSkuPrefixByCategory(category?: string): string {
  const normalized = (category || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
  return PREFIJO_POR_CATEGORIA[normalized] ?? "OTR";
}

function nextSkuFromExistingSkus(category: string | undefined, existingSkus: Iterable<string>, exists: (sku: string) => boolean) {
  const prefix = getSkuPrefixByCategory(category);
  const sequenceNumbers = Array.from(existingSkus)
    .map((sku) => normalizeSku(sku))
    .map((sku) => {
      const match = sku.match(SEQUENCE_PATTERN);
      return match?.[1] === prefix ? Number(match[2]) : 0;
    })
    .filter((number) => Number.isFinite(number) && number > 0);

  let currentNumber = Math.max(0, ...sequenceNumbers) + 1;
  while (currentNumber < 1000000) {
    const candidate = `${prefix}-${String(currentNumber).padStart(6, "0")}`;
    if (!exists(candidate)) return candidate;
    currentNumber += 1;
  }

  throw new Error(`No hay SKUs disponibles para el prefijo ${prefix}.`);
}

export function generateUniqueSkuFromExistingSkus(category: string | undefined, existingSkus: Iterable<string>): string {
  const normalizedSkus = new Set(Array.from(existingSkus).map((sku) => normalizeSku(sku)).filter(Boolean));
  return nextSkuFromExistingSkus(category, normalizedSkus, (sku) => normalizedSkus.has(normalizeSku(sku)));
}

async function findSkuRecord(sku: string, excludeRecordId?: string): Promise<AirtableRecord | null> {
  const normalizedSku = normalizeSku(sku);
  if (!normalizedSku) return null;

  const { client, url } = airtableUrl();
  const pageUrl = new URL(url);
  pageUrl.searchParams.set("maxRecords", "10");
  pageUrl.searchParams.set(
    "filterByFormula",
    `UPPER(TRIM({Identificador} & '')) = '${escapeFormulaString(normalizedSku)}'`
  );

  const data = await airtableRequest<AirtableListResponse>(pageUrl.toString(), { headers: client.headers });
  return (data.records ?? []).find((record) => record.id !== excludeRecordId) ?? null;
}

export async function checkSkuExists(sku: string, excludeRecordId?: string): Promise<boolean> {
  return Boolean(await findSkuRecord(sku, excludeRecordId));
}

export async function checkSkuAvailability(sku: string, excludeRecordId?: string): Promise<SkuAvailability> {
  const normalizedSku = normalizeSku(sku);
  const matchingRecord = await findSkuRecord(normalizedSku, excludeRecordId);
  return {
    sku: normalizedSku,
    exists: Boolean(matchingRecord),
    available: !matchingRecord,
    matchingRecordId: matchingRecord?.id,
  };
}

async function fetchSkuSequenceNumbers(prefix: string): Promise<number[]> {
  const { client, url } = airtableUrl();
  const records: AirtableRecord[] = [];
  let offset: string | null = null;

  do {
    const pageUrl = new URL(url);
    pageUrl.searchParams.set("pageSize", "100");
    pageUrl.searchParams.set("fields[]", "Identificador");
    pageUrl.searchParams.set("filterByFormula", `LEFT(UPPER({Identificador} & ''), 4) = '${prefix}-'`);
    if (offset) pageUrl.searchParams.set("offset", offset);

    const data = await airtableRequest<AirtableListResponse>(pageUrl.toString(), { headers: client.headers });
    records.push(...(data.records ?? []));
    offset = data.offset ?? null;
  } while (offset);

  return records
    .map((record) => normalizeSku(firstString(record.fields["Identificador"])))
    .map((sku) => {
      const match = sku.match(SEQUENCE_PATTERN);
      return match?.[1] === prefix ? Number(match[2]) : 0;
    })
    .filter((number) => Number.isFinite(number) && number > 0);
}

export async function getNextSkuForCategory(category?: string): Promise<string> {
  const prefix = getSkuPrefixByCategory(category);
  const sequenceNumbers = await fetchSkuSequenceNumbers(prefix);
  const nextNumber = Math.max(0, ...sequenceNumbers) + 1;
  return `${prefix}-${String(nextNumber).padStart(6, "0")}`;
}

export async function generateUniqueSku(category?: string): Promise<string> {
  const prefix = getSkuPrefixByCategory(category);
  const firstCandidate = await getNextSkuForCategory(category);
  const firstMatch = firstCandidate.match(SEQUENCE_PATTERN);
  let currentNumber = firstMatch ? Number(firstMatch[2]) : 1;

  while (currentNumber < 1000000) {
    const candidate = `${prefix}-${String(currentNumber).padStart(6, "0")}`;
    if (!(await checkSkuExists(candidate))) return candidate;
    currentNumber += 1;
  }

  throw new Error(`No hay SKUs disponibles para el prefijo ${prefix}.`);
}

export async function validateSkuForItem(params: {
  sku: string;
  excludeRecordId?: string;
}): Promise<SkuValidationResult> {
  const sku = normalizeSku(params.sku);
  if (!sku) {
    return {
      sku,
      valid: false,
      exists: false,
      available: false,
      message: "Ingresa un SKU interno.",
    };
  }

  if (!SKU_PATTERN.test(sku)) {
    return {
      sku,
      valid: false,
      exists: false,
      available: false,
      message: "El SKU solo puede contener letras, números y guiones.",
    };
  }

  const availability = await checkSkuAvailability(sku, params.excludeRecordId);
  if (!availability.available) {
    return {
      ...availability,
      valid: false,
      message: "Este SKU ya está usado en otro item.",
    };
  }

  return {
    ...availability,
    valid: true,
    message: "SKU disponible.",
  };
}
