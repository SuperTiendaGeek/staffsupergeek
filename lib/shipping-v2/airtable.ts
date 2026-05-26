import "server-only";

import type {
  ShippingV2DashboardSummary,
  ShippingV2Attachment,
  ShippingV2Item,
  ShippingV2ItemWriteInput,
  ShippingV2Novedad,
  ShippingV2Packing,
  ShippingV2Pago,
  ShippingV2Proveedor,
  ShippingV2Recepcion,
} from "@/types/shipping-v2";
import { getShippingV2ItemEditField } from "@/lib/shipping-v2/item-edit-config";
import { getDefaultItemFlowByOperation } from "@/lib/shipping-v2/item-operation-rules";
import { canBeItemLogisticsProvider, canBePurchaseProvider } from "@/lib/shipping-v2/provider-rules";
import { generateUniqueSkuFromExistingSkus, normalizeSku } from "@/lib/sku/sku-service";
import { assertShippingV2GeneratedSchema, SHIPPING_V2_ITEM_FIELDS, SHIPPING_V2_ITEM_SELECT_OPTIONS, SHIPPING_V2_TABLES } from "@/lib/shipping-v2/schema.generated";

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

export type ShippingV2AttachmentUpload = {
  filename: string;
  contentType: string;
  fileBase64: string;
};

const PACKING_LOGISTICS_MODES = new Set(["Pendiente de packing", "Crear packing individual", "Asignar a packing existente"]);

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
  return null;
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

function escapeFormulaString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getOfficialSkuField() {
  return SHIPPING_V2_ITEM_FIELDS.sku;
}

function selectOption(options: readonly string[], value: string) {
  return options.includes(value) ? value : options[0] ?? value;
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
  const proveedorId = firstString(f["Proveedor ID"]);
  const nombre = firstString(f["Nombre proveedor"] ?? f["Nombre Proveedor"] ?? f.Nombre ?? f.Proveedor, record.id);
  const label = proveedorId || nombre || record.id;
  const tipoProveedor = firstString(f["Tipo de proveedor"]);

  return {
    id: record.id,
    createdTime: record.createdTime,
    proveedorId,
    label,
    nombre,
    estado: firstString(f["Estado proveedor"] ?? f.Estado, "Activo"),
    tipoProveedor,
    puedeArmarPackings: firstBoolean(f["Puede armar packings"]),
    puedeRecibirEncargosTerceros: firstBoolean(f["Puede recibir encargos de terceros"]),
    permiteTriangulacion: firstBoolean(f["Permite triangulación"] ?? f["Permite triangulacion"]),
    contacto: firstString(f.Contacto),
    email: firstString(f.Email),
    telefono: firstString(f.Telefono ?? f["Teléfono"]),
    pais: firstString(f.Pais ?? f["País"] ?? tipoProveedor),
  };
}

function mapItem(record: AirtableRecord): ShippingV2Item {
  assertShippingV2GeneratedSchema();
  const F = SHIPPING_V2_ITEM_FIELDS;
  const f = record.fields;
  const proveedorCompra = f[F.proveedorCompra];
  const proveedorLogistico = f[F.proveedorLogistico];
  const fechaRegistro = firstString(f[F.fechaRegistro], record.createdTime);
  const packingRelacionado = f[F.packingRelacionado];
  const pagoRelacionado = f[F.pagoRelacionado];

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
    aiNombre: aiTextString(f[F.aiNombre]),
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
    costoAsignadoDespiece: firstNumber(f["Costo asignado por despiece"] ?? f["Costo Asignado Despiece"]),
    costoLogisticoAsignado: firstNumber(f["Costo logístico asignado"] ?? f["Costo logistico asignado"] ?? f["Costo Logistico Asignado"]),
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
    ubicacionActual: firstString(f[F.ubicacionActual]),
    origenFisicoActual: firstString(f["Origen físico actual"] ?? f["Origen fisico actual"] ?? f["Origen Fisico Actual"]),
    fechaRegistro,
    trackingDirecto: firstString(f[F.trackingDirecto]),
    trackingHaciaIntermediario: firstString(f[F.trackingHaciaIntermediario]),
    trackingDesdeIntermediario: firstString(f[F.trackingDesdeIntermediario]),
    trackingUsa: firstString(f["USA Tracking"] ?? f.TrackingUSA),
    trackingEc: firstString(f["EC Tracking"] ?? f.TrackingEC),
    requierePacking: firstBoolean(f[F.requierePacking]),
    packingId: firstString(packingRelacionado),
    pagoId: firstString(pagoRelacionado),
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

function mapPago(record: AirtableRecord): ShippingV2Pago {
  const f = record.fields;
  return {
    id: record.id,
    createdTime: record.createdTime,
    pagoId: firstString(f["Pago ID"] ?? f.Pago, record.id),
    estado: firstString(f.Estado ?? f["Estado de Pago"], "Pendiente"),
    proveedorId: firstString(f.Proveedor),
    proveedorNombre: firstString(f["Nombre Proveedor"] ?? f["Proveedor Nombre"]),
    total: firstNumber(f.Total ?? f["Total Pago"]),
    fechaPagoMax: firstString(f["Fecha de Pago Max"] ?? f["Fecha de Pago Máx"]),
    fechaPagoReal: firstString(f["Fecha de Pago Real"]),
    metodoPago: firstString(f["Metodo de Pago"] ?? f["Método de Pago"]),
    transaccionId: firstString(f["Transaccion ID"] ?? f["Transacción ID"]),
  };
}

function mapPacking(record: AirtableRecord): ShippingV2Packing {
  const f = record.fields;
  return {
    id: record.id,
    createdTime: record.createdTime,
    packingId: firstString(f.Packing ?? f.Pack, record.id),
    estado: firstString(f.Estado, "En Proceso"),
    tipo: firstString(f.Tipo),
    itemCount: linkedCount(f.Items ?? f.Item),
    peso: firstNumber(f["Peso (Kilos)"] ?? f.Peso),
    trackingUsa: firstString(f["USA Tracking"] ?? f.TrackingUSA),
    trackingEc: firstString(f["EC Tracking"] ?? f.TrackingEC),
    fechaEnvio: firstString(f["Fecha Envio"] ?? f["Fecha Envío"]),
    arriboEstimado: firstString(f["Arribo Estimado"]),
  };
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
  return {
    id: record.id,
    createdTime: record.createdTime,
    titulo: firstString(f.Titulo ?? f["Título"] ?? f.Novedad, "Sin titulo"),
    estado: firstString(f.Estado, "Abierta"),
    severidad: firstString(f.Severidad),
    itemId: firstString(f.Item),
    packingId: firstString(f.Packing),
    descripcion: firstString(f.Descripcion ?? f["Descripción"]),
  };
}

export async function getShippingV2Proveedores() {
  const records = await listRecords(SHIPPING_V2_TABLES.proveedores, { maxRecords: 100 });
  return records.map(mapProveedor);
}

async function getShippingV2ProveedorById(recordId: string) {
  const record = await getRecordById(SHIPPING_V2_TABLES.proveedores, recordId);
  return record ? mapProveedor(record) : null;
}

export async function getShippingV2Items() {
  const records = await listRecords(SHIPPING_V2_TABLES.items, {
    maxRecords: 200,
    sortField: SHIPPING_V2_ITEM_FIELDS.fechaRegistro,
    sortDirection: "desc",
  });
  return records
    .map(mapItem)
    .sort((a, b) => {
      const aTime = Date.parse(a.fechaRegistro || a.createdTime || "");
      const bTime = Date.parse(b.fechaRegistro || b.createdTime || "");
      const safeATime = Number.isNaN(aTime) ? -Infinity : aTime;
      const safeBTime = Number.isNaN(bTime) ? -Infinity : bTime;
      return safeBTime - safeATime;
    });
}

export async function getShippingV2ItemById(recordId: string) {
  const id = cleanString(recordId);
  if (!id) throw new Error("Record ID de item inválido.");

  const record = await airtableRequest<AirtableRecordResponse>(`${tableUrl(SHIPPING_V2_TABLES.items)}/${encodeURIComponent(id)}`);
  const item = mapItem(record);
  if (process.env.NODE_ENV !== "production") {
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
  action: "Creado" | "Actualizado";
  itemRecordId: string;
  itemName?: string;
  registradoPor: string;
  descripcion: string;
}) {
  try {
    await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.eventos), {
      method: "POST",
      body: JSON.stringify({
        records: [
          {
            fields: compactFields({
              "Tipo de entidad": "Shipping Item",
              "Acción": input.action,
              "Item relacionado": [input.itemRecordId],
              "Descripción del evento": input.descripcion,
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
  await createShippingV2Event({
    action: "Actualizado",
    itemRecordId: item.id,
    itemName: item.nombre,
    registradoPor: options.actualizadoPor,
    descripcion: input.eventDescription || `Campo "${config.label}" actualizado desde Portal Staff.`,
  });

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

export async function getShippingV2Pagos() {
  const records = await listRecords(SHIPPING_V2_TABLES.pagos, { maxRecords: 200 });
  return records.map(mapPago);
}

export async function getShippingV2Packings() {
  const records = await listRecords(SHIPPING_V2_TABLES.packings, { maxRecords: 200 });
  return records.map(mapPacking);
}

export async function getShippingV2Recepciones() {
  const records = await listRecords(SHIPPING_V2_TABLES.recepciones, { maxRecords: 200 });
  return records.map(mapRecepcion);
}

export async function getShippingV2Novedades() {
  const records = await listRecords(SHIPPING_V2_TABLES.novedades, { maxRecords: 200 });
  return records.map(mapNovedad);
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
