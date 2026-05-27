import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const ENV_FILE = path.join(ROOT, ".env.local");
const JSON_OUT = path.join(ROOT, "lib/shipping-v2/schema.generated.json");
const TS_OUT = path.join(ROOT, "lib/shipping-v2/schema.generated.ts");

const TABLES = {
  proveedores: "Shipping Proveedores",
  items: "Shipping Items",
  pagos: "Shipping Pagos",
  finanzasMovimientos: "Shipping Finanzas Movimientos",
  packings: "Shipping Packings",
  recepciones: "Shipping Recepciones",
  novedades: "Shipping Novedades",
  migraciones: "Shipping Migraciones",
  eventos: "Shipping Eventos",
};

const EXPECTED_ITEM_FIELDS = [
  "SKU",
  "Nombre del item",
  "Descripción",
  "Tipo de operación",
  "Tipo de item",
  "Categoría",
  "Estado Item",
  "Estado de revisión",
  "Estado de triangulación",
  "Estado de despiece",
  "Proveedor de compra",
  "Proveedor logístico / intermediario",
  "Requiere pago",
  "Pago relacionado",
  "Requiere packing",
  "Packing relacionado",
  "Modo logístico",
  "Afecta inventario",
  "Disponible para venta",
  "Costo proveedor",
  "Precio venta sugerido",
  "SKU interno",
  "SKU proveedor",
  "Modelo",
  "Marca",
  "Número de serie",
  "Condición",
  "Ubicación actual",
  "Tracking directo",
  "Observaciones internas",
  "Observación para venta",
];

const EXPECTED_PACKING_FIELDS = [
  "Packing ID",
  "Nombre Packing",
  "Tipo de packing",
  "Estado Packing",
  "Proveedor responsable",
  "Items incluidos",
  "Tracking USA",
  "Transportista USA",
  "Proveedor logístico EC",
  "Tracking EC",
  "Transportista EC",
  "Peso",
  "Unidad de peso",
  "Flete",
  "Arancel",
  "Otros costos",
  "Regla de distribución de costos",
  "Observaciones",
  "Fecha de creación",
  "Fecha de cierre",
  "Cerrado por",
  "Creado por",
];

const ITEM_FIELD_KEYS = {
  sku: "SKU",
  itemId: "Item ID",
  nombre: "Nombre del item",
  aiNombre: "AI Nombre del item",
  descripcion: "Descripción",
  tipoOperacion: "Tipo de operación",
  tipoItem: "Tipo de item",
  categoria: "Categoría",
  estadoItem: "Estado Item",
  estadoRevision: "Estado de revisión",
  estadoTriangulacion: "Estado de triangulación",
  estadoDespiece: "Estado de despiece",
  proveedorCompra: "Proveedor de compra",
  proveedorLogistico: "Proveedor logístico / intermediario",
  requierePago: "Requiere pago",
  pagoRelacionado: "Pago relacionado",
  requierePacking: "Requiere packing",
  packingRelacionado: "Packing relacionado",
  modoLogistico: "Modo logístico",
  afectaInventario: "Afecta inventario",
  disponibleVenta: "Disponible para venta",
  reservado: "Reservado",
  costoProveedor: "Costo proveedor",
  precioVentaFinal: "Precio venta final",
  precioVentaSugerido: "Precio venta sugerido",
  cantidad: "Cantidad",
  unidad: "Unidad",
  skuInterno: "SKU interno",
  skuProveedor: "SKU proveedor",
  modelo: "Modelo",
  marca: "Marca",
  numeroSerie: "Número de serie",
  condicion: "Condición",
  ubicacionActual: "Ubicación actual",
  trackingDirecto: "Tracking directo",
  trackingHaciaIntermediario: "Tracking hacia intermediario",
  trackingDesdeIntermediario: "Tracking desde intermediario",
  fotos: "Fotos",
  evidencias: "Evidencias",
  observacionesInternas: "Observaciones internas",
  observacionVenta: "Observación para venta",
  metodoAsignacionSku: "Método de asignación SKU",
  skuProveedorUsadoComoInterno: "SKU proveedor fue usado como interno",
  skuDuplicadoDetectado: "SKU duplicado detectado",
  skuOriginalSugerido: "SKU original sugerido",
  fechaRegistro: "Fecha de registro",
  registradoPor: "Registrado por",
  ultimaActualizacion: "Última actualización",
  actualizadoPor: "Actualizado por",
  esRegalo: "Es regalo",
  esParteRecuperada: "Es parte recuperada",
  esRepuesto: "Es repuesto",
  esUsoLocal: "Es uso local",
};

const PACKING_FIELD_KEYS = {
  packingId: "Packing ID",
  nombre: "Nombre Packing",
  tipo: "Tipo de packing",
  estado: "Estado Packing",
  proveedorResponsable: "Proveedor responsable",
  proveedorLogisticoEc: "Proveedor logístico EC",
  itemsIncluidos: "Items incluidos",
  trackingUsa: "Tracking USA",
  transportistaUsa: "Transportista USA",
  trackingEc: "Tracking EC",
  transportistaEc: "Transportista EC",
  peso: "Peso",
  unidadPeso: "Unidad de peso",
  flete: "Flete",
  arancel: "Arancel",
  otrosCostos: "Otros costos",
  reglaDistribucionCostos: "Regla de distribución de costos",
  observaciones: "Observaciones",
  fechaCreacion: "Fecha de creación",
  fechaCierre: "Fecha de cierre",
  cerradoPor: "Cerrado por",
  creadoPor: "Creado por",
};

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match) return null;
  let value = match[2].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return [match[1], value];
}

async function loadLocalEnv() {
  const raw = await readFile(ENV_FILE, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    process.env[key] ||= value;
  }
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name} en .env.local.`);
  return value;
}

function normalizeName(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, index) => [index]);
  for (let j = 1; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return rows[a.length][b.length];
}

function findSimilarFields(expected, foundFields) {
  const normalizedExpected = normalizeName(expected);
  return foundFields
    .map((name) => ({ name, distance: levenshtein(normalizeName(name), normalizedExpected) }))
    .filter((item) => item.distance <= Math.max(4, Math.floor(normalizedExpected.length * 0.35)) || normalizeName(item.name).includes(normalizedExpected) || normalizedExpected.includes(normalizeName(item.name)))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5)
    .map((item) => item.name);
}

function selectOptions(field) {
  const choices = field?.options?.choices;
  if (!Array.isArray(choices)) return [];
  return choices.map((choice) => choice.name).filter((name) => typeof name === "string");
}

function linkedTableId(field) {
  return field?.options?.linkedTableId || field?.options?.foreignTableId || null;
}

function simplifyField(field) {
  const output = {
    id: field.id,
    type: field.type,
  };

  if (field.type === "singleSelect" || field.type === "multipleSelects") {
    output.options = selectOptions(field);
  }
  if (field.type === "multipleRecordLinks") {
    output.linkedTableId = linkedTableId(field);
  }
  if (field.type === "multipleAttachments") output.attachment = true;
  if (field.type === "checkbox") output.checkbox = true;
  if (["number", "currency", "date", "singleLineText", "multilineText", "richText", "email", "url", "phoneNumber"].includes(field.type)) {
    output.kind = field.type;
  }

  return output;
}

function validateExpectedItems(itemsTable) {
  const found = Object.keys(itemsTable.fields);
  const hasOfficialSku = Boolean(itemsTable.fields["SKU"] || itemsTable.fields["Item ID"]);
  const missing = EXPECTED_ITEM_FIELDS.filter((field) => {
    if (field === "SKU") return !hasOfficialSku;
    return !itemsTable.fields[field];
  });

  if (!missing.length) {
    return { ok: true, found, missing: [], similar: {} };
  }

  const similar = Object.fromEntries(missing.map((field) => [field, findSimilarFields(field, found)]));
  return { ok: false, found, missing, similar };
}

function validateExpectedFields(table, expectedFields) {
  const found = Object.keys(table.fields);
  const missing = expectedFields.filter((field) => !table.fields[field]);
  if (!missing.length) return { ok: true, found, missing: [], similar: {} };
  const similar = Object.fromEntries(missing.map((field) => [field, findSimilarFields(field, found)]));
  return { ok: false, found, missing, similar };
}

function tsString(value) {
  return JSON.stringify(value, null, 2);
}

function generatedTs(schema, validation) {
  const itemsFields = schema.tables[TABLES.items].fields;
  const packingFields = schema.tables[TABLES.packings].fields;
  const itemConstants = Object.fromEntries(
    Object.entries(ITEM_FIELD_KEYS).filter(([, fieldName]) => Boolean(itemsFields[fieldName]))
  );
  const officialSkuField = itemsFields["SKU"] ? "SKU" : "Item ID";
  itemConstants.sku = officialSkuField;
  itemConstants.itemId = officialSkuField;

  const itemSelectOptions = Object.fromEntries(
    Object.entries(itemConstants)
      .map(([key, fieldName]) => [key, itemsFields[fieldName]])
      .filter(([, field]) => field.type === "singleSelect" || field.type === "multipleSelects")
      .map(([key, field]) => [key, field.options ?? []])
  );
  const packingConstants = Object.fromEntries(
    Object.entries(PACKING_FIELD_KEYS).filter(([, fieldName]) => Boolean(packingFields[fieldName]))
  );
  const packingSelectOptions = Object.fromEntries(
    Object.entries(packingConstants)
      .map(([key, fieldName]) => [key, packingFields[fieldName]])
      .filter(([, field]) => field.type === "singleSelect" || field.type === "multipleSelects")
      .map(([key, field]) => [key, field.options ?? []])
  );

  return `/* eslint-disable */\n// This file is generated by scripts/inspect-shipping-v2-schema.mjs.\n// Do not edit by hand. Run: npm run shipping-v2:schema\n\nexport const SHIPPING_V2_SCHEMA_GENERATED_AT = ${JSON.stringify(schema.generatedAt)};\n\nexport const SHIPPING_V2_TABLES = ${tsString(TABLES)} as const;\n\nexport const SHIPPING_V2_ITEM_FIELDS = ${tsString(itemConstants)} as const;\n\nexport const SHIPPING_V2_ITEM_SELECT_OPTIONS = ${tsString(itemSelectOptions)} as const;\n\nexport const SHIPPING_V2_PACKING_FIELDS = ${tsString(packingConstants)} as const;\n\nexport const SHIPPING_V2_PACKING_SELECT_OPTIONS = ${tsString(packingSelectOptions)} as const;\n\nexport const SHIPPING_V2_EXPECTED_ITEM_FIELDS_VALIDATION = ${tsString(validation.items)} as const;\n\nexport const SHIPPING_V2_EXPECTED_PACKING_FIELDS_VALIDATION = ${tsString(validation.packings)} as const;\n\nexport function assertShippingV2GeneratedSchema() {\n  if (!SHIPPING_V2_EXPECTED_ITEM_FIELDS_VALIDATION.ok) {\n    throw new Error(\`Schema Shipping V2 desactualizado o incompleto. Ejecuta npm run shipping-v2:schema. Campos faltantes: \${SHIPPING_V2_EXPECTED_ITEM_FIELDS_VALIDATION.missing.join(", ")}\`);\n  }\n  if (!SHIPPING_V2_EXPECTED_PACKING_FIELDS_VALIDATION.ok) {\n    throw new Error(\`Schema Shipping V2 Packings desactualizado o incompleto. Ejecuta npm run shipping-v2:schema. Campos faltantes: \${SHIPPING_V2_EXPECTED_PACKING_FIELDS_VALIDATION.missing.join(", ")}\`);\n  }\n}\n`;
}

async function main() {
  await loadLocalEnv();

  const apiKey = requiredEnv("AIRTABLE_API_KEY");
  const baseId = requiredEnv("AIRTABLE_BASE_ID");
  const response = await fetch(`https://api.airtable.com/v0/meta/bases/${encodeURIComponent(baseId)}/tables`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    const body = await response.text();
    const permissionHint = response.status === 401 || response.status === 403
      ? "\nEl token necesita permiso: schema.bases:read"
      : "";
    throw new Error(`No se pudo leer Metadata API de Airtable (${response.status}).${permissionHint}\n${body}`);
  }

  const metadata = await response.json();
  const tablesByName = new Map((metadata.tables ?? []).map((table) => [table.name, table]));
  const missingTables = Object.values(TABLES).filter((name) => !tablesByName.has(name));
  if (missingTables.length) {
    throw new Error(`Faltan tablas Shipping V2 en la metadata: ${missingTables.join(", ")}`);
  }

  const tableIdToName = new Map((metadata.tables ?? []).map((table) => [table.id, table.name]));
  const schema = {
    generatedAt: new Date().toISOString(),
    baseId,
    tables: {},
  };

  for (const tableName of Object.values(TABLES)) {
    const table = tablesByName.get(tableName);
    const fields = {};
    for (const field of table.fields ?? []) {
      const simplified = simplifyField(field);
      if (simplified.linkedTableId) {
        simplified.linkedTableName = tableIdToName.get(simplified.linkedTableId) ?? null;
      }
      fields[field.name] = simplified;
    }
    schema.tables[tableName] = { id: table.id, fields };
  }

  const validation = {
    items: validateExpectedItems(schema.tables[TABLES.items]),
    packings: validateExpectedFields(schema.tables[TABLES.packings], EXPECTED_PACKING_FIELDS),
  };
  for (const [name, result] of Object.entries(validation)) {
    if (!result.ok) {
      console.error(`Validación Shipping ${name} falló.`);
      console.error("Campos encontrados:");
      console.error(result.found.map((field) => `- ${field}`).join("\n"));
      console.error("Campos faltantes:");
      console.error(result.missing.map((field) => `- ${field}`).join("\n"));
      console.error("Campos parecidos posibles:");
      for (const [field, similar] of Object.entries(result.similar)) {
        console.error(`- ${field}: ${similar.length ? similar.join(", ") : "sin candidatos"}`);
      }
      process.exitCode = 1;
      return;
    }
  }

  await mkdir(path.dirname(JSON_OUT), { recursive: true });
  await writeFile(JSON_OUT, `${JSON.stringify(schema, null, 2)}\n`);
  await writeFile(TS_OUT, generatedTs(schema, validation));

  console.log("Metadata API de Airtable leída correctamente.");
  console.log(`Generado: ${path.relative(ROOT, JSON_OUT)}`);
  console.log(`Generado: ${path.relative(ROOT, TS_OUT)}`);
  console.log("Campos reales detectados en Shipping Items:");
  for (const field of validation.items.found) console.log(`- ${field}`);
  console.log("Campos reales detectados en Shipping Packings:");
  for (const field of validation.packings.found) console.log(`- ${field}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
