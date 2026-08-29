import "server-only";

import { comprometerUnidades, liberarUnidades, unidadesReservadas } from "./unidades";
import {
  calcularCierreDespiece,
  calcularRepartoParaPiezas,
  construirInputPiezaDespiece,
  evaluarSiSePuedeDespiezar,
  puedeCancelarseDespiece,
  type NuevaPiezaInput,
  type PiezaDespiece,
  type ResumenDespiece,
} from "./despiece-airtable";

import { EscrituraConcurrenteError, verificarEscrituraUnica, withLock } from "@/lib/concurrencia";

import type {
  ShippingV2DashboardSummary,
  ShippingV2AccessContext,
  ShippingV2AccessPermissions,
  ShippingV2Attachment,
  ShippingV2ComputerCatalogCreateInput,
  ShippingV2ComputerCatalogEntry,
  ShippingV2CpuCatalogCreateInput,
  ShippingV2CpuCatalogEntry,
  ShippingV2Destinatario,
  ShippingV2FinanzasMovimiento,
  ShippingV2Item,
  ShippingV2ItemSearchEntry,
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
import { canAccessApp, isAdministratorRole, isProviderRole } from "@/lib/apps";
import { SHIPPING_V2_FACEBOOK_SUPER_GEEK_FIELD, SHIPPING_V2_TEXTO_FACEBOOK_FIELD, SHIPPING_V2_TEXTO_FACEBOOK_LEGACY_FIELD, getShippingV2ItemEditField, getShippingV2ItemEditFieldByKey } from "@/lib/shipping-v2/item-edit-config";
import { getShippingV2FacebookPublicationBlockReason, getShippingV2FacebookTextGenerationBlockReason } from "@/lib/shipping-v2/facebook-super-geek-text";
import { evaluarPublicacionItem } from "@/lib/shipping-v2/item-availability";
import { validarReglaDistribucion } from "@/lib/shipping-v2/packing-costos";
import { getDefaultItemFlowByOperation } from "@/lib/shipping-v2/item-operation-rules";
import {
  isPositiveShippingV2Price,
  isShippingV2GiftOperation,
  isShippingV2PurchaseOperation,
  normalizeShippingV2InlineMoneyQuantityField,
  normalizeShippingV2ItemMoneyQuantityInput,
} from "@/lib/shipping-v2/item-money-quantity";
import {
  SHIPPING_V2_ACTIVE_PAYMENT_ITEM_LOCK_MESSAGE,
  calculateShippingV2PaymentItemSubtotal,
  calculateShippingV2PaymentItemsTotal,
  type ShippingV2PaymentItemLike,
} from "@/lib/shipping-v2/payment-calculations";
import { withShippingV2PackingProviderCostSummary } from "@/lib/shipping-v2/packing-calculations";
import { createShippingV2ProveedorLabelMap, resolveShippingV2ProveedorLabel } from "@/lib/shipping-v2/provider-labels";
import { canBeItemLogisticsProvider, canBePackingLogisticsProvider, canBePurchaseProvider } from "@/lib/shipping-v2/provider-rules";
import { canBeUsaTransportProvider, isCompatibleEcuadorTransportProvider } from "@/lib/shipping-v2/tracking-providers";
import { generateUniqueSkuFromExistingSkus, getSkuPrefixByCategory, normalizeSku } from "@/lib/sku/sku-service";
import { round2 } from "@/lib/finanzas/validaciones";
import {
  canShippingV2,
  assertShippingV2Permission,
  noShippingV2Access,
  providerShippingV2Access,
  puedeAlcanzarProveedor,
  staffShippingV2Access,
  systemShippingV2Access,
} from "@/lib/shipping-v2/access";
import { assertShippingV2GeneratedSchema, SHIPPING_V2_COMPUTER_CATALOG_FIELDS, SHIPPING_V2_COMPUTER_CATALOG_SELECT_OPTIONS, SHIPPING_V2_CONNECTIVITY_CATALOG_FIELDS, SHIPPING_V2_CPU_CATALOG_FIELDS, SHIPPING_V2_CPU_CATALOG_SELECT_OPTIONS, SHIPPING_V2_EXTRA_FEATURES_CATALOG_FIELDS, SHIPPING_V2_FINANCE_FIELDS, SHIPPING_V2_FINANCE_SELECT_OPTIONS, SHIPPING_V2_ITEM_FIELDS, SHIPPING_V2_ITEM_SELECT_OPTIONS, SHIPPING_V2_PACKING_FIELDS, SHIPPING_V2_PACKING_SELECT_OPTIONS, SHIPPING_V2_PAYMENT_FIELDS, SHIPPING_V2_PAYMENT_SELECT_OPTIONS, SHIPPING_V2_PORTS_CATALOG_FIELDS, SHIPPING_V2_PROVIDER_FIELDS, SHIPPING_V2_TABLES } from "@/lib/shipping-v2/schema.generated";
import { calculateShippingV2BatteryState, shippingV2CategoryDoesNotUseScreenOrBattery, shippingV2CategoryHasBattery } from "@/lib/shipping-v2/technical-sheet";
import { fetchCuentaPorNombre, fetchCuentaPorNombreNormalizado } from "@/lib/finanzas/cuentas";
import { crearMovimiento } from "@/lib/finanzas/movimientos";

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

const AIRTABLE_RATE_LIMIT_MAX_RETRIES = 3;
const AIRTABLE_RATE_LIMIT_BASE_DELAY_MS = 250;
const AIRTABLE_BATCH_RECORD_ID_CHUNK_SIZE = 25;
const AIRTABLE_MUTATION_RECORD_CHUNK_SIZE = 25;

export type ShippingV2TechnicalOptionType = "connectivity" | "port" | "extraFeature";
export type ShippingV2ItemsListSortKey =
  | "newest"
  | "oldest"
  | "sku-asc"
  | "sku-desc"
  | "name-asc"
  | "name-desc"
  | "estado"
  | "proveedor-compra"
  | "costo-desc"
  | "precio-desc";

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
const SHIPPING_V2_ITEM_SOURCE_FIELDS = {
  operacionComercial: "Operación Comercial",
  opcionOrigen: "Opción origen",
} as const;
const SHIPPING_V2_ITEM_SEARCH_INDEX_CACHE_MS = 90 * 1000;

type ShippingV2ItemSearchIndexCache = {
  items: ShippingV2ItemSearchEntry[];
  generatedAt: string;
  expiresAt: number;
};

let shippingV2ItemSearchIndexCache: ShippingV2ItemSearchIndexCache | null = null;

function invalidateShippingV2ItemSearchIndexCache() {
  shippingV2ItemSearchIndexCache = null;
}

// El control de acceso vive en lib/shipping-v2/access.ts (puro y testeable).
// Se reexporta desde aquí para no romper los imports existentes del módulo.
export {
  canShippingV2,
  assertShippingV2Permission,
  isShippingV2ProviderAccess,
  PERMISOS_PORTAL_PROVEEDOR,
  ETIQUETAS_PERMISO_PROVEEDOR,
} from "@/lib/shipping-v2/access";

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

/**
 * Rechaza las reglas de distribución que las fórmulas de Airtable no saben
 * repartir. Elegir "Por peso" dejaría el flete y el arancel en $0 para todos
 * los artículos del packing, sin que nada lo indique en pantalla.
 * Ver lib/shipping-v2/packing-costos.ts.
 */
function assertReglaDistribucionSoportada(regla: string | null | undefined) {
  if (regla === undefined) return; // no viene en el payload: no se toca
  const error = validarReglaDistribucion(regla);
  if (error) throw new Error(error);
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
  // Fase 20.5 §4.3 — deja de exigir presencia en SHIPPING_V2_FINANCE_SELECT_OPTIONS.cuentaOrigen,
  // el select legacy y congelado desde 20.1 de "Movimientos Financieros" (nunca tuvo los nombres
  // de tarjeta). Se valida contra su propio select, que el dueño ya cura correctamente. Se compara
  // recortando cada opción (una de las opciones reales en Airtable, "Tarjeta D. Supe Geek ", trae un
  // espacio final) contra `cuentaOrigen`, que ya llegó recortado por normalizeSingleSelectValue — pero
  // se conserva el texto EXACTO de la opción (con su espacio, si lo tiene) para lo que se escribe de
  // vuelta a Airtable: un singleSelect rechaza cualquier valor que no coincida carácter por carácter
  // con una opción ya configurada (sin typecast en este PATCH).
  const cuentaOrigenCanonica = SHIPPING_V2_PAYMENT_SELECT_OPTIONS.cuentaOrigen.find((opcion) => opcion.trim() === cuentaOrigen);
  if (!cuentaOrigenCanonica) {
    throw new Error("Cuenta origen no válida. Selecciona una opción existente.");
  }
  if (!cleanString(input.transaccionId) && !cleanString(input.comprobanteUrl)) throw new Error("Ingresa comprobante o transacción ID para completar soporte.");

  return {
    ...input,
    metodoPago,
    cuentaOrigen: cuentaOrigenCanonica,
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
  return puedeAlcanzarProveedor(access, packing.proveedorResponsableId, packing.proveedorLogisticoEcId, packing.transportistaUsa, packing.transportistaEc);
}

function canAccessItem(item: Pick<ShippingV2Item, "proveedorId" | "proveedorLogisticoId">, access?: ShippingV2AccessContext) {
  return puedeAlcanzarProveedor(access, item.proveedorId, item.proveedorLogisticoId);
}

function sanitizeShippingV2ItemForAccess(item: ShippingV2Item, access?: ShippingV2AccessContext, options?: { sanitizeForAccess?: boolean }) {
  if (options?.sanitizeForAccess === false || canShippingV2(access, "canViewCosts")) return item;
  const canViewProviderCost = canShippingV2(access, "canViewProviderCost");
  const canEditProviderItemFields = canShippingV2(access, "canEditProviderItemFields");
  return {
    ...item,
    costoProveedor: canViewProviderCost ? item.costoProveedor : null,
    fletePacking: null,
    arancelPacking: null,
    otrosCostosPacking: null,
    totalCostoProveedorPacking: null,
    costoFleteAsignado: null,
    costoArancelAsignado: null,
    otrosCostosAsignados: null,
    costoAsignadoDespiece: null,
    costoLogisticoAsignado: null,
    costoTotalUnidad: null,
    costoTotalEstimado: null,
    precioVentaSugerido: null,
    precioVenta: null,
    observacionesInternas: canEditProviderItemFields ? item.observacionesInternas : "",
    legacyPagoRelacionadoIds: [],
  };
}

function canAccessPago(pago: Pick<ShippingV2Pago, "proveedorId">, access?: ShippingV2AccessContext) {
  return puedeAlcanzarProveedor(access, pago.proveedorId);
}

function canAccessNovedad(novedad: ShippingV2Novedad, access?: ShippingV2AccessContext, context?: { itemIds?: Set<string>; packingIds?: Set<string> }) {
  if (!access) return false;
  if (access.isAdmin) return true;
  if (!access.providerId) return false;
  if (novedad.proveedorResponsableIds.includes(access.providerId) || novedad.proveedorResponsableId === access.providerId) return true;
  if (context?.itemIds && novedad.itemIds.some((itemId) => context.itemIds?.has(itemId))) return true;
  if (context?.packingIds && novedad.packingIds.some((packingId) => context.packingIds?.has(packingId))) return true;
  return false;
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

  if (isShippingV2PurchaseOperation(tipoOperacion)) {
    if (!proveedorId) throw new Error("Proveedor de compra es obligatorio para compras a proveedor.");
    if (!isPositiveShippingV2Price(costoProveedor)) {
      throw new Error("Costo proveedor por unidad debe ser mayor a 0 para compras a proveedor.");
    }
  }

  if (isShippingV2GiftOperation(tipoOperacion) && costoProveedor !== null && costoProveedor !== undefined && costoProveedor !== 0) {
    throw new Error("En regalos de proveedor, el costo proveedor por unidad debe estar vacío o ser 0.");
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

/**
 * Deriva las banderas de flujo (requiere pago, packing, inventario, venta) del
 * tipo de operación.
 *
 * `momento` decide qué pasa con el Estado Item:
 *
 *  · "alta"    → el estado lo pone la regla. Un artículo que nace como "Compra
 *                a proveedor" arranca en "Pendiente de pago".
 *  · "edicion" → el estado NO se toca. La regla devuelve siempre el estado
 *                INICIAL del tipo de operación, así que aplicarla a un artículo
 *                que ya avanzó lo mandaría hacia atrás: uno "Disponible" o
 *                "Vendido" volvería a "Pendiente de pago" solo por corregirle
 *                el nombre. El ciclo de vida lo mueven los pasos del flujo
 *                (pago, packing, recepción, "Listo para vender"), no una
 *                edición de datos.
 */
function applyCalculatedItemFlow(
  input: ShippingV2ItemWriteInput,
  momento: "alta" | "edicion" = "alta"
): ShippingV2ItemWriteInput {
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
    disponibleVenta: input.reservado === true ? false : flow.disponibleParaVenta,
    modoLogistico: requestedMode,
    estado: momento === "alta" ? flow.estadoItemSugerido : cleanString(input.estado) || flow.estadoItemSugerido,
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
    [F.fotos]: input.fotos?.map(keptAttachmentPayload),
    [F.observacionesInternas]: cleanString(input.observacionesInternas),
    [F.observacionVenta]: cleanString(input.observacionVenta),
    [F.estadoRevision]: cleanString(input.estadoRevision),
    [F.estadoTriangulacion]: cleanString(input.estadoTriangulacion),
    [F.estadoDespiece]: cleanString(input.estadoDespiece),
    [F.esRepuesto]: Boolean(input.esRepuesto),
    [F.esUsoLocal]: Boolean(input.usoLocal),
    [F.esRegalo]: tipoOperacion === "Regalo de proveedor",
    [SHIPPING_V2_ITEM_SOURCE_FIELDS.operacionComercial]: cleanString(input.operacionComercialId) ? [cleanString(input.operacionComercialId)] : undefined,
    [SHIPPING_V2_ITEM_SOURCE_FIELDS.opcionOrigen]: cleanString(input.opcionOrigenId) ? [cleanString(input.opcionOrigenId)] : undefined,
    ...extra,
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(value: string | null | undefined): number | null {
  const text = cleanString(value);
  if (!text) return null;

  const seconds = Number(text);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);

  const dateMs = Date.parse(text);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

export function getAirtableRateLimitRetryDelayMs(headers: Headers | undefined, retryIndex: number) {
  const retryAfterMs = parseRetryAfterMs(headers?.get("Retry-After"));
  if (retryAfterMs !== null) return retryAfterMs;
  return AIRTABLE_RATE_LIMIT_BASE_DELAY_MS * (2 ** retryIndex);
}

function mergeAirtableHeaders(headers?: HeadersInit) {
  if (!headers) return getClient().headers;
  const merged = new Headers(getClient().headers);
  new Headers(headers).forEach((value, key) => merged.set(key, value));
  return merged;
}

async function airtableFetch(url: string, init: RequestInit = {}, context: { operation: string }) {
  for (let attempt = 0; attempt <= AIRTABLE_RATE_LIMIT_MAX_RETRIES; attempt++) {
    const response = await fetch(url, {
      ...init,
      headers: mergeAirtableHeaders(init.headers),
      cache: "no-store",
    });

    if (response.status !== 429) return response;

    if (attempt >= AIRTABLE_RATE_LIMIT_MAX_RETRIES) {
      const text = await response.text();
      throw new Error(`Airtable Shipping V2 ${context.operation} 429: ${text || "RATE_LIMIT_REACHED"}. Se agotaron ${AIRTABLE_RATE_LIMIT_MAX_RETRIES} reintentos por rate limit.`);
    }

    await sleep(getAirtableRateLimitRetryDelayMs(response.headers, attempt));
  }

  throw new Error(`Airtable Shipping V2 ${context.operation}: reintentos agotados.`);
}

async function airtableMutation<T>(url: string, init: RequestInit) {
  const response = await airtableFetch(url, init, { operation: "escritura" });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable Shipping V2 escritura ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}

async function patchAirtableRecords(tableName: string, records: Array<{ id: string; fields: Record<string, unknown> }>) {
  const updatedRecords: AirtableRecord[] = [];

  for (let index = 0; index < records.length; index += AIRTABLE_MUTATION_RECORD_CHUNK_SIZE) {
    const response = await airtableMutation<AirtableMutationResponse>(tableUrl(tableName), {
      method: "PATCH",
      body: JSON.stringify({ records: records.slice(index, index + AIRTABLE_MUTATION_RECORD_CHUNK_SIZE) }),
    });
    updatedRecords.push(...(response.records ?? []));
  }

  return updatedRecords;
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
  const response = await airtableFetch(url, {
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
  }, { operation: "uploadAttachment" });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable Shipping V2 uploadAttachment ${response.status}: ${text}`);
  }
}

async function airtableRequest<T>(url: string) {
  const response = await airtableFetch(url, {}, { operation: "lectura" });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable Shipping V2 error ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}

async function recordExists(tableName: string, recordId: string) {
  const id = cleanString(recordId);
  if (!id) return true;

  const response = await airtableFetch(`${tableUrl(tableName)}/${encodeURIComponent(id)}`, {}, { operation: "lectura" });

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

  const response = await airtableFetch(`${tableUrl(tableName)}/${encodeURIComponent(id)}`, {}, { operation: "lectura" });

  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable Shipping V2 error ${response.status}: ${text}`);
  }

  return (await response.json()) as AirtableRecordResponse;
}

function escapeAirtableFormulaString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function recordIdFilterFormula(recordIds: string[]) {
  const clauses = recordIds.map((id) => `RECORD_ID()='${escapeAirtableFormulaString(id)}'`);
  return clauses.length === 1 ? clauses[0] : `OR(${clauses.join(",")})`;
}

async function listRecordsByIds(tableName: string, recordIds: string[]) {
  const uniqueIds = Array.from(new Set(recordIds.map(cleanString).filter(Boolean)));
  const records: AirtableRecord[] = [];

  for (let index = 0; index < uniqueIds.length; index += AIRTABLE_BATCH_RECORD_ID_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(index, index + AIRTABLE_BATCH_RECORD_ID_CHUNK_SIZE);
    records.push(...await listRecords(tableName, {
      pageSize: Math.min(chunk.length, 100),
      filterByFormula: recordIdFilterFormula(chunk),
    }));
  }

  return records;
}

type ListRecordsOptions = {
  maxRecords?: number;
  pageSize?: number;
  sortField?: string;
  sortDirection?: "asc" | "desc";
  filterByFormula?: string;
  fields?: string[];
};

type ListRecordsPageOptions = Omit<ListRecordsOptions, "maxRecords"> & {
  offset?: string | null;
};

async function listRecords(tableName: string, options: ListRecordsOptions = {}) {
  const records: AirtableRecord[] = [];
  let offset: string | null = null;

  do {
    const url = new URL(tableUrl(tableName));
    url.searchParams.set("pageSize", String(options.pageSize ?? 100));
    if (options.maxRecords) url.searchParams.set("maxRecords", String(options.maxRecords));
    if (options.filterByFormula) url.searchParams.set("filterByFormula", options.filterByFormula);
    options.fields?.forEach((field) => url.searchParams.append("fields[]", field));
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

async function listRecordsPage(tableName: string, options: ListRecordsPageOptions = {}) {
  const url = new URL(tableUrl(tableName));
  url.searchParams.set("pageSize", String(options.pageSize ?? 100));
  if (options.filterByFormula) url.searchParams.set("filterByFormula", options.filterByFormula);
  options.fields?.forEach((field) => url.searchParams.append("fields[]", field));
  if (options.sortField) {
    url.searchParams.append("sort[0][field]", options.sortField);
    url.searchParams.append("sort[0][direction]", options.sortDirection ?? "desc");
  }
  if (options.offset) url.searchParams.set("offset", options.offset);

  const data = await airtableRequest<AirtableListResponse>(url.toString());
  return {
    records: data.records ?? [],
    nextOffset: data.offset,
  };
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
    permiteAccesoPortalProveedor: firstBoolean(f["Permite acceso portal proveedor"]),
    permisosPortal: stringArray(f["Permisos portal proveedor"]),
    puedeResponderNovedadesGarantias: firstBoolean(f["Puede responder novedades o garantías"] ?? f["Puede responder novedades o garantias"]),
    contacto: firstString(f.Contacto),
    email: firstString(f["Email proveedor"] ?? f.Email ?? f["Email de contacto"]),
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

type MapItemOptions = { includeAiName?: boolean; access?: ShippingV2AccessContext; sanitizeForAccess?: boolean; proveedores?: ShippingV2Proveedor[] };
type MapPackingOptions = { includeItems?: boolean; includeAiName?: boolean; proveedores?: ShippingV2Proveedor[] };
type PackingCandidateItemsOptions = { packing?: ShippingV2Packing; proveedores?: ShippingV2Proveedor[] };

export type ShippingV2ItemNavigationEntry = Pick<ShippingV2Item, "id" | "sku" | "nombre">;

export type ShippingV2ItemNavigation = {
  previous: ShippingV2ItemNavigationEntry | null;
  next: ShippingV2ItemNavigationEntry | null;
  index: number | null;
  total: number;
  items: ShippingV2ItemNavigationEntry[];
};

type ShippingV2ItemListOrderEntry = ShippingV2ItemNavigationEntry & {
  createdTime?: string;
  fechaRegistro?: string;
};

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
    skuProveedor: firstString(f[F.skuProveedor]),
    metodoAsignacionSku: firstString(f[F.metodoAsignacionSku]),
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
    recibido: firstBoolean(f[F.recibido]),
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
    textoFacebook: firstString(f[SHIPPING_V2_TEXTO_FACEBOOK_FIELD]),
    textoFacebookLegacy: firstString(f[SHIPPING_V2_TEXTO_FACEBOOK_LEGACY_FIELD]),
    facebookSuperGeek: firstBoolean(f[SHIPPING_V2_FACEBOOK_SUPER_GEEK_FIELD]),
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
      gpuIntegrada: firstString(f[F.gpuIntegrada]),
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
    registradoPor: firstString(f["Registrado por"] ?? f["Registrado Por"]),
    ultimaActualizacion: firstString(f["Última actualización"] ?? f["Ultima actualizacion"] ?? f["Ultima Actualizacion"]),
    actualizadoPor: firstString(f["Actualizado por"] ?? f["Actualizado Por"]),
    fotos: mapAttachments(f[F.fotos] ?? f.Foto ?? f.Imagenes ?? f["Imágenes"]),
    evidencias: mapAttachments(f[F.evidencias] ?? f.Evidencia),
  };
}

function providerLabelFromMap(recordId: string | undefined, labelsById: Map<string, string>) {
  if (!recordId) return "";
  return labelsById.get(recordId)?.trim() || "";
}

function applyItemProviderLabels(item: ShippingV2Item, labelsById: Map<string, string>) {
  const proveedorNombre = providerLabelFromMap(item.proveedorId, labelsById);
  const proveedorLogisticoNombre = providerLabelFromMap(item.proveedorLogisticoId, labelsById);
  return {
    ...item,
    proveedorNombre: proveedorNombre || item.proveedorNombre,
    proveedorLogisticoNombre: proveedorLogisticoNombre || item.proveedorLogisticoNombre,
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
    cantidad: item.cantidad,
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
    totalRegalos: regalosResumen.reduce((sum, item) => sum + paymentSubtotalOrZero(item), 0),
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
    costoTotalProveedorItems: null,
    costoTotalItemsProveedor: firstNumber(f[F.costoTotalItemsProveedor]),
    cantidadItemsPacking: firstNumber(f[F.cantidadItemsPacking]),
    referenciasIncluidas: items.length,
    unidadesTotales: null,
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

export async function getShippingV2Destinatarios(access?: ShippingV2AccessContext) {
  const records = await listRecords(SHIPPING_V2_DESTINATARIOS_TABLE, { maxRecords: 500 });
  const destinatarios = records.map(mapDestinatario);
  if (!access || access.isAdmin) return destinatarios;
  if (!access.providerId) return [];
  const packings = await getShippingV2Packings(access);
  const packingIds = new Set(packings.map((packing) => packing.id));
  const packingLabels = new Set(packings.map((packing) => packing.packingId).filter(Boolean));
  return destinatarios.filter((destinatario) =>
    destinatario.packingIds.some((packingId) => packingIds.has(packingId)) ||
    destinatario.packingLabels.some((label) => packingLabels.has(label))
  );
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
    return session ? staffShippingV2Access() : noShippingV2Access();
  }

  const email = session.user.email.trim().toLowerCase();
  const roleIsProvider = isProviderRole(role);
  if (!email) return roleIsProvider ? noShippingV2Access() : staffShippingV2Access();

  const proveedores = await getShippingV2Proveedores();
  const provider = proveedores.find((item) => item.email?.trim().toLowerCase() === email);

  // Assumption: the current Staff session does not store a provider record id.
  // Provider access is derived from a Shipping Proveedor email match plus either
  // the user role "Proveedor" or the provider portal-access checkbox.
  if (provider && (roleIsProvider || provider.permiteAccesoPortalProveedor === true)) {
    return providerShippingV2Access(provider);
  }

  return roleIsProvider ? noShippingV2Access() : staffShippingV2Access();
}

async function getShippingV2ProveedorById(recordId: string) {
  const record = await getRecordById(SHIPPING_V2_TABLES.proveedores, recordId);
  return record ? mapProveedor(record) : null;
}

function getShippingV2ItemsListSort(sortBy: ShippingV2ItemsListSortKey = "newest") {
  const F = SHIPPING_V2_ITEM_FIELDS;

  switch (sortBy) {
    case "oldest":
      return { sortField: F.fechaRegistro, sortDirection: "asc" as const };
    case "sku-asc":
      return { sortField: getOfficialSkuField(), sortDirection: "asc" as const };
    case "sku-desc":
      return { sortField: getOfficialSkuField(), sortDirection: "desc" as const };
    case "name-asc":
      return { sortField: F.nombre, sortDirection: "asc" as const };
    case "name-desc":
      return { sortField: F.nombre, sortDirection: "desc" as const };
    case "estado":
      return { sortField: F.estadoItem, sortDirection: "asc" as const };
    case "proveedor-compra":
      return { sortField: F.proveedorCompra, sortDirection: "asc" as const };
    case "costo-desc":
      return { sortField: F.costoProveedor, sortDirection: "desc" as const };
    case "precio-desc":
      return { sortField: F.precioVentaFinal, sortDirection: "desc" as const };
    case "newest":
    default:
      return { sortField: F.fechaRegistro, sortDirection: "desc" as const };
  }
}

export async function getShippingV2Items(options: MapItemOptions = {}) {
  const proveedoresPromise = options.proveedores ? Promise.resolve(options.proveedores) : getShippingV2Proveedores();
  const [records, proveedores] = await Promise.all([
    listRecords(SHIPPING_V2_TABLES.items, {
      maxRecords: 200,
      sortField: SHIPPING_V2_ITEM_FIELDS.fechaRegistro,
      sortDirection: "desc",
    }),
    proveedoresPromise,
  ]);
  const labelsById = createShippingV2ProveedorLabelMap(proveedores);
  return records
    .map((record) => mapItem(record, options))
    .map((item) => applyItemProviderLabels(item, labelsById))
    .filter((item) => canAccessItem(item, options.access))
    .map((item) => sanitizeShippingV2ItemForAccess(item, options.access, options))
    .sort(compareShippingV2ItemListOrder);
}

export async function getShippingV2ItemsPage(options: MapItemOptions & {
  pageSize?: number;
  offset?: string | null;
  sortBy?: ShippingV2ItemsListSortKey;
} = {}) {
  const pageSize = Math.min(Math.max(Math.trunc(options.pageSize ?? 100), 1), 100);
  const sort = getShippingV2ItemsListSort(options.sortBy);

  if (options.access && !options.access.isAdmin) {
    const proveedoresPromise = options.proveedores ? Promise.resolve(options.proveedores) : getShippingV2Proveedores();
    const [records, proveedores] = await Promise.all([
      listRecords(SHIPPING_V2_TABLES.items, {
        maxRecords: 200,
        sortField: sort.sortField,
        sortDirection: sort.sortDirection,
      }),
      proveedoresPromise,
    ]);
    const labelsById = createShippingV2ProveedorLabelMap(proveedores);

    return {
      items: records
        .map((record) => mapItem(record, options))
        .map((item) => applyItemProviderLabels(item, labelsById))
        .filter((item) => canAccessItem(item, options.access))
        .map((item) => sanitizeShippingV2ItemForAccess(item, options.access, options)),
      nextOffset: undefined,
      pageSize,
    };
  }

  const [page, proveedores] = await Promise.all([
    listRecordsPage(SHIPPING_V2_TABLES.items, {
      pageSize,
      offset: options.offset,
      sortField: sort.sortField,
      sortDirection: sort.sortDirection,
    }),
    options.proveedores ? Promise.resolve(options.proveedores) : getShippingV2Proveedores(),
  ]);
  const labelsById = createShippingV2ProveedorLabelMap(proveedores);

  return {
    items: page.records
      .map((record) => mapItem(record, options))
      .map((item) => applyItemProviderLabels(item, labelsById))
      .filter((item) => canAccessItem(item, options.access))
      .map((item) => sanitizeShippingV2ItemForAccess(item, options.access, options)),
    nextOffset: page.nextOffset,
    pageSize,
  };
}

type ShippingV2PackingSearchInfo = {
  packingId: string;
  trackingUsa?: string;
  trackingEc?: string;
};

async function getShippingV2ProviderSearchLabels() {
  const F = SHIPPING_V2_PROVIDER_FIELDS;
  const records = await listRecords(SHIPPING_V2_TABLES.proveedores, {
    fields: [F.proveedorId, F.nombre],
    sortField: F.nombre,
    sortDirection: "asc",
  });
  return createShippingV2ProveedorLabelMap(records.map(mapProveedor));
}

async function getShippingV2PackingSearchInfoById() {
  const F = SHIPPING_V2_PACKING_FIELDS;
  const records = await listRecords(SHIPPING_V2_TABLES.packings, {
    fields: [getOfficialPackingIdField(), F.trackingUsa, F.trackingEc],
    sortField: getOfficialPackingIdField(),
    sortDirection: "desc",
  });

  return new Map(records.map((record) => [record.id, {
    packingId: firstString(record.fields[getOfficialPackingIdField()], record.id),
    trackingUsa: firstString(record.fields[F.trackingUsa]),
    trackingEc: firstString(record.fields[F.trackingEc]),
  } satisfies ShippingV2PackingSearchInfo]));
}

function searchEntryAvailability(input: { disponibleVenta: boolean | null; reservado: boolean | null }) {
  if (input.reservado) return "Reservado";
  if (input.disponibleVenta) return "Disponible para venta";
  return "No disponible";
}

function mapItemSearchEntry(
  record: AirtableRecord,
  context: {
    providerLabelsById: Map<string, string>;
    packingInfoById: Map<string, ShippingV2PackingSearchInfo>;
    canViewCosts?: boolean;
  }
): ShippingV2ItemSearchEntry {
  const F = SHIPPING_V2_ITEM_FIELDS;
  const f = record.fields;
  const sku = firstString(f[getOfficialSkuField()], record.id);
  const proveedorCompraId = firstString(f[F.proveedorCompra]);
  const proveedorLogisticoId = firstString(f[F.proveedorLogistico]);
  const packingRecordId = firstString(f[F.packingRelacionado]);
  const packingInfo = packingRecordId ? context.packingInfoById.get(packingRecordId) : undefined;
  const fotos = mapAttachments(f[F.fotos]);
  const disponibleVenta = firstBoolean(f[F.disponibleVenta]);
  const reservado = firstBoolean(f[F.reservado]);
  const fechaRegistro = firstString(f[F.fechaRegistro], record.createdTime);

  return {
    id: record.id,
    createdTime: record.createdTime,
    sku,
    skuProveedor: firstString(f[F.skuProveedor]) || undefined,
    nombre: firstString(f[F.nombre], "Artículo sin nombre"),
    marca: firstString(f[F.marca]) || undefined,
    modelo: firstString(f[F.modelo]) || undefined,
    numeroSerie: firstString(f[F.numeroSerie]) || undefined,
    estado: firstString(f[F.estadoItem], "Registrado"),
    tipoOperacion: firstString(f[F.tipoOperacion]) || undefined,
    proveedorCompra: resolveShippingV2ProveedorLabel(proveedorCompraId, context.providerLabelsById) || undefined,
    proveedorLogistico: resolveShippingV2ProveedorLabel(proveedorLogisticoId, context.providerLabelsById) || undefined,
    packingId: packingInfo?.packingId || packingRecordId || undefined,
    trackingDirecto: firstString(f[F.trackingDirecto]) || undefined,
    trackingHaciaIntermediario: firstString(f[F.trackingHaciaIntermediario]) || undefined,
    trackingDesdeIntermediario: firstString(f[F.trackingDesdeIntermediario]) || undefined,
    trackingUsa: packingInfo?.trackingUsa || undefined,
    trackingEc: packingInfo?.trackingEc || undefined,
    precioVenta: context.canViewCosts === false ? null : firstNumber(f[F.precioVentaFinal]),
    disponibilidad: searchEntryAvailability({ disponibleVenta, reservado }),
    ubicacionActual: firstString(f[F.ubicacionActual]) || undefined,
    fechaRegistro,
    thumbnailUrl: fotos[0]?.thumbnailUrl || fotos[0]?.url,
  };
}

function canAccessItemRecord(record: AirtableRecord, access?: ShippingV2AccessContext) {
  const F = SHIPPING_V2_ITEM_FIELDS;
  return puedeAlcanzarProveedor(access, firstString(record.fields[F.proveedorCompra]), firstString(record.fields[F.proveedorLogistico]));
}

export async function getShippingV2ItemSearchIndex(access?: ShippingV2AccessContext) {
  const now = Date.now();
  const canUseGlobalCache = !access || access.isAdmin;
  if (canUseGlobalCache && shippingV2ItemSearchIndexCache && shippingV2ItemSearchIndexCache.expiresAt > now) {
    return {
      items: shippingV2ItemSearchIndexCache.items,
      generatedAt: shippingV2ItemSearchIndexCache.generatedAt,
    };
  }

  try {
    const F = SHIPPING_V2_ITEM_FIELDS;
    const fields = Array.from(new Set([
      getOfficialSkuField(),
      F.skuProveedor,
      F.nombre,
      F.marca,
      F.modelo,
      F.numeroSerie,
      F.estadoItem,
      F.tipoOperacion,
      F.proveedorCompra,
      F.proveedorLogistico,
      F.packingRelacionado,
      F.trackingDirecto,
      F.trackingHaciaIntermediario,
      F.trackingDesdeIntermediario,
      F.precioVentaFinal,
      F.disponibleVenta,
      F.reservado,
      F.ubicacionActual,
      F.fechaRegistro,
      F.fotos,
    ]));

    const [records, providerLabelsById, packingInfoById] = await Promise.all([
      listRecords(SHIPPING_V2_TABLES.items, {
        pageSize: 100,
        sortField: F.fechaRegistro,
        sortDirection: "desc",
        fields,
      }),
      getShippingV2ProviderSearchLabels(),
      getShippingV2PackingSearchInfoById(),
    ]);

    const items = records
      .filter((record) => canAccessItemRecord(record, access))
      .map((record) => mapItemSearchEntry(record, { providerLabelsById, packingInfoById, canViewCosts: canShippingV2(access, "canViewCosts") }));
    const generatedAt = new Date().toISOString();

    // Cache corto en memoria: evita releer todo Airtable en cada montaje y se invalida en mutaciones principales de Items.
    if (canUseGlobalCache) {
      shippingV2ItemSearchIndexCache = {
        items,
        generatedAt,
        expiresAt: now + SHIPPING_V2_ITEM_SEARCH_INDEX_CACHE_MS,
      };
    }

    return { items, generatedAt };
  } catch (error) {
    console.error("Error al cargar índice global de Shipping Items:", error);
    throw new Error("No se pudo cargar la búsqueda global de Shipping Items.");
  }
}

function shippingV2ListTime(value?: string) {
  const parsed = Date.parse(value || "");
  return Number.isNaN(parsed) ? -Infinity : parsed;
}

function compareShippingV2ItemListOrder(a: ShippingV2ItemListOrderEntry, b: ShippingV2ItemListOrderEntry) {
  const registeredDiff = shippingV2ListTime(b.fechaRegistro) - shippingV2ListTime(a.fechaRegistro);
  if (registeredDiff !== 0) return registeredDiff;

  const createdDiff = shippingV2ListTime(b.createdTime) - shippingV2ListTime(a.createdTime);
  if (createdDiff !== 0) return createdDiff;

  return a.id.localeCompare(b.id);
}

function toItemNavigationEntry(item: ShippingV2ItemListOrderEntry): ShippingV2ItemNavigationEntry {
  return {
    id: item.id,
    sku: item.sku,
    nombre: item.nombre,
  };
}

async function getShippingV2ItemNavigationEntries(access?: ShippingV2AccessContext) {
  const F = SHIPPING_V2_ITEM_FIELDS;
  const fields = Array.from(new Set([getOfficialSkuField(), F.nombre, F.fechaRegistro, F.proveedorCompra, F.proveedorLogistico]));
  const records = await listRecords(SHIPPING_V2_TABLES.items, {
    maxRecords: 200,
    sortField: F.fechaRegistro,
    sortDirection: "desc",
    fields,
  });

  return records
    .filter((record) => canAccessItemRecord(record, access))
    .map((record): ShippingV2ItemListOrderEntry => {
      const f = record.fields;
      return {
        id: record.id,
        createdTime: record.createdTime,
        sku: firstString(f[getOfficialSkuField()], record.id),
        nombre: firstString(f[F.nombre]),
        fechaRegistro: firstString(f[F.fechaRegistro], record.createdTime),
      };
    })
    .sort(compareShippingV2ItemListOrder)
    .map(toItemNavigationEntry);
}

export async function getShippingV2ItemNavigation(recordId: string, access?: ShippingV2AccessContext): Promise<ShippingV2ItemNavigation> {
  const id = cleanString(recordId);
  const items = await getShippingV2ItemNavigationEntries(access);
  const currentIndex = id ? items.findIndex((item) => item.id === id) : -1;

  if (currentIndex < 0) {
    return {
      previous: null,
      next: null,
      index: null,
      total: items.length,
      items,
    };
  }

  return {
    previous: currentIndex > 0 ? items[currentIndex - 1] : null,
    next: currentIndex < items.length - 1 ? items[currentIndex + 1] : null,
    index: currentIndex + 1,
    total: items.length,
    items,
  };
}

export async function getShippingV2ItemById(recordId: string, options: MapItemOptions = {}) {
  const id = cleanString(recordId);
  if (!id) throw new Error("Record ID de item inválido.");

  const [record, proveedores] = await Promise.all([
    airtableRequest<AirtableRecordResponse>(`${tableUrl(SHIPPING_V2_TABLES.items)}/${encodeURIComponent(id)}`),
    getShippingV2Proveedores(),
  ]);
  const labelsById = createShippingV2ProveedorLabelMap(proveedores);
  const item = applyItemProviderLabels(mapItem(record, options), labelsById);
  if (!canAccessItem(item, options.access)) throw new Error("No tienes acceso a este item.");
  if (process.env.NODE_ENV !== "production" && process.env.SHIPPING_V2_DEBUG_AI_NAME === "true" && options.includeAiName !== false) {
    console.info("[Shipping V2 AI Nombre]", {
      recordId: id,
      rawAiNombre: record.fields[SHIPPING_V2_ITEM_FIELDS.aiNombre],
      mappedAiNombre: item.aiNombre,
    });
  }
  return sanitizeShippingV2ItemForAccess(item, options.access, options);
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

export async function generateUniqueShippingV2SkuForCategory(category?: string) {
  return generateUniqueSkuFromExistingSkus(category, await getExistingShippingV2Skus());
}

/**
 * Elige el SKU con el que nacerá el item, garantizando que no se repita.
 *
 * Cada SKU debe ser único e irrepetible: es el número con el que el artículo
 * se identifica en facturas, packings y órdenes. Dos artículos con el mismo
 * SKU harían imposible saber cuál se vendió.
 *
 * Airtable no puede imponer unicidad por sí solo, así que la garantía es del
 * código y tiene dos partes:
 *
 *   1. El TURNO por prefijo de categoría. Tanto elegir el siguiente número
 *      libre como comprobar que un SKU manual no exista son "leer y luego
 *      escribir": entre las dos cosas cabe otra creación. Serializando por
 *      prefijo, dos SSD nunca se calculan a la vez, mientras que crear un SSD
 *      y una RAM siguen siendo simultáneos.
 *   2. La VERIFICACIÓN posterior (en createShippingV2ItemRecord), porque el
 *      turno no cruza instancias del servidor.
 *
 * Antes esto no tenía protección: dos artículos de la misma categoría creados
 * en el mismo instante podían recibir ambos el mismo número.
 */
async function resolveOfficialSkuForCreate(input: ShippingV2ItemWriteInput) {
  const manualSku = normalizeSku(cleanString(input.sku));
  const prefijo = manualSku ? manualSku.split("-")[0] : getSkuPrefixByCategory(cleanString(input.categoria));

  return withLock(`shipping-sku:${prefijo}`, async () => {
    if (!manualSku) return generateUniqueShippingV2SkuForCategory(cleanString(input.categoria));

    const existing = await findShippingV2ItemBySku(manualSku);
    if (existing) throw new Error(`El SKU ${manualSku} ya existe en Shipping Items (artículo "${existing.nombre}").`);
    return manualSku;
  });
}

/**
 * Tras crear el item, confirma que su SKU siguió siendo único. Si otra
 * instancia creó otro artículo con el mismo SKU en el mismo instante, aquí se
 * detecta: el registro recién creado queda señalado para corregirlo a mano, en
 * vez de convivir en silencio con su gemelo.
 */
async function verificarSkuUnicoTrasCrear(sku: string, recordIdCreado: string): Promise<void> {
  const registros = await listRecords(SHIPPING_V2_TABLES.items, {
    maxRecords: 2,
    fields: [getOfficialSkuField()],
    filterByFormula: `LOWER({${getOfficialSkuField()}}) = LOWER('${escapeFormulaString(sku)}')`,
  });
  const otros = registros.filter((r) => r.id !== recordIdCreado);
  if (otros.length > 0) {
    throw new EscrituraConcurrenteError(
      `el SKU ${sku} quedó duplicado (registros ${recordIdCreado} y ${otros.map((r) => r.id).join(", ")}); corrige uno de los dos a mano`
    );
  }
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
    // Ahora adminOnly (ver item-edit-config.ts): toda corrección manual de
    // cantidad queda en el historial del item, sin excepción.
    SHIPPING_V2_ITEM_FIELDS.cantidad,
  ]);

  return config.category === "special" || criticalFields.has(config.field);
}

async function validateInlineItemFieldChange(input: {
  item: ShippingV2Item;
  recordId: string;
  field: string;
  rawValue: unknown;
  normalizedValue: unknown;
  esAdmin: boolean;
  /** Claves (config.key) que este usuario tiene en "oculto" o "solo-lectura" — ver lib/permissions/campos.ts. Vacío para un administrador. */
  camposNoEditables?: readonly string[];
}) {
  const config = getShippingV2ItemEditField(input.field);
  if (!config || (config.category !== "normal" && config.category !== "special")) {
    throw new Error("Este campo no se puede editar inline.");
  }

  // Campos de corrección: visibles para todos, editables solo por administración.
  if (config.adminOnly && !input.esAdmin) {
    throw new Error(`Solo un administrador puede corregir "${config.label}" a mano.`);
  }

  // Personalización por usuario (Fase 2 de permisos, ver lib/permissions/campos.ts).
  // Nunca aplica a un campo adminOnly: ese ya tiene el candado más fuerte de arriba.
  if (!config.adminOnly && !input.esAdmin && input.camposNoEditables?.includes(config.key)) {
    throw new Error(`No tienes permiso para editar "${config.label}".`);
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

  if (input.field === SHIPPING_V2_TEXTO_FACEBOOK_FIELD) {
    const nextText = cleanString(input.normalizedValue);
    if (input.item.facebookSuperGeek === true) {
      throw new Error("Facebook Super Geek ya fue activado; no se puede editar Texto Facebook desde el sistema.");
    }
    if (nextText) {
      const reason = getShippingV2FacebookTextGenerationBlockReason(input.item);
      if (reason) throw new Error(reason);
    }
  }

  if (input.field === SHIPPING_V2_FACEBOOK_SUPER_GEEK_FIELD) {
    if (input.item.facebookSuperGeek === true && input.normalizedValue !== true) {
      throw new Error("Facebook Super Geek ya fue activado; no se puede desactivar desde el sistema.");
    }
    if (input.normalizedValue === true) {
      const reason = getShippingV2FacebookPublicationBlockReason(input.item);
      if (reason) throw new Error(reason);
    }
  }

  // Pasar un item a "Disponible" es la publicación del artículo: el camino
  // normal es el botón "Listo para vender" de Recepción, que además valida
  // revisión y novedades (marcarShippingV2ItemDisponible). Aquí solo se permite
  // como corrección manual de administración, y queda en el historial del item.
  if (input.field === SHIPPING_V2_ITEM_FIELDS.estadoItem && cleanString(input.normalizedValue) === "Disponible" && !input.esAdmin) {
    throw new Error('Para poner un artículo disponible usa "Listo para vender" en Recepción. La corrección manual es solo para administradores.');
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

  if (
    (input.field === SHIPPING_V2_ITEM_FIELDS.cantidad || input.field === SHIPPING_V2_ITEM_FIELDS.costoProveedor) &&
    await itemHasActiveV2PaymentLink(input.item)
  ) {
    throw new Error(SHIPPING_V2_ACTIVE_PAYMENT_ITEM_LOCK_MESSAGE);
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

export async function updateShippingV2ItemField(recordId: string, input: { field: string; value: unknown; eventDescription?: string }, options: { actualizadoPor: string; esAdmin?: boolean; access?: ShippingV2AccessContext; allowedFields?: readonly string[]; camposNoEditables?: readonly string[] }) {
  assertShippingV2GeneratedSchema();
  const id = cleanString(recordId);
  const field = cleanString(input.field);
  if (!id) throw new Error("Record ID de item inválido.");
  if (!field) throw new Error("Campo inválido.");
  if (options.allowedFields && !options.allowedFields.includes(field)) {
    throw new Error("No tienes permiso para editar este campo.");
  }

  const config = getShippingV2ItemEditField(field);
  if (!config) throw new Error("Campo no reconocido para Shipping Items.");

  const existing = await getShippingV2ItemById(id, { access: options.access, sanitizeForAccess: false });
  const normalizedValue = normalizeShippingV2InlineMoneyQuantityField({
    field,
    value: normalizeInlineValue(config.type, input.value),
    item: existing,
  });
  const esAdmin = options.esAdmin === true;
  await validateInlineItemFieldChange({ item: existing, recordId: id, field, rawValue: input.value, normalizedValue, esAdmin, camposNoEditables: options.camposNoEditables });

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
  const visibleItem = sanitizeShippingV2ItemForAccess(item, options.access);
  if (shouldLogShippingV2ItemFieldEvent(config)) {
    // Las correcciones que solo puede hacer administración se marcan como tales
    // para poder auditarlas después: son excepciones al flujo, no operación normal.
    const esCorreccionAdmin =
      esAdmin &&
      (config.adminOnly === true ||
        (field === SHIPPING_V2_ITEM_FIELDS.estadoItem && cleanString(normalizedValue) === "Disponible"));

    await createShippingV2Event({
      action: "Actualizado",
      itemRecordId: item.id,
      itemName: item.nombre,
      registradoPor: options.actualizadoPor,
      descripcion:
        input.eventDescription ||
        (esCorreccionAdmin
          ? `Corrección manual de administración: "${config.label}".`
          : `Campo crítico "${config.label}" actualizado desde Portal Staff.`),
    });
  }

  invalidateShippingV2ItemSearchIndexCache();
  return visibleItem;
}

async function createShippingV2ItemRecord(
  input: ShippingV2ItemWriteInput,
  options: {
    registradoPor: string;
    eventDescription?: string;
    extraFields?: Record<string, unknown>;
  }
) {
  const sku = await resolveOfficialSkuForCreate(input);
  const fields = getItemFields(input, {
    [getOfficialSkuField()]: sku,
    [SHIPPING_V2_ITEM_FIELDS.metodoAsignacionSku]: undefined,
    ...options.extraFields,
    [SHIPPING_V2_ITEM_FIELDS.fechaRegistro]: new Date().toISOString(),
    [SHIPPING_V2_ITEM_FIELDS.registradoPor]: options.registradoPor,
  });

  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }] }),
  });

  const created = response.records?.[0];
  if (!created) throw new Error("Airtable no devolvió el item creado.");

  // Segunda capa de la unicidad del SKU: el turno de arriba no cruza
  // instancias del servidor, así que se confirma releyendo.
  await verificarSkuUnicoTrasCrear(sku, created.id);

  const item = mapItem(created);
  await createShippingV2Event({
    action: "Creado",
    itemRecordId: item.id,
    itemName: item.nombre,
    registradoPor: options.registradoPor,
    descripcion: options.eventDescription || `Item ${item.sku} creado desde Portal Staff.`,
  });

  invalidateShippingV2ItemSearchIndexCache();
  return item;
}

export async function createShippingV2Item(input: ShippingV2ItemWriteInput, options: { registradoPor: string }) {
  const calculatedInput = applyCalculatedItemFlow(input);
  const normalizedInput = normalizeShippingV2ItemMoneyQuantityInput(calculatedInput, { mode: "create" });
  validateItemInput(normalizedInput);
  await validateItemProviderRules(normalizedInput);

  return createShippingV2ItemRecord(normalizedInput, options);
}

export async function createShippingV2ItemFromOperacion(
  input: {
    operacionId: string;
    opcionId: string;
    nombre: string;
    descripcion?: string;
    proveedorId?: string | null;
    costoProveedor?: number | null;
    precioVenta?: number | null;
    fotos?: ShippingV2Attachment[];
    /** Categoría de la Operación Comercial de origen. Ambas tablas usan la
     *  misma lista de opciones (Laptop, RAM, SSD, Batería, Pantalla…), así que
     *  se copia tal cual. */
    categoria?: string | null;
  },
  options: { registradoPor: string }
) {
  const operacionId = cleanString(input.operacionId);
  const opcionId = cleanString(input.opcionId);
  if (!operacionId) throw new Error("Operación Comercial inválida para crear Shipping Item.");
  if (!opcionId) throw new Error("Opción origen inválida para crear Shipping Item.");

  const proveedorId = cleanString(input.proveedorId);
  if (proveedorId) await validateItemProviderRules({ proveedorId });

  const nombre = cleanString(input.nombre) || "Artículo sin nombre";
  const precioVenta = input.precioVenta ?? null;

  // La categoría sale de la Operación Comercial. Antes se forzaba "Repuesto" a
  // TODO lo que naciera por aquí, y como el buscador de repuestos de stock
  // filtra únicamente por Categoría, la lista del técnico se llenó de cosas que
  // no son repuestos: una impresora Epson, un disco externo Seagate, unos
  // audífonos Plantronics, una motherboard de iMac. Ambas tablas comparten la
  // misma lista de opciones, así que basta con copiarla; si la operación no
  // trae categoría se cae a "Otro", que es honesto — no a "Repuesto", que
  // afirma algo falso.
  const categoria = knownOptionOrUndefined(
    SHIPPING_V2_ITEM_SELECT_OPTIONS.categoria,
    cleanString(input.categoria)
  ) ?? "Otro";

  const itemInput: ShippingV2ItemWriteInput = {
    nombre,
    descripcion: cleanString(input.descripcion) || nombre,
    tipoOperacion: "Compra ya pagada",
    // "Rol general" describe qué es la pieza dentro de un equipo, no cómo se
    // vende. Un pedido especial para un cliente es un artículo por derecho
    // propio, no una parte: "Equipo completo" es lo correcto salvo que la
    // categoría diga que es un repuesto.
    tipoItem: categoria === "Repuesto" ? "Repuesto" : "Equipo completo",
    categoria,
    estado: "Pagado",
    proveedorId,
    requierePago: false,
    requierePacking: false,
    afectaInventario: true,
    disponibleVenta: false,
    reservado: true,
    modoLogistico: "Tracking directo",
    cantidad: 1,
    unidad: "Unidad",
    costoProveedor: input.costoProveedor ?? null,
    precioVentaSugerido: precioVenta,
    precioVenta,
    // "Es repuesto" era la quinta casilla que decía lo mismo que Categoría y
    // nunca coincidía con las otras cuatro. Se deja de escribir: manda Categoría.
    operacionComercialId: operacionId,
    opcionOrigenId: opcionId,
    fotos: input.fotos,
  };

  const normalizedItemInput = normalizeShippingV2ItemMoneyQuantityInput(itemInput, { mode: "create" });

  return createShippingV2ItemRecord(normalizedItemInput, {
    registradoPor: options.registradoPor,
    eventDescription: `Item creado desde Operaciones Comerciales para opción ${opcionId}.`,
    extraFields: {
      [SHIPPING_V2_ITEM_FIELDS.metodoAsignacionSku]: "Generado automáticamente",
    },
  });
}

export async function addFotosToShippingV2Item(
  recordId: string,
  fotos: ShippingV2AttachmentUpload[],
  options: { registradoPor?: string } = {}
) {
  const id = cleanString(recordId);
  if (!id) throw new Error("Record ID de item inválido.");
  if (!fotos.length) return { item: await getShippingV2ItemById(id, { access: systemShippingV2Access() }), warning: null as string | null, uploadedCount: 0 };

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

  const item = await getShippingV2ItemById(id, { access: systemShippingV2Access() });
  await createShippingV2Event({
    action: "Actualizado",
    itemRecordId: item.id,
    itemName: item.nombre,
    registradoPor: options.registradoPor || "Portal Staff",
    descripcion: fotos.length - failedFiles.length === 1 ? "Foto agregada al Item." : "Fotos agregadas al Item.",
  });

  invalidateShippingV2ItemSearchIndexCache();
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

  const current = await getShippingV2ItemById(id, { access: systemShippingV2Access() });
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

  invalidateShippingV2ItemSearchIndexCache();
  return item;
}

export async function updateShippingV2Item(recordId: string, input: ShippingV2ItemWriteInput, options: { actualizadoPor: string; esAdmin?: boolean; camposNoEditables?: readonly string[] }) {
  const id = cleanString(recordId);
  if (!id) throw new Error("Record ID de item inválido.");
  // "edicion": recalcula las banderas de flujo pero NO retrocede el estado.
  const calculatedInput = applyCalculatedItemFlow(input, "edicion");
  const normalizedInput = normalizeShippingV2ItemMoneyQuantityInput(calculatedInput, { mode: "update" });
  validateItemInput(normalizedInput);
  await validateItemProviderRules(normalizedInput);

  const existing = await getShippingV2ItemById(id, { access: systemShippingV2Access() });

  // Mismo candado que el editor de campo individual (ver adminOnly en
  // item-edit-config.ts): este es el otro camino de escritura del mismo
  // campo — el formulario completo de edición, no la celda inline — y sin
  // este chequeo cualquiera con permiso de editar items podía cambiar la
  // cantidad por aquí sin pasar por la validación de rol.
  if (nullableNumberChanged(normalizedInput.cantidad, existing.cantidad) && options.esAdmin !== true) {
    throw new Error('Solo un administrador puede corregir "Cantidad" a mano.');
  }

  // Personalización por usuario (Fase 2 de permisos, ver
  // lib/permissions/campos.ts) — mismo criterio que en el editor de campo
  // individual, pero comparando cada campo restringido contra su valor
  // anterior porque acá llegan todos juntos en un solo objeto.
  if (options.esAdmin !== true) {
    for (const key of options.camposNoEditables ?? []) {
      if (
        key in normalizedInput &&
        valorCampoCambio((normalizedInput as Record<string, unknown>)[key], (existing as Record<string, unknown>)[key])
      ) {
        const label = getShippingV2ItemEditFieldByKey(key)?.label ?? key;
        throw new Error(`No tienes permiso para editar "${label}".`);
      }
    }
  }

  if (
    (nullableNumberChanged(normalizedInput.cantidad, existing.cantidad) ||
      nullableNumberChanged(normalizedInput.costoProveedor, existing.costoProveedor)) &&
    await itemHasActiveV2PaymentLink(existing)
  ) {
    throw new Error(SHIPPING_V2_ACTIVE_PAYMENT_ITEM_LOCK_MESSAGE);
  }
  const nextSku = normalizeSku(cleanString(normalizedInput.sku));
  if (existing.packingId && cleanString(normalizedInput.modoLogistico) !== cleanString(existing.modoLogistico)) {
    throw new Error("No se puede cambiar el modo logístico porque el Item ya tiene packing relacionado.");
  }

  if (nextSku && nextSku !== existing.sku) {
    const duplicated = await findShippingV2ItemBySku(nextSku);
    if (duplicated && duplicated.id !== id) {
      throw new Error("Este SKU ya existe en Shipping Items.");
    }
  }

  const fields = getItemFields(normalizedInput, {
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

  invalidateShippingV2ItemSearchIndexCache();
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

  const existing = await getShippingV2ItemById(id, { includeAiName: false, access: systemShippingV2Access() });
  if (existing.recibido !== true) throw new Error("Marca primero Recibido antes de preparar la ficha técnica.");

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
        integratedGpu: cleanString(input.gpuIntegrada),
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
    [F.gpuIntegrada]: optionalTextField(input.gpuIntegrada),
    [F.bateriaSalud]: batteryHealth,
    [F.bateriaEstado]: batteryState || null,
    [F.conectividadV2]: connectivityV2Ids,
    [F.puertosV2]: portV2Ids,
    [F.caracteristicasExtrasV2]: extraFeatureV2Ids,
    [F.observacionFichaTecnica]: optionalTextField(input.observacionFichaTecnica),
    [F.ultimaActualizacion]: now,
    [F.actualizadoPor]: options.actualizadoPor,
  };

  // La ficha se considera generada apenas tiene los campos mínimos (marca + modelo),
  // sin depender de que el cliente haya usado "Completar desde catálogos": ese flag
  // se perdía en guardados manuales y la ficha nunca quedaba marcada como generada.
  const meetsMinimumFicha = Boolean(brandFicha && modelFicha);
  const shouldMarkGenerated = meetsMinimumFicha || input.reviewed === true || input.generated === true;

  if (shouldMarkGenerated && existing.technicalSheet.fichaTecnicaGenerada !== true) {
    fields[F.fichaTecnicaGenerada] = true;
    fields[F.fichaTecnicaGeneradaPor] = options.actualizadoPor;
    fields[F.fechaFichaTecnicaGenerada] = now;
  }

  if (input.reviewed) {
    fields[F.fichaTecnicaGenerada] = true;
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

export async function getShippingV2Pagos(access?: ShippingV2AccessContext) {
  assertShippingV2Permission(access, "canViewPayments", "No tienes permiso para ver pagos de Shipping.");
  const [records, proveedores, items] = await Promise.all([
    listRecords(SHIPPING_V2_TABLES.pagos, { maxRecords: 200, sortField: SHIPPING_V2_PAYMENT_FIELDS.fechaCreacion, sortDirection: "desc" }),
    getShippingV2Proveedores(),
    getShippingV2Items({ includeAiName: false, access, sanitizeForAccess: false }),
  ]);
  const labelsById = createShippingV2ProveedorLabelMap(proveedores);
  const itemsById = new Map(items.map((item) => [item.id, item]));
  return records
    .map((record) => mapPago(record, { labelsById, itemsById }))
    .filter((pago) => canAccessPago(pago, access));
}

export async function getShippingV2PagoById(recordId: string, access?: ShippingV2AccessContext) {
  assertShippingV2Permission(access, "canViewPayments", "No tienes permiso para ver pagos de Shipping.");
  const id = cleanString(recordId);
  if (!id) throw new Error("Record ID de pago inválido.");
  const [record, proveedores, items] = await Promise.all([
    airtableRequest<AirtableRecordResponse>(`${tableUrl(SHIPPING_V2_TABLES.pagos)}/${encodeURIComponent(id)}`),
    getShippingV2Proveedores(),
    getShippingV2Items({ includeAiName: false, access, sanitizeForAccess: false }),
  ]);
  const pago = mapPago(record, {
    labelsById: createShippingV2ProveedorLabelMap(proveedores),
    itemsById: new Map(items.map((item) => [item.id, item])),
  });
  if (!canAccessPago(pago, access)) throw new Error("No tienes acceso a este pago.");
  return pago;
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

function paymentLinkedIdsForItem(item: Pick<ShippingV2Item, "pagoV2ItemIds" | "pagoV2RegaloIds">) {
  return [...item.pagoV2ItemIds, ...item.pagoV2RegaloIds].map(cleanString).filter(Boolean);
}

function isPaidItemCandidate(item: Pick<ShippingV2Item, "estado" | "tipoOperacion">) {
  return normalizeStatus(item.estado) === "pagado" || normalizeStatus(item.tipoOperacion) === "compra ya pagada";
}

function providerRequiredForPayment(item: Pick<ShippingV2Item, "tipoOperacion" | "requierePago">) {
  if (!item.requierePago) return false;
  return ["compra a proveedor", "compra ya pagada"].includes(normalizeStatus(item.tipoOperacion));
}

function itemIsLinkedToActivePayment(item: Pick<ShippingV2Item, "pagoV2ItemIds" | "pagoV2RegaloIds">, pagosById: Map<string, ShippingV2Pago>) {
  const paymentIds = paymentLinkedIdsForItem(item);
  return paymentIds.some((id) => {
    const pago = pagosById.get(id);
    return pago ? isActivePaymentStatus(String(pago.estadoPago)) : true;
  });
}

async function itemHasActiveV2PaymentLink(item: Pick<ShippingV2Item, "pagoV2ItemIds" | "pagoV2RegaloIds">) {
  const paymentIds = paymentLinkedIdsForItem(item);
  if (!paymentIds.length) return false;
  const pagos = await getShippingV2Pagos(systemShippingV2Access());
  const pagosById = new Map(pagos.map((pago) => [pago.id, pago]));
  return itemIsLinkedToActivePayment(item, pagosById);
}

function paymentSubtotalOrZero(item: ShippingV2PaymentItemLike) {
  try {
    return calculateShippingV2PaymentItemSubtotal(item);
  } catch {
    return 0;
  }
}

function nullableNumberChanged(next: number | null | undefined, current: number | null | undefined) {
  return (next ?? null) !== (current ?? null);
}

/**
 * Comparación genérica para el candado de "Campos Restringidos" (Fase 2 de
 * permisos, ver lib/permissions/campos.ts) sobre el formulario completo de
 * edición del item, donde los campos vienen mezclados en un solo objeto de
 * tipos distintos. Trata "" y null/undefined como el mismo "vacío" para no
 * marcar cambio cuando solo cambió la representación del dato.
 */
function valorCampoCambio(next: unknown, current: unknown): boolean {
  if (Array.isArray(next) || Array.isArray(current)) {
    return JSON.stringify(next ?? []) !== JSON.stringify(current ?? []);
  }
  const a = next === "" || next === undefined ? null : next;
  const b = current === "" || current === undefined ? null : current;
  return a !== b;
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

export function computePagosSummary(porPagar: ShippingV2PagoPendingItem[], pagosPendientes: ShippingV2Pago[], pagadosSinSoporte: ShippingV2PagoSupportCard[], pagosCompletos: ShippingV2Pago[]): ShippingV2PagosSummary {
  return {
    totalPorPagar: round2(porPagar.reduce((sum, item) => sum + paymentSubtotalOrZero(item), 0) + pagosPendientes.reduce((sum, pago) => sum + (pago.saldoPendiente ?? pago.totalAPagar ?? 0), 0)),
    totalPagadoSinSoporte: round2(pagadosSinSoporte.reduce((sum, card) => sum + (card.total ?? 0), 0)),
    totalPagadoCompleto: round2(pagosCompletos.reduce((sum, pago) => sum + (pago.totalPagado ?? pago.totalAPagar ?? 0), 0)),
    incompletos: pagadosSinSoporte.length,
    porPagarCount: porPagar.length + pagosPendientes.length,
    itemsSinPagoCount: porPagar.length,
    pagosPendientesCount: pagosPendientes.length,
    pagadosSinSoporteCount: pagadosSinSoporte.length,
    pagosCompletosCount: pagosCompletos.length,
  };
}

export async function getShippingV2PendingPaymentItems(context?: { pagos?: ShippingV2Pago[]; items?: ShippingV2Item[]; access?: ShippingV2AccessContext }) {
  const [pagos, items] = await Promise.all([
    context?.pagos ? Promise.resolve(context.pagos) : getShippingV2Pagos(context?.access),
    context?.items ? Promise.resolve(context.items) : getShippingV2Items({ includeAiName: false, access: context?.access }),
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
        total: paymentSubtotalOrZero(item),
        missing,
      };
    });
}

export async function getShippingV2PagosWorkspace(access?: ShippingV2AccessContext): Promise<ShippingV2PagosWorkspace> {
  assertShippingV2Permission(access, "canViewPayments", "No tienes permiso para ver pagos de Shipping.");
  const [pagos, proveedores, items] = await Promise.all([
    getShippingV2Pagos(access),
    getShippingV2Proveedores(),
    getShippingV2Items({ includeAiName: false, access }),
  ]);
  const pagosById = new Map(pagos.map((pago) => [pago.id, pago]));
  const canManagePayments = canShippingV2(access, "canManagePayments");
  const itemsPendientes = canManagePayments ? await getShippingV2PendingPaymentItems({ pagos, items, access }) : [];
  const pagosPendientes = pagos.filter(isPendingPayment);
  const pagosPagados = pagos.filter((pago) => normalizeStatus(String(pago.estadoPago)) === "pagado");
  const pagosCompletos = pagosPagados.filter(isCompletePaidPayment);
  const pagosIncompletos: Extract<ShippingV2PagoSupportCard, { kind: "pago" }>[] = canManagePayments ? pagosPagados
    .filter((pago) => !isCompletePaidPayment(pago))
    .map((pago): Extract<ShippingV2PagoSupportCard, { kind: "pago" }> => ({
      kind: "pago",
      id: pago.id,
      pago,
      proveedorId: pago.proveedorId,
      proveedorNombre: pago.proveedorNombre,
      total: pago.totalPagado ?? pago.totalAPagar,
      missing: getPaymentSupportMissing(pago),
    })) : [];
  const itemsPagadosSinPago = canManagePayments
    ? getPaidItemsWithoutSupport(items, pagosById).filter((card): card is Extract<ShippingV2PagoSupportCard, { kind: "item" }> => card.kind === "item")
    : [];
  const pagadosSinSoporte = [...itemsPagadosSinPago, ...pagosIncompletos];
  return {
    pagos,
    proveedores: access?.providerId ? proveedores.filter((provider) => provider.id === access.providerId) : proveedores,
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

function attachmentFromUrl(urlValue?: string) {
  const url = cleanString(urlValue);
  return url ? [{ url }] : undefined;
}

function assertNoDuplicatedPaymentItemIds(itemIds: string[], regalosIds: string[]) {
  const seen = new Set<string>();
  const allIds = [...itemIds, ...regalosIds].map(cleanString).filter(Boolean);
  for (const id of allIds) {
    if (seen.has(id)) throw new Error("No se puede crear un pago con Items duplicados.");
    seen.add(id);
  }
}

async function assertItemsCanJoinPayment(itemIds: string[], regalosIds: string[]) {
  assertNoDuplicatedPaymentItemIds(itemIds, regalosIds);
  const uniqueItemIds = Array.from(new Set(itemIds.map(cleanString).filter(Boolean)));
  const uniqueGiftIds = Array.from(new Set(regalosIds.map(cleanString).filter(Boolean)));
  const items = await Promise.all(uniqueItemIds.map((id) => getShippingV2ItemById(id, { includeAiName: false, access: systemShippingV2Access() })));
  const gifts = await Promise.all(uniqueGiftIds.map((id) => getShippingV2ItemById(id, { includeAiName: false, access: systemShippingV2Access() })));
  const activePayments = (await getShippingV2Pagos(systemShippingV2Access())).filter((pago) => isActivePaymentStatus(String(pago.estadoPago)));

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

export async function createShippingV2Pago(input: ShippingV2PagoWriteInput, options: { registradoPor: string; access?: ShippingV2AccessContext }) {
  assertShippingV2Permission(options.access, "canManagePayments", "No tienes permiso para crear pagos de Shipping.");
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

  const totalAPagar = calculateShippingV2PaymentItemsTotal(items);
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
  const pago = await getShippingV2PagoById(created.id, options.access);
  if (estadoPago === "Pagado") {
    return markShippingV2PagoAsPaid(pago.id, input, options);
  }
  return pago;
}

// Fase 20.1 — mapeo del valor legacy de "Cuenta origen" (texto libre de
// Shipping Pagos) a la cuenta real de Cuentas Financieras. "Tarjeta"/"Otra"
// no tienen mapeo conocido a propósito: se deja sin resolver y se loguea una
// advertencia en vez de bloquear el pago (ver docs/DISENO_FASE20_1_FUNDACION.md §4).
const CUENTA_ORIGEN_LEGACY_A_CUENTA_FINANCIERA: Record<string, string> = {
  caja: "Caja Registradora",
  paypal: "PayPal",
  "banco pichincha": "SGINGRESOS", // confirmado §1.5 — se revisará en 20.6
};

/**
 * Fase 20.5 §4.3 (Corrección 1) — los 3 nombres mapeados arriba se resuelven
 * por igualdad exacta (ya probado desde 20.1, sin riesgo de typo porque el
 * texto lo escribimos nosotros en el diccionario). Cualquier otro texto
 * (las tarjetas de crédito, cuyo nombre en Cuentas Financieras lo escribe el
 * dueño a mano en Airtable, potencialmente con un espacio de más o distinta
 * capitalización respecto al select legacy de Shipping Pagos) se resuelve
 * por comparación normalizada vía fetchCuentaPorNombreNormalizado — nunca
 * bloquea un pago a proveedor ya hecho: sin coincidencia, se loguea una
 * advertencia y el movimiento se crea sin Cuenta Origen (permitirCuentaFaltante).
 */
async function resolveCuentaFinancieraLegacy(cuentaOrigenTexto: string): Promise<string | null> {
  const clave = normalizeStatus(cuentaOrigenTexto);
  const nombreMapeado = CUENTA_ORIGEN_LEGACY_A_CUENTA_FINANCIERA[clave];
  const cuenta = nombreMapeado ? await fetchCuentaPorNombre(nombreMapeado) : await fetchCuentaPorNombreNormalizado(cuentaOrigenTexto);
  if (!cuenta) {
    console.warn(`[Finanzas] Cuenta origen legacy "${cuentaOrigenTexto}" sin Cuenta Financiera resoluble — el movimiento se crea sin Cuenta Origen.`);
    return null;
  }
  return cuenta.id;
}

async function createFinanceMovementForPago(pago: ShippingV2Pago, input: ShippingV2PagoMarkPaidInput, registradoPor: string) {
  if (pago.movimientoFinanzasIds.length) return pago.movimientoFinanzasIds[0];
  const supportInput = normalizeAndValidatePaymentSupportInput(input);
  const cuentaOrigenId = await resolveCuentaFinancieraLegacy(supportInput.cuentaOrigen);
  const movimiento = await crearMovimiento(
    {
      tipo: "Egreso",
      origen: "Shipping",
      categoria: "Compra Proveedor Shipping",
      monto: pago.totalAPagar ?? 0,
      cuentaOrigenId,
      estado: "Confirmado",
      estadoDistribucion: "No aplica",
      metodo: supportInput.metodoPago,
      fecha: cleanString(supportInput.fechaPagoReal) || new Date().toISOString(),
      transaccionId: cleanString(input.transaccionId),
      comprobanteUrl: cleanString(input.comprobanteUrl),
      observacion: cleanString(input.observacion),
      registradoPor,
      proveedorId: pago.proveedorId,
      pagoShippingId: pago.id,
    },
    // Único llamador autorizado a crear un Egreso sin Cuenta Origen resuelta
    // — ver comentario de CrearMovimientoOptions.permitirCuentaFaltante.
    { permitirCuentaFaltante: true }
  );
  return movimiento.id;
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

  const items = await Promise.all(uniqueItemIds.map((id) => getShippingV2ItemById(id, { includeAiName: false, access: systemShippingV2Access() })));
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

export async function markShippingV2PagoAsPaid(recordId: string, input: ShippingV2PagoMarkPaidInput, options: { registradoPor: string; access?: ShippingV2AccessContext }) {
  assertShippingV2Permission(options.access, "canManagePayments", "No tienes permiso para marcar pagos de Shipping.");
  const pago = await getShippingV2PagoById(recordId, options.access);
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
  return getShippingV2PagoById(pago.id, options.access);
}

export async function setShippingV2PagoInReview(recordId: string, options: { registradoPor: string; access?: ShippingV2AccessContext }) {
  assertShippingV2Permission(options.access, "canManagePayments", "No tienes permiso para cambiar pagos de Shipping.");
  const pago = await getShippingV2PagoById(recordId, options.access);
  if (["pagado", "anulado"].includes(normalizeStatus(String(pago.estadoPago)))) throw new Error("Este pago no permite enviarse a revisión.");
  await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.pagos), {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id: pago.id, fields: { [SHIPPING_V2_PAYMENT_FIELDS.estadoPago]: "En revisión" } }] }),
  });
  return getShippingV2PagoById(pago.id, options.access);
}

export async function cancelShippingV2Pago(recordId: string, input: { motivo?: string }, options: { registradoPor: string; access?: ShippingV2AccessContext }) {
  assertShippingV2Permission(options.access, "canManagePayments", "No tienes permiso para anular pagos de Shipping.");
  const pago = await getShippingV2PagoById(recordId, options.access);
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
  return getShippingV2PagoById(pago.id, options.access);
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

  const proveedoresPromise = options.proveedores ? Promise.resolve(options.proveedores) : getShippingV2Proveedores();
  const [record, proveedores] = await Promise.all([
    airtableRequest<AirtableRecordResponse>(`${tableUrl(SHIPPING_V2_TABLES.packings)}/${encodeURIComponent(id)}`),
    proveedoresPromise,
  ]);
  const labelsById = createShippingV2ProveedorLabelMap(proveedores);
  const packing = applyPackingProviderLabels(mapPacking(record), labelsById);
  if (!canAccessPacking(packing, access)) throw new Error("No tienes acceso a este packing.");
  if (!includeItems) return packing;
  const itemRecords = await listRecordsByIds(SHIPPING_V2_TABLES.items, packing.itemIds);
  const itemRecordsById = new Map(itemRecords.map((itemRecord) => [itemRecord.id, itemRecord]));
  packing.items = packing.itemIds
    .map((itemId) => itemRecordsById.get(itemId))
    .filter((record): record is AirtableRecord => Boolean(record))
    .map((record) => mapItem(record, { includeAiName: options.includeAiName !== false }))
    .map((item) => applyItemProviderLabels(item, labelsById))
    .filter((item) => canAccessItem(item, access))
    .map((item) => sanitizeShippingV2ItemForAccess(item, access));
  return withShippingV2PackingProviderCostSummary(packing);
}

export async function getShippingV2PackingInvoiceData(recordId: string, access?: ShippingV2AccessContext): Promise<ShippingV2PackingInvoiceData> {
  assertShippingV2Permission(access, "canViewInvoice", "No tienes permiso para ver la factura de este packing.");
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
  assertShippingV2Permission(options.access, "canLinkDestinatario", "No tienes permiso para cambiar el destinatario del packing.");
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
  access?: ShippingV2AccessContext;
}) {
  assertShippingV2Permission(input.access, "canGenerateInvoice", "No tienes permiso para generar facturas de packing.");
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
  const updated = await getShippingV2PackingById(input.packingId, input.access, { includeAiName: false });
  const attachment = updated.factura[0];
  return {
    packing: updated,
    attachment,
  };
}

export async function createShippingV2Packing(input: ShippingV2PackingWriteInput, options: { creadoPor: string; access?: ShippingV2AccessContext }) {
  assertShippingV2Permission(options.access, "canCreatePacking", "No tienes permiso para crear packings.");
  assertShippingV2GeneratedSchema();
  validateOptionalWeight(input.peso);
  assertReglaDistribucionSoportada(input.reglaDistribucionCostos);
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

function isPackingWeightOnlyInput(input: ShippingV2PackingWriteInput) {
  const keys = Object.keys(input).filter((key) => Object.prototype.hasOwnProperty.call(input, key));
  return keys.length === 1 && keys[0] === "peso";
}

export async function updateShippingV2Packing(recordId: string, input: ShippingV2PackingWriteInput, options: { actualizadoPor: string; access?: ShippingV2AccessContext }) {
  const canEditPacking = canShippingV2(options.access, "canEditPacking");
  const canEditWeightOnly = isPackingWeightOnlyInput(input) && canShippingV2(options.access, "canEditPackingWeight");
  if (!canEditPacking && !canEditWeightOnly) {
    throw new Error("No tienes permiso para editar packings.");
  }
  const id = cleanString(recordId);
  if (!id) throw new Error("Record ID de packing inválido.");
  const existing = await getShippingV2PackingById(id, options.access, { includeItems: false, includeAiName: false });
  assertPackingPatchAllowed(existing.estado, input);
  validateOptionalWeight(input.peso);
  assertReglaDistribucionSoportada(input.reglaDistribucionCostos);
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

export async function getShippingV2PackingCandidateItems(packingId: string, access?: ShippingV2AccessContext, options: PackingCandidateItemsOptions = {}) {
  const packing = options.packing ?? await getShippingV2PackingById(packingId, access, {
    includeItems: false,
    includeAiName: false,
    proveedores: options.proveedores,
  });
  const scopedItems = await getShippingV2Items({ includeAiName: false, access, proveedores: options.proveedores });
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
  assertShippingV2Permission(options.access, "canAddItemsToPacking", "No tienes permiso para agregar items al packing.");
  const id = cleanString(packingId);
  const uniqueItemIds = Array.from(new Set(itemIds.map(cleanString).filter(Boolean)));
  if (!id) throw new Error("Record ID de packing inválido.");
  if (!uniqueItemIds.length) throw new Error("Selecciona al menos un item.");

  const packing = await getShippingV2PackingById(id, options.access, { includeItems: false, includeAiName: false });
  if (!isOpenPackingStatus(packing.estado)) throw new Error("Este packing ya no permite modificar items desde vista normal.");

  const items = await Promise.all(uniqueItemIds.map((itemId) => getShippingV2ItemById(itemId, { includeAiName: false, access: options.access })));
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

  await patchAirtableRecords(SHIPPING_V2_TABLES.items, items.map((item) => ({
    id: item.id,
    fields: {
      [SHIPPING_V2_ITEM_FIELDS.estadoItem]: "En packing",
      [SHIPPING_V2_ITEM_FIELDS.requierePacking]: true,
      [SHIPPING_V2_ITEM_FIELDS.modoLogistico]: "Asignar a packing existente",
      [SHIPPING_V2_ITEM_FIELDS.ultimaActualizacion]: new Date().toISOString(),
      [SHIPPING_V2_ITEM_FIELDS.actualizadoPor]: options.registradoPor,
    },
  })));

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
  assertShippingV2Permission(options.access, "canRemoveItemsFromPacking", "No tienes permiso para quitar items del packing.");
  const id = cleanString(packingId);
  const itemRecordId = cleanString(itemId);
  if (!id || !itemRecordId) throw new Error("Packing o item inválido.");
  const packing = await getShippingV2PackingById(id, options.access, { includeItems: false, includeAiName: false });
  if (!isOpenPackingStatus(packing.estado)) throw new Error("Este packing ya no permite modificar items desde vista normal.");
  if (!packing.itemIds.includes(itemRecordId)) throw new Error("El item no pertenece a este packing.");
  const item = await getShippingV2ItemById(itemRecordId, { includeAiName: false, access: options.access });
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
  assertShippingV2Permission(options.access, "canClosePacking", "No tienes permiso para cerrar packings.");
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

const RECEIVED_REQUIRED_MESSAGE = "Marca primero Recibido para continuar con la revisión de este item.";

type ReceptionChecklistFieldConfig = {
  checked: string;
  by?: string;
  date?: string;
  label: string;
};

const RECEPTION_CHECKLIST_FIELDS: Record<ShippingV2RecepcionChecklistAction, ReceptionChecklistFieldConfig> = {
  received: { checked: SHIPPING_V2_ITEM_FIELDS.recibido, label: "Recibido" },
  reviewed: { checked: "Revisado física/técnicamente", by: "Revisado por", date: "Fecha revisión", label: "Revisado física/técnicamente" },
  "photos-taken": { checked: "Fotos tomadas", by: "Fotos tomadas por", date: "Fecha fotos", label: "Fotos tomadas" },
  "published-shopify": { checked: "Shopify publicado", by: "Shopify publicado por", date: "Fecha Shopify publicado", label: "Shopify publicado" },
  "published-marketplace": { checked: "Marketplace publicado", by: "Marketplace publicado por", date: "Fecha Marketplace publicado", label: "Marketplace publicado" },
  "published-mercado-libre": { checked: "Mercado Libre publicado", by: "Mercado Libre publicado por", date: "Fecha Mercado Libre publicado", label: "Mercado Libre publicado" },
  "published-facebook": { checked: "Grupos Facebook publicado", by: "Facebook publicado por", date: "Fecha Facebook publicado", label: "Grupos Facebook publicado" },
  "facebook-super-geek": { checked: SHIPPING_V2_FACEBOOK_SUPER_GEEK_FIELD, label: "Facebook Super Geek" },
};

export async function updateShippingV2ReceptionChecklistItem(
  recordId: string,
  input: { action: ShippingV2RecepcionChecklistAction; value: boolean; note?: string },
  options: { actualizadoPor: string }
) {
  const id = cleanString(recordId);
  if (!id) throw new Error("Record ID de item inválido.");
  const item = await getShippingV2ItemById(id, { includeAiName: false, access: systemShippingV2Access() });
  const now = new Date().toISOString();
  const note = cleanString(input.note);
  const fields: Record<string, unknown> = {
    [SHIPPING_V2_ITEM_FIELDS.ultimaActualizacion]: now,
    [SHIPPING_V2_ITEM_FIELDS.actualizadoPor]: options.actualizadoPor,
  };
  const checklistFields = RECEPTION_CHECKLIST_FIELDS[input.action];
  if (!checklistFields) throw new Error("Acción de recepción no soportada.");
  if (input.action !== "received" && item.recibido !== true) throw new Error(RECEIVED_REQUIRED_MESSAGE);
  if (input.action === "facebook-super-geek") {
    if (item.facebookSuperGeek === true && input.value !== true) {
      throw new Error("Facebook Super Geek ya fue activado; no se puede desactivar desde el sistema.");
    }
    if (input.value) {
      const reason = getShippingV2FacebookPublicationBlockReason(item);
      if (reason) throw new Error(reason);
    }
  }
  fields[checklistFields.checked] = input.value;
  if (input.value && checklistFields.by && checklistFields.date) {
    fields[checklistFields.by] = options.actualizadoPor;
    fields[checklistFields.date] = now;
  }
  if (note) fields["Observación recepción"] = `${item.observacionRecepcion ? `${item.observacionRecepcion}\n` : ""}[${now}] ${options.actualizadoPor}: ${note}`;

  if (input.action === "received") {
    if (input.value) {
      const currentReviewStatus = normalizeStatus(item.estadoRevision || "");
      if (!currentReviewStatus || currentReviewStatus === "pendiente de recepcion" || currentReviewStatus === "pendiente de recepción" || currentReviewStatus === "no aplica") {
        fields[SHIPPING_V2_ITEM_FIELDS.estadoRevision] = "Recibido pendiente de revisión";
      }
      if (normalizeStatus(item.estado) === "en transito" || normalizeStatus(item.estado) === "en tránsito") {
        fields[SHIPPING_V2_ITEM_FIELDS.estadoItem] = "Recibido";
      }
    } else {
      fields[SHIPPING_V2_ITEM_FIELDS.estadoRevision] = "Pendiente de recepción";
      fields[SHIPPING_V2_ITEM_FIELDS.disponibleVenta] = false;
      if (["recibido", "en revision", "en revisión", "disponible"].includes(normalizeStatus(item.estado))) {
        fields[SHIPPING_V2_ITEM_FIELDS.estadoItem] = "Recibido";
      }
      for (const [action, config] of Object.entries(RECEPTION_CHECKLIST_FIELDS) as Array<[ShippingV2RecepcionChecklistAction, ReceptionChecklistFieldConfig]>) {
        if (action !== "received" && action !== "facebook-super-geek") fields[config.checked] = false;
      }
    }
  } else if (input.action === "reviewed") {
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

  const item = await getShippingV2ItemById(id, { includeAiName: false, access: systemShippingV2Access() });
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
  await patchAirtableRecords(SHIPPING_V2_TABLES.items, packing.itemIds.map((itemId) => ({
    id: itemId,
    fields,
  })));
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

  assertShippingV2Permission(input.access, "canTransitionPackingStatus", "No tienes permiso para cambiar este estado del packing.");

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
      [SHIPPING_V2_ITEM_FIELDS.estadoRevision]: "Pendiente de recepción",
      [SHIPPING_V2_ITEM_FIELDS.recibido]: false,
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
      descripcion: "Packing marcado como recibido desde Portal Staff. Los items quedan pendientes de confirmación de recepción.",
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
  assertShippingV2Permission(options.access, "canCreateNovedades", "No tienes permiso para registrar novedades.");
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

export async function getShippingV2Novedades(access?: ShippingV2AccessContext) {
  const records = await listRecords(SHIPPING_V2_TABLES.novedades, { maxRecords: 200 });
  const novedades = records.map(mapNovedad);
  if (!access || access.isAdmin) return novedades;
  if (!access.providerId) return [];
  const [items, packings] = await Promise.all([
    getShippingV2Items({ includeAiName: false, access }),
    getShippingV2Packings(access),
  ]);
  return novedades.filter((novedad) => canAccessNovedad(novedad, access, {
    itemIds: new Set(items.map((item) => item.id)),
    packingIds: new Set(packings.map((packing) => packing.id)),
  }));
}

export async function getShippingV2NovedadesForItem(itemRecordId: string, access?: ShippingV2AccessContext) {
  const itemId = cleanString(itemRecordId);
  if (!itemId) return [];
  await getShippingV2ItemById(itemId, { includeAiName: false, access });

  const records = await listRecords(SHIPPING_V2_TABLES.novedades, { maxRecords: 500 });
  return records
    .map(mapNovedad)
    .filter((novedad) => novedad.itemIds.includes(itemId))
    .filter((novedad) => canAccessNovedad(novedad, access, { itemIds: new Set([itemId]) }))
    .sort((a, b) => {
      const bTime = Date.parse(b.fechaRegistro || b.createdTime || "");
      const aTime = Date.parse(a.fechaRegistro || a.createdTime || "");
      return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
    });
}

/**
 * Marca un item como listo para vender: Estado Item → "Disponible" y
 * "Disponible para venta" → true. Es la "acción controlada" que exigía el guard
 * de validateInlineItemFieldChange y que hasta ahora no existía, por lo que el
 * ciclo de vida se estancaba en "En revisión" (ver lib/shipping-v2/item-availability.ts).
 *
 * Idempotente: si el item ya está Disponible se devuelve tal cual, sin error.
 */
export async function marcarShippingV2ItemDisponible(
  recordId: string,
  options: { actualizadoPor: string }
) {
  assertShippingV2GeneratedSchema();
  const id = cleanString(recordId);
  if (!id) throw new Error("Record ID de item inválido.");

  const item = await getShippingV2ItemById(id, { includeAiName: false, access: systemShippingV2Access() });
  if (item.recibido !== true) throw new Error("Marca primero Recibido antes de dejar el item listo para vender.");

  const novedades = await getShippingV2NovedadesForItem(id);
  const novedadesAbiertas = novedades.filter((n) => isOpenNovedadStatus(n.estado)).length;

  const evaluacion = evaluarPublicacionItem({
    estado: item.estado,
    estadoRevision: item.estadoRevision,
    revisadoFisicamente: item.revisadoFisicamente,
    novedadesAbiertas,
  });

  if (!evaluacion.puede) {
    if (evaluacion.motivo === "ya-disponible") return item; // idempotente
    throw new Error(evaluacion.detalle);
  }

  const estadoAnterior = item.estado;
  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
    method: "PATCH",
    body: JSON.stringify({
      records: [
        {
          id,
          fields: {
            [SHIPPING_V2_ITEM_FIELDS.estadoItem]: "Disponible",
            [SHIPPING_V2_ITEM_FIELDS.disponibleVenta]: true,
            [SHIPPING_V2_ITEM_FIELDS.ultimaActualizacion]: new Date().toISOString(),
            [SHIPPING_V2_ITEM_FIELDS.actualizadoPor]: options.actualizadoPor,
          },
        },
      ],
    }),
  });

  const updated = response.records?.[0];
  if (!updated) throw new Error("Airtable no devolvió el item actualizado.");
  const itemActualizado = mapItem(updated);

  await createShippingV2Event({
    action: "Cambio de estado",
    entity: "Shipping Item",
    itemRecordId: id,
    itemName: itemActualizado.nombre,
    registradoPor: options.actualizadoPor,
    descripcion: "Publicado como listo para vender desde Recepción.",
    estadoAnterior,
    estadoNuevo: "Disponible",
  });

  invalidateShippingV2ItemSearchIndexCache();
  return itemActualizado;
}

export async function getShippingV2DashboardSummary(access?: ShippingV2AccessContext): Promise<ShippingV2DashboardSummary> {
  const [items, pagos, packings, novedades] = await Promise.all([
    getShippingV2Items({ access }),
    canShippingV2(access, "canViewPayments") ? getShippingV2Pagos(access) : Promise.resolve([]),
    getShippingV2Packings(access),
    getShippingV2Novedades(access),
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

// ─── Repuestos de stock para la cuenta unificada de órdenes (Fase 11) ──────
// El link "Orden de Reparación (Stock)" (Shipping Items → Órdenes de
// Reparación) es distinto del link "Operación Comercial": ese último es para
// items "de pedido" (comprados a través de una operación); este es para
// items "de stock" agregados directamente a una orden en modo V2.

export type ShippingV2RepuestoStockResumen = {
  id: string;
  sku: string;
  nombre: string;
  precioVentaFinal: number | null;
};

const ORDEN_STOCK_LINK_FIELD = "Orden de Reparación (Stock)";

function mapRepuestoStockResumen(record: AirtableRecord): ShippingV2RepuestoStockResumen {
  const f = record.fields;
  return {
    id: record.id,
    sku: firstString(f[SHIPPING_V2_ITEM_FIELDS.sku], record.id),
    nombre: firstString(f[SHIPPING_V2_ITEM_FIELDS.nombre], "Artículo sin nombre"),
    precioVentaFinal: firstNumber(f[SHIPPING_V2_ITEM_FIELDS.precioVentaFinal]),
  };
}

// Categorías que pueden montarse dentro de un equipo del cliente. Todo lo que
// no sea un equipo terminado (Laptop, Desktop, All in One, Monitor, Consola)
// sirve como repuesto.
//
// Antes esto era `Categoría = "Repuesto"` a secas, lo que obligaba a etiquetar
// como "Repuesto" a un SSD, una RAM o una batería para que el técnico pudiera
// encontrarlos — y esa misma casilla es la que describe QUÉ es el artículo. Al
// mezclar "qué es" con "para qué sirve", la categoría dejó de ser confiable:
// terminaron marcados como Repuesto una impresora Epson, un disco externo
// Seagate y unos audífonos Plantronics. Ahora la categoría dice la verdad y es
// el buscador el que sabe qué categorías son montables.
const CATEGORIAS_REPUESTO_STOCK = [
  "Repuesto",
  "RAM",
  "SSD",
  "HDD",
  "Pantalla",
  "Teclado",
  "Batería",
  "Cargador",
  "Mainboard",
  "Tarjeta gráfica",
  "Fuente de poder",
  "Cable",
  "Accesorio",
] as const;

// Items montables, disponibles para venta y sin reservar — candidatos a
// agregarse como repuesto de stock a una orden de reparación.
export async function buscarShippingItemsRepuestoStockDisponibles(
  query?: string
): Promise<ShippingV2RepuestoStockResumen[]> {
  assertShippingV2GeneratedSchema();
  const categoriasOr = CATEGORIAS_REPUESTO_STOCK.map(
    (c) => `{${SHIPPING_V2_ITEM_FIELDS.categoria}}="${c}"`
  ).join(",");
  const records = await listRecords(SHIPPING_V2_TABLES.items, {
    maxRecords: 200,
    filterByFormula: `AND(OR(${categoriasOr}), {${SHIPPING_V2_ITEM_FIELDS.disponibleVenta}}=1, {${SHIPPING_V2_ITEM_FIELDS.reservado}}=0)`,
  });

  let results = records.map(mapRepuestoStockResumen);

  const q = cleanString(query).toLowerCase();
  if (q) {
    results = results.filter(
      (item) => item.nombre.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q)
    );
  }

  return results.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

// Reserva un item de stock para una orden: Reservado=true, Disponible para
// venta=false, y lo enlaza a la orden vía "Orden de Reparación (Stock)".
// Valida categoría/disponibilidad para evitar reservar dos veces por una
// condición de carrera (dos técnicos agregando el mismo item a la vez).
export async function reservarShippingItemComoRepuestoDeOrdenStock(opciones: {
  itemId: string;
  ordenRecordId: string;
  ordenIdVisible: string;
  registradoPor: string;
}): Promise<ShippingV2RepuestoStockResumen> {
  // F-26 — mismo turno por artículo que usa el apartado de reservas, para que
  // montar un repuesto y apartar para un cliente no puedan colarse a la vez
  // sobre la misma unidad.
  return withLock(`shipping-item:${cleanString(opciones.itemId)}`, () =>
    reservarRepuestoDeOrdenSinTurno(opciones)
  );
}

async function reservarRepuestoDeOrdenSinTurno({
  itemId,
  ordenRecordId,
  ordenIdVisible,
  registradoPor,
}: {
  itemId: string;
  ordenRecordId: string;
  ordenIdVisible: string;
  registradoPor: string;
}): Promise<ShippingV2RepuestoStockResumen> {
  assertShippingV2GeneratedSchema();
  const id = cleanString(itemId);
  if (!id) throw new Error("Record ID de item inválido.");

  const existing = await airtableRequest<AirtableRecordResponse>(
    `${tableUrl(SHIPPING_V2_TABLES.items)}/${encodeURIComponent(id)}`
  );
  const f = existing.fields;

  const categoriaItem = firstString(f[SHIPPING_V2_ITEM_FIELDS.categoria]);
  if (!CATEGORIAS_REPUESTO_STOCK.some((c) => c === categoriaItem)) {
    throw new Error(
      `Un artículo de categoría "${categoriaItem || "sin categoría"}" no se puede montar como repuesto en una orden.`
    );
  }
  // F-42 — se compromete UNA UNIDAD, no el registro entero. La guarda anterior
  // rechazaba en cuanto la bandera "Reservado" estuviera encendida, así que
  // montar 1 unidad de REP-000017 (52 unidades) bloqueaba las 52 para
  // cualquier otra orden, reserva o venta.
  const unidadesItem = {
    cantidad: firstNumber(f[SHIPPING_V2_ITEM_FIELDS.cantidad]) ?? 0,
    cantidadReservada: firstNumber(f[SHIPPING_V2_ITEM_FIELDS.cantidadReservada]) ?? 0,
    reservado: firstBoolean(f[SHIPPING_V2_ITEM_FIELDS.reservado]),
  };
  // "Disponible para venta" apagada significa dos cosas distintas: que el
  // artículo aún no está vendible (en tránsito, en packing) o que ya no quedan
  // unidades libres. Se distinguen por si hay algo comprometido; sin esto se
  // podría montar en una orden mercadería que todavía no ha llegado.
  if (firstBoolean(f[SHIPPING_V2_ITEM_FIELDS.disponibleVenta]) === false && unidadesReservadas(unidadesItem) === 0) {
    throw new Error("Este item no está disponible para venta.");
  }
  const compromiso = comprometerUnidades(unidadesItem, 1);
  if (!compromiso.ok) throw new Error(compromiso.motivo);

  // El artículo pasa a "Reservado" pero NO se descuenta del inventario: sigue
  // siendo tuyo y sigue contando en el stock. Solo una factura o un recibo
  // reducen la cantidad (postEmision / descontarInventarioRecibo).
  //
  // Hasta aquí solo se marcaban las banderas y el Estado Item se quedaba como
  // estuviera ("Repuesto", "En revisión", "Pagado"…), así que el semáforo del
  // inventario no reflejaba que la pieza estaba comprometida con una orden.
  const estadoAnterior = firstString(f[SHIPPING_V2_ITEM_FIELDS.estadoItem], "Disponible");
  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
    method: "PATCH",
    body: JSON.stringify({
      records: [
        {
          id,
          fields: {
            [SHIPPING_V2_ITEM_FIELDS.cantidadReservada]: compromiso.cantidadReservada,
            [SHIPPING_V2_ITEM_FIELDS.reservado]: compromiso.reservado,
            [SHIPPING_V2_ITEM_FIELDS.disponibleVenta]: compromiso.disponibleVenta,
            // Solo se cierra el estado cuando ya no quedan unidades libres.
            ...(compromiso.reservado ? { [SHIPPING_V2_ITEM_FIELDS.estadoItem]: "Reservado" } : {}),
            // APPEND, no reemplazo: con varias unidades el mismo registro
            // puede estar montado en más de una orden a la vez. Antes se
            // escribía [ordenRecordId], lo que desvinculaba en silencio la
            // orden anterior.
            [ORDEN_STOCK_LINK_FIELD]: Array.from(
              new Set([...linkedRecordIds(f[ORDEN_STOCK_LINK_FIELD]), ordenRecordId])
            ),
          },
        },
      ],
    }),
  });

  const updated = response.records?.[0];
  if (!updated) throw new Error("Airtable no devolvió el item actualizado.");

  // F-26 — se relee para confirmar que nuestro incremento sobrevivió. Si otra
  // instancia comprometió la misma unidad en paralelo, su escritura pisó la
  // nuestra y el contador no coincidirá. Se falla antes de registrar el evento
  // en el historial, para no dejar rastro de algo que no ocurrió.
  const releido = await airtableRequest<AirtableRecordResponse>(
    `${tableUrl(SHIPPING_V2_TABLES.items)}/${encodeURIComponent(id)}`
  );
  verificarEscrituraUnica(
    firstNumber(releido.fields[SHIPPING_V2_ITEM_FIELDS.cantidadReservada]) ?? 0,
    compromiso.cantidadReservada,
    `montar repuesto ${id}`
  );

  const resumen = mapRepuestoStockResumen(updated);

  await createShippingV2Event({
    action: "Cambio de estado",
    entity: "Shipping Item",
    itemRecordId: id,
    itemName: resumen.nombre,
    registradoPor,
    descripcion: `Reservado como repuesto de stock para la orden ${ordenIdVisible}. Sigue en inventario hasta que se facture.`,
    estadoAnterior,
    estadoNuevo: "Reservado",
  });

  return resumen;
}

// Libera un item previamente reservado como stock de una orden: revierte
// Reservado/Disponible para venta y quita el link a la orden.
export async function liberarShippingItemDeOrdenStock({
  itemId,
  ordenRecordId,
  ordenIdVisible,
  registradoPor,
}: {
  itemId: string;
  ordenRecordId: string;
  ordenIdVisible: string;
  registradoPor: string;
}): Promise<ShippingV2RepuestoStockResumen> {
  assertShippingV2GeneratedSchema();
  const id = cleanString(itemId);
  if (!id) throw new Error("Record ID de item inválido.");

  const existing = await airtableRequest<AirtableRecordResponse>(
    `${tableUrl(SHIPPING_V2_TABLES.items)}/${encodeURIComponent(id)}`
  );
  const f = existing.fields;
  const linkedOrdenIds = linkedRecordIds(f[ORDEN_STOCK_LINK_FIELD]);
  if (!linkedOrdenIds.includes(ordenRecordId)) {
    throw new Error("Este item no está reservado como stock de esta orden.");
  }

  // Solo se devuelve a "Disponible" si sigue en "Reservado". Si entre medias
  // pasó a otro estado (Vendido, Con novedad…), quitar el repuesto de la orden
  // no puede resucitarlo a la venta — mismo criterio que liberarItem() de
  // reservas.
  const estadoActual = firstString(f[SHIPPING_V2_ITEM_FIELDS.estadoItem]);

  // F-42 — se devuelve UNA unidad al stock libre, y se desvincula SOLO esta
  // orden: el registro puede seguir montado en otras.
  const liberacion = liberarUnidades(
    {
      cantidad: firstNumber(f[SHIPPING_V2_ITEM_FIELDS.cantidad]) ?? 0,
      cantidadReservada: firstNumber(f[SHIPPING_V2_ITEM_FIELDS.cantidadReservada]) ?? 0,
      reservado: firstBoolean(f[SHIPPING_V2_ITEM_FIELDS.reservado]),
    },
    1
  );
  const ordenesRestantes = linkedOrdenIds.filter((x) => x !== ordenRecordId);
  const vuelveADisponible = estadoActual === "Reservado" && liberacion.disponibleVenta;

  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
    method: "PATCH",
    body: JSON.stringify({
      records: [
        {
          id,
          fields: {
            ...(vuelveADisponible ? { [SHIPPING_V2_ITEM_FIELDS.estadoItem]: "Disponible" } : {}),
            [SHIPPING_V2_ITEM_FIELDS.cantidadReservada]: liberacion.cantidadReservada,
            [SHIPPING_V2_ITEM_FIELDS.reservado]: liberacion.reservado,
            [SHIPPING_V2_ITEM_FIELDS.disponibleVenta]: liberacion.disponibleVenta,
            // Se quita SOLO esta orden; las demás siguen montadas.
            [ORDEN_STOCK_LINK_FIELD]: ordenesRestantes,
          },
        },
      ],
    }),
  });

  const updated = response.records?.[0];
  if (!updated) throw new Error("Airtable no devolvió el item actualizado.");
  const resumen = mapRepuestoStockResumen(updated);

  await createShippingV2Event({
    action: "Cambio de estado",
    entity: "Shipping Item",
    itemRecordId: id,
    itemName: resumen.nombre,
    registradoPor,
    descripcion: `Liberado de la orden ${ordenIdVisible} (quitado como repuesto de stock).`,
    estadoAnterior: estadoActual || "Reservado",
    estadoNuevo: vuelveADisponible ? "Disponible" : estadoActual,
  });

  return resumen;
}

// ─── Despiece ────────────────────────────────────────────────────────────────
//
// Desarmar un equipo para vender sus piezas por separado. Las reglas y el
// reparto del costo viven en ./despiece.ts (puro, con pruebas); aquí solo se
// lee y se escribe. Ver docs/DISENO_DESPIECE.md.

const CAMPO_ITEMS_HIJOS = "Items hijos";
const CAMPO_ITEM_PADRE = "Item padre";
const CAMPO_COSTO_ASIGNADO_DESPIECE = "Costo asignado por despiece";
const CAMPO_MOTIVO_DESPIECE = "Motivo de despiece";
const CAMPO_FECHA_DESPIECE = "Fecha de despiece";
const CAMPO_RESPONSABLE_DESPIECE = "Responsable de despiece";

async function leerRegistroItem(id: string) {
  return airtableRequest<AirtableRecordResponse>(`${tableUrl(SHIPPING_V2_TABLES.items)}/${encodeURIComponent(id)}`);
}

function mapPiezaDespiece(record: AirtableRecord): PiezaDespiece {
  const F = SHIPPING_V2_ITEM_FIELDS;
  const f = record.fields;
  return {
    id: record.id,
    sku: firstString(f[F.sku]),
    nombre: firstString(f[F.nombre]),
    categoria: firstString(f[F.categoria]),
    cantidad: firstNumber(f[F.cantidad]) ?? 1,
    condicion: firstString(f[F.condicion]),
    precioVenta: firstNumber(f[F.precioVentaFinal]),
    costoAsignado: firstNumber(f[CAMPO_COSTO_ASIGNADO_DESPIECE]) ?? 0,
    estadoItem: firstString(f[F.estadoItem]),
    observaciones: firstString(f[F.observacionesInternas]),
    numeroSerie: firstString(f[F.numeroSerie]),
    tieneFacturaORecibo:
      linkedRecordIds(f["Factura"]).length > 0 || linkedRecordIds(f["Recibo"]).length > 0,
  };
}

/**
 * Todo lo que la pestaña necesita: si se puede despiezar, las piezas ya
 * creadas con su costo, y cuánto costo queda sin repartir.
 */
export async function getResumenDespiece(
  itemRecordId: string,
  access?: ShippingV2AccessContext
): Promise<ResumenDespiece> {
  assertShippingV2GeneratedSchema();
  assertShippingV2Permission(access, "canViewItems", "No tienes acceso a este item.");
  const id = cleanString(itemRecordId);
  if (!id) throw new Error("Record ID de item inválido.");

  const padreRecord = await leerRegistroItem(id);
  const f = padreRecord.fields;
  const hijosIds = linkedRecordIds(f[CAMPO_ITEMS_HIJOS]);
  const hijosRecords = hijosIds.length > 0 ? await listRecordsByIds(SHIPPING_V2_TABLES.items, hijosIds) : [];
  const piezas = hijosRecords.map(mapPiezaDespiece);

  const costoTotalEquipo = firstNumber(f[SHIPPING_V2_ITEM_FIELDS.costoTotalUnidad]) ?? 0;
  const evaluacion = evaluarSiSePuedeDespiezar({
    estadoItem: firstString(f[SHIPPING_V2_ITEM_FIELDS.estadoItem]),
    estadoDespiece: firstString(f[SHIPPING_V2_ITEM_FIELDS.estadoDespiece]),
    cantidad: firstNumber(f[SHIPPING_V2_ITEM_FIELDS.cantidad]) ?? 0,
    cantidadReservada: firstNumber(f[SHIPPING_V2_ITEM_FIELDS.cantidadReservada]) ?? 0,
    reservado: firstBoolean(f[SHIPPING_V2_ITEM_FIELDS.reservado]),
    tieneFacturaORecibo:
      linkedRecordIds(f["Factura"]).length > 0 || linkedRecordIds(f["Recibo"]).length > 0,
  });
  const reparto = calcularRepartoParaPiezas(costoTotalEquipo, piezas);
  const cancelacion = puedeCancelarseDespiece(piezas);

  return {
    padreId: id,
    puedeDespiezar: evaluacion.puede,
    motivoBloqueo: evaluacion.puede ? undefined : evaluacion.mensaje,
    estadoDespiece: firstString(f[SHIPPING_V2_ITEM_FIELDS.estadoDespiece]) || "No aplica",
    motivo: firstString(f[CAMPO_MOTIVO_DESPIECE]),
    costoTotalEquipo,
    piezas: piezas.map((p) => ({
      ...p,
      costoAsignado: reparto.piezas.find((r) => r.id === p.id)?.costoAsignado ?? p.costoAsignado,
    })),
    sinRepartir: reparto.sinRepartir,
    piezasSinPrecio: reparto.piezasSinPrecio,
    puedeCancelar: piezas.length > 0 && cancelacion.puede,
    motivoNoCancelable: cancelacion.mensaje,
  };
}

/** Escribe el costo repartido en cada pieza que lo necesite (en lotes de 10). */
async function sincronizarCostosPiezas(costoTotalEquipo: number, piezas: PiezaDespiece[]): Promise<void> {
  const { aEscribir } = calcularRepartoParaPiezas(costoTotalEquipo, piezas);
  for (let i = 0; i < aEscribir.length; i += 10) {
    const lote = aEscribir.slice(i, i + 10);
    await airtableMutation(tableUrl(SHIPPING_V2_TABLES.items), {
      method: "PATCH",
      body: JSON.stringify({
        records: lote.map((r) => ({ id: r.id, fields: { [CAMPO_COSTO_ASIGNADO_DESPIECE]: r.costoAsignado } })),
      }),
    });
  }
}

/**
 * Crea una pieza a partir del equipo padre. El reparto del costo se recalcula
 * después, porque agregar una pieza cambia lo que cargan todas las demás.
 */
export async function crearPiezaDespiece(
  input: NuevaPiezaInput & { padreId: string },
  options: { registradoPor: string; access?: ShippingV2AccessContext }
) {
  assertShippingV2Permission(options.access, "canEditItems", "No tienes permiso para despiezar artículos.");
  const padreId = cleanString(input.padreId);
  if (!padreId) throw new Error("Record ID del equipo padre inválido.");

  // Se vuelve a comprobar en el servidor: la pantalla puede haberse quedado
  // con datos viejos, y entre que se abrió y se guarda el equipo pudo venderse.
  const resumen = await getResumenDespiece(padreId, options.access);
  if (!resumen.puedeDespiezar) throw new Error(resumen.motivoBloqueo ?? "Este equipo no se puede despiezar.");

  const padreRecord = await leerRegistroItem(padreId);
  const itemInput = construirInputPiezaDespiece(input, {
    proveedorCompraId: linkedRecordIds(padreRecord.fields[SHIPPING_V2_ITEM_FIELDS.proveedorCompra])[0],
    tipoOperacion: firstString(padreRecord.fields[SHIPPING_V2_ITEM_FIELDS.tipoOperacion]),
  });

  const pieza = await createShippingV2ItemRecord(itemInput as ShippingV2ItemWriteInput, {
    registradoPor: options.registradoPor,
    eventDescription: `Pieza recuperada del despiece de ${firstString(padreRecord.fields[SHIPPING_V2_ITEM_FIELDS.sku])}.`,
    extraFields: { [CAMPO_ITEM_PADRE]: [padreId], "Es parte recuperada": true },
  });

  // El equipo entra en "Despiece en proceso" en cuanto nace la primera pieza.
  if (resumen.estadoDespiece !== "Despiece en proceso") {
    await airtableMutation(tableUrl(SHIPPING_V2_TABLES.items), {
      method: "PATCH",
      body: JSON.stringify({
        records: [{ id: padreId, fields: { [SHIPPING_V2_ITEM_FIELDS.estadoDespiece]: "Despiece en proceso" } }],
      }),
    });
  }

  const actualizado = await getResumenDespiece(padreId, options.access);
  await sincronizarCostosPiezas(actualizado.costoTotalEquipo, actualizado.piezas);
  invalidateShippingV2ItemSearchIndexCache();
  return getResumenDespiece(padreId, options.access);
}

/** Quita una pieza del despiece. Solo mientras no se haya vendido ni facturado. */
export async function borrarPiezaDespiece(
  input: { padreId: string; piezaId: string },
  options: { registradoPor: string; access?: ShippingV2AccessContext }
) {
  assertShippingV2Permission(options.access, "canEditItems", "No tienes permiso para despiezar artículos.");
  const padreId = cleanString(input.padreId);
  const piezaId = cleanString(input.piezaId);
  if (!padreId || !piezaId) throw new Error("Identificadores inválidos.");

  const resumen = await getResumenDespiece(padreId, options.access);
  const pieza = resumen.piezas.find((p) => p.id === piezaId);
  if (!pieza) throw new Error("Esa pieza no pertenece a este despiece.");
  if (pieza.estadoItem === "Vendido" || pieza.tieneFacturaORecibo) {
    throw new Error(`La pieza ${pieza.sku} ya se vendió o facturó; no se puede quitar del despiece.`);
  }

  await airtableMutation(`${tableUrl(SHIPPING_V2_TABLES.items)}?records[]=${encodeURIComponent(piezaId)}`, {
    method: "DELETE",
  });

  const actualizado = await getResumenDespiece(padreId, options.access);
  await sincronizarCostosPiezas(actualizado.costoTotalEquipo, actualizado.piezas);
  invalidateShippingV2ItemSearchIndexCache();
  return getResumenDespiece(padreId, options.access);
}

/**
 * Edita una pieza ya creada. Hace falta sobre todo por el precio: es lo que
 * decide cómo se reparte el costo del equipo, así que corregir un precio mal
 * escrito no puede obligar a borrar la pieza y volver a crearla (perdería su
 * SKU y su historial).
 */
export async function editarPiezaDespiece(
  input: {
    padreId: string;
    piezaId: string;
    nombre?: string;
    categoria?: string;
    cantidad?: number;
    condicion?: string;
    precioVenta?: number | null;
    observaciones?: string;
  },
  options: { registradoPor: string; access?: ShippingV2AccessContext; esAdmin?: boolean }
) {
  assertShippingV2Permission(options.access, "canEditItems", "No tienes permiso para despiezar artículos.");
  const padreId = cleanString(input.padreId);
  const piezaId = cleanString(input.piezaId);
  if (!padreId || !piezaId) throw new Error("Identificadores inválidos.");

  const resumen = await getResumenDespiece(padreId, options.access);
  const pieza = resumen.piezas.find((p) => p.id === piezaId);
  if (!pieza) throw new Error("Esa pieza no pertenece a este despiece.");
  if (pieza.estadoItem === "Vendido" || pieza.tieneFacturaORecibo) {
    throw new Error(`La pieza ${pieza.sku} ya se vendió o facturó; no se puede modificar.`);
  }

  const F = SHIPPING_V2_ITEM_FIELDS;
  const campos: Record<string, unknown> = {};
  if (cleanString(input.nombre)) campos[F.nombre] = cleanString(input.nombre);
  if (cleanString(input.categoria)) campos[F.categoria] = cleanString(input.categoria);
  if (cleanString(input.condicion)) campos[F.condicion] = cleanString(input.condicion);
  if (typeof input.cantidad === "number" && Number.isInteger(input.cantidad) && input.cantidad > 0) {
    // Una pieza de despiece es un Shipping Item más: mismo candado que
    // cualquier otro item (ver adminOnly en item-edit-config.ts). Al crear
    // la pieza sí se puede fijar la cantidad inicial (crearPiezaDespiece);
    // corregirla después es lo que se restringe.
    if (input.cantidad !== pieza.cantidad && options.esAdmin !== true) {
      throw new Error('Solo un administrador puede corregir la "Cantidad" de una pieza ya creada.');
    }
    campos[F.cantidad] = input.cantidad;
  }
  if (input.observaciones !== undefined) campos[F.observacionesInternas] = cleanString(input.observaciones);
  // El precio SÍ se puede dejar en blanco a propósito: significa "sin precio
  // asignado todavía", y la pieza simplemente no entra a facturación.
  if (input.precioVenta !== undefined) {
    campos[F.precioVentaFinal] = typeof input.precioVenta === "number" && input.precioVenta > 0 ? input.precioVenta : null;
  }
  if (Object.keys(campos).length === 0) return resumen;

  await airtableMutation(tableUrl(SHIPPING_V2_TABLES.items), {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id: piezaId, fields: campos }], typecast: true }),
  });

  // Cambiar un precio cambia el reparto de TODAS las piezas, no solo de esta.
  const actualizado = await getResumenDespiece(padreId, options.access);
  await sincronizarCostosPiezas(actualizado.costoTotalEquipo, actualizado.piezas);
  invalidateShippingV2ItemSearchIndexCache();
  return getResumenDespiece(padreId, options.access);
}

/**
 * Cierra el despiece: descuenta la unidad desarmada del equipo padre y lo saca
 * de la venta. Es la tercera forma legítima de reducir inventario —junto a la
 * factura y el recibo— y la única que no es una venta: el equipo no se vendió,
 * cambió de forma. Por eso no genera ningún movimiento financiero.
 */
export async function completarDespiece(
  input: { padreId: string; completo: boolean; motivo?: string },
  options: { registradoPor: string; access?: ShippingV2AccessContext }
) {
  assertShippingV2Permission(options.access, "canEditItems", "No tienes permiso para despiezar artículos.");
  const padreId = cleanString(input.padreId);
  if (!padreId) throw new Error("Record ID del equipo padre inválido.");

  return withLock(`shipping-item:${padreId}`, async () => {
    const resumen = await getResumenDespiece(padreId, options.access);
    if (!resumen.puedeDespiezar) throw new Error(resumen.motivoBloqueo ?? "Este equipo no se puede despiezar.");
    if (resumen.piezas.length === 0) {
      throw new Error("Agrega al menos una pieza antes de completar el despiece.");
    }

    const padreRecord = await leerRegistroItem(padreId);
    const estadoAnterior = firstString(padreRecord.fields[SHIPPING_V2_ITEM_FIELDS.estadoItem]);
    const cierre = calcularCierreDespiece(
      {
        cantidad: firstNumber(padreRecord.fields[SHIPPING_V2_ITEM_FIELDS.cantidad]) ?? 0,
        cantidadReservada: firstNumber(padreRecord.fields[SHIPPING_V2_ITEM_FIELDS.cantidadReservada]) ?? 0,
      },
      input.completo
    );

    await sincronizarCostosPiezas(resumen.costoTotalEquipo, resumen.piezas);

    await airtableMutation(tableUrl(SHIPPING_V2_TABLES.items), {
      method: "PATCH",
      body: JSON.stringify({
        records: [{
          id: padreId,
          fields: {
            [SHIPPING_V2_ITEM_FIELDS.estadoItem]: cierre.estadoItemPadre,
            [SHIPPING_V2_ITEM_FIELDS.estadoDespiece]: cierre.estadoDespiecePadre,
            [SHIPPING_V2_ITEM_FIELDS.cantidad]: cierre.cantidadPadre,
            [SHIPPING_V2_ITEM_FIELDS.disponibleVenta]: false,
            [CAMPO_FECHA_DESPIECE]: new Date().toISOString(),
            [CAMPO_RESPONSABLE_DESPIECE]: options.registradoPor,
            ...(cleanString(input.motivo) ? { [CAMPO_MOTIVO_DESPIECE]: cleanString(input.motivo) } : {}),
          },
        }],
      }),
    });

    await createShippingV2Event({
      action: "Cambio de estado",
      entity: "Shipping Item",
      itemRecordId: padreId,
      itemName: firstString(padreRecord.fields[SHIPPING_V2_ITEM_FIELDS.nombre]),
      registradoPor: options.registradoPor,
      descripcion: `${cierre.estadoDespiecePadre}: se recuperaron ${resumen.piezas.length} pieza(s). La unidad desarmada se descontó del inventario.`,
      estadoAnterior,
      estadoNuevo: cierre.estadoItemPadre,
    });

    invalidateShippingV2ItemSearchIndexCache();
    return getResumenDespiece(padreId, options.access);
  });
}

/** Deshace el despiece. Solo si ninguna pieza salió ya del inventario. */
export async function cancelarDespiece(
  input: { padreId: string },
  options: { registradoPor: string; access?: ShippingV2AccessContext }
) {
  assertShippingV2Permission(options.access, "canEditItems", "No tienes permiso para despiezar artículos.");
  const padreId = cleanString(input.padreId);
  if (!padreId) throw new Error("Record ID del equipo padre inválido.");

  const resumen = await getResumenDespiece(padreId, options.access);
  const cancelacion = puedeCancelarseDespiece(resumen.piezas);
  if (!cancelacion.puede) throw new Error(cancelacion.mensaje ?? "No se puede cancelar este despiece.");

  await airtableMutation(tableUrl(SHIPPING_V2_TABLES.items), {
    method: "PATCH",
    body: JSON.stringify({
      records: [{ id: padreId, fields: { [SHIPPING_V2_ITEM_FIELDS.estadoDespiece]: "Cancelado" } }],
    }),
  });

  await createShippingV2Event({
    action: "Cambio de estado",
    entity: "Shipping Item",
    itemRecordId: padreId,
    registradoPor: options.registradoPor,
    descripcion: `Despiece cancelado. Las ${resumen.piezas.length} pieza(s) creadas siguen existiendo como artículos independientes.`,
  });

  invalidateShippingV2ItemSearchIndexCache();
  return getResumenDespiece(padreId, options.access);
}
