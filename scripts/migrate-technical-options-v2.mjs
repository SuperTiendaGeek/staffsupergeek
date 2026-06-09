import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const ENV_FILE = path.join(ROOT, ".env.local");
const APPLY = process.argv.includes("--apply");

const TABLES = {
  shippingItems: "Shipping Items",
  computerCatalog: "Catálogo Computadores",
  connectivityCatalog: "Catálogo Conectividad",
  portsCatalog: "Catálogo Puertos",
  extraFeaturesCatalog: "Catálogo Características Extras",
};

const FIELD = {
  name: "Nombre",
};

const MIGRATIONS = [
  {
    label: "Conectividad",
    masterTable: TABLES.connectivityCatalog,
    sources: [
      { tableName: TABLES.shippingItems, oldField: "Conectividad", newField: "Conectividad V2" },
      { tableName: TABLES.computerCatalog, oldField: "Conectividad sugerida", newField: "Conectividad sugerida V2" },
    ],
  },
  {
    label: "Puertos",
    masterTable: TABLES.portsCatalog,
    sources: [
      { tableName: TABLES.shippingItems, oldField: "Puertos", newField: "Puertos V2" },
      { tableName: TABLES.computerCatalog, oldField: "Puertos sugeridos", newField: "Puertos sugeridos V2" },
    ],
  },
  {
    label: "Características extras",
    masterTable: TABLES.extraFeaturesCatalog,
    sources: [
      { tableName: TABLES.shippingItems, oldField: "Características extras", newField: "Características extras V2" },
      { tableName: TABLES.computerCatalog, oldField: "Características extras sugeridas", newField: "Características extras sugeridas V2" },
    ],
  },
];

const ALIASES = new Map([
  ["bluetooh", "Bluetooth"],
  ["wifi", "Wi-Fi"],
  ["wi fi", "Wi-Fi"],
  ["usb c", "USB-C"],
  ["usbc", "USB-C"],
  ["usb c port", "USB-C"],
  ["usb-c port", "USB-C"],
  ["lan", "Ethernet"],
  ["audio", "Audio Jack"],
  ["jack", "Audio Jack"],
]);

const summary = {
  dryRun: !APPLY,
  recordsReviewed: {},
  recordsUpdated: {},
  optionsCreated: [],
  unrecognizedValues: [],
  errors: [],
};

async function loadLocalEnv() {
  try {
    const content = await readFile(ENV_FILE, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key] !== undefined) continue;
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // .env.local is optional when env vars are already available.
  }
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name}.`);
  return value;
}

function client() {
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

function tableUrl(tableName) {
  return `${client().baseUrl}/${encodeURIComponent(tableName)}`;
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalLabel(value) {
  const trimmed = String(value || "").trim().replace(/\s+/g, " ");
  return ALIASES.get(normalizeName(trimmed)) || trimmed;
}

function stringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  const text = String(value || "").trim();
  if (!text) return [];
  return text.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
}

async function airtableRequest(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...client().headers,
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable ${response.status}: ${text}`);
  }

  return response.json();
}

async function metadataTables() {
  const data = await airtableRequest(`https://api.airtable.com/v0/meta/bases/${encodeURIComponent(client().baseId)}/tables`);
  return data.tables || [];
}

async function listRecords(tableName) {
  const records = [];
  let offset = null;
  do {
    const url = new URL(tableUrl(tableName));
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const data = await airtableRequest(url.toString());
    records.push(...(data.records || []));
    offset = data.offset || null;
  } while (offset);
  return records;
}

async function createRecord(tableName, fields) {
  if (!APPLY) {
    return { id: `dry-${normalizeName(fields[FIELD.name]).replace(/\s+/g, "-")}`, fields };
  }
  const data = await airtableRequest(tableUrl(tableName), {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }] }),
  });
  const record = data.records?.[0];
  if (!record) throw new Error(`Airtable no devolvió registro creado en ${tableName}.`);
  return record;
}

async function patchRecords(tableName, records) {
  if (!records.length) return;
  if (!APPLY) return;
  for (let index = 0; index < records.length; index += 10) {
    const chunk = records.slice(index, index + 10);
    await airtableRequest(tableUrl(tableName), {
      method: "PATCH",
      body: JSON.stringify({ records: chunk }),
    });
  }
}

async function assertRequiredFields() {
  const checks = [];
  for (const migration of MIGRATIONS) {
    checks.push({ tableName: migration.masterTable, fields: [FIELD.name] });
    for (const source of migration.sources) {
      checks.push({ tableName: source.tableName, fields: [source.oldField, source.newField] });
    }
  }

  const tables = await metadataTables();
  const tableByName = new Map(tables.map((table) => [table.name, table]));

  const missing = [];
  for (const check of checks) {
    const table = tableByName.get(check.tableName);
    if (!table) {
      missing.push(`${check.tableName}: tabla no encontrada`);
      continue;
    }
    const fieldNames = new Set((table.fields || []).map((field) => field.name));
    const missingFields = check.fields.filter((field) => !fieldNames.has(field));
    if (missingFields.length) {
      missing.push(`${check.tableName}: ${missingFields.join(", ")}`);
    }
  }

  if (missing.length) {
    throw new Error(`Preflight falló. Faltan campos requeridos en Airtable Metadata API:\n- ${missing.join("\n- ")}`);
  }
}

async function buildMasterMap(tableName) {
  const records = await listRecords(tableName);
  const map = new Map();
  for (const record of records) {
    const name = String(record.fields[FIELD.name] || "").trim();
    if (!name) continue;
    map.set(normalizeName(canonicalLabel(name)), { id: record.id, name });
  }
  return map;
}

async function resolveMasterRecord(migration, source, rawValue, masterMap) {
  const option = canonicalLabel(rawValue);
  const normalized = normalizeName(option);
  if (!normalized) {
    summary.unrecognizedValues.push({ type: migration.label, value: rawValue, reason: "empty-after-normalization" });
    return null;
  }
  if (normalized === normalizeName(source.oldField) || normalized === normalizeName(source.newField)) {
    summary.unrecognizedValues.push({
      type: migration.label,
      table: source.tableName,
      value: rawValue,
      reason: "field-name-value-ignored",
    });
    return null;
  }

  const existing = masterMap.get(normalized);
  if (existing) return existing.id;

  const created = await createRecord(migration.masterTable, { [FIELD.name]: option });
  masterMap.set(normalized, { id: created.id, name: option });
  summary.optionsCreated.push({ type: migration.label, value: option, table: migration.masterTable, dryRun: !APPLY });
  return created.id;
}

function mergeIds(existingValue, nextIds) {
  const current = Array.isArray(existingValue) ? existingValue.filter((id) => typeof id === "string") : [];
  return [...new Set([...current, ...nextIds])];
}

async function migrateSource(source, migration, masterMap) {
  const records = await listRecords(source.tableName);
  summary.recordsReviewed[source.tableName] = (summary.recordsReviewed[source.tableName] || 0) + records.length;
  const updates = [];

  for (const record of records) {
    const oldValues = stringArray(record.fields[source.oldField]);
    if (!oldValues.length) continue;

    const nextIds = [];
    for (const oldValue of oldValues) {
      try {
        const id = await resolveMasterRecord(migration, source, oldValue, masterMap);
        if (id) nextIds.push(id);
      } catch (error) {
        summary.errors.push({ table: source.tableName, recordId: record.id, value: oldValue, error: error instanceof Error ? error.message : String(error) });
      }
    }

    const merged = mergeIds(record.fields[source.newField], nextIds);
    const current = mergeIds(record.fields[source.newField], []);
    const changed = merged.length !== current.length || merged.some((id) => !current.includes(id));
    if (changed) {
      updates.push({ id: record.id, fields: { [source.newField]: merged } });
    }
  }

  await patchRecords(source.tableName, updates);
  summary.recordsUpdated[source.tableName] = (summary.recordsUpdated[source.tableName] || 0) + updates.length;
}

async function main() {
  await loadLocalEnv();
  if (!APPLY) {
    console.log("Modo DRY RUN. Usa --apply para escribir cambios en Airtable.");
  }

  await assertRequiredFields();

  for (const migration of MIGRATIONS) {
    const masterMap = await buildMasterMap(migration.masterTable);
    for (const source of migration.sources) {
      await migrateSource(source, migration, masterMap);
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  summary.errors.push({ error: error instanceof Error ? error.message : String(error) });
  console.error(JSON.stringify(summary, null, 2));
  process.exitCode = 1;
});
