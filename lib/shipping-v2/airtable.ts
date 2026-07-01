import "server-only";

import type {
  ShippingV2DashboardSummary,
  ShippingV2Attachment,
  ShippingV2ComputerCatalogCreateInput,
  ShippingV2ComputerCatalogEntry,
  ShippingV2CpuCatalogCreateInput,
  ShippingV2CpuCatalogEntry,
  ShippingV2Destinatario,
  ShippingV2FinanzasMovimiento,
  ShippingV2Item,
  ShippingV2ItemWriteInput,
  ShippingV2TechnicalSheetInput,
  ShippingV2Novedad,
  ShippingV2Packing,
  ShippingV2PackingWriteInput,
  ShippingV2PagoMarkPaidInput,
  ShippingV2PagoPendingItem,
  ShippingV2PagoSupportCard,
  ShippingV2PagosSummary,
  ShippingV2PagosWorkspace,
  ShippingV2PackingInvoiceData,
  ShippingV2PagoWriteInput,
  ShippingV2Pago,
  ShippingV2Proveedor,
  ShippingV2Recepcion,
  ShippingV2PackingStatusAction,
  ShippingV2PackingNovedadInput,
  ShippingV2RecepcionChecklistAction,
  ShippingV2ItemNovedadInput,
  ShippingV2TechnicalOption,
} from "@/types/shipping-v2";
import type { StaffSession } from "@/lib/session";
import { canAccessApp, isAdministratorRole } from "@/lib/apps";
import { getShippingV2ItemEditField } from "@/lib/shipping-v2/item-edit-config";
import { getDefaultItemFlowByOperation } from "@/lib/shipping-v2/item-operation-rules";
import { createShippingV2ProveedorLabelMap, resolveShippingV2ProveedorLabel } from "@/lib/shipping-v2/provider-labels";
import { canBeItemLogisticsProvider, canBePackingLogisticsProvider, canBePurchaseProvider } from "@/lib/shipping-v2/provider-rules";
import { canBeUsaTransportProvider, isCompatibleEcuadorTransportProvider } from "@/lib/shipping-v2/tracking-providers";
import { generateUniqueSkuFromExistingSkus, normalizeSku } from "@/lib/sku/sku-service";
import { assertShippingV2GeneratedSchema, SHIPPING_V2_COMPUTER_CATALOG_FIELDS, SHIPPING_V2_COMPUTER_CATALOG_SELECT_OPTIONS, SHIPPING_V2_CONNECTIVITY_CATALOG_FIELDS, SHIPPING_V2_CPU_CATALOG_FIELDS, SHIPPING_V2_CPU_CATALOG_SELECT_OPTIONS, SHIPPING_V2_EXTRA_FEATURES_CATALOG_FIELDS, SHIPPING_V2_FINANCE_FIELDS, SHIPPING_V2_FINANCE_SELECT_OPTIONS, SHIPPING_V2_ITEM_FIELDS, SHIPPING_V2_ITEM_SELECT_OPTIONS, SHIPPING_V2_PACKING_FIELDS, SHIPPING_V2_PACKING_SELECT_OPTIONS, SHIPPING_V2_PAYMENT_FIELDS, SHIPPING_V2_PAYMENT_SELECT_OPTIONS, SHIPPING_V2_PORTS_CATALOG_FIELDS, SHIPPING_V2_PROVIDER_FIELDS, SHIPPING_V2_TABLES } from "@/lib/shipping-v2/schema.generated";
import { calculateShippingV2BatteryState, shippingV2CategoryDoesNotUseScreenOrBattery, shippingV2CategoryHasBattery } from "@/lib/shipping-v2/technical-sheet";

type AirtableRecord = {
  id: string;
  createdTime?: string;
  fields: Record<string, unknown>;
};

type AirtableListResponse = {
  records?: AirtableRecord[];
  offset?: string;
};

type AirtableRecordResponse = AirtableRecord;

type AirtableMutationResponse = {
  records?: AirtableRecord[];
};

export type ShippingV2TechnicalOptionType = "connectivity" | "port" | "extraFeature";

export type ShippingV2AttachmentUpload = {
  filename: string;
  contentType: string;
  fileBase64: string;
};

const PACKING_LOGISTICS_MODES = new Set(["Pendiente de packing", "Crear packing individual", "Asignar a packing existente"]);
const OPEN_PACKING_STATUS = "En Proceso";
const PACKING_CANDIDATE_STATES = new Set(["registrado", "pendiente de pago", "pagado", "pendiente de packing"]);
const PACKING_BLOCKED_STATES = new Set(["vendido", "cancelado", "archivado", "destinado a partes", "desarmado parcialmente", "desarmado completamente"]);
const PACKING_CANDIDATE_MODES = new Set(["Pendiente de packing", "Crear packing individual", "Asignar a packing existente"]);
const SHIPPING_V2_DESTINATARIOS_TABLE = "Shipping Destinatarios";
const SHIPPING_V2_DESTINATARIO_PACKING_FIELD = "Packing vinculado";
const SHIPPING_V2_PACKING_ORDER_REFERENCE_FIELD = "Orden referencia";
const SHIPPING_V2_PACKING_INVOICE_FIELD = "Factura";

export type ShippingV2AccessContext = {
  isAdmin: boolean;
  providerId?: string;
};

function getRequiredEnv(name: "AIRTABLE_API_KEY" | "AIRTABLE_BASE_ID") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name}. Definir en .env.local para habilitar Shipping.`);
  return value;
}

function getClient() {
  const baseId = getRequiredEnv("AIRTABLE_BASE_ID");

  return {
    baseUrl: `https://api.airtable.com/v0/${baseId}`,
    headers: {
      Authorization: `Bearer ${getRequiredEnv("AIRTABLE_API_KEY")}`,
      "Content-Type": "application/json",
    },
  };
}

function tableUrl(tableName: string) {
  return `${getClient().baseUrl}/${encodeURIComponent(tableName)}`;
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

function isValidModoLogistico(value: string) {
  return SHIPPING_V2_ITEM_SELECT_OPTIONS.modoLogistico.includes(value as never);
}

function resolveModoLogistico(inputValue: unknown, defaultValue: string) {
  const value = cleanString(inputValue);
  if (value && isValidModoLogistico(value)) return value;
  return defaultValue;
}

function aiTextString(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const aiValue = (value as { value?: unknown }).value;
    return firstString(aiValue, fallback);
  }
  return firstString(value, fallback);
}

function firstNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim().replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = firstNumber(item);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

function validateOptionalWeight(value: number | null | undefined) {
  if (value === undefined || value === null) return;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Peso inválido.");
  if (value < 0) throw new Error("El peso no puede ser negativo.");
}

function validateOptionalMoney(value: number | null | undefined, label: string) {
  if (value === undefined || value === null) return;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} debe ser un número válido.`);
  if (value < 0) throw new Error(`${label} no puede ser negativo.`);
}

function firstBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value !== 0;
  if (typeof value === "string") {
    const normalized = normalizeStatus(value);
    if (["si", "sí", "true", "yes", "disponible"].includes(normalized)) return true;
    if (["no", "false", "not", "n/a", "no disponible"].includes(normalized)) return false;
  }
  return null;
}

function linkedRecordIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function mapAttachments(value: unknown): ShippingV2Attachment[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): ShippingV2Attachment | null => {
      if (!item || typeof item !== "object") return null;
      const attachment = item as {
        id?: unknown;
        url?: unknown;
        filename?: unknown;
        type?: unknown;
        width?: unknown;
        height?: unknown;
        thumbnails?: {
          small?: { url?: unknown };
          large?: { url?: unknown };
          full?: { url?: unknown };
        };
      };

      if (typeof attachment.url !== "string" || !attachment.url) return null;

      const thumbnailUrl =
        firstString(attachment.thumbnails?.large?.url) ||
        firstString(attachment.thumbnails?.small?.url) ||
        firstString(attachment.thumbnails?.full?.url) ||
        undefined;

      return {
        id: firstString(attachment.id) || undefined,
        url: attachment.url,
        filename: firstString(attachment.filename) || undefined,
        type: firstString(attachment.type) || undefined,
        width: firstNumber(attachment.width) ?? undefined,
        height: firstNumber(attachment.height) ?? undefined,
        thumbnailUrl,
      };
    })
    .filter((item): item is ShippingV2Attachment => Boolean(item));
}

function stringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => firstString(item))
      .map((item) => item.trim())
      .filter(Boolean);
  }
  const text = firstString(value);
  if (!text) return [];
  return text.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
}

const TECHNICAL_OPTION_ALIASES: Record<string, string> = {
  bluetooh: "Bluetooth",
  wifi: "Wi-Fi",
  wi_fi: "Wi-Fi",
  lan: "Ethernet",
  "usb c": "USB-C",
  usbc: "USB-C",
  "usb c port": "USB-C",
  "usb-c port": "USB-C",
  audio: "Audio Jack",
  jack: "Audio Jack",
};

function linkedCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function normalizeStatus(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeTechnicalOption(value: string) {
  return normalizeStatus(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeShippingV2TechnicalOptionLabel(value: string) {
  const trimmed = cleanString(value).replace(/\s+/g, " ");
  if (!trimmed) return "";
  const normalized = normalizeTechnicalOption(trimmed);
  return TECHNICAL_OPTION_ALIASES[normalized] ?? trimmed;
}

function normalizeShippingV2TechnicalOptionLabelForType(type: ShippingV2TechnicalOptionType, value: string) {
  const trimmed = cleanString(value).replace(/\s+/g, " ");
  if (!trimmed) return "";
  const normalized = normalizeTechnicalOption(trimmed);
  if (type === "connectivity" && ["lan", "rj45"].includes(normalized)) return "Ethernet";
  if (["wifi", "wi fi"].includes(normalized)) return "Wi-Fi";
  if (["usb c", "usb type c", "usbc"].includes(normalized)) return "USB-C";
  return TECHNICAL_OPTION_ALIASES[normalized] ?? trimmed;
}

function getShippingV2TechnicalOptionConfig(type: ShippingV2TechnicalOptionType) {
  if (type === "connectivity") {
    return {
      table: SHIPPING_V2_TABLES.connectivityCatalog,
      fields: SHIPPING_V2_CONNECTIVITY_CATALOG_FIELDS,
    };
  }
  if (type === "port") {
    return {
      table: SHIPPING_V2_TABLES.portsCatalog,
      fields: SHIPPING_V2_PORTS_CATALOG_FIELDS,
    };
  }
  return {
    table: SHIPPING_V2_TABLES.extraFeaturesCatalog,
    fields: SHIPPING_V2_EXTRA_FEATURES_CATALOG_FIELDS,
  };
}

function mapTechnicalOptionRecord(record: AirtableRecord, fields: typeof SHIPPING_V2_CONNECTIVITY_CATALOG_FIELDS): ShippingV2TechnicalOption {
  const f = record.fields;
  return {
    id: record.id,
    createdTime: record.createdTime,
    name: firstString(f[fields.name]),
    aliases: stringArray(f[fields.aliases]),
    active: firstBoolean(f[fields.active]),
    order: firstNumber(f[fields.order]),
    description: firstString(f[fields.description]),
    createdFromPortal: firstBoolean(f[fields.createdFromPortal]),
    createdAt: firstString(f[fields.createdAt]),
    createdBy: firstString(f[fields.createdBy]),
    notes: firstString(f[fields.notes]),
  };
}

async function listTechnicalOptions(type: ShippingV2TechnicalOptionType) {
  const config = getShippingV2TechnicalOptionConfig(type);
  const records = await listRecords(config.table, {
    pageSize: 100,
    sortField: config.fields.order,
    sortDirection: "asc",
  });
  const all = records
    .map((record) => mapTechnicalOptionRecord(record, config.fields))
    .filter((option) => option.name);
  const active = all.filter((option) => option.active === true);
  const options = active.length ? active : all;
  return options.sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name));
}

export async function listConnectivityOptions() {
  return listTechnicalOptions("connectivity");
}

export async function listPortOptions() {
  return listTechnicalOptions("port");
}

export async function listExtraFeatureOptions() {
  return listTechnicalOptions("extraFeature");
}

export async function getShippingV2TechnicalOptionSets() {
  const [connectivity, ports, extraFeatures] = await Promise.all([
    listConnectivityOptions(),
    listPortOptions(),
    listExtraFeatureOptions(),
  ]);
  return { connectivity, ports, extraFeatures };
}

function normalizeCpuCatalogModel(value: string) {
  return normalizeStatus(value)
    .replace(/\b(intel|amd|apple|qualcomm)\b/g, " ")
    .replace(/\b(cpu|processor|procesador)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bpro\b/g, " pro ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComputerCatalogText(value: string) {
  return normalizeStatus(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripComputerBrandFromModel(computerModel: string, brand?: string) {
  let model = cleanString(computerModel);
  const candidates = [cleanString(brand), ...SHIPPING_V2_COMPUTER_CATALOG_SELECT_OPTIONS.brand].filter(Boolean);

  for (const candidate of candidates) {
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    model = model.replace(new RegExp(`^\\s*${escaped}\\b\\s*`, "i"), "").trim();
  }

  return model;
}

function computerCatalogSearchKeys(brand: string | undefined, model: string) {
  const cleanBrand = cleanString(brand);
  const cleanModel = stripComputerBrandFromModel(model, cleanBrand);
  const combined = [cleanBrand, cleanModel].filter(Boolean).join(" ");
  const normalizedCombined = normalizeComputerCatalogText(combined || cleanModel || model);
  const normalizedModel = normalizeComputerCatalogText(cleanModel || model);
  return {
    normalizedCombined,
    compactCombined: normalizedCombined.replace(/\s+/g, ""),
    normalizedModel,
    compactModel: normalizedModel.replace(/\s+/g, ""),
  };
}

function stripCpuBrandFromModel(cpuModel: string, cpuBrand?: string) {
  let model = cleanString(cpuModel);
  const brand = cleanString(cpuBrand);
  const brands = brand ? [brand] : ["AMD", "Intel", "Apple", "Qualcomm"];

  for (const candidate of brands) {
    const normalizedCandidate = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    model = model.replace(new RegExp(`^\\s*${normalizedCandidate}\\b\\s*`, "i"), "").trim();
  }

  return model;
}

function cpuCatalogSearchKeys(value: string) {
  const normalized = normalizeCpuCatalogModel(value);
  const compact = normalized.replace(/\s+/g, "");
  return { normalized, compact };
}

function normalizeCpuFrequency(value: unknown) {
  const text = cleanString(value);
  if (!text) return "";
  const match = text.replace(",", ".").match(/(\d+(?:\.\d+)?)/);
  if (!match) return text;
  return `${Number(match[1]).toFixed(2)}GHz`;
}

function cpuFrequencyWithoutUnit(value: string) {
  return value.replace(/\s*ghz\s*$/i, "").trim();
}

function buildOriginalCpuFrequency(baseFrequency: string, turboFrequency: string) {
  if (!baseFrequency || !turboFrequency) return "";
  return `${cpuFrequencyWithoutUnit(baseFrequency)}-${cpuFrequencyWithoutUnit(turboFrequency)}`;
}

function escapeFormulaString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSingleSelectValue(value: unknown) {
  return cleanString(value).replace(/^"+|"+$/g, "").trim();
}

function isAllowedInBothSelects(value: string, firstOptions: readonly string[], secondOptions: readonly string[]) {
  return firstOptions.includes(value) && secondOptions.includes(value);
}

function normalizeAndValidatePaymentSupportInput(input: ShippingV2PagoMarkPaidInput) {
  const metodoPago = normalizeSingleSelectValue(input.metodoPago);
  const cuentaOrigen = normalizeSingleSelectValue(input.cuentaOrigen);
  const metodo = normalizeStatus(metodoPago);
  const cuenta = normalizeStatus(cuentaOrigen);

  if (!cleanString(input.fechaPagoReal)) throw new Error("Fecha real de pago es obligatoria para completar soporte.");
  if (!metodoPago || metodo === "no aplica") throw new Error("Selecciona un método de pago válido.");
  if (!isAllowedInBothSelects(metodoPago, SHIPPING_V2_PAYMENT_SELECT_OPTIONS.metodoPago, SHIPPING_V2_FINANCE_SELECT_OPTIONS.metodo)) {
    throw new Error("Método de pago no válido. Selecciona una opción existente.");
  }
  if (!cuentaOrigen || cuenta === "no aplica") throw new Error("Selecciona una cuenta origen válida.");
  if (!isAllowedInBothSelects(cuentaOrigen, SHIPPING_V2_PAYMENT_SELECT_OPTIONS.cuentaOrigen, SHIPPING_V2_FINANCE_SELECT_OPTIONS.cuentaOrigen)) {
    throw new Error("Cuenta origen no válida. Selecciona una opción existente.");
  }
  if (!cleanString(input.transaccionId) && !cleanString(input.comprobanteUrl)) throw new Error("Ingresa comprobante o transacción ID para completar soporte.");

  return {
    ...input,
    metodoPago,
    cuentaOrigen,
  };
}

function getOfficialSkuField() {
  return SHIPPING_V2_ITEM_FIELDS.sku;
}

function getOfficialPackingIdField() {
  return SHIPPING_V2_PACKING_FIELDS.packingId;
}

function selectOption(options: readonly string[], value: string) {
  return options.includes(value) ? value : options[0] ?? value;
}

function optionalSelectOption(options: readonly string[], value: unknown) {
  const text = cleanString(value);
  if (!text) return null;
  if (!options.includes(text)) throw new Error(`"${text}" no es una opción válida.`);
  return text;
}

function optionalTextField(value: unknown) {
  const text = cleanString(value);
  return text || null;
}

function optionalNumberField(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const number = firstNumber(value);
  if (number === null) throw new Error("Valor numérico inválido.");
  return number;
}

function knownOptionOrUndefined(options: readonly string[], value: string) {
  if (!value) return undefined;
  return !options.length || options.includes(value) ? value : undefined;
}

function hasOwnInput(input: ShippingV2PackingWriteInput, key: keyof ShippingV2PackingWriteInput) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function providerNameFromLink(fields: Record<string, unknown>, linkValue: unknown, labels: string[]) {
  for (const label of labels) {
    const value = firstString(fields[label]);
    if (value) return value;
  }
  return firstString(linkValue);
}

function isOpenPackingStatus(status: string) {
  return normalizeStatus(status) === normalizeStatus(OPEN_PACKING_STATUS);
}

function canAccessPacking(packing: Pick<ShippingV2Packing, "proveedorResponsableId" | "proveedorLogisticoEcId" | "transportistaUsa" | "transportistaEc">, access?: ShippingV2AccessContext) {
  if (!access || access.isAdmin || !access.providerId) return true;
  return packing.proveedorResponsableId === access.providerId ||
    packing.proveedorLogisticoEcId === access.providerId ||
    packing.transportistaUsa === access.providerId ||
    packing.transportistaEc === access.providerId;
}

function canAccessItem(item: Pick<ShippingV2Item, "proveedorId" | "proveedorLogisticoId">, access?: ShippingV2AccessContext) {
  if (!access || access.isAdmin || !access.providerId) return true;
  return item.proveedorId === access.providerId || item.proveedorLogisticoId === access.providerId;
}

function generatePackingId() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = String(now.getTime()).slice(-5);
  return `PK-${date}-${time}`;
}

function compactFields(fields: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => {
      if (value === undefined || value === null) return false;
      if (typeof value === "string") return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      return true;
    })
  );
}

function isEmptyLinkedValue(value: unknown) {
  return value === "" || value === null || value === undefined;
}

function normalizeInlineValue(type: string, value: unknown) {
  if (type === "checkbox") return value === true || value === "true" || value === "on";
  if (type === "number" || type === "currency") {
    if (value === "" || value === null || value === undefined) return null;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.trim().replace(",", "."));
      if (Number.isFinite(parsed)) return parsed;
    }
    throw new Error("Valor numérico inválido.");
  }
  if (type === "linkedRecord") {
    if (isEmptyLinkedValue(value)) return [];
    if (typeof value !== "string" || !value.trim()) throw new Error("Registro relacionado inválido.");
    return [value.trim()];
  }
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSingleRecordId(value: unknown) {
  if (Array.isArray(value)) return firstString(value);
  return firstString(value);
}

function validateItemInput(input: ShippingV2ItemWriteInput) {
  const tipoOperacion = cleanString(input.tipoOperacion);
  const tipoItem = cleanString(input.tipoItem);
  const estado = cleanString(input.estado);
  const proveedorId = cleanString(input.proveedorId);
  const costoProveedor = input.costoProveedor;

  if (!tipoOperacion) throw new Error("Tipo de operación es obligatorio.");
  if (!tipoItem) throw new Error("Tipo de item es obligatorio.");
  if (!estado) throw new Error("Estado Item es obligatorio.");
  if (input.requierePago && !proveedorId) throw new Error("Proveedor de compra es obligatorio cuando el item requiere pago.");

  if (["Compra a proveedor", "Compra ya pagada"].includes(tipoOperacion)) {
    if (!proveedorId) throw new Error("Proveedor de compra es obligatorio para compras a proveedor.");
    if (costoProveedor === null || costoProveedor === undefined || !Number.isFinite(costoProveedor)) {
      throw new Error("Costo proveedor es obligatorio para compras a proveedor.");
    }
  }

  if (tipoOperacion === "Regalo de proveedor" && costoProveedor !== null && costoProveedor !== undefined && costoProveedor !== 0) {
    throw new Error("En regalos de proveedor, el costo proveedor debe estar vacío o ser 0.");
  }

  const modoLogistico = cleanString(input.modoLogistico);
  if (!modoLogistico || !isValidModoLogistico(modoLogistico)) {
    throw new Error("Modo logístico inválido.");
  }

  if (input.requierePacking && modoLogistico === "No aplica") {
    throw new Error("Si el item requiere packing, el modo logístico no puede ser No aplica.");
  }

  if (PACKING_LOGISTICS_MODES.has(modoLogistico) && !input.requierePacking) {
    throw new Error("Los modos logísticos con packing requieren que Requiere packing quede activo.");
  }
}

function applyCalculatedItemFlow(input: ShippingV2ItemWriteInput): ShippingV2ItemWriteInput {
  const flow = getDefaultItemFlowByOperation({
    tipoOperacion: cleanString(input.tipoOperacion),
    categoria: cleanString(input.categoria),
    tipoItem: cleanString(input.tipoItem),
    proveedorCompra: cleanString(input.proveedorId),
    proveedorLogistico: cleanString(input.proveedorLogisticoId),
    origenFisicoActual: cleanString(input.origenFisicoActual),
    estadoItem: cleanString(input.estado),
  });

  const requestedMode = resolveModoLogistico(input.modoLogistico, flow.modoLogistico);
  const modeUsesPacking = PACKING_LOGISTICS_MODES.has(requestedMode);
  const modeUsesDirectTracking = requestedMode === "Tracking directo";

  return {
    ...input,
    requierePago: flow.requierePago,
    requierePacking: modeUsesDirectTracking ? false : modeUsesPacking ? true : flow.requierePacking,
    afectaInventario: flow.afectaInventario,
    disponibleVenta: flow.disponibleParaVenta,
    modoLogistico: requestedMode,
    estado: flow.estadoItemSugerido,
    estadoRevision: cleanString(input.estadoRevision) || flow.estadoRevisionSugerido,
  };
}

async function validateItemProviderRules(input: { proveedorId?: string; proveedorLogisticoId?: string }) {
  const proveedorId = cleanString(input.proveedorId);
  if (proveedorId) {
    const provider = await getShippingV2ProveedorById(proveedorId);
    if (!provider) throw new Error("El proveedor seleccionado no existe.");
    if (!canBePurchaseProvider(provider)) {
      throw new Error("Este proveedor no puede usarse como proveedor de compra.");
    }
  }

  const proveedorLogisticoId = cleanString(input.proveedorLogisticoId);
  if (proveedorLogisticoId) {
    const provider = await getShippingV2ProveedorById(proveedorLogisticoId);
    if (!provider) throw new Error("El proveedor logístico seleccionado no existe.");
    if (!canBeItemLogisticsProvider(provider)) {
      throw new Error("Este proveedor no está configurado para recibir encargos, triangulación o armado de packings.");
    }
  }
}

async function validateInlineProviderRule(field: string, normalizedValue: unknown) {
  const recordId = normalizeSingleRecordId(normalizedValue);
  if (!recordId) return;

  const provider = await getShippingV2ProveedorById(recordId);
  if (!provider) throw new Error("El proveedor seleccionado no existe.");

  if (field === SHIPPING_V2_ITEM_FIELDS.proveedorCompra && !canBePurchaseProvider(provider)) {
    throw new Error("Este proveedor no puede usarse como proveedor de compra.");
  }

  if (field === SHIPPING_V2_ITEM_FIELDS.proveedorLogistico && !canBeItemLogisticsProvider(provider)) {
    throw new Error("Este proveedor no está configurado para recibir encargos, triangulación o armado de packings.");
  }
}

function getItemFields(input: ShippingV2ItemWriteInput, extra: Record<string, unknown> = {}) {
  assertShippingV2GeneratedSchema();
  const F = SHIPPING_V2_ITEM_FIELDS;
  const tipoOperacion = cleanString(input.tipoOperacion);

  return compactFields({
    [F.nombre]: cleanString(input.nombre),
    [F.descripcion]: cleanString(input.descripcion),
    [F.tipoOperacion]: tipoOperacion,
    [F.tipoItem]: cleanString(input.tipoItem),
    [F.categoria]: cleanString(input.categoria),
    [F.estadoItem]: cleanString(input.estado),
    [F.proveedorCompra]: cleanString(input.proveedorId) ? [cleanString(input.proveedorId)] : undefined,
    [F.proveedorLogistico]: cleanString(input.proveedorLogisticoId) ? [cleanString(input.proveedorLogisticoId)] : undefined,
    [F.requierePago]: Boolean(input.requierePago),
    [F.requierePacking]: Boolean(input.requierePacking),
    [F.modoLogistico]: cleanString(input.modoLogistico),
    [F.afectaInventario]: Boolean(input.afectaInventario),
    [F.disponibleVenta]: Boolean(input.disponibleVenta),
    [F.reservado]: Boolean(input.reservado),
    [F.skuProveedor]: normalizeSku(cleanString(input.skuProveedor)),
    [F.modelo]: cleanString(input.modelo),
    [F.marca]: cleanString(input.marca),
    [F.numeroSerie]: cleanString(input.numeroSerie),
    [F.condicion]: cleanString(input.condicion),
    [F.cantidad]: input.cantidad ?? undefined,
    [F.unidad]: cleanString(input.unidad),
    [F.costoProveedor]: input.costoProveedor ?? undefined,
    [F.precioVentaSugerido]: input.precioVentaSugerido ?? undefined,
    [F.precioVentaFinal]: input.precioVenta ?? undefined,
    [F.ubicacionActual]: cleanString(input.ubicacionActual),
    [F.trackingDirecto]: cleanString(input.trackingDirecto),
    [F.observacionesInternas]: cleanString(input.observacionesInternas),
    [F.observacionVenta]: cleanString(input.observacionVenta),
    [F.estadoRevision]: cleanString(input.estadoRevision),
    [F.estadoTriangulacion]: cleanString(input.estadoTriangulacion),
    [F.estadoDespiece]: cleanString(input.estadoDespiece),
    [F.esRepuesto]: Boolean(input.esRepuesto),
    [F.esUsoLocal]: Boolean(input.usoLocal),
    [F.esRegalo]: tipoOperacion === "Regalo de proveedor",
    ...extra,
  });
}

async function airtableMutation<T>(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: getClient().headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable Shipping V2 escritura ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}

function logLinkedTableMismatch(context: {
  action: string;
  packingRecordId?: string;
  itemRecordIds?: string[];
  tableName: string;
  fieldName: string;
}) {
  console.error("[Shipping V2 linked table mismatch]", context);
}

function isLinkedTableMismatch(error: unknown) {
  return error instanceof Error && error.message.includes("ROW_TABLE_DOES_NOT_MATCH_LINKED_TABLE");
}

async function uploadAttachmentToRecord(input: {
  recordId: string;
  attachmentFieldIdOrName: string;
  filename: string;
  contentType: string;
  fileBase64: string;
}) {
  const client = getClient();
  const url = `https://content.airtable.com/v0/${encodeURIComponent(getRequiredEnv("AIRTABLE_BASE_ID"))}/${encodeURIComponent(input.recordId)}/${encodeURIComponent(input.attachmentFieldIdOrName)}/uploadAttachment`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...client.headers,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      contentType: input.contentType,
      filename: input.filename,
      file: input.fileBase64,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable Shipping V2 uploadAttachment ${response.status}: ${text}`);
  }
}

async function airtableRequest<T>(url: string) {
  const response = await fetch(url, {
    headers: getClient().headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable Shipping V2 error ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}

async function recordExists(tableName: string, recordId: string) {
  const id = cleanString(recordId);
  if (!id) return true;

  const response = await fetch(`${tableUrl(tableName)}/${encodeURIComponent(id)}`, {
    headers: getClient().headers,
    cache: "no-store",
  });

  if (response.status === 404) return false;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable Shipping V2 error ${response.status}: ${text}`);
  }
  return true;
}

async function getRecordById(tableName: string, recordId: string) {
  const id = cleanString(recordId);
  if (!id) return null;

  const response = await fetch(`${tableUrl(tableName)}/${encodeURIComponent(id)}`, {
    headers: getClient().headers,
    cache: "no-store",
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable Shipping V2 error ${response.status}: ${text}`);
  }

  return (await response.json()) as AirtableRecordResponse;
}

async function listRecords(tableName: string, options: { maxRecords?: number; pageSize?: number; sortField?: string; sortDirection?: "asc" | "desc"; filterByFormula?: string } = {}) {
  const records: AirtableRecord[] = [];
  let offset: string | null = null;

  do {
    const url = new URL(tableUrl(tableName));
    url.searchParams.set("pageSize", String(options.pageSize ?? 100));
    if (options.maxRecords) url.searchParams.set("maxRecords", String(options.maxRecords));
    if (options.filterByFormula) url.searchParams.set("filterByFormula", options.filterByFormula);
    if (options.sortField) {
      url.searchParams.append("sort[0][field]", options.sortField);
      url.searchParams.append("sort[0][direction]", options.sortDirection ?? "desc");
    }
    if (offset) url.searchParams.set("offset", offset);

    const data = await airtableRequest<AirtableListResponse>(url.toString());
    records.push(...(data.records ?? []));
    offset = data.offset ?? null;
  } while (offset && (!options.maxRecords || records.length < options.maxRecords));

  return options.maxRecords ? records.slice(0, options.maxRecords) : records;
}

function mapProveedor(record: AirtableRecord): ShippingV2Proveedor {
  const f = record.fields;
  const F = SHIPPING_V2_PROVIDER_FIELDS;
  const proveedorId = firstString(f[F.proveedorId]);
  const nombre = firstString(f[F.nombre] ?? f["Nombre Proveedor"] ?? f.Nombre ?? f.Proveedor);
  const label = proveedorId || nombre || record.id;
  const tipoProveedor = firstString(f[F.tipoProveedor]);

  return {
    id: record.id,
    createdTime: record.createdTime,
    proveedorId,
    label,
    nombre: nombre || label,
    estado: firstString(f[F.estado] ?? f.Estado, "Activo"),
    tipoProveedor,
    requierePagoAntesEnvio: firstBoolean(f["Requiere pago antes de envío"]),
    plazoSugeridoPagoDias: firstNumber(f["Plazo sugerido de pago en días"]),
    metodoPagoPreferido: firstString(f["Método de pago preferido"]),
    cuentaDestinoPagoPreferida: firstString(f["Cuenta o destino de pago preferido"]),
    puedeArmarPackings: firstBoolean(f[F.puedeArmarPackings] ?? f["Puede armar packings"]),
    puedeRecibirEncargosTerceros: firstBoolean(f[F.puedeRecibirEncargosTerceros] ?? f["Puede recibir encargos de terceros"]),
    permiteTriangulacion: firstBoolean(f[F.permiteTriangulacion] ?? f["Permite triangulación"] ?? f["Permite triangulacion"]),
    contacto: firstString(f.Contacto),
    email: firstString(f.Email ?? f["Email de contacto"]),
    telefono: firstString(f.Telefono ?? f["Teléfono"] ?? f["Teléfono / WhatsApp"]),
    pais: firstString(f.Pais ?? f["País"] ?? tipoProveedor),
    paisZonaLogistica: firstString(f[F.paisZonaLogistica] ?? f["País / zona logística"]),
    urlRastreo: firstString(f[F.urlRastreo] ?? f["URL rastreo"]),
    plantillaUrlRastreo: firstString(f[F.plantillaUrlRastreo] ?? f["Plantilla URL rastreo"]),
    website: firstString(f["Website proveedor"] ?? f.Website ?? f["Sitio web"] ?? f["Página web"]),
    pieFactura: firstString(f["Pie factura"]),
    logoProveedor: mapAttachments(f["Logo proveedor"] ?? f.Logo),
    permiteRastreoWeb: firstBoolean(f[F.permiteRastreoWeb] ?? f["Permite rastreo web"]),
    notasRastreo: firstString(f[F.notasRastreo] ?? f["Notas de rastreo"]),
  };
}

function mapCpuCatalogEntry(record: AirtableRecord): ShippingV2CpuCatalogEntry {
  const f = record.fields;
  const F = SHIPPING_V2_CPU_CATALOG_FIELDS;

  return {
    id: record.id,
    createdTime: record.createdTime,
    cpuModel: firstString(f[F.cpuModel]),
    cpuBrand: firstString(f[F.cpuBrand]),
    baseFrequency: firstString(f[F.baseFrequency]),
    turboFrequency: firstString(f[F.turboFrequency]),
    originalFrequency: firstString(f[F.originalFrequency]),
    suggestedRamType: firstString(f[F.suggestedRamType]),
    integratedGpu: firstString(f[F.integratedGpu]),
    sourceName: firstString(f[F.sourceName]),
    sourceUrl: firstString(f[F.sourceUrl]),
    verified: firstBoolean(f[F.verified]),
    usageCount: firstNumber(f[F.usageCount]),
    lastReviewedAt: firstString(f[F.lastReviewedAt]),
    notes: firstString(f[F.notes]),
  };
}

function mapComputerCatalogEntry(record: AirtableRecord): ShippingV2ComputerCatalogEntry {
  const f = record.fields;
  const F = SHIPPING_V2_COMPUTER_CATALOG_FIELDS;

  return {
    id: record.id,
    createdTime: record.createdTime,
    computerModel: firstString(f[F.computerModel]),
    brand: firstString(f[F.brand]),
    suggestedScreenSize: firstString(f[F.suggestedScreenSize]),
    suggestedScreenResolution: firstString(f[F.suggestedScreenResolution]),
    suggestedOperatingSystem: firstString(f[F.suggestedOperatingSystem]),
    suggestedConnectivityV2Ids: linkedRecordIds(f[F.suggestedConnectivityV2]),
    suggestedPortV2Ids: linkedRecordIds(f[F.suggestedPortsV2]),
    suggestedExtraFeatureV2Ids: linkedRecordIds(f[F.suggestedExtraFeaturesV2]),
    suggestedConnectivityV2Names: [],
    suggestedPortV2Names: [],
    suggestedExtraFeatureV2Names: [],
    batteryApplies: firstString(f[F.batteryApplies]),
    suggestedGpu: firstString(f[F.suggestedGpu]),
    sourceName: firstString(f[F.sourceName]),
    sourceUrl: firstString(f[F.sourceUrl]),
    verified: firstBoolean(f[F.verified]),
    usageCount: firstNumber(f[F.usageCount]),
    lastReviewedAt: firstString(f[F.lastReviewedAt]),
    notes: firstString(f[F.notes]),
  };
}

function rankCpuCatalogEntry(entry: ShippingV2CpuCatalogEntry, query: string) {
  const entryModel = stripCpuBrandFromModel(entry.cpuModel, entry.cpuBrand);
  const entryWithBrand = [entry.cpuBrand, entryModel].filter(Boolean).join(" ");
  const entryKeys = cpuCatalogSearchKeys(entryWithBrand || entry.cpuModel);
  const entryModelOnlyKeys = cpuCatalogSearchKeys(entryModel || entry.cpuModel);
  const queryKeys = cpuCatalogSearchKeys(query);
  if (!queryKeys.normalized) return 100;
  if (entryKeys.compact === queryKeys.compact) return 0;
  if (entryModelOnlyKeys.compact === queryKeys.compact) return 0;
  if (entryKeys.normalized === queryKeys.normalized) return 1;
  if (entryModelOnlyKeys.normalized === queryKeys.normalized) return 1;
  if (entryKeys.normalized.includes(queryKeys.normalized) || queryKeys.normalized.includes(entryKeys.normalized)) return 2;
  if (entryModelOnlyKeys.normalized.includes(queryKeys.normalized) || queryKeys.normalized.includes(entryModelOnlyKeys.normalized)) return 2;
  if (entryKeys.compact.includes(queryKeys.compact) || queryKeys.compact.includes(entryKeys.compact)) return 3;
  if (entryModelOnlyKeys.compact.includes(queryKeys.compact) || queryKeys.compact.includes(entryModelOnlyKeys.compact)) return 3;
  return 100;
}

function isCpuCatalogBrand(value: string) {
  return SHIPPING_V2_CPU_CATALOG_SELECT_OPTIONS.cpuBrand.includes(value as never);
}

function isCpuCatalogRamType(value: string) {
  return SHIPPING_V2_CPU_CATALOG_SELECT_OPTIONS.suggestedRamType.includes(value as never);
}

function rankComputerCatalogEntry(entry: ShippingV2ComputerCatalogEntry, brand: string, model: string) {
  const entryKeys = computerCatalogSearchKeys(entry.brand, entry.computerModel);
  const queryKeys = computerCatalogSearchKeys(brand, model);
  if (!queryKeys.normalizedCombined && !queryKeys.normalizedModel) return 100;
  if (entryKeys.compactCombined === queryKeys.compactCombined) return 0;
  if (entryKeys.compactModel === queryKeys.compactModel) return brand ? 1 : 0;
  if (entryKeys.normalizedCombined === queryKeys.normalizedCombined) return 1;
  if (entryKeys.normalizedModel === queryKeys.normalizedModel) return 1;
  if (entryKeys.normalizedCombined.includes(queryKeys.normalizedModel) || entryKeys.normalizedModel.includes(queryKeys.normalizedModel)) return 2;
  if (queryKeys.normalizedModel.includes(entryKeys.normalizedModel)) return 3;
  if (entryKeys.compactCombined.includes(queryKeys.compactModel) || entryKeys.compactModel.includes(queryKeys.compactModel)) return 4;
  return 100;
}

type MapItemOptions = { includeAiName?: boolean };
type MapPackingOptions = { includeItems?: boolean; includeAiName?: boolean };

function mapItem(record: AirtableRecord, options: MapItemOptions = {}): ShippingV2Item {
  assertShippingV2GeneratedSchema();
  const F = SHIPPING_V2_ITEM_FIELDS;
  const f = record.fields;
  const includeAiName = options.includeAiName !== false;
  const proveedorCompra = f[F.proveedorCompra];
  const proveedorLogistico = f[F.proveedorLogistico];
  const fechaRegistro = firstString(f[F.fechaRegistro], record.createdTime);
  const packingRelacionado = f[F.packingRelacionado];
  const pagoRelacionado = f[F.pagoRelacionado];
  const pagoV2ItemIds = linkedRecordIds(f["Shipping Pagos (Items relacionados)"]);
  const pagoV2RegaloIds = linkedRecordIds(f["Shipping Pagos (Regalos incluidos)"]);

  const sku = firstString(f[getOfficialSkuField()], record.id);

  return {
    id: record.id,
    createdTime: record.createdTime,
    sku,
    itemId: sku,
    codigo: sku,
    skuInterno: sku,
    skuProveedor: firstString(f[F.skuProveedor]),
    metodoAsignacionSku: firstString(f[F.metodoAsignacionSku]),
    skuProveedorUsadoComoInterno: firstBoolean(f[F.skuProveedorUsadoComoInterno]),
    skuDuplicadoDetectado: firstBoolean(f[F.skuDuplicadoDetectado]),
    skuOriginalSugerido: firstString(f[F.skuOriginalSugerido]),
    nombre: firstString(f[F.nombre]),
    aiNombre: includeAiName ? aiTextString(f[F.aiNombre]) : "",
    descripcion: firstString(f[F.descripcion]),
    modelo: firstString(f[F.modelo]),
    marca: firstString(f[F.marca]),
    numeroSerie: firstString(f[F.numeroSerie]),
    categoria: firstString(f[F.categoria]),
    tipoOperacion: firstString(f[F.tipoOperacion]),
    tipoItem: firstString(f[F.tipoItem]),
    condicion: firstString(f[F.condicion]),
    cantidad: firstNumber(f[F.cantidad]),
    unidad: firstString(f[F.unidad]),
    estado: firstString(f[F.estadoItem], "Registrado"),
    estadoRevision: firstString(f[F.estadoRevision]),
    estadoTriangulacion: firstString(f[F.estadoTriangulacion]),
    estadoDespiece: firstString(f[F.estadoDespiece]),
    afectaInventario: firstBoolean(f[F.afectaInventario]),
    proveedorId: firstString(proveedorCompra),
    proveedorNombre: firstString(f["Nombre Proveedor"] ?? f["Proveedor Nombre"] ?? f["Proveedor de compra nombre"] ?? proveedorCompra),
    proveedorLogisticoId: firstString(proveedorLogistico),
    proveedorLogisticoNombre: firstString(f["Proveedor logistico nombre"] ?? f["Proveedor logístico nombre"] ?? f["Proveedor Logistico Nombre"] ?? proveedorLogistico),
    requierePago: firstBoolean(f[F.requierePago]),
    modoLogistico: firstString(f[F.modoLogistico]),
    costoProveedor: firstNumber(f[F.costoProveedor]),
    fletePacking: firstNumber(f[F.fletePacking]),
    arancelPacking: firstNumber(f[F.arancelPacking]),
    otrosCostosPacking: firstNumber(f[F.otrosCostosPacking]),
    reglaDistribucionPacking: firstString(f[F.reglaDistribucionPacking]),
    totalCostoProveedorPacking: firstNumber(f[F.totalCostoProveedorPacking]),
    cantidadItemsPacking: firstNumber(f[F.cantidadItemsPacking]),
    costoFleteAsignado: firstNumber(f[F.costoFleteAsignado]),
    costoArancelAsignado: firstNumber(f[F.costoArancelAsignado]),
    otrosCostosAsignados: firstNumber(f[F.otrosCostosAsignados]),
    costoAsignadoDespiece: firstNumber(f["Costo asignado por despiece"] ?? f["Costo Asignado Despiece"]),
    costoLogisticoAsignado: firstNumber(f[F.costoLogisticoAsignado] ?? f["Costo logístico asignado"] ?? f["Costo logistico asignado"] ?? f["Costo Logistico Asignado"]),
    costoTotalUnidad: firstNumber(f[F.costoTotalUnidad]),
    costoTotalEstimado: firstNumber(f["Costo total estimado"] ?? f["Costo Total Estimado"]),
    precioVentaSugerido: firstNumber(f[F.precioVentaSugerido]),
    precioVenta: firstNumber(f[F.precioVentaFinal]),
    qty: firstNumber(f[F.cantidad]),
    disponibleVenta: firstBoolean(f[F.disponibleVenta]),
    reservado: firstBoolean(f[F.reservado]),
    usoLocal: firstBoolean(f[F.esUsoLocal]),
    esRepuesto: firstBoolean(f[F.esRepuesto]),
    esRegalo: firstBoolean(f[F.esRegalo]),
    conNovedad: firstBoolean(f["Con novedad"] ?? f.Novedad ?? f.Novedades),
    revisadoFisicamente: firstBoolean(f["Revisado física/técnicamente"]),
    revisadoPor: firstString(f["Revisado por"]),
    fechaRevision: firstString(f["Fecha revisión"]),
    fotosTomadas: firstBoolean(f["Fotos tomadas"]),
    fotosTomadasPor: firstString(f["Fotos tomadas por"]),
    fechaFotos: firstString(f["Fecha fotos"]),
    shopifyPublicado: firstBoolean(f["Shopify publicado"]),
    shopifyPublicadoPor: firstString(f["Shopify publicado por"]),
    fechaShopifyPublicado: firstString(f["Fecha Shopify publicado"]),
    marketplacePublicado: firstBoolean(f["Marketplace publicado"]),
    marketplacePublicadoPor: firstString(f["Marketplace publicado por"]),
    fechaMarketplacePublicado: firstString(f["Fecha Marketplace publicado"]),
    mercadoLibrePublicado: firstBoolean(f["Mercado Libre publicado"]),
    mercadoLibrePublicadoPor: firstString(f["Mercado Libre publicado por"]),
    fechaMercadoLibrePublicado: firstString(f["Fecha Mercado Libre publicado"]),
    gruposFacebookPublicado: firstBoolean(f["Grupos Facebook publicado"]),
    facebookPublicadoPor: firstString(f["Facebook publicado por"]),
    fechaFacebookPublicado: firstString(f["Fecha Facebook publicado"]),
    observacionRecepcion: firstString(f["Observación recepción"]),
    technicalSheet: {
      marcaFicha: firstString(f[F.marcaFicha]),
      modeloFicha: firstString(f[F.modeloFicha]),
      sistemaOperativo: firstString(f[F.sistemaOperativo]),
      pantallaTamano: firstString(f[F.pantallaTamano]),
      pantallaResolucion: firstString(f[F.pantallaResolucion]),
      cpuMarca: firstString(f[F.cpuMarca]),
      cpuModelo: firstString(f[F.cpuModelo]),
      cpuFrecuenciaBase: firstString(f[F.cpuFrecuenciaBase]),
      cpuFrecuenciaTurbo: firstString(f[F.cpuFrecuenciaTurbo]),
      ramCapacidad: firstString(f[F.ramCapacidad]),
      ramTipo: firstString(f[F.ramTipo]),
      almacenamientoPrincipal: firstString(f[F.almacenamientoPrincipal]),
      almacenamientoTipo: firstString(f[F.almacenamientoTipo]),
      gpu: firstString(f[F.gpu]),
      bateriaSalud: firstNumber(f[F.bateriaSalud]),
      bateriaEstado: firstString(f[F.bateriaEstado]),
      connectivityV2Ids: linkedRecordIds(f[F.conectividadV2]),
      portV2Ids: linkedRecordIds(f[F.puertosV2]),
      extraFeatureV2Ids: linkedRecordIds(f[F.caracteristicasExtrasV2]),
      connectivityV2Names: [],
      portV2Names: [],
      extraFeatureV2Names: [],
      observacionFichaTecnica: firstString(f[F.observacionFichaTecnica]),
      fichaTecnicaGenerada: firstBoolean(f[F.fichaTecnicaGenerada]),
      fichaTecnicaRevisada: firstBoolean(f[F.fichaTecnicaRevisada]),
      fichaTecnicaGeneradaPor: firstString(f[F.fichaTecnicaGeneradaPor]),
      fichaTecnicaRevisadaPor: firstString(f[F.fichaTecnicaRevisadaPor]),
      fechaFichaTecnicaGenerada: firstString(f[F.fechaFichaTecnicaGenerada]),
      fechaFichaTecnicaRevisada: firstString(f[F.fechaFichaTecnicaRevisada]),
    },
    ubicacionActual: firstString(f[F.ubicacionActual]),
    origenFisicoActual: firstString(f["Origen físico actual"] ?? f["Origen fisico actual"] ?? f["Origen Fisico Actual"]),
    fechaRegistro,
    trackingDirecto: firstString(f[F.trackingDirecto]),
    trackingHaciaIntermediario: firstString(f[F.trackingHaciaIntermediario]),
    trackingDesdeIntermediario: firstString(f[F.trackingDesdeIntermediario]),
    trackingUsa: firstString(f["USA Tracking"] ?? f.TrackingUSA),
    trackingEc: firstString(f["EC Tracking"] ?? f.TrackingEC),
    requierePacking: firstBoolean(f[F.requierePacking]),
    pagoV2ItemIds,
    pagoV2RegaloIds,
    packingId: firstString(packingRelacionado),
    pagoId: pagoV2ItemIds[0] ?? pagoV2RegaloIds[0],
    legacyPagoRelacionadoIds: linkedRecordIds(pagoRelacionado),
    itemPadreId: firstString(f["Item padre"] ?? f["Item Padre"]),
    itemHijoIds: linkedRecordIds(f["Items hijos"] ?? f["Items Hijos"]),
    motivoDespiece: firstString(f["Motivo de despiece"] ?? f["Motivo Despiece"]),
    fechaDespiece: firstString(f["Fecha de despiece"] ?? f["Fecha Despiece"]),
    responsableDespiece: firstString(f["Responsable de despiece"] ?? f["Responsable Despiece"]),
    esParteRecuperada: firstBoolean(f["Es parte recuperada"] ?? f["Parte recuperada"]),
    observacionesInternas: firstString(f[F.observacionesInternas]),
    observacionVenta: firstString(f[F.observacionVenta]),
    legacyItemId: firstString(f["Legacy Item ID"]),
    legacyPagoId: firstString(f["Legacy Pago ID"]),
    legacyPackingId: firstString(f["Legacy Packing ID"]),
    fuenteMigracion: firstString(f["Fuente de migración"] ?? f["Fuente de migracion"] ?? f["Fuente Migracion"]),
    estadoMigracion: firstString(f["Estado de migración"] ?? f["Estado de migracion"] ?? f["Estado Migracion"]),
    registradoPor: firstString(f["Registrado por"] ?? f["Registrado Por"]),
    ultimaActualizacion: firstString(f["Última actualización"] ?? f["Ultima actualizacion"] ?? f["Ultima Actualizacion"]),
    actualizadoPor: firstString(f["Actualizado por"] ?? f["Actualizado Por"]),
    fotos: mapAttachments(f[F.fotos] ?? f.Foto ?? f.Imagenes ?? f["Imágenes"]),
    evidencias: mapAttachments(f[F.evidencias] ?? f.Evidencia),
  };
}

function summarizePaymentItem(item: ShippingV2Item) {
  return {
    id: item.id,
    sku: item.sku,
    skuProveedor: item.skuProveedor,
    nombre: item.nombre,
    tipoOperacion: item.tipoOperacion,
    tipoItem: item.tipoItem,
    categoria: item.categoria,
    estado: item.estado,
    proveedorId: item.proveedorId,
    proveedorNombre: item.proveedorNombre,
    proveedorLogisticoId: item.proveedorLogisticoId,
    proveedorLogisticoNombre: item.proveedorLogisticoNombre,
    costoProveedor: item.costoProveedor,
    esRegalo: item.esRegalo,
  };
}

function mapPago(record: AirtableRecord, context: { labelsById?: Map<string, string>; itemsById?: Map<string, ShippingV2Item> } = {}): ShippingV2Pago {
  const F = SHIPPING_V2_PAYMENT_FIELDS;
  const f = record.fields;
  const proveedorId = firstString(f[F.proveedor]);
  const itemIds = linkedRecordIds(f[F.itemsRelacionados]);
  const regalosIds = linkedRecordIds(f[F.regalosIncluidos]);
  const itemsResumen = itemIds.map((id) => context.itemsById?.get(id)).filter((item): item is ShippingV2Item => Boolean(item)).map(summarizePaymentItem);
  const regalosResumen = regalosIds.map((id) => context.itemsById?.get(id)).filter((item): item is ShippingV2Item => Boolean(item)).map(summarizePaymentItem);
  const estadoPago = firstString(f[F.estadoPago], "Pendiente");
  const totalAPagar = firstNumber(f[F.totalAPagar]);
  const movimientosFinanzasIds = linkedRecordIds(f[F.movimientosFinanzas]);
  return {
    id: record.id,
    createdTime: record.createdTime,
    pagoId: firstString(f[F.pagoId], record.id),
    estado: estadoPago,
    estadoPago,
    proveedorId,
    proveedorNombre: resolveShippingV2ProveedorLabel(proveedorId, context.labelsById ?? new Map()),
    itemIds,
    itemsResumen,
    regalosIds,
    regalosResumen,
    total: totalAPagar,
    totalAPagar,
    totalPagado: firstNumber(f[F.totalPagado]),
    saldoPendiente: firstNumber(f[F.saldoPendiente]),
    totalRegalos: regalosResumen.reduce((sum, item) => sum + (item.costoProveedor ?? 0), 0),
    cantidadItems: itemIds.length,
    cantidadRegalos: regalosIds.length,
    fechaCreacion: firstString(f[F.fechaCreacion], record.createdTime),
    fechaVencimientoSugerida: firstString(f[F.fechaVencimientoSugerida]),
    fechaPagoMax: firstString(f[F.fechaVencimientoSugerida]),
    fechaPagoReal: firstString(f[F.fechaPagoReal]),
    metodoPago: firstString(f[F.metodoPago]),
    cuentaOrigen: firstString(f[F.cuentaOrigen]),
    transaccionId: firstString(f[F.transaccionId]),
    comprobante: mapAttachments(f[F.comprobante]),
    facturaProveedor: mapAttachments(f[F.facturaProveedor]),
    observacion: firstString(f[F.observacion]),
    registradoPor: firstString(f[F.registradoPor]),
    pagadoPor: firstString(f[F.pagadoPor]),
    estadoIntegracionFinanzas: firstString(f[F.estadoIntegracionFinanzas]),
    movimientoFinanzasId: movimientosFinanzasIds[0],
    movimientoFinanzasIds: movimientosFinanzasIds,
    fechaAnulacion: firstString(f[F.fechaAnulacion]),
    motivoAnulacion: firstString(f[F.motivoAnulacion]),
  };
}

function mapFinanzasMovimiento(record: AirtableRecord, labelsById: Map<string, string> = new Map()): ShippingV2FinanzasMovimiento {
  const F = SHIPPING_V2_FINANCE_FIELDS;
  const f = record.fields;
  const proveedorId = firstString(f[F.proveedor]);
  return {
    id: record.id,
    createdTime: record.createdTime,
    movimientoId: firstString(f[F.movimientoShippingId], record.id),
    estado: firstString(f[F.estadoIntegracion], "Pendiente de sincronizar"),
    origen: firstString(f[F.origen]),
    tipoMovimiento: firstString(f[F.tipoMovimiento]),
    pagoId: firstString(f[F.pagoShippingRelacionado]),
    proveedorId,
    proveedorNombre: resolveShippingV2ProveedorLabel(proveedorId, labelsById),
    fecha: firstString(f[F.fechaMovimiento]),
    monto: firstNumber(f[F.monto]),
    metodo: firstString(f[F.metodo]),
    cuentaOrigen: firstString(f[F.cuentaOrigen]),
    transaccionId: firstString(f[F.transaccionId]),
    comprobante: mapAttachments(f[F.comprobante]),
    observacion: firstString(f[F.observacion]),
    registradoPor: firstString(f[F.registradoPor]),
  };
}

function mapPacking(record: AirtableRecord): ShippingV2Packing {
  const F = SHIPPING_V2_PACKING_FIELDS;
  const f = record.fields;
  const proveedorResponsable = f[F.proveedorResponsable];
  const proveedorLogisticoEc = f[F.proveedorLogisticoEc];
  const transportistaUsa = f[F.transportistaUsa];
  const transportistaEc = f[F.transportistaEc];
  const items = linkedRecordIds(f[F.itemsIncluidos]);
  const estado = firstString(f[F.estado], OPEN_PACKING_STATUS);
  return {
    id: record.id,
    createdTime: record.createdTime,
    packingId: firstString(f[F.packingId], record.id),
    nombre: firstString(f[F.nombre]),
    estado,
    tipo: firstString(f[F.tipo]),
    // TODO: replace literal with generated schema field after Shipping Packings schema includes it.
    ordenReferencia: firstString(f[SHIPPING_V2_PACKING_ORDER_REFERENCE_FIELD] ?? f["Orden Referencia"] ?? f["Order Reference"]),
    factura: mapAttachments(f[SHIPPING_V2_PACKING_INVOICE_FIELD] ?? f["Factura proveedor"] ?? f.Invoice),
    proveedorResponsableId: firstString(proveedorResponsable),
    proveedorResponsableNombre: providerNameFromLink(f, proveedorResponsable, ["Nombre proveedor responsable", "Proveedor responsable nombre", "Proveedor Responsable Nombre"]),
    proveedorLogisticoEcId: firstString(proveedorLogisticoEc),
    proveedorLogisticoEcNombre: providerNameFromLink(f, proveedorLogisticoEc, ["Proveedor logístico EC nombre", "Proveedor logistico EC nombre", "Proveedor Logistico EC Nombre"]),
    itemIds: items,
    items: [],
    itemCount: items.length,
    trackingUsa: firstString(f[F.trackingUsa]),
    transportistaUsa: firstString(transportistaUsa),
    transportistaUsaNombre: providerNameFromLink(f, transportistaUsa, ["Transportista USA nombre", "Transportista USA Nombre"]),
    trackingEc: firstString(f[F.trackingEc]),
    transportistaEc: firstString(transportistaEc),
    transportistaEcNombre: providerNameFromLink(f, transportistaEc, ["Transportista EC nombre", "Transportista EC Nombre"]),
    peso: firstNumber(f[F.peso]),
    flete: firstNumber(f[F.flete]),
    arancel: firstNumber(f[F.arancel]),
    otrosCostos: firstNumber(f[F.otrosCostos]),
    costoTotalItemsProveedor: firstNumber(f[F.costoTotalItemsProveedor]),
    cantidadItemsPacking: firstNumber(f[F.cantidadItemsPacking]),
    reglaDistribucionCostos: firstString(f[F.reglaDistribucionCostos]),
    reglaDistribucion: firstString(f[F.reglaDistribucionCostos]),
    observacionCostos: firstString(f[F.observacionCostos]),
    observaciones: firstString(f[F.observaciones]),
    fechaCreacion: firstString(f[F.fechaCreacion], record.createdTime),
    fechaCierre: firstString(f[F.fechaCierre]),
    fechaEnvio: firstString(f[F.fechaEnvio]),
    fechaRecepcion: firstString(f[F.fechaRecepcion]),
    cerradoPor: firstString(f[F.cerradoPor]),
    creadoPor: firstString(f[F.creadoPor]),
    conNovedad: normalizeStatus(estado).includes("novedad"),
  };
}

function applyPackingProviderLabels(packing: ShippingV2Packing, labelsById: Map<string, string>) {
  return {
    ...packing,
    proveedorResponsableNombre: resolveShippingV2ProveedorLabel(packing.proveedorResponsableId, labelsById),
    proveedorLogisticoEcNombre: resolveShippingV2ProveedorLabel(packing.proveedorLogisticoEcId, labelsById),
    transportistaUsaNombre: resolveShippingV2ProveedorLabel(packing.transportistaUsa, labelsById),
    transportistaEcNombre: resolveShippingV2ProveedorLabel(packing.transportistaEc, labelsById),
  };
}

function mapDestinatario(record: AirtableRecord): ShippingV2Destinatario {
  const f = record.fields;
  return {
    id: record.id,
    createdTime: record.createdTime,
    nombre: firstString(f.Destinatario ?? f.Nombre ?? f["Nombre destinatario"], "Sin destinatario"),
    empresa: firstString(f["Empresa / Casillero"] ?? f.Empresa ?? f.Casillero),
    direccion: firstString(f["Dirección"] ?? f.Direccion ?? f["Dirección línea 1"] ?? f["Direccion linea 1"]),
    direccionLinea2: firstString(f["Dirección línea 2"] ?? f["Direccion linea 2"] ?? f["Dirección 2"] ?? f["Address line 2"]),
    ciudad: firstString(f.Ciudad ?? f.City),
    estado: firstString(f.Estado ?? f.State),
    codigoPostal: firstString(f["Código postal / ZIP"] ?? f["Codigo postal / ZIP"] ?? f["Código postal"] ?? f.ZIP ?? f.Zip),
    pais: firstString(f["País"] ?? f.Pais ?? f.Country, "USA"),
    telefono: firstString(f["Teléfono"] ?? f.Telefono ?? f.Phone),
    packingIds: linkedRecordIds(f["Packing vinculado"] ?? f.Packing ?? f["Packing relacionado"]),
    packingLabels: [firstString(f["Packing ID (from Packing vinculado)"] ?? f["Packing ID"] ?? f["Packing"])].filter(Boolean),
  };
}

function destinatarioMatchesPacking(destinatario: ShippingV2Destinatario, packing: ShippingV2Packing) {
  return destinatario.packingIds.includes(packing.id) || destinatario.packingLabels.includes(packing.packingId);
}

function sanitizeFilenamePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function invoiceDateStamp(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(date).replace(/-/g, "");
}

export async function getShippingV2Destinatarios() {
  const records = await listRecords(SHIPPING_V2_DESTINATARIOS_TABLE, { maxRecords: 500 });
  return records.map(mapDestinatario);
}

export function findShippingV2PackingDestinatario(destinatarios: ShippingV2Destinatario[], packing: ShippingV2Packing) {
  return destinatarios.find((destinatario) => destinatarioMatchesPacking(destinatario, packing)) ?? null;
}

function mapRecepcion(record: AirtableRecord): ShippingV2Recepcion {
  const f = record.fields;
  return {
    id: record.id,
    createdTime: record.createdTime,
    recepcionId: firstString(f.Recepcion ?? f["Recepción"], record.id),
    estado: firstString(f.Estado, "Pendiente"),
    packingId: firstString(f.Packing),
    fechaRecepcion: firstString(f["Fecha Recepcion"] ?? f["Fecha Recepción"]),
    itemsRecibidos: firstNumber(f["Items Recibidos"]) ?? linkedCount(f.Items ?? f.Item),
    observacion: firstString(f.Observacion ?? f["Observación"]),
  };
}

function mapNovedad(record: AirtableRecord): ShippingV2Novedad {
  const f = record.fields;
  const tipo = firstString(f["Tipo de novedad"] ?? f.Tipo);
  const itemIds = linkedRecordIds(f["Item relacionado"] ?? f.Item);
  const packingIds = linkedRecordIds(f["Packing relacionado"] ?? f.Packing);
  const proveedorResponsableIds = linkedRecordIds(f["Proveedor responsable"] ?? f.Proveedor);

  return {
    id: record.id,
    createdTime: record.createdTime,
    novedadId: firstString(f["Novedad ID"] ?? f.Novedad, record.id),
    titulo: firstString(f.Titulo ?? f["Título"] ?? f.Novedad ?? f["Novedad ID"] ?? tipo, "Sin titulo"),
    tipo,
    estado: firstString(f["Estado Novedad"] ?? f.Estado, "Abierta"),
    severidad: firstString(f.Prioridad ?? f.Severidad ?? f["Tipo de novedad"]),
    itemId: itemIds[0],
    itemIds,
    packingId: packingIds[0],
    packingIds,
    proveedorResponsableId: proveedorResponsableIds[0],
    proveedorResponsableIds,
    descripcion: firstString(f.Descripcion ?? f["Descripción"]),
    evidencias: mapAttachments(f.Evidencias),
    fechaRegistro: firstString(f["Fecha de registro"] ?? f["Fecha registro"], record.createdTime),
    registradoPor: firstString(f["Registrado por"]),
    respuestaProveedor: firstString(f["Respuesta del proveedor"]),
    solucion: firstString(f["Solución"]),
    descripcionSolucion: firstString(f["Descripción de solución"]),
    fechaCierre: firstString(f["Fecha de cierre"]),
    cerradoPor: firstString(f["Cerrado por"]),
    observacionFinal: firstString(f["Observación final"]),
  };
}

export async function getShippingV2Proveedores() {
  const records = await listRecords(SHIPPING_V2_TABLES.proveedores, { maxRecords: 100 });
  return records.map(mapProveedor);
}

export async function getShippingV2AccessContextForSession(session: StaffSession | null): Promise<ShippingV2AccessContext> {
  const role = session?.user.rol;
  if (!session || isAdministratorRole(role) || ["manager", "gerente"].includes(normalizeStatus(role || ""))) {
    return { isAdmin: true };
  }

  const email = session.user.email.trim().toLowerCase();
  if (!email) return { isAdmin: true };

  const proveedores = await getShippingV2Proveedores();
  const provider = proveedores.find((item) => item.email?.trim().toLowerCase() === email);

  // Assumption: the current Staff session does not store a provider record id.
  // Provider-limited access is enabled when the user's email matches a Shipping Proveedor email.
  // Internal staff users without that match keep broad Shipping access until user-provider mapping exists.
  return provider ? { isAdmin: false, providerId: provider.id } : { isAdmin: true };
}

async function getShippingV2ProveedorById(recordId: string) {
  const record = await getRecordById(SHIPPING_V2_TABLES.proveedores, recordId);
  return record ? mapProveedor(record) : null;
}

export async function getShippingV2Items(options: MapItemOptions = {}) {
  const records = await listRecords(SHIPPING_V2_TABLES.items, {
    maxRecords: 200,
    sortField: SHIPPING_V2_ITEM_FIELDS.fechaRegistro,
    sortDirection: "desc",
  });
  return records
    .map((record) => mapItem(record, options))
    .sort((a, b) => {
      const aTime = Date.parse(a.fechaRegistro || a.createdTime || "");
      const bTime = Date.parse(b.fechaRegistro || b.createdTime || "");
      const safeATime = Number.isNaN(aTime) ? -Infinity : aTime;
      const safeBTime = Number.isNaN(bTime) ? -Infinity : bTime;
      return safeBTime - safeATime;
    });
}

export async function getShippingV2ItemById(recordId: string, options: MapItemOptions = {}) {
  const id = cleanString(recordId);
  if (!id) throw new Error("Record ID de item inválido.");

  const record = await airtableRequest<AirtableRecordResponse>(`${tableUrl(SHIPPING_V2_TABLES.items)}/${encodeURIComponent(id)}`);
  const item = mapItem(record, options);
  if (process.env.NODE_ENV !== "production" && process.env.SHIPPING_V2_DEBUG_AI_NAME === "true" && options.includeAiName !== false) {
    console.info("[Shipping V2 AI Nombre]", {
      recordId: id,
      rawAiNombre: record.fields[SHIPPING_V2_ITEM_FIELDS.aiNombre],
      mappedAiNombre: item.aiNombre,
    });
  }
  return item;
}

export async function findShippingV2ItemBySku(skuValue: string) {
  assertShippingV2GeneratedSchema();
  const sku = normalizeSku(cleanString(skuValue));
  if (!sku) return null;

  const records = await listRecords(SHIPPING_V2_TABLES.items, {
    maxRecords: 1,
    filterByFormula: `LOWER({${getOfficialSkuField()}}) = LOWER('${escapeFormulaString(sku)}')`,
  });

  return records[0] ? mapItem(records[0]) : null;
}

export async function listCpuCatalogEntries(options: { query?: string; maxResults?: number } = {}) {
  assertShippingV2GeneratedSchema();
  const records = await listRecords(SHIPPING_V2_TABLES.cpuCatalog, {
    maxRecords: 500,
    sortField: SHIPPING_V2_CPU_CATALOG_FIELDS.usageCount,
    sortDirection: "desc",
  });
  const entries = records.map(mapCpuCatalogEntry).filter((entry) => entry.cpuModel);
  const query = cleanString(options.query);
  const maxResults = options.maxResults ?? 10;
  if (!query) return entries.slice(0, maxResults);

  return entries
    .map((entry) => ({ entry, rank: rankCpuCatalogEntry(entry, query) }))
    .filter((item) => item.rank < 100)
    .sort((a, b) => a.rank - b.rank || (b.entry.usageCount ?? 0) - (a.entry.usageCount ?? 0) || a.entry.cpuModel.localeCompare(b.entry.cpuModel))
    .slice(0, maxResults)
    .map((item) => item.entry);
}

export async function findCpuCatalogEntryByModel(cpuModel: string) {
  const query = cleanString(cpuModel);
  if (!query) return null;
  const matches = await listCpuCatalogEntries({ query, maxResults: 1 });
  const match = matches[0];
  return match && rankCpuCatalogEntry(match, query) <= 1 ? match : null;
}

export async function createCpuCatalogEntryFromTechnicalSheet(input: ShippingV2CpuCatalogCreateInput) {
  assertShippingV2GeneratedSchema();
  const cpuBrand = cleanString(input.cpuBrand);
  const model = stripCpuBrandFromModel(input.cpuModel, cpuBrand);
  if (!model) throw new Error("CPU modelo es obligatorio para crear catálogo.");

  const existing = await findCpuCatalogEntryByModel([cpuBrand, model].filter(Boolean).join(" "));
  if (existing) return existing;

  const F = SHIPPING_V2_CPU_CATALOG_FIELDS;
  const suggestedRamType = cleanString(input.suggestedRamType);
  const baseFrequency = normalizeCpuFrequency(input.baseFrequency);
  const turboFrequency = normalizeCpuFrequency(input.turboFrequency);
  const originalFrequency = baseFrequency && turboFrequency
    ? buildOriginalCpuFrequency(baseFrequency, turboFrequency)
    : cleanString(input.originalFrequency);
  const now = new Date().toISOString();

  // TODO: add a one-off cleanup tool if legacy catalog rows need model/brand/frequency normalization.
  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.cpuCatalog), {
    method: "POST",
    body: JSON.stringify({
      records: [
        {
          fields: compactFields({
            [F.cpuModel]: model,
            [F.cpuBrand]: cpuBrand && isCpuCatalogBrand(cpuBrand) ? cpuBrand : undefined,
            [F.baseFrequency]: baseFrequency,
            [F.turboFrequency]: turboFrequency,
            [F.originalFrequency]: originalFrequency,
            [F.suggestedRamType]: suggestedRamType && isCpuCatalogRamType(suggestedRamType) ? suggestedRamType : undefined,
            [F.integratedGpu]: cleanString(input.integratedGpu),
            [F.sourceName]: cleanString(input.sourceName),
            [F.sourceUrl]: cleanString(input.sourceUrl),
            [F.verified]: Boolean(input.verified),
            [F.usageCount]: input.usageCount ?? 1,
            [F.lastReviewedAt]: input.lastReviewedAt || now,
            [F.notes]: cleanString(input.notes),
          }),
        },
      ],
    }),
  });

  const created = response.records?.[0];
  if (!created) throw new Error("Airtable no devolvió el CPU creado.");
  return mapCpuCatalogEntry(created);
}

export async function incrementCpuCatalogUsage(entryId: string) {
  const id = cleanString(entryId);
  if (!id) return null;

  const existingRecord = await getRecordById(SHIPPING_V2_TABLES.cpuCatalog, id);
  if (!existingRecord) return null;
  const existing = mapCpuCatalogEntry(existingRecord);
  const F = SHIPPING_V2_CPU_CATALOG_FIELDS;
  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.cpuCatalog), {
    method: "PATCH",
    body: JSON.stringify({
      records: [
        {
          id,
          fields: {
            [F.usageCount]: (existing.usageCount ?? 0) + 1,
          },
        },
      ],
    }),
  });

  return response.records?.[0] ? mapCpuCatalogEntry(response.records[0]) : null;
}

export async function listComputerCatalogEntries(options: { brand?: string; model?: string; maxResults?: number } = {}) {
  assertShippingV2GeneratedSchema();
  const records = await listRecords(SHIPPING_V2_TABLES.computerCatalog, {
    maxRecords: 1000,
    sortField: SHIPPING_V2_COMPUTER_CATALOG_FIELDS.usageCount,
    sortDirection: "desc",
  });
  const entries = records.map(mapComputerCatalogEntry).filter((entry) => entry.computerModel);
  const brand = cleanString(options.brand);
  const model = cleanString(options.model);
  const maxResults = options.maxResults ?? 10;
  if (!brand && !model) return entries.slice(0, maxResults);

  return entries
    .map((entry) => ({ entry, rank: rankComputerCatalogEntry(entry, brand, model) }))
    .filter((item) => item.rank < 100)
    .sort((a, b) => a.rank - b.rank || (b.entry.usageCount ?? 0) - (a.entry.usageCount ?? 0) || a.entry.computerModel.localeCompare(b.entry.computerModel))
    .slice(0, maxResults)
    .map((item) => item.entry);
}

export async function findComputerCatalogEntryByBrandAndModel(brand: string, model: string) {
  const cleanBrand = cleanString(brand);
  const cleanModel = cleanString(model);
  if (!cleanBrand && !cleanModel) return null;
  const matches = await listComputerCatalogEntries({ brand: cleanBrand, model: cleanModel, maxResults: 1 });
  const match = matches[0];
  return match && rankComputerCatalogEntry(match, cleanBrand, cleanModel) <= 1 ? match : null;
}

export async function createComputerCatalogEntryFromTechnicalSheet(input: ShippingV2ComputerCatalogCreateInput) {
  assertShippingV2GeneratedSchema();
  const brand = cleanString(input.brand);
  const model = stripComputerBrandFromModel(input.computerModel, brand);
  if (!model) throw new Error("Modelo computador es obligatorio para crear catálogo.");

  const existing = await findComputerCatalogEntryByBrandAndModel(brand, model);
  if (existing) return existing;

  const F = SHIPPING_V2_COMPUTER_CATALOG_FIELDS;
  const now = new Date().toISOString();
  const connectivityV2Ids = linkedRecordIds(input.suggestedConnectivityV2Ids);
  const portV2Ids = linkedRecordIds(input.suggestedPortV2Ids);
  const extraFeatureV2Ids = linkedRecordIds(input.suggestedExtraFeatureV2Ids);

  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.computerCatalog), {
    method: "POST",
    body: JSON.stringify({
      records: [
        {
          fields: compactFields({
            [F.computerModel]: model,
            [F.brand]: knownOptionOrUndefined(SHIPPING_V2_COMPUTER_CATALOG_SELECT_OPTIONS.brand, brand),
            [F.suggestedScreenSize]: knownOptionOrUndefined(SHIPPING_V2_COMPUTER_CATALOG_SELECT_OPTIONS.suggestedScreenSize, cleanString(input.suggestedScreenSize)),
            [F.suggestedScreenResolution]: knownOptionOrUndefined(SHIPPING_V2_COMPUTER_CATALOG_SELECT_OPTIONS.suggestedScreenResolution, cleanString(input.suggestedScreenResolution)),
            [F.suggestedOperatingSystem]: knownOptionOrUndefined(SHIPPING_V2_COMPUTER_CATALOG_SELECT_OPTIONS.suggestedOperatingSystem, cleanString(input.suggestedOperatingSystem)),
            [F.suggestedConnectivityV2]: connectivityV2Ids,
            [F.suggestedPortsV2]: portV2Ids,
            [F.suggestedExtraFeaturesV2]: extraFeatureV2Ids,
            [F.batteryApplies]: knownOptionOrUndefined(SHIPPING_V2_COMPUTER_CATALOG_SELECT_OPTIONS.batteryApplies, cleanString(input.batteryApplies)),
            [F.suggestedGpu]: cleanString(input.suggestedGpu),
            [F.sourceName]: cleanString(input.sourceName),
            [F.sourceUrl]: cleanString(input.sourceUrl),
            [F.verified]: Boolean(input.verified),
            [F.usageCount]: input.usageCount ?? 1,
            [F.lastReviewedAt]: input.lastReviewedAt || now,
            [F.notes]: cleanString(input.notes),
          }),
        },
      ],
    }),
  });

  const created = response.records?.[0];
  if (!created) throw new Error("Airtable no devolvió el modelo creado.");
  return mapComputerCatalogEntry(created);
}

export async function incrementComputerCatalogUsage(entryId: string) {
  const id = cleanString(entryId);
  if (!id) return null;

  const existingRecord = await getRecordById(SHIPPING_V2_TABLES.computerCatalog, id);
  if (!existingRecord) return null;
  const existing = mapComputerCatalogEntry(existingRecord);
  const F = SHIPPING_V2_COMPUTER_CATALOG_FIELDS;
  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.computerCatalog), {
    method: "PATCH",
    body: JSON.stringify({
      records: [
        {
          id,
          fields: {
            [F.usageCount]: (existing.usageCount ?? 0) + 1,
          },
        },
      ],
    }),
  });

  return response.records?.[0] ? mapComputerCatalogEntry(response.records[0]) : null;
}

export async function createShippingV2TechnicalOption(input: {
  type: ShippingV2TechnicalOptionType;
  label: string;
  session: StaffSession | null;
}) {
  if (!input.session || (!isAdministratorRole(input.session.user.rol) && !canAccessApp(input.session, "Shipping"))) {
    throw new Error("No tienes permiso para crear opciones técnicas.");
  }

  const config = getShippingV2TechnicalOptionConfig(input.type);
  const option = normalizeShippingV2TechnicalOptionLabelForType(input.type, input.label);
  if (!option) throw new Error("Nombre de opción obligatorio.");

  const normalizedOption = normalizeTechnicalOption(option);
  const existingOptions = await listTechnicalOptions(input.type);
  const existing = existingOptions.find((candidate) => {
    if (normalizeTechnicalOption(candidate.name) === normalizedOption) return true;
    return candidate.aliases.some((alias) => normalizeTechnicalOption(alias) === normalizedOption);
  });

  if (existing) {
    return { ok: true, alreadyExists: true, option: { id: existing.id, name: existing.name }, type: input.type };
  }

  const maxOrder = existingOptions.reduce((max, item) => Math.max(max, item.order ?? 0), 0);
  const now = new Date().toISOString();
  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(config.table), {
    method: "POST",
    body: JSON.stringify({
      records: [
        {
          fields: compactFields({
            [config.fields.name]: option,
            [config.fields.aliases]: "",
            [config.fields.active]: true,
            [config.fields.order]: maxOrder + 1,
            [config.fields.description]: "",
            [config.fields.createdFromPortal]: true,
            [config.fields.createdAt]: now,
            [config.fields.createdBy]: input.session.user.nombre || input.session.user.email,
            [config.fields.notes]: "Creado desde editor de ficha técnica",
          }),
        },
      ],
    }),
  });

  const created = response.records?.[0];
  if (!created) throw new Error("Airtable no devolvió la opción técnica creada.");
  const mapped = mapTechnicalOptionRecord(created, config.fields);
  return { ok: true, alreadyExists: false, option: { id: mapped.id, name: mapped.name }, type: input.type };
}

async function getExistingShippingV2Skus() {
  const records = await listRecords(SHIPPING_V2_TABLES.items, { pageSize: 100 });
  return records.map((record) => firstString(record.fields[getOfficialSkuField()])).filter(Boolean);
}

async function generateUniqueShippingV2SkuForCategory(category?: string) {
  return generateUniqueSkuFromExistingSkus(category, await getExistingShippingV2Skus());
}

async function resolveOfficialSkuForCreate(input: ShippingV2ItemWriteInput) {
  const manualSku = normalizeSku(cleanString(input.sku ?? input.skuInterno));
  if (!manualSku) return generateUniqueShippingV2SkuForCategory(cleanString(input.categoria));

  const existing = await findShippingV2ItemBySku(manualSku);
  if (existing) throw new Error("Este SKU ya existe en Shipping Items.");
  return manualSku;
}

async function createShippingV2Event(input: {
  action: "Creado" | "Actualizado" | "Cambio de estado" | "Novedad abierta" | "Otro";
  entity?: "Shipping Item" | "Shipping Packing" | "Shipping Novedad";
  itemRecordId?: string;
  packingRecordId?: string;
  novedadRecordId?: string;
  itemName?: string;
  registradoPor: string;
  descripcion: string;
  estadoAnterior?: string;
  estadoNuevo?: string;
  observacion?: string;
}) {
  try {
    await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.eventos), {
      method: "POST",
      body: JSON.stringify({
        records: [
          {
            fields: compactFields({
              "Tipo de entidad": input.entity ?? "Shipping Item",
              "Acción": input.action,
              "Item relacionado": input.itemRecordId ? [input.itemRecordId] : undefined,
              "Packing relacionado": input.packingRecordId ? [input.packingRecordId] : undefined,
              "Novedad relacionada": input.novedadRecordId ? [input.novedadRecordId] : undefined,
              "Estado anterior": input.estadoAnterior,
              "Estado nuevo": input.estadoNuevo,
              "Descripción del evento": input.descripcion,
              "Observación": input.observacion,
              "Registrado por": input.registradoPor,
              "Fecha del evento": new Date().toISOString(),
              "Datos relevantes": input.itemName,
            }),
          },
        ],
      }),
    });
  } catch (error) {
    console.warn("No se pudo registrar evento de Shipping V2:", error);
  }
}

function shouldLogShippingV2ItemFieldEvent(config: { field: string; category: string }) {
  const criticalFields = new Set<string>([
    SHIPPING_V2_ITEM_FIELDS.estadoItem,
    SHIPPING_V2_ITEM_FIELDS.estadoRevision,
    SHIPPING_V2_ITEM_FIELDS.estadoTriangulacion,
    SHIPPING_V2_ITEM_FIELDS.estadoDespiece,
    SHIPPING_V2_ITEM_FIELDS.modoLogistico,
    SHIPPING_V2_ITEM_FIELDS.proveedorCompra,
    SHIPPING_V2_ITEM_FIELDS.proveedorLogistico,
    SHIPPING_V2_ITEM_FIELDS.costoProveedor,
    SHIPPING_V2_ITEM_FIELDS.precioVentaFinal,
    SHIPPING_V2_ITEM_FIELDS.sku,
    SHIPPING_V2_ITEM_FIELDS.skuProveedor,
    SHIPPING_V2_ITEM_FIELDS.tipoOperacion,
  ]);

  return config.category === "special" || criticalFields.has(config.field);
}

async function validateInlineItemFieldChange(input: {
  item: ShippingV2Item;
  recordId: string;
  field: string;
  rawValue: unknown;
  normalizedValue: unknown;
}) {
  const config = getShippingV2ItemEditField(input.field);
  if (!config || (config.category !== "normal" && config.category !== "special")) {
    throw new Error("Este campo no se puede editar inline.");
  }

  if (config.type === "singleSelect") {
    const value = cleanString(input.normalizedValue);
    if (value && config.options && !config.options.includes(value)) {
      throw new Error(`"${value}" no es una opción válida para ${config.label}.`);
    }
  }

  if (config.type === "linkedRecord") {
    await validateInlineProviderRule(input.field, input.normalizedValue);
  }

  if (input.field === SHIPPING_V2_ITEM_FIELDS.estadoItem && cleanString(input.normalizedValue) === "Disponible") {
    throw new Error("Este cambio de estado requiere una acción controlada.");
  }

  if (input.field === SHIPPING_V2_ITEM_FIELDS.tipoOperacion && (input.item.pagoId || input.item.packingId)) {
    throw new Error("No se puede cambiar el tipo de operación porque el Item ya tiene procesos relacionados.");
  }

  if (input.field === SHIPPING_V2_ITEM_FIELDS.modoLogistico) {
    if (input.item.packingId) {
      throw new Error("No se puede cambiar el modo logístico porque el Item ya tiene packing relacionado.");
    }

    const nextMode = cleanString(input.normalizedValue);
    const flow = getDefaultItemFlowByOperation({ tipoOperacion: input.item.tipoOperacion, estadoItem: input.item.estado });
    if (flow.requierePacking && nextMode === "No aplica") {
      throw new Error("Si el item requiere packing, el modo logístico no puede ser No aplica.");
    }
  }

  if (input.field === SHIPPING_V2_ITEM_FIELDS.proveedorCompra && input.item.pagoId) {
    throw new Error("No se puede cambiar el proveedor de compra porque el Item ya tiene pago relacionado.");
  }

  if (input.field === SHIPPING_V2_ITEM_FIELDS.costoProveedor && input.item.pagoId) {
    throw new Error("No se puede cambiar el costo proveedor porque el Item ya tiene pago relacionado.");
  }

  if (input.field === getOfficialSkuField()) {
    const nextSku = normalizeSku(cleanString(input.normalizedValue));
    if (!nextSku) throw new Error("SKU no puede quedar vacío.");
    if (nextSku !== input.item.sku) {
      const duplicated = await findShippingV2ItemBySku(nextSku);
      if (duplicated && duplicated.id !== input.recordId) {
        throw new Error("Este SKU ya existe en Shipping Items.");
      }
    }
  }
}

export async function updateShippingV2ItemField(recordId: string, input: { field: string; value: unknown; eventDescription?: string }, options: { actualizadoPor: string }) {
  assertShippingV2GeneratedSchema();
  const id = cleanString(recordId);
  const field = cleanString(input.field);
  if (!id) throw new Error("Record ID de item inválido.");
  if (!field) throw new Error("Campo inválido.");

  const config = getShippingV2ItemEditField(field);
  if (!config) throw new Error("Campo no reconocido para Shipping Items.");

  const existing = await getShippingV2ItemById(id);
  const normalizedValue = normalizeInlineValue(config.type, input.value);
  await validateInlineItemFieldChange({ item: existing, recordId: id, field, rawValue: input.value, normalizedValue });

  const mode = field === SHIPPING_V2_ITEM_FIELDS.modoLogistico ? cleanString(normalizedValue) : "";
  const logisticsFlowFields = mode
    ? {
      [SHIPPING_V2_ITEM_FIELDS.requierePacking]: PACKING_LOGISTICS_MODES.has(mode) ? true : false,
    }
    : {};

  const fields: Record<string, unknown> = {
    [field]: field === getOfficialSkuField() ? normalizeSku(cleanString(normalizedValue)) : normalizedValue,
    ...logisticsFlowFields,
    [SHIPPING_V2_ITEM_FIELDS.ultimaActualizacion]: new Date().toISOString(),
    [SHIPPING_V2_ITEM_FIELDS.actualizadoPor]: options.actualizadoPor,
  };

  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id, fields }] }),
  });

  const updated = response.records?.[0];
  if (!updated) throw new Error("Airtable no devolvió el item actualizado.");

  const item = mapItem(updated);
  if (shouldLogShippingV2ItemFieldEvent(config)) {
    await createShippingV2Event({
      action: "Actualizado",
      itemRecordId: item.id,
      itemName: item.nombre,
      registradoPor: options.actualizadoPor,
      descripcion: input.eventDescription || `Campo crítico "${config.label}" actualizado desde Portal Staff.`,
    });
  }

  return item;
}

export async function createShippingV2Item(input: ShippingV2ItemWriteInput, options: { registradoPor: string }) {
  const calculatedInput = applyCalculatedItemFlow(input);
  validateItemInput(calculatedInput);
  await validateItemProviderRules(calculatedInput);

  const sku = await resolveOfficialSkuForCreate(calculatedInput);
  const fields = getItemFields(calculatedInput, {
    [getOfficialSkuField()]: sku,
    [SHIPPING_V2_ITEM_FIELDS.skuInterno]: undefined,
    [SHIPPING_V2_ITEM_FIELDS.metodoAsignacionSku]: undefined,
    [SHIPPING_V2_ITEM_FIELDS.skuProveedorUsadoComoInterno]: undefined,
    [SHIPPING_V2_ITEM_FIELDS.skuDuplicadoDetectado]: undefined,
    [SHIPPING_V2_ITEM_FIELDS.skuOriginalSugerido]: undefined,
    [SHIPPING_V2_ITEM_FIELDS.fechaRegistro]: new Date().toISOString(),
    [SHIPPING_V2_ITEM_FIELDS.registradoPor]: options.registradoPor,
  });

  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }] }),
  });

  const created = response.records?.[0];
  if (!created) throw new Error("Airtable no devolvió el item creado.");

  const item = mapItem(created);
  await createShippingV2Event({
    action: "Creado",
    itemRecordId: item.id,
    itemName: item.nombre,
    registradoPor: options.registradoPor,
    descripcion: `Item ${item.sku} creado desde Portal Staff.`,
  });

  return item;
}

export async function addFotosToShippingV2Item(
  recordId: string,
  fotos: ShippingV2AttachmentUpload[],
  options: { registradoPor?: string } = {}
) {
  const id = cleanString(recordId);
  if (!id) throw new Error("Record ID de item inválido.");
  if (!fotos.length) return { item: await getShippingV2ItemById(id), warning: null as string | null, uploadedCount: 0 };

  const failedFiles: string[] = [];

  for (const foto of fotos) {
    try {
      await uploadAttachmentToRecord({
        recordId: id,
        attachmentFieldIdOrName: SHIPPING_V2_ITEM_FIELDS.fotos,
        filename: foto.filename,
        contentType: foto.contentType,
        fileBase64: foto.fileBase64,
      });
    } catch (error) {
      console.error("No se pudo agregar foto al Item de Shipping V2:", error);
      failedFiles.push(foto.filename);
    }
  }

  if (failedFiles.length === fotos.length) {
    throw new Error("El Item se creó, pero no se pudo subir ninguna foto.");
  }

  const item = await getShippingV2ItemById(id);
  await createShippingV2Event({
    action: "Actualizado",
    itemRecordId: item.id,
    itemName: item.nombre,
    registradoPor: options.registradoPor || "Portal Staff",
    descripcion: fotos.length - failedFiles.length === 1 ? "Foto agregada al Item." : "Fotos agregadas al Item.",
  });

  return {
    item,
    warning: failedFiles.length > 0 ? `El Item se creó, pero no se pudieron subir: ${failedFiles.join(", ")}.` : null,
    uploadedCount: fotos.length - failedFiles.length,
  };
}

function keptAttachmentPayload(attachment: ShippingV2Attachment) {
  if (attachment.id) return { id: attachment.id };
  return {
    url: attachment.url,
    filename: attachment.filename || undefined,
  };
}

export async function removeFotoFromShippingV2Item(
  recordId: string,
  input: { attachmentId?: string | null; url?: string | null; filename?: string | null },
  options: { actualizadoPor: string }
) {
  const id = cleanString(recordId);
  if (!id) throw new Error("Record ID de item inválido.");

  const attachmentId = cleanString(input.attachmentId);
  const url = cleanString(input.url);
  const filename = cleanString(input.filename);
  if (!attachmentId && !url && !filename) {
    throw new Error("Falta identificar la foto a eliminar.");
  }

  const current = await getShippingV2ItemById(id);
  const nextFotos = current.fotos.filter((foto) => {
    if (attachmentId && foto.id === attachmentId) return false;
    if (url && foto.url === url) return false;
    if (filename && foto.filename === filename) return false;
    return true;
  });

  if (nextFotos.length === current.fotos.length) {
    throw new Error("No se encontró la foto en el Item.");
  }

  const fields: Record<string, unknown> = {
    [SHIPPING_V2_ITEM_FIELDS.fotos]: nextFotos.map(keptAttachmentPayload),
    [SHIPPING_V2_ITEM_FIELDS.ultimaActualizacion]: new Date().toISOString(),
    [SHIPPING_V2_ITEM_FIELDS.actualizadoPor]: options.actualizadoPor,
  };

  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id, fields }] }),
  });

  const updated = response.records?.[0];
  if (!updated) throw new Error("Airtable no devolvió el item actualizado.");

  const item = mapItem(updated);
  await createShippingV2Event({
    action: "Actualizado",
    itemRecordId: item.id,
    itemName: item.nombre,
    registradoPor: options.actualizadoPor,
    descripcion: "Foto eliminada del Item.",
  });

  return item;
}

export async function updateShippingV2Item(recordId: string, input: ShippingV2ItemWriteInput, options: { actualizadoPor: string }) {
  const id = cleanString(recordId);
  if (!id) throw new Error("Record ID de item inválido.");
  const calculatedInput = applyCalculatedItemFlow(input);
  validateItemInput(calculatedInput);
  await validateItemProviderRules(calculatedInput);

  const existing = await getShippingV2ItemById(id);
  const nextSku = normalizeSku(cleanString(calculatedInput.sku ?? calculatedInput.skuInterno));
  if (existing.packingId && cleanString(calculatedInput.modoLogistico) !== cleanString(existing.modoLogistico)) {
    throw new Error("No se puede cambiar el modo logístico porque el Item ya tiene packing relacionado.");
  }

  if (nextSku && nextSku !== existing.sku) {
    const duplicated = await findShippingV2ItemBySku(nextSku);
    if (duplicated && duplicated.id !== id) {
      throw new Error("Este SKU ya existe en Shipping Items.");
    }
  }

  const fields = getItemFields(calculatedInput, {
    ...(nextSku ? { [getOfficialSkuField()]: nextSku } : {}),
    [SHIPPING_V2_ITEM_FIELDS.ultimaActualizacion]: new Date().toISOString(),
    [SHIPPING_V2_ITEM_FIELDS.actualizadoPor]: options.actualizadoPor,
  });

  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id, fields }] }),
  });

  const updated = response.records?.[0];
  if (!updated) throw new Error("Airtable no devolvió el item actualizado.");

  const item = mapItem(updated);
  await createShippingV2Event({
    action: "Actualizado",
    itemRecordId: item.id,
    itemName: item.nombre,
    registradoPor: options.actualizadoPor,
    descripcion: `Item ${item.sku} actualizado desde Portal Staff.`,
  });

  return item;
}

export async function updateShippingV2ItemTechnicalSheet(
  recordId: string,
  input: ShippingV2TechnicalSheetInput,
  options: { actualizadoPor: string }
) {
  assertShippingV2GeneratedSchema();
  const id = cleanString(recordId);
  if (!id) throw new Error("Record ID de item inválido.");

  const existing = await getShippingV2ItemById(id, { includeAiName: false });
  const F = SHIPPING_V2_ITEM_FIELDS;
  const now = new Date().toISOString();
  const batteryHealth = shippingV2CategoryDoesNotUseScreenOrBattery(existing.categoria) ? null : optionalNumberField(input.bateriaSalud);
  const batteryState = calculateShippingV2BatteryState(existing.categoria, batteryHealth);
  const cpuModel = cleanString(input.cpuModelo);
  const cpuFrequencyBase = normalizeCpuFrequency(input.cpuFrecuenciaBase);
  const cpuFrequencyTurbo = normalizeCpuFrequency(input.cpuFrecuenciaTurbo);
  const connectivityV2Ids = linkedRecordIds(input.connectivityV2Ids);
  const portV2Ids = linkedRecordIds(input.portV2Ids);
  const extraFeatureV2Ids = linkedRecordIds(input.extraFeatureV2Ids);
  const brandFicha = cleanString(input.marcaFicha);
  const modelFicha = cleanString(input.modeloFicha);

  if (cpuModel) {
    const existingCpu = await findCpuCatalogEntryByModel(cpuModel);
    if (existingCpu) {
      await incrementCpuCatalogUsage(existingCpu.id);
    } else if (
      cpuFrequencyBase ||
      cpuFrequencyTurbo ||
      cleanString(input.ramTipo) ||
      cleanString(input.gpu)
    ) {
      await createCpuCatalogEntryFromTechnicalSheet({
        cpuModel,
        cpuBrand: cleanString(input.cpuMarca),
        baseFrequency: cpuFrequencyBase,
        turboFrequency: cpuFrequencyTurbo,
        suggestedRamType: cleanString(input.ramTipo),
        integratedGpu: cleanString(input.gpu),
        sourceName: "Ingresado desde ficha técnica",
        verified: false,
        usageCount: 1,
        lastReviewedAt: now,
        notes: `Creado automáticamente desde ficha técnica del item ${existing.sku}`,
      });
    }
  }

  if (brandFicha && modelFicha) {
    const existingComputer = await findComputerCatalogEntryByBrandAndModel(brandFicha, modelFicha);
    if (existingComputer) {
      await incrementComputerCatalogUsage(existingComputer.id);
    } else if (
      cleanString(input.pantallaTamano) ||
      cleanString(input.pantallaResolucion) ||
      cleanString(input.sistemaOperativo) ||
      connectivityV2Ids.length ||
      portV2Ids.length ||
      extraFeatureV2Ids.length ||
      cleanString(input.gpu)
    ) {
      const batteryApplies = batteryState === "No aplica"
        ? "No"
        : batteryHealth !== null || shippingV2CategoryHasBattery(existing.categoria)
          ? "Sí"
          : "No especificado";
      await createComputerCatalogEntryFromTechnicalSheet({
        computerModel: modelFicha,
        brand: brandFicha,
        suggestedScreenSize: cleanString(input.pantallaTamano),
        suggestedScreenResolution: cleanString(input.pantallaResolucion),
        suggestedOperatingSystem: cleanString(input.sistemaOperativo),
        suggestedConnectivityV2Ids: connectivityV2Ids,
        suggestedPortV2Ids: portV2Ids,
        suggestedExtraFeatureV2Ids: extraFeatureV2Ids,
        batteryApplies,
        suggestedGpu: cleanString(input.gpu),
        sourceName: "Ingresado desde ficha técnica",
        verified: false,
        usageCount: 1,
        lastReviewedAt: now,
        notes: `Creado automáticamente desde ficha técnica del item ${existing.sku}`,
      });
    }
  }

  const fields: Record<string, unknown> = {
    [F.marcaFicha]: optionalTextField(brandFicha),
    [F.modeloFicha]: optionalTextField(modelFicha),
    [F.sistemaOperativo]: optionalSelectOption(SHIPPING_V2_ITEM_SELECT_OPTIONS.sistemaOperativo, input.sistemaOperativo),
    [F.pantallaTamano]: shippingV2CategoryDoesNotUseScreenOrBattery(existing.categoria) ? "No aplica" : optionalSelectOption(SHIPPING_V2_ITEM_SELECT_OPTIONS.pantallaTamano, input.pantallaTamano),
    [F.pantallaResolucion]: shippingV2CategoryDoesNotUseScreenOrBattery(existing.categoria) ? "No aplica" : optionalSelectOption(SHIPPING_V2_ITEM_SELECT_OPTIONS.pantallaResolucion, input.pantallaResolucion),
    [F.cpuMarca]: optionalSelectOption(SHIPPING_V2_ITEM_SELECT_OPTIONS.cpuMarca, input.cpuMarca),
    [F.cpuModelo]: optionalTextField(cpuModel),
    [F.cpuFrecuenciaBase]: optionalTextField(cpuFrequencyBase),
    [F.cpuFrecuenciaTurbo]: optionalTextField(cpuFrequencyTurbo),
    [F.ramCapacidad]: optionalSelectOption(SHIPPING_V2_ITEM_SELECT_OPTIONS.ramCapacidad, input.ramCapacidad),
    [F.ramTipo]: optionalSelectOption(SHIPPING_V2_ITEM_SELECT_OPTIONS.ramTipo, input.ramTipo),
    [F.almacenamientoPrincipal]: optionalTextField(input.almacenamientoPrincipal),
    [F.almacenamientoTipo]: optionalSelectOption(SHIPPING_V2_ITEM_SELECT_OPTIONS.almacenamientoTipo, input.almacenamientoTipo),
    [F.gpu]: optionalTextField(input.gpu),
    [F.bateriaSalud]: batteryHealth,
    [F.bateriaEstado]: batteryState || null,
    [F.conectividadV2]: connectivityV2Ids,
    [F.puertosV2]: portV2Ids,
    [F.caracteristicasExtrasV2]: extraFeatureV2Ids,
    [F.observacionFichaTecnica]: optionalTextField(input.observacionFichaTecnica),
    [F.ultimaActualizacion]: now,
    [F.actualizadoPor]: options.actualizadoPor,
  };

  if (input.generated) {
    fields[F.fichaTecnicaGenerada] = true;
    fields[F.fichaTecnicaGeneradaPor] = options.actualizadoPor;
    fields[F.fechaFichaTecnicaGenerada] = now;
  }

  if (input.reviewed) {
    fields[F.fichaTecnicaRevisada] = true;
    fields[F.fichaTecnicaRevisadaPor] = options.actualizadoPor;
    fields[F.fechaFichaTecnicaRevisada] = now;
  }

  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id, fields }] }),
  });

  const updated = response.records?.[0];
  if (!updated) throw new Error("Airtable no devolvió el item actualizado.");

  const item = mapItem(updated);
  if (input.reviewed) {
    await createShippingV2Event({
      action: "Actualizado",
      itemRecordId: item.id,
      itemName: item.nombre,
      registradoPor: options.actualizadoPor,
      descripcion: `Ficha técnica ${item.sku} revisada desde Portal Staff.`,
    });
  }

  return item;
}

export async function getShippingV2Pagos() {
  const [records, proveedores, items] = await Promise.all([
    listRecords(SHIPPING_V2_TABLES.pagos, { maxRecords: 200, sortField: SHIPPING_V2_PAYMENT_FIELDS.fechaCreacion, sortDirection: "desc" }),
    getShippingV2Proveedores(),
    getShippingV2Items({ includeAiName: false }),
  ]);
  const labelsById = createShippingV2ProveedorLabelMap(proveedores);
  const itemsById = new Map(items.map((item) => [item.id, item]));
  return records.map((record) => mapPago(record, { labelsById, itemsById }));
}

export async function getShippingV2PagoById(recordId: string) {
  const id = cleanString(recordId);
  if (!id) throw new Error("Record ID de pago inválido.");
  const [record, proveedores, items] = await Promise.all([
    airtableRequest<AirtableRecordResponse>(`${tableUrl(SHIPPING_V2_TABLES.pagos)}/${encodeURIComponent(id)}`),
    getShippingV2Proveedores(),
    getShippingV2Items({ includeAiName: false }),
  ]);
  return mapPago(record, {
    labelsById: createShippingV2ProveedorLabelMap(proveedores),
    itemsById: new Map(items.map((item) => [item.id, item])),
  });
}

function isCancelledItem(item: Pick<ShippingV2Item, "estado" | "estadoRevision" | "estadoTriangulacion" | "estadoDespiece">) {
  return [item.estado, item.estadoRevision, item.estadoTriangulacion, item.estadoDespiece].some((value) => {
    const status = normalizeStatus(String(value ?? ""));
    return status === "cancelado" || status === "anulado" || status === "archivado";
  });
}

function isActivePaymentStatus(status: string) {
  return normalizeStatus(status) !== "anulado";
}

function isPaidItemCandidate(item: Pick<ShippingV2Item, "estado" | "tipoOperacion">) {
  return normalizeStatus(item.estado) === "pagado" || normalizeStatus(item.tipoOperacion) === "compra ya pagada";
}

function providerRequiredForPayment(item: Pick<ShippingV2Item, "tipoOperacion" | "requierePago">) {
  if (!item.requierePago) return false;
  return ["compra a proveedor", "compra ya pagada"].includes(normalizeStatus(item.tipoOperacion));
}

function itemIsLinkedToActivePayment(item: Pick<ShippingV2Item, "pagoV2ItemIds" | "pagoV2RegaloIds">, pagosById: Map<string, ShippingV2Pago>) {
  const paymentIds = [...item.pagoV2ItemIds, ...item.pagoV2RegaloIds];
  return paymentIds.some((id) => {
    const pago = pagosById.get(id);
    return pago ? isActivePaymentStatus(String(pago.estadoPago)) : true;
  });
}

function toPendingPaymentItem(item: ShippingV2Item): ShippingV2PagoPendingItem {
  return {
    id: item.id,
    sku: item.sku,
    skuProveedor: item.skuProveedor,
    nombre: item.nombre,
    tipoOperacion: item.tipoOperacion,
    tipoItem: item.tipoItem,
    categoria: item.categoria,
    estado: item.estado,
    proveedorId: item.proveedorId,
    proveedorNombre: item.proveedorNombre,
    proveedorLogisticoId: item.proveedorLogisticoId,
    proveedorLogisticoNombre: item.proveedorLogisticoNombre,
    requierePago: item.requierePago,
    costoProveedor: item.costoProveedor,
    cantidad: item.cantidad,
    esRegalo: item.esRegalo,
    fechaRegistro: item.fechaRegistro,
    pagoV2ItemIds: item.pagoV2ItemIds,
    pagoV2RegaloIds: item.pagoV2RegaloIds,
  };
}

function getPaymentSupportMissing(pago: ShippingV2Pago) {
  const missing: string[] = [];
  const metodo = normalizeStatus(pago.metodoPago ?? "");
  const cuenta = normalizeStatus(pago.cuentaOrigen ?? "");
  const finanzas = normalizeStatus(pago.estadoIntegracionFinanzas ?? "");

  if (!pago.fechaPagoReal) missing.push("Fecha real de pago");
  if (!pago.metodoPago || metodo === "no aplica") missing.push("Método de pago");
  if (metodo !== "no aplica" && (!pago.cuentaOrigen || cuenta === "no aplica")) missing.push("Cuenta origen");
  if (!pago.transaccionId && !pago.comprobante.length) missing.push("Comprobante o transacción ID");
  if (!pago.movimientoFinanzasIds.length) missing.push("Movimiento puente");
  if (!pago.estadoIntegracionFinanzas) missing.push("Estado Finanzas");
  if (pago.estadoIntegracionFinanzas && !["pendiente de sincronizar", "sincronizado"].includes(finanzas)) missing.push("Estado Finanzas válido");

  return missing;
}

function isCompletePaidPayment(pago: ShippingV2Pago) {
  return normalizeStatus(String(pago.estadoPago)) === "pagado" && getPaymentSupportMissing(pago).length === 0;
}

function isPendingPayment(pago: ShippingV2Pago) {
  return ["pendiente", "borrador", "parcial"].includes(normalizeStatus(String(pago.estadoPago)));
}

function computeSuggestedDueDate(provider: ShippingV2Proveedor | null, fallback?: string) {
  const explicit = cleanString(fallback);
  if (explicit) return explicit;
  const days = provider?.plazoSugeridoPagoDias;
  if (typeof days !== "number" || !Number.isFinite(days) || days <= 0) return "";
  const date = new Date();
  date.setDate(date.getDate() + Math.trunc(days));
  return date.toISOString().slice(0, 10);
}

function computePagosSummary(porPagar: ShippingV2PagoPendingItem[], pagosPendientes: ShippingV2Pago[], pagadosSinSoporte: ShippingV2PagoSupportCard[], pagosCompletos: ShippingV2Pago[]): ShippingV2PagosSummary {
  return {
    totalPorPagar: porPagar.reduce((sum, item) => sum + (item.costoProveedor ?? 0), 0) + pagosPendientes.reduce((sum, pago) => sum + (pago.saldoPendiente ?? pago.totalAPagar ?? 0), 0),
    totalPagadoSinSoporte: pagadosSinSoporte.reduce((sum, card) => sum + (card.total ?? 0), 0),
    totalPagadoCompleto: pagosCompletos.reduce((sum, pago) => sum + (pago.totalPagado ?? pago.totalAPagar ?? 0), 0),
    incompletos: pagadosSinSoporte.length,
    porPagarCount: porPagar.length + pagosPendientes.length,
    itemsSinPagoCount: porPagar.length,
    pagosPendientesCount: pagosPendientes.length,
    pagadosSinSoporteCount: pagadosSinSoporte.length,
    pagosCompletosCount: pagosCompletos.length,
  };
}

export async function getShippingV2PendingPaymentItems(context?: { pagos?: ShippingV2Pago[]; items?: ShippingV2Item[] }) {
  const [pagos, items] = await Promise.all([
    context?.pagos ? Promise.resolve(context.pagos) : getShippingV2Pagos(),
    context?.items ? Promise.resolve(context.items) : getShippingV2Items({ includeAiName: false }),
  ]);
  const pagosById = new Map(pagos.map((pago) => [pago.id, pago]));
  return items
    .filter((item) => {
      if (!item.requierePago) return false;
      if (item.esRegalo) return false;
      if (isCancelledItem(item)) return false;
      if (providerRequiredForPayment(item) && !item.proveedorId) return false;
      if (itemIsLinkedToActivePayment(item, pagosById)) return false;
      if (isPaidItemCandidate(item)) return false;
      return true;
    })
    .map(toPendingPaymentItem);
}

function getPaidItemsWithoutSupport(items: ShippingV2Item[], pagosById: Map<string, ShippingV2Pago>): ShippingV2PagoSupportCard[] {
  return items
    .filter((item) => {
      if (!item.requierePago) return false;
      if (item.esRegalo) return false;
      if (isCancelledItem(item)) return false;
      if (providerRequiredForPayment(item) && !item.proveedorId) return false;
      if (itemIsLinkedToActivePayment(item, pagosById)) return false;
      return isPaidItemCandidate(item);
    })
    .map((item) => {
      const pendingItem = toPendingPaymentItem(item);
      const missing = ["Pago Shipping V2", "Movimiento puente"];
      if (!item.costoProveedor) missing.push("Costo proveedor");
      return {
        kind: "item" as const,
        id: item.id,
        item: pendingItem,
        proveedorId: item.proveedorId,
        proveedorNombre: item.proveedorNombre,
        total: item.costoProveedor,
        missing,
      };
    });
}

export async function getShippingV2PagosWorkspace(): Promise<ShippingV2PagosWorkspace> {
  const [pagos, proveedores, items] = await Promise.all([
    getShippingV2Pagos(),
    getShippingV2Proveedores(),
    getShippingV2Items({ includeAiName: false }),
  ]);
  const pagosById = new Map(pagos.map((pago) => [pago.id, pago]));
  const itemsPendientes = await getShippingV2PendingPaymentItems({ pagos, items });
  const pagosPendientes = pagos.filter(isPendingPayment);
  const pagosPagados = pagos.filter((pago) => normalizeStatus(String(pago.estadoPago)) === "pagado");
  const pagosCompletos = pagosPagados.filter(isCompletePaidPayment);
  const pagosIncompletos: Extract<ShippingV2PagoSupportCard, { kind: "pago" }>[] = pagosPagados
    .filter((pago) => !isCompletePaidPayment(pago))
    .map((pago): Extract<ShippingV2PagoSupportCard, { kind: "pago" }> => ({
      kind: "pago",
      id: pago.id,
      pago,
      proveedorId: pago.proveedorId,
      proveedorNombre: pago.proveedorNombre,
      total: pago.totalPagado ?? pago.totalAPagar,
      missing: getPaymentSupportMissing(pago),
    }));
  const itemsPagadosSinPago = getPaidItemsWithoutSupport(items, pagosById).filter((card): card is Extract<ShippingV2PagoSupportCard, { kind: "item" }> => card.kind === "item");
  const pagadosSinSoporte = [...itemsPagadosSinPago, ...pagosIncompletos];
  return {
    pagos,
    proveedores,
    itemsPendientes,
    porPagar: itemsPendientes,
    pagosPendientes,
    pendientes: {
      itemsSinPago: itemsPendientes,
      pagosPendientes,
    },
    pagadosSinSoporte,
    sinSoporte: {
      itemsPagadosSinPago,
      pagosIncompletos,
    },
    pagosCompletos,
    pagosRegistrados: pagos,
    summary: computePagosSummary(itemsPendientes, pagosPendientes, pagadosSinSoporte, pagosCompletos),
  };
}

function generatePaymentId() {
  const now = new Date();
  return `PAY-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${String(now.getTime()).slice(-5)}`;
}

function generateFinanceMovementId() {
  const now = new Date();
  return `SFM-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${String(now.getTime()).slice(-5)}`;
}

function attachmentFromUrl(urlValue?: string) {
  const url = cleanString(urlValue);
  return url ? [{ url }] : undefined;
}

async function assertItemsCanJoinPayment(itemIds: string[], regalosIds: string[]) {
  const uniqueItemIds = Array.from(new Set(itemIds.map(cleanString).filter(Boolean)));
  const uniqueGiftIds = Array.from(new Set(regalosIds.map(cleanString).filter(Boolean)));
  const items = await Promise.all(uniqueItemIds.map((id) => getShippingV2ItemById(id, { includeAiName: false })));
  const gifts = await Promise.all(uniqueGiftIds.map((id) => getShippingV2ItemById(id, { includeAiName: false })));
  const activePayments = (await getShippingV2Pagos()).filter((pago) => isActivePaymentStatus(String(pago.estadoPago)));

  for (const item of items) {
    if (!item.requierePago || item.esRegalo) throw new Error(`El item ${item.sku} no genera pago operativo.`);
    if (isCancelledItem(item)) throw new Error(`El item ${item.sku} está cancelado, anulado o archivado.`);
    if (providerRequiredForPayment(item) && !item.proveedorId) throw new Error(`El item ${item.sku} requiere proveedor de compra.`);
    const duplicated = activePayments.find((pago) => pago.itemIds.includes(item.id));
    if (duplicated) throw new Error(`El item ${item.sku} ya está en el pago activo ${duplicated.pagoId}.`);
  }
  for (const gift of gifts) {
    if (!gift.esRegalo) throw new Error(`El item ${gift.sku} no está marcado como regalo.`);
    if (isCancelledItem(gift)) throw new Error(`El regalo ${gift.sku} está cancelado, anulado o archivado.`);
    const duplicated = activePayments.find((pago) => pago.regalosIds.includes(gift.id));
    if (duplicated) throw new Error(`El regalo ${gift.sku} ya está en el pago activo ${duplicated.pagoId}.`);
  }
  return { items, gifts };
}

export async function createShippingV2Pago(input: ShippingV2PagoWriteInput, options: { registradoPor: string }) {
  assertShippingV2GeneratedSchema();
  const proveedorId = cleanString(input.proveedorId);
  if (!proveedorId) throw new Error("Proveedor es obligatorio.");
  const provider = await getShippingV2ProveedorById(proveedorId);
  if (!provider) throw new Error("Proveedor no encontrado.");
  const { items, gifts } = await assertItemsCanJoinPayment(input.itemIds ?? [], input.regalosIds ?? []);
  if (!items.length) throw new Error("Selecciona al menos un item que genere pago.");
  const mismatched = items.find((item) => item.proveedorId !== proveedorId);
  if (mismatched) throw new Error(`El item ${mismatched.sku} pertenece a otro proveedor de compra.`);
  const invalidGift = gifts.find((gift) => gift.proveedorId && gift.proveedorId !== proveedorId);
  if (invalidGift) throw new Error(`El regalo ${invalidGift.sku} pertenece a otro proveedor.`);

  const totalAPagar = items.reduce((sum, item) => sum + (item.costoProveedor ?? 0), 0);
  const F = SHIPPING_V2_PAYMENT_FIELDS;
  const requestedStatus = cleanString(input.estadoPago);
  const estadoPago = normalizeStatus(requestedStatus) === "pagado" ? "Pagado" : requestedStatus || "Pendiente";
  if (estadoPago === "Pagado") {
    normalizeAndValidatePaymentSupportInput(input);
    const notPaidSupportItem = items.find((item) => !isPaidItemCandidate(item));
    if (notPaidSupportItem) {
      throw new Error(`El item ${notPaidSupportItem.sku} no está marcado como Pagado ni como Compra ya pagada.`);
    }
  }
  const fields = compactFields({
    [F.pagoId]: generatePaymentId(),
    [F.estadoPago]: estadoPago,
    [F.proveedor]: [proveedorId],
    [F.itemsRelacionados]: items.map((item) => item.id),
    [F.regalosIncluidos]: gifts.map((gift) => gift.id),
    [F.totalAPagar]: totalAPagar,
    [F.fechaCreacion]: new Date().toISOString(),
    [F.fechaVencimientoSugerida]: computeSuggestedDueDate(provider, input.fechaVencimientoSugerida),
    [F.observacion]: cleanString(input.observacion),
    [F.estadoIntegracionFinanzas]: estadoPago === "Pagado" ? "Pendiente de sincronizar" : "Pendiente de generar",
    [F.registradoPor]: options.registradoPor,
  });

  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.pagos), {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }] }),
  });
  const created = response.records?.[0];
  if (!created) throw new Error("Airtable no devolvió el pago creado.");
  const pago = await getShippingV2PagoById(created.id);
  if (estadoPago === "Pagado") {
    return markShippingV2PagoAsPaid(pago.id, input, options);
  }
  return pago;
}

async function createFinanceMovementForPago(pago: ShippingV2Pago, input: ShippingV2PagoMarkPaidInput, registradoPor: string) {
  if (pago.movimientoFinanzasIds.length) return pago.movimientoFinanzasIds[0];
  const supportInput = normalizeAndValidatePaymentSupportInput(input);
  const F = SHIPPING_V2_FINANCE_FIELDS;
  const fields = compactFields({
    [F.movimientoShippingId]: generateFinanceMovementId(),
    [F.origen]: "Shipping",
    [F.tipoMovimiento]: "Egreso",
    [F.estadoIntegracion]: "Pendiente de sincronizar",
    [F.pagoShippingRelacionado]: [pago.id],
    [F.proveedor]: pago.proveedorId ? [pago.proveedorId] : undefined,
    [F.monto]: pago.totalAPagar ?? 0,
    [F.fechaMovimiento]: cleanString(supportInput.fechaPagoReal) || new Date().toISOString(),
    [F.metodo]: supportInput.metodoPago,
    [F.cuentaOrigen]: supportInput.cuentaOrigen,
    [F.transaccionId]: cleanString(input.transaccionId),
    [F.comprobante]: attachmentFromUrl(input.comprobanteUrl),
    [F.observacion]: cleanString(input.observacion),
    [F.registradoPor]: registradoPor,
    [F.fechaCreacion]: new Date().toISOString(),
  });
  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.finanzasMovimientos), {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }] }),
  });
  const created = response.records?.[0];
  if (!created) throw new Error("Airtable no devolvió el movimiento financiero.");
  return created.id;
}

function canMoveItemToPaidAfterPayment(item: ShippingV2Item) {
  const estado = normalizeStatus(item.estado);
  if (estado === "pendiente de pago") return true;
  if (estado === "registrado" && item.requierePago) return true;
  return false;
}

async function updateItemsToPaidAfterPayment(pago: Pick<ShippingV2Pago, "itemIds">) {
  const uniqueItemIds = Array.from(new Set(pago.itemIds.map(cleanString).filter(Boolean)));
  if (!uniqueItemIds.length) return;

  const items = await Promise.all(uniqueItemIds.map((id) => getShippingV2ItemById(id, { includeAiName: false })));
  const records = items
    .filter(canMoveItemToPaidAfterPayment)
    .map((item) => ({
      id: item.id,
      fields: {
        [SHIPPING_V2_ITEM_FIELDS.estadoItem]: "Pagado",
        [SHIPPING_V2_ITEM_FIELDS.ultimaActualizacion]: new Date().toISOString(),
      },
    }));

  if (!records.length) return;
  for (let index = 0; index < records.length; index += 10) {
    await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
      method: "PATCH",
      body: JSON.stringify({ records: records.slice(index, index + 10) }),
    });
  }
}

export async function markShippingV2PagoAsPaid(recordId: string, input: ShippingV2PagoMarkPaidInput, options: { registradoPor: string }) {
  const pago = await getShippingV2PagoById(recordId);
  const status = normalizeStatus(String(pago.estadoPago));
  if (status === "anulado") throw new Error("Un pago Anulado no puede marcarse como pagado.");
  if (normalizeStatus(String(pago.estadoIntegracionFinanzas)).includes("sincronizado")) throw new Error("No se puede modificar un pago ya sincronizado con Finanzas.");
  const supportInput = normalizeAndValidatePaymentSupportInput(input);

  const movementId = await createFinanceMovementForPago(pago, supportInput, options.registradoPor);
  const F = SHIPPING_V2_PAYMENT_FIELDS;
  const fields = compactFields({
    [F.estadoPago]: "Pagado",
    [F.fechaPagoReal]: cleanString(supportInput.fechaPagoReal) || new Date().toISOString(),
    [F.metodoPago]: supportInput.metodoPago,
    [F.cuentaOrigen]: supportInput.cuentaOrigen,
    [F.transaccionId]: cleanString(input.transaccionId),
    [F.comprobante]: attachmentFromUrl(input.comprobanteUrl),
    [F.observacion]: cleanString(input.observacion) || pago.observacion,
    [F.pagadoPor]: options.registradoPor,
    [F.estadoIntegracionFinanzas]: "Pendiente de sincronizar",
    [F.movimientosFinanzas]: [movementId],
  });
  await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.pagos), {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id: pago.id, fields }] }),
  });
  await updateItemsToPaidAfterPayment(pago);
  return getShippingV2PagoById(pago.id);
}

export async function setShippingV2PagoInReview(recordId: string, options: { registradoPor: string }) {
  const pago = await getShippingV2PagoById(recordId);
  if (["pagado", "anulado"].includes(normalizeStatus(String(pago.estadoPago)))) throw new Error("Este pago no permite enviarse a revisión.");
  await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.pagos), {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id: pago.id, fields: { [SHIPPING_V2_PAYMENT_FIELDS.estadoPago]: "En revisión" } }] }),
  });
  return getShippingV2PagoById(pago.id);
}

export async function cancelShippingV2Pago(recordId: string, input: { motivo?: string }, options: { registradoPor: string }) {
  const pago = await getShippingV2PagoById(recordId);
  if (normalizeStatus(String(pago.estadoPago)) === "pagado" && pago.movimientoFinanzasIds.length) {
    throw new Error("No se puede anular libremente un pago pagado con movimiento financiero.");
  }
  const F = SHIPPING_V2_PAYMENT_FIELDS;
  await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.pagos), {
    method: "PATCH",
    body: JSON.stringify({
      records: [{
        id: pago.id,
        fields: {
          [F.estadoPago]: "Anulado",
          [F.estadoIntegracionFinanzas]: "Anulado",
          [F.fechaAnulacion]: new Date().toISOString(),
          [F.motivoAnulacion]: cleanString(input.motivo),
        },
      }],
    }),
  });
  return getShippingV2PagoById(pago.id);
}

function packingFieldsFromInput(input: ShippingV2PackingWriteInput, extra: Record<string, unknown> = {}) {
  const F = SHIPPING_V2_PACKING_FIELDS;
  return compactFields({
    [F.nombre]: cleanString(input.nombre),
    [F.tipo]: selectOption(SHIPPING_V2_PACKING_SELECT_OPTIONS.tipo, cleanString(input.tipo)),
    [F.estado]: cleanString(input.estado) || OPEN_PACKING_STATUS,
    [F.proveedorResponsable]: cleanString(input.proveedorResponsableId) ? [cleanString(input.proveedorResponsableId)] : undefined,
    [F.proveedorLogisticoEc]: cleanString(input.proveedorLogisticoEcId) ? [cleanString(input.proveedorLogisticoEcId)] : undefined,
    [F.trackingUsa]: cleanString(input.trackingUsa),
    [F.transportistaUsa]: cleanString(input.transportistaUsa) ? [cleanString(input.transportistaUsa)] : undefined,
    [F.trackingEc]: cleanString(input.trackingEc),
    ...(hasOwnInput(input, "transportistaEc") ? { [F.transportistaEc]: cleanString(input.transportistaEc) ? [cleanString(input.transportistaEc)] : undefined } : {}),
    ...(hasOwnInput(input, "peso") ? { [F.peso]: input.peso ?? undefined } : {}),
    ...(hasOwnInput(input, "flete") ? { [F.flete]: input.flete ?? undefined } : {}),
    ...(hasOwnInput(input, "arancel") ? { [F.arancel]: input.arancel ?? undefined } : {}),
    ...(hasOwnInput(input, "otrosCostos") ? { [F.otrosCostos]: input.otrosCostos ?? undefined } : {}),
    ...(hasOwnInput(input, "reglaDistribucionCostos") ? { [F.reglaDistribucionCostos]: selectOption(SHIPPING_V2_PACKING_SELECT_OPTIONS.reglaDistribucionCostos, cleanString(input.reglaDistribucionCostos)) } : {}),
    ...(hasOwnInput(input, "observacionCostos") ? { [F.observacionCostos]: cleanString(input.observacionCostos) } : {}),
    // TODO: replace literal with generated schema field after Shipping Packings schema includes it.
    ...(hasOwnInput(input, "ordenReferencia") ? { [SHIPPING_V2_PACKING_ORDER_REFERENCE_FIELD]: cleanString(input.ordenReferencia) } : {}),
    [F.observaciones]: cleanString(input.observaciones),
    ...extra,
  });
}

function packingPatchFieldsFromInput(input: ShippingV2PackingWriteInput) {
  const F = SHIPPING_V2_PACKING_FIELDS;
  const fields: Record<string, unknown> = {};
  if (hasOwnInput(input, "nombre")) fields[F.nombre] = cleanString(input.nombre);
  if (hasOwnInput(input, "tipo")) fields[F.tipo] = selectOption(SHIPPING_V2_PACKING_SELECT_OPTIONS.tipo, cleanString(input.tipo));
  if (hasOwnInput(input, "proveedorResponsableId")) {
    const value = cleanString(input.proveedorResponsableId);
    fields[F.proveedorResponsable] = value ? [value] : [];
  }
  if (hasOwnInput(input, "proveedorLogisticoEcId")) {
    const value = cleanString(input.proveedorLogisticoEcId);
    fields[F.proveedorLogisticoEc] = value ? [value] : [];
  }
  if (hasOwnInput(input, "trackingUsa")) fields[F.trackingUsa] = cleanString(input.trackingUsa);
  if (hasOwnInput(input, "transportistaUsa")) {
    const value = cleanString(input.transportistaUsa);
    fields[F.transportistaUsa] = value ? [value] : [];
  }
  if (hasOwnInput(input, "trackingEc")) fields[F.trackingEc] = cleanString(input.trackingEc);
  if (hasOwnInput(input, "transportistaEc")) {
    const value = cleanString(input.transportistaEc);
    fields[F.transportistaEc] = value ? [value] : [];
  }
  if (hasOwnInput(input, "peso")) fields[F.peso] = input.peso ?? null;
  if (hasOwnInput(input, "flete")) fields[F.flete] = input.flete ?? null;
  if (hasOwnInput(input, "arancel")) fields[F.arancel] = input.arancel ?? null;
  if (hasOwnInput(input, "otrosCostos")) fields[F.otrosCostos] = input.otrosCostos ?? null;
  if (hasOwnInput(input, "reglaDistribucionCostos")) fields[F.reglaDistribucionCostos] = cleanString(input.reglaDistribucionCostos) ? selectOption(SHIPPING_V2_PACKING_SELECT_OPTIONS.reglaDistribucionCostos, cleanString(input.reglaDistribucionCostos)) : null;
  if (hasOwnInput(input, "observacionCostos")) fields[F.observacionCostos] = cleanString(input.observacionCostos);
  if (hasOwnInput(input, "observaciones")) fields[F.observaciones] = cleanString(input.observaciones);
  if (hasOwnInput(input, "ordenReferencia")) fields[SHIPPING_V2_PACKING_ORDER_REFERENCE_FIELD] = cleanString(input.ordenReferencia);
  return fields;
}

function editablePackingKeysForStatus(status: string): Set<keyof ShippingV2PackingWriteInput> {
  const normalized = normalizeStatus(status);
  const logisticsCostKeys: Array<keyof ShippingV2PackingWriteInput> = ["flete", "arancel", "otrosCostos", "reglaDistribucionCostos", "observacionCostos"];
  if (normalized === "en proceso") {
    return new Set(["nombre", "tipo", "ordenReferencia", "observaciones", "proveedorResponsableId", "trackingUsa", "transportistaUsa", "trackingEc", "transportistaEc", "peso", ...logisticsCostKeys]);
  }
  if (normalized === "cerrado") {
    return new Set(["ordenReferencia", "trackingUsa", "transportistaUsa", "trackingEc", "transportistaEc", "peso", ...logisticsCostKeys]);
  }
  if (normalized === "en transito") {
    return new Set(["ordenReferencia", "trackingUsa", "transportistaUsa", "trackingEc", "transportistaEc", "peso", ...logisticsCostKeys]);
  }
  if (normalized === "recibido") {
    return new Set(["ordenReferencia", ...logisticsCostKeys]);
  }
  return new Set();
}

function assertPackingPatchAllowed(status: string, input: ShippingV2PackingWriteInput) {
  const allowed = editablePackingKeysForStatus(status);
  const keys = Object.keys(input) as Array<keyof ShippingV2PackingWriteInput>;
  if (!keys.length) throw new Error("No hay campos editables para actualizar.");
  const disallowed = keys.filter((key) => !allowed.has(key));
  if (disallowed.length) {
    throw new Error(`No se puede editar ${disallowed.join(", ")} cuando el packing está en estado ${status}.`);
  }
}

async function validatePackingLogisticsProvider(providerId?: string) {
  const cleanId = cleanString(providerId);
  if (!cleanId) return;
  const provider = await getShippingV2ProveedorById(cleanId);
  if (!provider) throw new Error("Proveedor logístico no encontrado.");
  if (!canBePackingLogisticsProvider(provider)) {
    throw new Error("El proveedor logístico debe estar activo y tener Tipo de proveedor = Logístico.");
  }
}

async function validatePackingTransportistas(input: ShippingV2PackingWriteInput) {
  const [usaProvider, ecProvider] = await Promise.all([
    cleanString(input.transportistaUsa) ? getShippingV2ProveedorById(cleanString(input.transportistaUsa)) : Promise.resolve(null),
    cleanString(input.transportistaEc) ? getShippingV2ProveedorById(cleanString(input.transportistaEc)) : Promise.resolve(null),
  ]);

  if (cleanString(input.transportistaUsa) && (!usaProvider || !canBeUsaTransportProvider(usaProvider))) {
    throw new Error("Este transportista no es compatible con esta ruta logística.");
  }
  if (cleanString(input.transportistaEc) && (!ecProvider || !isCompatibleEcuadorTransportProvider(ecProvider, input))) {
    throw new Error("Este transportista no es compatible con esta ruta logística.");
  }
}

function shouldValidatePackingRoute(input: ShippingV2PackingWriteInput) {
  return hasOwnInput(input, "transportistaUsa") ||
    hasOwnInput(input, "transportistaEc") ||
    hasOwnInput(input, "trackingUsa") ||
    hasOwnInput(input, "trackingEc") ||
    hasOwnInput(input, "tipo");
}

export async function getShippingV2Packings(access?: ShippingV2AccessContext) {
  const [records, proveedores] = await Promise.all([
    listRecords(SHIPPING_V2_TABLES.packings, {
      maxRecords: 200,
      sortField: SHIPPING_V2_PACKING_FIELDS.fechaCreacion,
      sortDirection: "desc",
    }),
    getShippingV2Proveedores(),
  ]);
  const labelsById = createShippingV2ProveedorLabelMap(proveedores);
  return records
    .map(mapPacking)
    .map((packing) => applyPackingProviderLabels(packing, labelsById))
    .filter((packing) => canAccessPacking(packing, access));
}

export async function getShippingV2PackingById(recordId: string, access?: ShippingV2AccessContext, options: MapPackingOptions = {}) {
  const id = cleanString(recordId);
  if (!id) throw new Error("Record ID de packing inválido.");
  const includeItems = options.includeItems !== false;

  const [record, proveedores] = await Promise.all([
    airtableRequest<AirtableRecordResponse>(`${tableUrl(SHIPPING_V2_TABLES.packings)}/${encodeURIComponent(id)}`),
    getShippingV2Proveedores(),
  ]);
  const labelsById = createShippingV2ProveedorLabelMap(proveedores);
  const packing = applyPackingProviderLabels(mapPacking(record), labelsById);
  if (!canAccessPacking(packing, access)) throw new Error("No tienes acceso a este packing.");
  if (!includeItems) return packing;
  const itemRecords = await Promise.all(packing.itemIds.map((itemId) => getRecordById(SHIPPING_V2_TABLES.items, itemId)));
  packing.items = itemRecords
    .filter((record): record is AirtableRecord => Boolean(record))
    .map((record) => mapItem(record, { includeAiName: options.includeAiName !== false }))
    .filter((item) => canAccessItem(item, access));
  return packing;
}

export async function getShippingV2PackingInvoiceData(recordId: string, access?: ShippingV2AccessContext): Promise<ShippingV2PackingInvoiceData> {
  const packing = await getShippingV2PackingById(recordId, access, { includeAiName: false });
  if (!packing) throw new Error("Packing no encontrado.");
  if (!packing.items.length) throw new Error("Este packing no tiene items vinculados. Agrega items antes de generar la factura.");

  const providerId = packing.proveedorResponsableId || packing.items.find((item) => item.proveedorId)?.proveedorId || "";
  if (!providerId) throw new Error("Este packing no tiene proveedor relacionado. Asigna un proveedor antes de generar la factura.");
  const provider = await getShippingV2ProveedorById(providerId);
  if (!provider) throw new Error("Proveedor no encontrado. Revisa el proveedor relacionado del packing.");

  const destinatarios = (await listRecords(SHIPPING_V2_DESTINATARIOS_TABLE, { maxRecords: 200 })).map(mapDestinatario);
  const matchingDestinatarios = destinatarios.filter((destinatario) => destinatarioMatchesPacking(destinatario, packing));
  const recipient = matchingDestinatarios[0];
  if (!recipient) throw new Error("Este packing no tiene destinatario vinculado. Agrega un destinatario antes de generar la factura.");

  const warnings: string[] = [];
  if (matchingDestinatarios.length > 1) warnings.push("Este packing tiene varios destinatarios vinculados; se usó el primero.");
  if (!provider.logoProveedor.length) warnings.push("Proveedor sin logo; la factura se generó sin logo.");
  if (!provider.website) warnings.push("Proveedor sin website registrado.");
  if (!provider.email) warnings.push("Proveedor sin email registrado.");
  if (!packing.ordenReferencia) warnings.push("Recomendado: ingresa Orden referencia antes de generar factura.");
  if (!packing.trackingUsa && !packing.trackingEc) warnings.push("Packing sin tracking registrado.");

  const items = packing.items.map((item) => {
    const quantity = item.cantidad && item.cantidad > 0 ? item.cantidad : 1;
    const unitPrice = item.costoProveedor ?? item.precioVentaSugerido ?? item.precioVenta ?? 0;
    if (!item.skuProveedor) warnings.push(`Item ${item.sku || item.id} sin SKU proveedor.`);
    if (!unitPrice) warnings.push(`Item ${item.sku || item.id} sin precio/costo proveedor.`);
    return {
      id: item.id,
      skuProveedor: item.skuProveedor,
      description: item.nombre || item.descripcion || item.sku || item.id,
      quantity,
      unitPrice,
      lineTotal: quantity * unitPrice,
    };
  });
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const stamp = invoiceDateStamp();
  const invoiceNumber = `INV-${sanitizeFilenamePart(packing.packingId || packing.id)}-${stamp}`;
  const reference = sanitizeFilenamePart(packing.ordenReferencia || packing.trackingUsa || packing.trackingEc || stamp);
  const filename = `invoice-${sanitizeFilenamePart(packing.packingId || packing.id)}-${reference || stamp}.pdf`;

  return {
    packing: {
      id: packing.id,
      packingId: packing.packingId,
      tracking: packing.trackingUsa || packing.trackingEc,
      ordenReferencia: packing.ordenReferencia,
      fechaEnvio: packing.fechaEnvio,
      fechaCreacion: packing.fechaCreacion,
      factura: packing.factura,
    },
    provider: {
      id: provider.id,
      name: provider.nombre || provider.label,
      logoUrl: provider.logoProveedor[0]?.thumbnailUrl || provider.logoProveedor[0]?.url,
      website: provider.website,
      email: provider.email,
      invoiceFooter: provider.pieFactura,
    },
    recipient: {
      name: recipient.nombre,
      company: recipient.empresa,
      address1: recipient.direccion,
      address2: recipient.direccionLinea2,
      city: recipient.ciudad,
      state: recipient.estado,
      zip: recipient.codigoPostal,
      country: recipient.pais,
      phone: recipient.telefono,
    },
    items,
    totals: {
      subtotal,
      total: subtotal,
      currency: "USD",
    },
    invoice: {
      invoiceNumber,
      filename,
      generatedAt: new Date().toISOString(),
    },
    warnings,
  };
}

export async function linkShippingV2DestinatarioToPacking(
  packingId: string,
  destinatarioId: string,
  options: { registradoPor: string; access?: ShippingV2AccessContext }
) {
  const packing = await getShippingV2PackingById(packingId, options.access, { includeAiName: false });
  const record = await getRecordById(SHIPPING_V2_DESTINATARIOS_TABLE, cleanString(destinatarioId));
  if (!record) throw new Error("Destinatario no encontrado.");
  const destinatario = mapDestinatario(record);
  const nextPackingIds = Array.from(new Set([...destinatario.packingIds, packing.id]));

  await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_DESTINATARIOS_TABLE), {
    method: "PATCH",
    body: JSON.stringify({
      records: [
        {
          id: destinatario.id,
          fields: {
            [SHIPPING_V2_DESTINATARIO_PACKING_FIELD]: nextPackingIds,
          },
        },
      ],
    }),
  });

  await createShippingV2Event({
    action: "Actualizado",
    entity: "Shipping Packing",
    packingRecordId: packing.id,
    registradoPor: options.registradoPor,
    descripcion: "Destinatario vinculado al packing",
    observacion: destinatario.nombre,
  });

  const updatedRecord = await getRecordById(SHIPPING_V2_DESTINATARIOS_TABLE, destinatario.id);
  return {
    packing,
    destinatario: updatedRecord ? mapDestinatario(updatedRecord) : { ...destinatario, packingIds: nextPackingIds },
  };
}

export async function attachShippingV2PackingInvoice(input: {
  packingId: string;
  filename: string;
  pdfBytes: Uint8Array;
  registradoPor: string;
  invoiceNumber: string;
}) {
  await uploadAttachmentToRecord({
    recordId: input.packingId,
    attachmentFieldIdOrName: SHIPPING_V2_PACKING_INVOICE_FIELD,
    filename: input.filename,
    contentType: "application/pdf",
    fileBase64: Buffer.from(input.pdfBytes).toString("base64"),
  });
  await createShippingV2Event({
    action: "Otro",
    entity: "Shipping Packing",
    packingRecordId: input.packingId,
    registradoPor: input.registradoPor,
    descripcion: "Factura proveedor generada",
    observacion: `${input.filename} · ${input.invoiceNumber}`,
  });
  const updated = await getShippingV2PackingById(input.packingId, undefined, { includeAiName: false });
  const attachment = updated.factura[0];
  return {
    packing: updated,
    attachment,
  };
}

export async function createShippingV2Packing(input: ShippingV2PackingWriteInput, options: { creadoPor: string; access?: ShippingV2AccessContext }) {
  assertShippingV2GeneratedSchema();
  validateOptionalWeight(input.peso);
  await validatePackingLogisticsProvider(input.proveedorLogisticoEcId);
  await validatePackingTransportistas(input);
  if (options.access && !options.access.isAdmin && options.access.providerId) {
    const responsable = cleanString(input.proveedorResponsableId);
    const logisticoEc = cleanString(input.proveedorLogisticoEcId);
    const transportistaUsa = cleanString(input.transportistaUsa);
    const transportistaEc = cleanString(input.transportistaEc);
    if (responsable !== options.access.providerId &&
      logisticoEc !== options.access.providerId &&
      transportistaUsa !== options.access.providerId &&
      transportistaEc !== options.access.providerId) {
      throw new Error("No puedes crear packings para otro proveedor.");
    }
  }
  const packingId = generatePackingId();
  const fields = packingFieldsFromInput({ ...input, estado: OPEN_PACKING_STATUS }, {
    [getOfficialPackingIdField()]: packingId,
    [SHIPPING_V2_PACKING_FIELDS.fechaCreacion]: new Date().toISOString(),
    [SHIPPING_V2_PACKING_FIELDS.creadoPor]: options.creadoPor,
  });

  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.packings), {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }] }),
  });
  const created = response.records?.[0];
  if (!created) throw new Error("Airtable no devolvió el packing creado.");
  const packing = mapPacking(created);
  await createShippingV2Event({
    action: "Creado",
    entity: "Shipping Packing",
    packingRecordId: packing.id,
    registradoPor: options.creadoPor,
    descripcion: `Packing ${packing.packingId} creado desde Portal Staff.`,
  });
  return packing;
}

export async function updateShippingV2Packing(recordId: string, input: ShippingV2PackingWriteInput, options: { actualizadoPor: string; access?: ShippingV2AccessContext }) {
  const id = cleanString(recordId);
  if (!id) throw new Error("Record ID de packing inválido.");
  const existing = await getShippingV2PackingById(id, options.access, { includeItems: false, includeAiName: false });
  assertPackingPatchAllowed(existing.estado, input);
  validateOptionalWeight(input.peso);
  validateOptionalMoney(input.flete, "Flete");
  validateOptionalMoney(input.arancel, "Arancel");
  validateOptionalMoney(input.otrosCostos, "Otros costos");
  if (hasOwnInput(input, "proveedorLogisticoEcId")) await validatePackingLogisticsProvider(input.proveedorLogisticoEcId);
  if (shouldValidatePackingRoute(input)) {
    await validatePackingTransportistas({ ...existing, ...input });
  }

  const fields = packingPatchFieldsFromInput(input);
  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.packings), {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id, fields }] }),
  });
  const updated = response.records?.[0];
  if (!updated) throw new Error("Airtable no devolvió el packing actualizado.");
  const packing = mapPacking(updated);
  await createShippingV2Event({
    action: "Actualizado",
    entity: "Shipping Packing",
    packingRecordId: packing.id,
    registradoPor: options.actualizadoPor,
    descripcion: `Packing ${packing.packingId} actualizado desde Portal Staff.`,
  });
  return getShippingV2PackingById(id, options.access, { includeAiName: false });
}

function isPackingCandidate(item: ShippingV2Item) {
  const normalizedState = normalizeStatus(String(item.estado));
  return Boolean(
    item.requierePacking &&
    !item.packingId &&
    PACKING_CANDIDATE_STATES.has(normalizedState) &&
    !PACKING_BLOCKED_STATES.has(normalizedState) &&
    PACKING_CANDIDATE_MODES.has(String(item.modoLogistico || ""))
  );
}

function isItemCompatibleWithPackingProvider(item: ShippingV2Item, packing: ShippingV2Packing) {
  const packingProviderIds = new Set([
    packing.proveedorResponsableId,
    packing.proveedorLogisticoEcId,
  ].filter(Boolean));
  if (!packingProviderIds.size) return true;
  return Boolean(
    (item.proveedorId && packingProviderIds.has(item.proveedorId)) ||
    (item.proveedorLogisticoId && packingProviderIds.has(item.proveedorLogisticoId))
  );
}

function getPackingCandidateDiagnostics(items: ShippingV2Item[], packing: ShippingV2Packing) {
  return {
    totalItemsRead: items.length,
    requiresPacking: items.filter((item) => Boolean(item.requierePacking)).length,
    withoutPackingRelacionado: items.filter((item) => !item.packingId).length,
    compatibleLogisticsMode: items.filter((item) => PACKING_CANDIDATE_MODES.has(String(item.modoLogistico || ""))).length,
    validState: items.filter((item) => {
      const state = normalizeStatus(String(item.estado));
      return PACKING_CANDIDATE_STATES.has(state) && !PACKING_BLOCKED_STATES.has(state);
    }).length,
    compatibleProvider: items.filter((item) => isItemCompatibleWithPackingProvider(item, packing)).length,
    finalCandidates: items.filter((item) => isPackingCandidate(item) && isItemCompatibleWithPackingProvider(item, packing)).length,
  };
}

export async function getShippingV2PackingCandidateItems(packingId: string, access?: ShippingV2AccessContext) {
  const packing = await getShippingV2PackingById(packingId, access, { includeItems: false, includeAiName: false });
  const items = await getShippingV2Items({ includeAiName: false });
  const scopedItems = items.filter((item) => canAccessItem(item, access));
  if (process.env.NODE_ENV !== "production" && process.env.SHIPPING_V2_DEBUG_PACKINGS === "true") {
    console.info("[Shipping V2 Packings candidatos]", {
      packingId: packing.id,
      packingProveedorResponsableId: packing.proveedorResponsableId || null,
      packingProveedorLogisticoEcId: packing.proveedorLogisticoEcId || null,
      ...getPackingCandidateDiagnostics(scopedItems, packing),
    });
  }
  return scopedItems.filter((item) => isPackingCandidate(item) && isItemCompatibleWithPackingProvider(item, packing));
}

export async function addItemsToShippingV2Packing(packingId: string, itemIds: string[], options: { registradoPor: string; access?: ShippingV2AccessContext }) {
  const id = cleanString(packingId);
  const uniqueItemIds = Array.from(new Set(itemIds.map(cleanString).filter(Boolean)));
  if (!id) throw new Error("Record ID de packing inválido.");
  if (!uniqueItemIds.length) throw new Error("Selecciona al menos un item.");

  const packing = await getShippingV2PackingById(id, options.access, { includeItems: false, includeAiName: false });
  if (!isOpenPackingStatus(packing.estado)) throw new Error("Este packing ya no permite modificar items desde vista normal.");

  const items = await Promise.all(uniqueItemIds.map((itemId) => getShippingV2ItemById(itemId, { includeAiName: false })));
  for (const item of items) {
    if (!canAccessItem(item, options.access)) throw new Error(`No tienes acceso al item ${item.sku}.`);
    if (item.packingId && item.packingId !== id) throw new Error(`El item ${item.sku} ya está asignado a otro packing.`);
    if (!item.requierePacking) throw new Error(`El item ${item.sku} no requiere packing.`);
    if ((!isPackingCandidate(item) || !isItemCompatibleWithPackingProvider(item, packing)) && item.packingId !== id) {
      throw new Error("Este Item no puede agregarse a este packing porque no cumple los criterios logísticos.");
    }
  }

  const nextItemIds = Array.from(new Set([...packing.itemIds, ...uniqueItemIds]));
  try {
    await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.packings), {
      method: "PATCH",
      body: JSON.stringify({ records: [{ id, fields: { [SHIPPING_V2_PACKING_FIELDS.itemsIncluidos]: nextItemIds } }] }),
    });
  } catch (error) {
    if (isLinkedTableMismatch(error)) {
      logLinkedTableMismatch({
        action: "addItemsToShippingV2Packing.linkItems",
        packingRecordId: id,
        itemRecordIds: uniqueItemIds,
        tableName: SHIPPING_V2_TABLES.packings,
        fieldName: SHIPPING_V2_PACKING_FIELDS.itemsIncluidos,
      });
    }
    throw error;
  }

  await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
    method: "PATCH",
    body: JSON.stringify({
      records: items.map((item) => ({
        id: item.id,
        fields: {
          [SHIPPING_V2_ITEM_FIELDS.estadoItem]: "En packing",
          [SHIPPING_V2_ITEM_FIELDS.requierePacking]: true,
          [SHIPPING_V2_ITEM_FIELDS.modoLogistico]: "Asignar a packing existente",
          [SHIPPING_V2_ITEM_FIELDS.ultimaActualizacion]: new Date().toISOString(),
          [SHIPPING_V2_ITEM_FIELDS.actualizadoPor]: options.registradoPor,
        },
      })),
    }),
  });

  await createShippingV2Event({
    action: "Actualizado",
    entity: "Shipping Packing",
    packingRecordId: id,
    registradoPor: options.registradoPor,
    descripcion: `${uniqueItemIds.length} item(s) agregado(s) al packing.`,
  });
  return {
    packing: {
      id,
      itemIds: nextItemIds,
      itemCount: nextItemIds.length,
    },
    addedItems: items.map((item) => ({
      ...item,
      estado: "En packing",
      requierePacking: true,
      modoLogistico: "Asignar a packing existente",
      packingId: id,
    })),
  };
}

export async function removeItemFromShippingV2Packing(packingId: string, itemId: string, options: { registradoPor: string; access?: ShippingV2AccessContext }) {
  const id = cleanString(packingId);
  const itemRecordId = cleanString(itemId);
  if (!id || !itemRecordId) throw new Error("Packing o item inválido.");
  const packing = await getShippingV2PackingById(id, options.access, { includeItems: false, includeAiName: false });
  if (!isOpenPackingStatus(packing.estado)) throw new Error("Este packing ya no permite modificar items desde vista normal.");
  if (!packing.itemIds.includes(itemRecordId)) throw new Error("El item no pertenece a este packing.");
  const item = await getShippingV2ItemById(itemRecordId, { includeAiName: false });
  if (!canAccessItem(item, options.access)) throw new Error("No tienes acceso a este item.");

  const nextItemIds = packing.itemIds.filter((value) => value !== itemRecordId);
  try {
    await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.packings), {
      method: "PATCH",
      body: JSON.stringify({ records: [{ id, fields: { [SHIPPING_V2_PACKING_FIELDS.itemsIncluidos]: nextItemIds } }] }),
    });
  } catch (error) {
    if (isLinkedTableMismatch(error)) {
      logLinkedTableMismatch({
        action: "removeItemFromShippingV2Packing.unlinkItem",
        packingRecordId: id,
        itemRecordIds: [itemRecordId],
        tableName: SHIPPING_V2_TABLES.packings,
        fieldName: SHIPPING_V2_PACKING_FIELDS.itemsIncluidos,
      });
    }
    throw error;
  }
  await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
    method: "PATCH",
    body: JSON.stringify({
      records: [{
        id: itemRecordId,
        fields: {
          [SHIPPING_V2_ITEM_FIELDS.estadoItem]: "Pendiente de packing",
          [SHIPPING_V2_ITEM_FIELDS.requierePacking]: true,
          [SHIPPING_V2_ITEM_FIELDS.modoLogistico]: "Pendiente de packing",
          [SHIPPING_V2_ITEM_FIELDS.ultimaActualizacion]: new Date().toISOString(),
          [SHIPPING_V2_ITEM_FIELDS.actualizadoPor]: options.registradoPor,
        },
      }],
    }),
  });
  await createShippingV2Event({
    action: "Actualizado",
    entity: "Shipping Packing",
    packingRecordId: id,
    itemRecordId,
    registradoPor: options.registradoPor,
    descripcion: "Item removido del packing.",
  });
  return {
    packing: {
      id,
      itemIds: nextItemIds,
      itemCount: nextItemIds.length,
    },
    removedItem: {
      ...item,
      estado: "Pendiente de packing",
      requierePacking: true,
      modoLogistico: "Pendiente de packing",
      packingId: "",
    },
  };
}

export async function closeShippingV2Packing(packingId: string, options: { cerradoPor: string; access?: ShippingV2AccessContext }) {
  const id = cleanString(packingId);
  if (!id) throw new Error("Record ID de packing inválido.");
  const packing = await getShippingV2PackingById(id, options.access);
  if (!isOpenPackingStatus(packing.estado)) throw new Error("Este packing ya no permite cierre desde vista normal.");
  if (!packing.itemIds.length) throw new Error("No puedes cerrar un packing sin items.");

  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.packings), {
    method: "PATCH",
    body: JSON.stringify({
      records: [{
        id,
        fields: {
          [SHIPPING_V2_PACKING_FIELDS.estado]: "Cerrado",
          [SHIPPING_V2_PACKING_FIELDS.fechaCierre]: new Date().toISOString(),
          [SHIPPING_V2_PACKING_FIELDS.cerradoPor]: options.cerradoPor,
        },
      }],
    }),
  });
  const updated = response.records?.[0];
  if (!updated) throw new Error("Airtable no devolvió el packing cerrado.");
  await createShippingV2Event({
    action: "Cambio de estado",
    entity: "Shipping Packing",
    packingRecordId: id,
    registradoPor: options.cerradoPor,
    descripcion: "Packing cerrado desde Portal Staff.",
  });
  return getShippingV2PackingById(id, options.access);
}

function isOpenNovedadStatus(status: string) {
  const normalized = normalizeStatus(status);
  return Boolean(normalized && !["resuelta", "resuelto", "cancelada", "cancelado", "cerrada", "cerrado"].includes(normalized));
}

function isCriticalNovedadType(type: string) {
  const normalized = normalizeStatus(type);
  return ["faltante", "danado", "dañado", "incompleto", "diferente al comprado", "garantia con proveedor", "garantia"].includes(normalized);
}

function revisionStateForNovedad(type: string) {
  const normalized = normalizeStatus(type);
  if (normalized === "faltante") return "Faltante";
  if (normalized === "danado" || normalized === "dañado") return "Dañado";
  if (normalized === "incompleto") return "Incompleto";
  if (normalized === "diferente al comprado") return "Diferente al comprado";
  if (normalized === "garantia con proveedor" || normalized === "garantia") return "En garantía con proveedor";
  return "Aceptado con observación";
}

const RECEPTION_CHECKLIST_FIELDS: Record<ShippingV2RecepcionChecklistAction, { checked: string; by: string; date: string; label: string }> = {
  reviewed: { checked: "Revisado física/técnicamente", by: "Revisado por", date: "Fecha revisión", label: "Revisado física/técnicamente" },
  "photos-taken": { checked: "Fotos tomadas", by: "Fotos tomadas por", date: "Fecha fotos", label: "Fotos tomadas" },
  "published-shopify": { checked: "Shopify publicado", by: "Shopify publicado por", date: "Fecha Shopify publicado", label: "Shopify publicado" },
  "published-marketplace": { checked: "Marketplace publicado", by: "Marketplace publicado por", date: "Fecha Marketplace publicado", label: "Marketplace publicado" },
  "published-mercado-libre": { checked: "Mercado Libre publicado", by: "Mercado Libre publicado por", date: "Fecha Mercado Libre publicado", label: "Mercado Libre publicado" },
  "published-facebook": { checked: "Grupos Facebook publicado", by: "Facebook publicado por", date: "Fecha Facebook publicado", label: "Grupos Facebook publicado" },
};

export async function updateShippingV2ReceptionChecklistItem(
  recordId: string,
  input: { action: ShippingV2RecepcionChecklistAction; value: boolean; note?: string },
  options: { actualizadoPor: string }
) {
  const id = cleanString(recordId);
  if (!id) throw new Error("Record ID de item inválido.");
  const item = await getShippingV2ItemById(id, { includeAiName: false });
  const now = new Date().toISOString();
  const note = cleanString(input.note);
  const fields: Record<string, unknown> = {
    [SHIPPING_V2_ITEM_FIELDS.ultimaActualizacion]: now,
    [SHIPPING_V2_ITEM_FIELDS.actualizadoPor]: options.actualizadoPor,
  };
  const checklistFields = RECEPTION_CHECKLIST_FIELDS[input.action];
  if (!checklistFields) throw new Error("Acción de recepción no soportada.");
  fields[checklistFields.checked] = input.value;
  if (input.value) {
    fields[checklistFields.by] = options.actualizadoPor;
    fields[checklistFields.date] = now;
  }
  if (note) fields["Observación recepción"] = `${item.observacionRecepcion ? `${item.observacionRecepcion}\n` : ""}[${now}] ${options.actualizadoPor}: ${note}`;

  if (input.action === "reviewed") {
    fields[SHIPPING_V2_ITEM_FIELDS.estadoRevision] = input.value ? "Recibido correctamente" : "Recibido pendiente de revisión";
    if (input.value && normalizeStatus(item.estado) === "recibido") fields[SHIPPING_V2_ITEM_FIELDS.estadoItem] = "En revisión";
  }

  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id, fields }] }),
  });
  const updated = response.records?.[0];
  if (!updated) throw new Error("Airtable no devolvió el item actualizado.");
  const updatedItem = mapItem(updated);
  await createShippingV2Event({
    action: "Actualizado",
    itemRecordId: id,
    itemName: updatedItem.nombre,
    registradoPor: options.actualizadoPor,
    descripcion: `Recepción: ${checklistFields.label} = ${input.value ? "sí" : "no"}.`,
    observacion: note,
  });
  return updatedItem;
}

function generateItemNovedadId(item: ShippingV2Item) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const time = String(Date.now()).slice(-5);
  return `NOV-${item.sku || item.id}-${date}-${time}`;
}

export async function createShippingV2ItemNovedad(
  recordId: string,
  input: ShippingV2ItemNovedadInput,
  options: { registradoPor: string }
) {
  const id = cleanString(recordId);
  if (!id) throw new Error("Record ID de item inválido.");
  const tipo = cleanString(input.tipo);
  const descripcion = cleanString(input.descripcion);
  const evidenciaUrl = cleanString(input.evidenciaUrl);
  const packingId = cleanString(input.packingId);
  if (!tipo) throw new Error("Selecciona un tipo de novedad.");
  if (!descripcion) throw new Error("Describe la novedad del item.");

  const item = await getShippingV2ItemById(id, { includeAiName: false });
  const critical = isCriticalNovedadType(tipo);

  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.novedades), {
    method: "POST",
    body: JSON.stringify({
      typecast: true,
      records: [{
        fields: compactFields({
          "Novedad ID": generateItemNovedadId(item),
          "Tipo de novedad": tipo,
          "Estado Novedad": "Abierta",
          "Item relacionado": [item.id],
          "Packing relacionado": packingId ? [packingId] : undefined,
          "Descripción": descripcion,
          "Evidencias": evidenciaUrl ? [{ url: evidenciaUrl }] : undefined,
          "Fecha de registro": new Date().toISOString(),
          "Registrado por": options.registradoPor,
        }),
      }],
    }),
  });
  const created = response.records?.[0];
  if (!created) throw new Error("Airtable no devolvió la novedad creada.");

  let updatedItem = item;
  if (critical) {
    const itemResponse = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
      method: "PATCH",
      body: JSON.stringify({
        records: [{
          id: item.id,
          fields: {
            [SHIPPING_V2_ITEM_FIELDS.estadoItem]: "Con novedad",
            [SHIPPING_V2_ITEM_FIELDS.estadoRevision]: revisionStateForNovedad(tipo),
            [SHIPPING_V2_ITEM_FIELDS.ultimaActualizacion]: new Date().toISOString(),
            [SHIPPING_V2_ITEM_FIELDS.actualizadoPor]: options.registradoPor,
          },
        }],
      }),
    });
    const updated = itemResponse.records?.[0];
    if (updated) updatedItem = mapItem(updated);
  }

  await createShippingV2Event({
    action: "Novedad abierta",
    entity: "Shipping Novedad",
    itemRecordId: item.id,
    packingRecordId: packingId || undefined,
    novedadRecordId: created.id,
    registradoPor: options.registradoPor,
    descripcion: `Novedad de item registrada: ${tipo}.`,
    observacion: descripcion,
  });

  return { item: updatedItem, novedad: mapNovedad(created) };
}

async function getOpenNovedadesForPacking(packing: ShippingV2Packing) {
  const records = await listRecords(SHIPPING_V2_TABLES.novedades, { maxRecords: 200 });
  return records
    .map(mapNovedad)
    .filter((novedad) => {
      const relatedToPacking = novedad.packingId === packing.id || Boolean(novedad.itemId && packing.itemIds.includes(novedad.itemId));
      return relatedToPacking && isOpenNovedadStatus(novedad.estado);
    });
}

async function patchPackingStatus(input: {
  packing: ShippingV2Packing;
  estado: string;
  actor: string;
  fields?: Record<string, unknown>;
  descripcion: string;
  observacion?: string;
  access?: ShippingV2AccessContext;
}) {
  const previousStatus = input.packing.estado;
  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.packings), {
    method: "PATCH",
    body: JSON.stringify({
      records: [{
        id: input.packing.id,
        fields: {
          [SHIPPING_V2_PACKING_FIELDS.estado]: input.estado,
          ...(input.fields ?? {}),
        },
      }],
    }),
  });
  const updated = response.records?.[0];
  if (!updated) throw new Error("Airtable no devolvió el packing actualizado.");
  await createShippingV2Event({
    action: "Cambio de estado",
    entity: "Shipping Packing",
    packingRecordId: input.packing.id,
    registradoPor: input.actor,
    descripcion: input.descripcion,
    estadoAnterior: previousStatus,
    estadoNuevo: input.estado,
    observacion: input.observacion,
  });
  return getShippingV2PackingById(input.packing.id, input.access);
}

async function updatePackingItemsForStatus(packing: ShippingV2Packing, fields: Record<string, unknown>) {
  if (!packing.itemIds.length) return;
  await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
    method: "PATCH",
    body: JSON.stringify({
      records: packing.itemIds.map((itemId) => ({
        id: itemId,
        fields,
      })),
    }),
  });
}

export async function transitionShippingV2PackingStatus(
  packingId: string,
  input: { action: ShippingV2PackingStatusAction; actor: string; decision?: string; access?: ShippingV2AccessContext }
) {
  const id = cleanString(packingId);
  if (!id) throw new Error("Record ID de packing inválido.");
  const packing = await getShippingV2PackingById(id, input.access);
  const currentStatus = normalizeStatus(packing.estado);
  const now = new Date().toISOString();
  const decision = cleanString(input.decision);

  if (input.action === "close") {
    return closeShippingV2Packing(id, { cerradoPor: input.actor, access: input.access });
  }

  if (input.action === "mark-in-transit") {
    if (currentStatus !== "cerrado") throw new Error("Solo puedes marcar en tránsito un packing cerrado.");
    await updatePackingItemsForStatus(packing, {
      [SHIPPING_V2_ITEM_FIELDS.estadoItem]: "En tránsito",
      [SHIPPING_V2_ITEM_FIELDS.ultimaActualizacion]: now,
      [SHIPPING_V2_ITEM_FIELDS.actualizadoPor]: input.actor,
    });
    return patchPackingStatus({
      packing,
      estado: "En tránsito",
      actor: input.actor,
      access: input.access,
      fields: {
        [SHIPPING_V2_PACKING_FIELDS.fechaEnvio]: now,
        "Enviado por": input.actor,
      },
      descripcion: "Packing marcado en tránsito desde Portal Staff.",
    });
  }

  if (input.action === "mark-received") {
    if (currentStatus !== "en transito") throw new Error("Solo puedes marcar recibido un packing en tránsito.");
    await updatePackingItemsForStatus(packing, {
      [SHIPPING_V2_ITEM_FIELDS.estadoItem]: "Recibido",
      [SHIPPING_V2_ITEM_FIELDS.estadoRevision]: "Recibido pendiente de revisión",
      [SHIPPING_V2_ITEM_FIELDS.ultimaActualizacion]: now,
      [SHIPPING_V2_ITEM_FIELDS.actualizadoPor]: input.actor,
    });
    return patchPackingStatus({
      packing,
      estado: "Recibido",
      actor: input.actor,
      access: input.access,
      fields: {
        [SHIPPING_V2_PACKING_FIELDS.fechaRecepcion]: now,
        "Recibido por": input.actor,
      },
      descripcion: "Packing marcado como recibido desde Portal Staff. Los items quedan pendientes de revisión.",
    });
  }

  if (input.action === "start-review") {
    if (currentStatus !== "recibido") throw new Error("Solo puedes iniciar revisión de un packing recibido.");
    await updatePackingItemsForStatus(packing, {
      [SHIPPING_V2_ITEM_FIELDS.estadoItem]: "En revisión",
      [SHIPPING_V2_ITEM_FIELDS.estadoRevision]: "Recibido pendiente de revisión",
      [SHIPPING_V2_ITEM_FIELDS.ultimaActualizacion]: now,
      [SHIPPING_V2_ITEM_FIELDS.actualizadoPor]: input.actor,
    });
    return patchPackingStatus({
      packing,
      estado: "En revisión",
      actor: input.actor,
      access: input.access,
      descripcion: "Revisión de packing iniciada desde Portal Staff.",
    });
  }

  if (input.action === "continue-review") {
    if (currentStatus !== "con novedad") throw new Error("Solo puedes continuar revisión desde un packing con novedad.");
    return patchPackingStatus({
      packing,
      estado: "En revisión",
      actor: input.actor,
      access: input.access,
      descripcion: "Revisión de packing continuada desde una novedad.",
      observacion: decision,
    });
  }

  if (input.action === "restore-in-transit" || input.action === "restore-received" || input.action === "restore-review") {
    if (!input.access?.isAdmin) throw new Error("Solo un administrador puede restaurar el estado operativo.");
    if (currentStatus !== "con novedad") throw new Error("Esta acción solo aplica a packings legacy en estado Con novedad.");
    if (!decision) throw new Error("Registra una confirmación para restaurar el estado operativo.");
    const nextStatus = input.action === "restore-in-transit" ? "En tránsito" : input.action === "restore-received" ? "Recibido" : "En revisión";
    return patchPackingStatus({
      packing,
      estado: nextStatus,
      actor: input.actor,
      access: input.access,
      descripcion: `Estado operativo restaurado a ${nextStatus} desde estado legacy Con novedad.`,
      observacion: decision,
    });
  }

  if (input.action === "close-final") {
    if (currentStatus !== "en revision" && currentStatus !== "con novedad") {
      throw new Error("Solo puedes cerrar final un packing en revisión o con novedad.");
    }
    const openNovedades = await getOpenNovedadesForPacking(packing);
    if (currentStatus === "en revision" && openNovedades.length) {
      throw new Error("No puedes cerrar final mientras existan novedades pendientes.");
    }
    if (currentStatus === "con novedad") {
      if (!input.access?.isAdmin) throw new Error("Solo un administrador puede cerrar un packing con novedad.");
      if (!decision) throw new Error("Registra una decisión para cerrar un packing con novedad.");
    }
    return patchPackingStatus({
      packing,
      estado: "Cerrado final",
      actor: input.actor,
      access: input.access,
      descripcion: currentStatus === "con novedad" ? "Packing con novedad cerrado final con decisión administrativa." : "Packing cerrado final desde Portal Staff.",
      observacion: decision,
    });
  }

  if (input.action === "cancel") {
    if (!input.access?.isAdmin) throw new Error("Solo un administrador puede cancelar packings.");
    if (currentStatus === "cerrado final") throw new Error("No puedes cancelar un packing cerrado final.");
    if (!decision) throw new Error("Registra un motivo para cancelar el packing.");
    return patchPackingStatus({
      packing,
      estado: "Cancelado",
      actor: input.actor,
      access: input.access,
      fields: {
        "Fecha de cancelación": now,
        "Motivo de cancelación": decision || "Cancelado desde Portal Staff.",
      },
      descripcion: "Packing cancelado desde Portal Staff.",
      observacion: decision,
    });
  }

  throw new Error("Acción de estado no soportada.");
}

function generateNovedadId(packing: ShippingV2Packing) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const time = String(Date.now()).slice(-5);
  return `NOV-${packing.packingId || packing.id}-${date}-${time}`;
}

export async function createShippingV2PackingNovedad(
  packingId: string,
  input: ShippingV2PackingNovedadInput,
  options: { registradoPor: string; access?: ShippingV2AccessContext }
) {
  const id = cleanString(packingId);
  if (!id) throw new Error("Record ID de packing inválido.");
  const tipo = cleanString(input.tipo);
  const descripcion = cleanString(input.descripcion);
  const evidenciaUrl = cleanString(input.evidenciaUrl);
  if (!tipo) throw new Error("Selecciona un tipo de novedad.");
  if (!descripcion) throw new Error("Describe la novedad del packing.");

  const packing = await getShippingV2PackingById(id, options.access, { includeAiName: false });
  const currentStatus = normalizeStatus(packing.estado);
  if (currentStatus === "cancelado") {
    throw new Error("No puedes registrar novedades en un packing cancelado.");
  }
  if (currentStatus === "cerrado final" && !options.access?.isAdmin) {
    throw new Error("Solo un administrador puede registrar novedades administrativas en un packing cerrado final.");
  }

  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.novedades), {
    method: "POST",
    body: JSON.stringify({
      typecast: true,
      records: [{
        fields: compactFields({
          "Novedad ID": generateNovedadId(packing),
          "Tipo de novedad": tipo,
          "Estado Novedad": "Abierta",
          "Packing relacionado": [packing.id],
          "Proveedor responsable": packing.proveedorResponsableId ? [packing.proveedorResponsableId] : undefined,
          "Descripción": descripcion,
          "Evidencias": evidenciaUrl ? [{ url: evidenciaUrl }] : undefined,
          "Fecha de registro": new Date().toISOString(),
          "Registrado por": options.registradoPor,
        }),
      }],
    }),
  });
  const created = response.records?.[0];
  if (!created) throw new Error("Airtable no devolvió la novedad creada.");

  await createShippingV2Event({
    action: "Novedad abierta",
    entity: "Shipping Novedad",
    packingRecordId: packing.id,
    novedadRecordId: created.id,
    registradoPor: options.registradoPor,
    descripcion: `Novedad de packing registrada: ${tipo}.`,
    observacion: descripcion,
  });

  return {
    packing,
    novedad: mapNovedad(created),
  };
}

export async function getShippingV2Recepciones() {
  const records = await listRecords(SHIPPING_V2_TABLES.recepciones, { maxRecords: 200 });
  return records.map(mapRecepcion);
}

export async function getShippingV2Novedades() {
  const records = await listRecords(SHIPPING_V2_TABLES.novedades, { maxRecords: 200 });
  return records.map(mapNovedad);
}

export async function getShippingV2NovedadesForItem(itemRecordId: string) {
  const itemId = cleanString(itemRecordId);
  if (!itemId) return [];

  const records = await listRecords(SHIPPING_V2_TABLES.novedades, { maxRecords: 500 });
  return records
    .map(mapNovedad)
    .filter((novedad) => novedad.itemIds.includes(itemId))
    .sort((a, b) => {
      const bTime = Date.parse(b.fechaRegistro || b.createdTime || "");
      const aTime = Date.parse(a.fechaRegistro || a.createdTime || "");
      return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
    });
}

export async function getShippingV2DashboardSummary(): Promise<ShippingV2DashboardSummary> {
  const [items, pagos, packings, novedades] = await Promise.all([
    getShippingV2Items(),
    getShippingV2Pagos(),
    getShippingV2Packings(),
    getShippingV2Novedades(),
  ]);

  return {
    totalItems: items.length,
    itemsPendientesPago: items.filter((item) => normalizeStatus(item.estado).includes("pendiente pago")).length,
    itemsEnTransito: items.filter((item) => normalizeStatus(item.estado).includes("transito")).length,
    itemsDisponibles: items.filter((item) => normalizeStatus(item.estado).includes("disponible")).length,
    pagosPendientes: pagos.filter((pago) => normalizeStatus(pago.estado).includes("pendiente")).length,
    packingsEnProceso: packings.filter((packing) => normalizeStatus(packing.estado).includes("proceso")).length,
    packingsEnTransito: packings.filter((packing) => normalizeStatus(packing.estado).includes("transito")).length,
    novedadesAbiertas: novedades.filter((novedad) => ["abierta", "en revision"].includes(normalizeStatus(novedad.estado))).length,
  };
}
