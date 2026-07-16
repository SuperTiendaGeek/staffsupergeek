import type { ShippingV2ItemSearchEntry } from "@/types/shipping-v2";

export type ShippingV2PreparedSearchField = {
  key: string;
  label: string;
  value: string;
  normalized: string;
};

export type ShippingV2PreparedItemSearchEntry = {
  item: ShippingV2ItemSearchEntry;
  fields: ShippingV2PreparedSearchField[];
  searchText: string;
  nameText: string;
  brandModelText: string;
  providerText: string;
  statusText: string;
  trackingText: string;
  packingText: string;
  registeredAt: number;
};

export type ShippingV2SearchMatch = {
  key: string;
  label: string;
  value: string;
};

export type ShippingV2SearchResult = {
  item: ShippingV2ItemSearchEntry;
  score: number;
  matchedFields: ShippingV2SearchMatch[];
};

export type ShippingV2SearchResults = {
  total: number;
  results: ShippingV2SearchResult[];
};

const DEFAULT_SEARCH_LIMIT = 8;

export function normalizeSearchText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeSearchQuery(query: unknown) {
  return normalizeSearchText(query).split(" ").filter(Boolean);
}

function field(key: string, label: string, value: unknown): ShippingV2PreparedSearchField {
  const stringValue = String(value ?? "").trim();
  return {
    key,
    label,
    value: stringValue,
    normalized: normalizeSearchText(stringValue),
  };
}

function joinNormalized(fields: ShippingV2PreparedSearchField[]) {
  return fields.map((item) => item.normalized).filter(Boolean).join(" ");
}

function registeredAtValue(value?: string) {
  const parsed = Date.parse(value || "");
  return Number.isNaN(parsed) ? -Infinity : parsed;
}

function buildFields(item: ShippingV2ItemSearchEntry) {
  return [
    field("sku", "SKU", item.sku),
    field("skuProveedor", "SKU proveedor", item.skuProveedor),
    field("nombre", "Nombre", item.nombre),
    field("marca", "Marca", item.marca),
    field("modelo", "Modelo", item.modelo),
    field("numeroSerie", "Serie", item.numeroSerie),
    field("estado", "Estado", item.estado),
    field("tipoOperacion", "Tipo", item.tipoOperacion),
    field("proveedorCompra", "Proveedor compra", item.proveedorCompra),
    field("proveedorLogistico", "Proveedor logistico", item.proveedorLogistico),
    field("packingId", "Packing", item.packingId),
    field("legacyPackingId", "Packing legacy", item.legacyPackingId),
    field("trackingDirecto", "Tracking directo", item.trackingDirecto),
    field("trackingHaciaIntermediario", "Tracking hacia intermediario", item.trackingHaciaIntermediario),
    field("trackingDesdeIntermediario", "Tracking desde intermediario", item.trackingDesdeIntermediario),
    field("trackingUsa", "Tracking USA", item.trackingUsa),
    field("trackingEc", "Tracking EC", item.trackingEc),
    field("ubicacionActual", "Ubicacion", item.ubicacionActual),
    field("disponibilidad", "Disponibilidad", item.disponibilidad),
  ].filter((item) => item.normalized);
}

export function prepareShippingV2ItemSearchIndex(items: ShippingV2ItemSearchEntry[]) {
  return items.map((item): ShippingV2PreparedItemSearchEntry => {
    const fields = buildFields(item);
    const nameFields = fields.filter((entry) => ["nombre"].includes(entry.key));
    const brandModelFields = fields.filter((entry) => ["marca", "modelo"].includes(entry.key));
    const providerFields = fields.filter((entry) => ["proveedorCompra", "proveedorLogistico"].includes(entry.key));
    const statusFields = fields.filter((entry) => ["estado", "tipoOperacion"].includes(entry.key));
    const trackingFields = fields.filter((entry) => entry.key.startsWith("tracking"));
    const packingFields = fields.filter((entry) => entry.key === "packingId" || entry.key === "legacyPackingId");

    return {
      item,
      fields,
      searchText: joinNormalized(fields),
      nameText: joinNormalized(nameFields),
      brandModelText: joinNormalized(brandModelFields),
      providerText: joinNormalized(providerFields),
      statusText: joinNormalized(statusFields),
      trackingText: joinNormalized(trackingFields),
      packingText: joinNormalized(packingFields),
      registeredAt: registeredAtValue(item.fechaRegistro || item.createdTime),
    };
  });
}

function normalizedField(entry: ShippingV2PreparedItemSearchEntry, key: string) {
  return entry.fields.find((fieldEntry) => fieldEntry.key === key)?.normalized || "";
}

function exact(value: string, query: string) {
  return Boolean(query && value === query);
}

function starts(value: string, query: string) {
  return Boolean(query && value.startsWith(query));
}

function allTokensInText(tokens: string[], text: string) {
  return tokens.length > 0 && tokens.every((token) => text.includes(token));
}

function allTokensPresent(entry: ShippingV2PreparedItemSearchEntry, tokens: string[]) {
  return tokens.every((token) => entry.fields.some((fieldEntry) => fieldEntry.normalized.includes(token)));
}

function compact(value: string) {
  return value.replace(/\s+/g, "");
}

function calculateScore(entry: ShippingV2PreparedItemSearchEntry, query: string, tokens: string[]) {
  const sku = normalizedField(entry, "sku");
  const supplierSku = normalizedField(entry, "skuProveedor");
  const serial = normalizedField(entry, "numeroSerie");
  const name = normalizedField(entry, "nombre");
  const packing = entry.packingText;
  const tracking = entry.trackingText;
  const compactQuery = compact(query);

  if (exact(sku, query) || exact(compact(sku), compactQuery)) return 0;
  if (exact(supplierSku, query) || exact(compact(supplierSku), compactQuery)) return 10;
  if (exact(serial, query) || exact(compact(serial), compactQuery)) return 20;
  if (entry.fields.some((fieldEntry) => fieldEntry.key.startsWith("tracking") && (exact(fieldEntry.normalized, query) || exact(compact(fieldEntry.normalized), compactQuery)))) return 30;
  if (entry.fields.some((fieldEntry) => (fieldEntry.key === "packingId" || fieldEntry.key === "legacyPackingId") && (exact(fieldEntry.normalized, query) || exact(compact(fieldEntry.normalized), compactQuery)))) return 40;
  if (starts(sku, query) || starts(compact(sku), compactQuery)) return 50;
  if (starts(serial, query) || starts(compact(serial), compactQuery) || entry.fields.some((fieldEntry) => fieldEntry.key.startsWith("tracking") && (starts(fieldEntry.normalized, query) || starts(compact(fieldEntry.normalized), compactQuery)))) return 60;
  if (exact(name, query)) return 70;
  if (starts(name, query)) return 80;
  if (allTokensInText(tokens, entry.brandModelText)) return 90;
  if (allTokensInText(tokens, `${entry.nameText} ${entry.brandModelText}`)) return 100;
  if (allTokensInText(tokens, entry.providerText)) return 120;
  if (allTokensInText(tokens, entry.statusText)) return 140;
  if (allTokensInText(tokens, `${packing} ${tracking}`)) return 150;
  return 200;
}

function findMatchedFields(entry: ShippingV2PreparedItemSearchEntry, query: string, tokens: string[]) {
  const matches = entry.fields.filter((fieldEntry) => {
    if (query && fieldEntry.normalized.includes(query)) return true;
    return tokens.some((token) => fieldEntry.normalized.includes(token));
  });

  const unique = new Map<string, ShippingV2SearchMatch>();
  matches.forEach((match) => {
    if (!unique.has(match.key)) {
      unique.set(match.key, {
        key: match.key,
        label: match.label,
        value: match.value,
      });
    }
  });

  return Array.from(unique.values()).slice(0, 3);
}

export function searchShippingV2ItemIndex(
  index: ShippingV2PreparedItemSearchEntry[],
  rawQuery: unknown,
  options: { limit?: number } = {}
): ShippingV2SearchResults {
  const query = normalizeSearchText(rawQuery);
  const tokens = tokenizeSearchQuery(query);
  const limit = options.limit ?? DEFAULT_SEARCH_LIMIT;

  if (!query || tokens.length === 0) return { total: 0, results: [] };

  const ranked = index
    .filter((entry) => allTokensPresent(entry, tokens))
    .map((entry): ShippingV2SearchResult & { registeredAt: number } => ({
      item: entry.item,
      score: calculateScore(entry, query, tokens),
      matchedFields: findMatchedFields(entry, query, tokens),
      registeredAt: entry.registeredAt,
    }))
    .sort((a, b) => a.score - b.score || b.registeredAt - a.registeredAt || a.item.nombre.localeCompare(b.item.nombre, "es", { sensitivity: "base" }));

  return {
    total: ranked.length,
    results: ranked.slice(0, limit).map(({ registeredAt: _registeredAt, ...result }) => result),
  };
}
