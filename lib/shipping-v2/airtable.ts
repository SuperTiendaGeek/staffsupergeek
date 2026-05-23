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
    [F.afectaInventario]: Boolean(input.afectaInventario),
    [F.disponibleVenta]: Boolean(input.disponibleVenta),
    [F.skuProveedor]: cleanString(input.skuProveedor),
    [F.modelo]: cleanString(input.modelo),
    [F.marca]: cleanString(input.marca),
    [F.numeroSerie]: cleanString(input.numeroSerie),
    [F.condicion]: cleanString(input.condicion),
    [F.costoProveedor]: input.costoProveedor ?? undefined,
    [F.precioVentaSugerido]: input.precioVentaSugerido ?? undefined,
    [F.ubicacionActual]: cleanString(input.ubicacionActual),
    [F.observacionesInternas]: cleanString(input.observacionesInternas),
    [F.observacionVenta]: cleanString(input.observacionVenta),
    [F.estadoRevision]: cleanString(input.estadoRevision),
    [F.estadoTriangulacion]: cleanString(input.estadoTriangulacion),
    [F.estadoDespiece]: cleanString(input.estadoDespiece),
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
  return {
    id: record.id,
    createdTime: record.createdTime,
    nombre: firstString(f.Nombre ?? f.Proveedor, record.id),
    estado: firstString(f.Estado, "Activo"),
    contacto: firstString(f.Contacto),
    email: firstString(f.Email),
    telefono: firstString(f.Telefono ?? f["Teléfono"]),
    pais: firstString(f.Pais ?? f["País"]),
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

  return {
    id: record.id,
    createdTime: record.createdTime,
    itemId: firstString(f[F.itemId]),
    codigo: firstString(f[F.skuInterno], record.id),
    skuInterno: firstString(f[F.skuInterno], record.id),
    skuProveedor: firstString(f[F.skuProveedor]),
    metodoAsignacionSku: firstString(f[F.metodoAsignacionSku]),
    skuProveedorUsadoComoInterno: firstBoolean(f[F.skuProveedorUsadoComoInterno]),
    skuDuplicadoDetectado: firstBoolean(f[F.skuDuplicadoDetectado]),
    skuOriginalSugerido: firstString(f[F.skuOriginalSugerido]),
    nombre: firstString(f[F.nombre]),
    descripcion: firstString(f[F.descripcion]),
    modelo: firstString(f[F.modelo]),
    marca: firstString(f[F.marca]),
    numeroSerie: firstString(f[F.numeroSerie]),
    categoria: firstString(f[F.categoria]),
    tipoOperacion: firstString(f[F.tipoOperacion]),
    tipoItem: firstString(f[F.tipoItem]),
    condicion: firstString(f[F.condicion]),
    cantidad: firstNumber(f.Cantidad ?? f.Qty),
    unidad: firstString(f.Unidad),
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
    costoProveedor: firstNumber(f[F.costoProveedor]),
    costoAsignadoDespiece: firstNumber(f["Costo asignado por despiece"] ?? f["Costo Asignado Despiece"]),
    costoLogisticoAsignado: firstNumber(f["Costo logístico asignado"] ?? f["Costo logistico asignado"] ?? f["Costo Logistico Asignado"]),
    costoTotalEstimado: firstNumber(f["Costo total estimado"] ?? f["Costo Total Estimado"]),
    precioVentaSugerido: firstNumber(f[F.precioVentaSugerido]),
    precioVenta: firstNumber(f["Precio Venta"]),
    qty: firstNumber(f.Qty ?? f.Cantidad),
    disponibleVenta: firstBoolean(f[F.disponibleVenta]),
    reservado: firstBoolean(f.Reservado),
    usoLocal: firstBoolean(f["Uso local"] ?? f["Uso Local"]),
    esRepuesto: firstBoolean(f["Es repuesto"] ?? f.Repuesto),
    esRegalo: firstBoolean(f[F.esRegalo]),
    conNovedad: firstBoolean(f["Con novedad"] ?? f.Novedad ?? f.Novedades),
    ubicacionActual: firstString(f[F.ubicacionActual]),
    origenFisicoActual: firstString(f["Origen físico actual"] ?? f["Origen fisico actual"] ?? f["Origen Fisico Actual"]),
    fechaRegistro,
    trackingDirecto: firstString(f["Tracking directo"] ?? f["Tracking Directo"]),
    trackingHaciaIntermediario: firstString(f["Tracking hacia intermediario"] ?? f["Tracking Hacia Intermediario"]),
    trackingDesdeIntermediario: firstString(f["Tracking desde intermediario"] ?? f["Tracking Desde Intermediario"]),
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
    fotos: mapAttachments(f.Fotos ?? f.Foto ?? f.Imagenes ?? f["Imágenes"]),
    evidencias: mapAttachments(f.Evidencias ?? f.Evidencia),
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

export async function getShippingV2Items() {
  const records = await listRecords(SHIPPING_V2_TABLES.items, { maxRecords: 200 });
  return records.map(mapItem);
}

export async function getShippingV2ItemById(recordId: string) {
  const id = cleanString(recordId);
  if (!id) throw new Error("Record ID de item inválido.");

  const record = await airtableRequest<AirtableRecordResponse>(`${tableUrl(SHIPPING_V2_TABLES.items)}/${encodeURIComponent(id)}`);
  return mapItem(record);
}

export async function findShippingV2ItemBySkuInterno(skuInterno: string) {
  assertShippingV2GeneratedSchema();
  const sku = cleanString(skuInterno);
  if (!sku) return null;

  const records = await listRecords(SHIPPING_V2_TABLES.items, {
    maxRecords: 1,
    filterByFormula: `LOWER({${SHIPPING_V2_ITEM_FIELDS.skuInterno}}) = LOWER('${escapeFormulaString(sku)}')`,
  });

  return records[0] ? mapItem(records[0]) : null;
}

async function findShippingV2ItemByItemId(itemId: string) {
  assertShippingV2GeneratedSchema();
  const value = cleanString(itemId);
  if (!value) return null;

  const records = await listRecords(SHIPPING_V2_TABLES.items, {
    maxRecords: 1,
    filterByFormula: `LOWER({${SHIPPING_V2_ITEM_FIELDS.itemId}}) = LOWER('${escapeFormulaString(value)}')`,
  });

  return records[0] ? mapItem(records[0]) : null;
}

async function generateUniqueShippingV2Sku(prefix = "SKU") {
  const year = new Date().getFullYear();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const random = Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
    const sku = `${prefix}-${year}-${random}`;
    const existing = await findShippingV2ItemBySkuInterno(sku);
    if (!existing) return sku;
  }

  throw new Error("No se pudo generar un SKU interno único. Intenta nuevamente.");
}

async function generateUniqueShippingV2ItemId() {
  const year = new Date().getFullYear();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const random = Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
    const itemId = `ITEM-${year}-${random}`;
    const existing = await findShippingV2ItemByItemId(itemId);
    if (!existing) return itemId;
  }

  throw new Error("No se pudo generar un Item ID único. Intenta nuevamente.");
}

async function resolveSkuForCreate(input: ShippingV2ItemWriteInput) {
  const manualSku = cleanString(input.skuInterno);
  const proveedorSku = cleanString(input.skuProveedor);

  if (manualSku) {
    const existing = await findShippingV2ItemBySkuInterno(manualSku);
    if (existing) throw new Error(`El SKU interno "${manualSku}" ya existe en otro item.`);

    return {
      skuInterno: manualSku,
      metodoAsignacionSku: selectOption(SHIPPING_V2_ITEM_SELECT_OPTIONS.metodoAsignacionSku, "Asignado manualmente"),
      skuProveedorUsadoComoInterno: false,
      skuDuplicadoDetectado: false,
      skuOriginalSugerido: "",
    };
  }

  if (proveedorSku) {
    const existing = await findShippingV2ItemBySkuInterno(proveedorSku);
    if (!existing) {
      return {
        skuInterno: proveedorSku,
        metodoAsignacionSku: selectOption(SHIPPING_V2_ITEM_SELECT_OPTIONS.metodoAsignacionSku, "Usado desde proveedor"),
        skuProveedorUsadoComoInterno: true,
        skuDuplicadoDetectado: false,
        skuOriginalSugerido: "",
      };
    }

    return {
      skuInterno: await generateUniqueShippingV2Sku(),
      metodoAsignacionSku: selectOption(SHIPPING_V2_ITEM_SELECT_OPTIONS.metodoAsignacionSku, "Generado por duplicado"),
      skuProveedorUsadoComoInterno: false,
      skuDuplicadoDetectado: true,
      skuOriginalSugerido: proveedorSku,
    };
  }

  return {
    skuInterno: await generateUniqueShippingV2Sku(),
    metodoAsignacionSku: selectOption(SHIPPING_V2_ITEM_SELECT_OPTIONS.metodoAsignacionSku, "Generado automáticamente"),
    skuProveedorUsadoComoInterno: false,
    skuDuplicadoDetectado: false,
    skuOriginalSugerido: "",
  };
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

export async function createShippingV2Item(input: ShippingV2ItemWriteInput, options: { registradoPor: string }) {
  validateItemInput(input);

  const sku = await resolveSkuForCreate(input);
  const itemId = await generateUniqueShippingV2ItemId();
  const fields = getItemFields(input, {
    [SHIPPING_V2_ITEM_FIELDS.itemId]: itemId,
    [SHIPPING_V2_ITEM_FIELDS.skuInterno]: sku.skuInterno,
    [SHIPPING_V2_ITEM_FIELDS.metodoAsignacionSku]: sku.metodoAsignacionSku,
    [SHIPPING_V2_ITEM_FIELDS.skuProveedorUsadoComoInterno]: sku.skuProveedorUsadoComoInterno,
    [SHIPPING_V2_ITEM_FIELDS.skuDuplicadoDetectado]: sku.skuDuplicadoDetectado,
    [SHIPPING_V2_ITEM_FIELDS.skuOriginalSugerido]: sku.skuOriginalSugerido,
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
    descripcion: `Item ${item.skuInterno} creado desde Portal Staff.`,
  });

  return item;
}

export async function updateShippingV2Item(recordId: string, input: ShippingV2ItemWriteInput, options: { actualizadoPor: string }) {
  const id = cleanString(recordId);
  if (!id) throw new Error("Record ID de item inválido.");
  validateItemInput(input);

  const existing = await getShippingV2ItemById(id);
  const nextSku = cleanString(input.skuInterno);

  if (nextSku && nextSku !== existing.skuInterno) {
    const duplicated = await findShippingV2ItemBySkuInterno(nextSku);
    if (duplicated && duplicated.id !== id) {
      throw new Error(`El SKU interno "${nextSku}" ya existe en otro item.`);
    }
  }

  const fields = getItemFields(input, {
    ...(nextSku ? { [SHIPPING_V2_ITEM_FIELDS.skuInterno]: nextSku } : {}),
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
    descripcion: `Item ${item.skuInterno} actualizado desde Portal Staff.`,
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
