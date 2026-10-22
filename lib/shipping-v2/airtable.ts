import "server-only";

import { comprometerUnidades, liberarUnidades, normalizarUnidades, unidadesLibres, unidadesReservadas } from "./unidades";
import {
  calcularCierreDespiece,
  calcularRepartoParaPiezas,
  construirInputPiezaDespiece,
  evaluarSiSePuedeDespiezar,
  puedeCancelarseDespiece,
  puedeRevertirseDespiece,
  ESTADO_PIEZA_EN_ESPERA,
  type NuevaPiezaInput,
  type PiezaDespiece,
  type ResumenDespiece,
} from "./despiece-airtable";

import { EscrituraConcurrenteError, verificarEscrituraUnica, withLock } from "@/lib/concurrencia";

import type {
  ShippingV2DashboardSummary,
  ShippingV2UnidadHermana,
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
  ShippingV2ItemDocumento,
  ShippingV2ItemTrazabilidad,
  ShippingV2LogisticaFila,
  ShippingV2CostosTraerlo,
  ShippingV2PagoLogisticaResumen,
  ShippingV2ItemSearchEntry,
  ShippingV2ItemWriteInput,
  ShippingV2TechnicalSheet,
  ShippingV2TechnicalSheetInput,
  ShippingV2Novedad,
  ShippingV2Packing,
  ShippingV2PackingWriteInput,
  ShippingV2PagoMarkPaidInput,
  ShippingV2PagoPendingItem,
  ShippingV2PagoSupportCard,
  ShippingV2PackingReviewSummary,
  ShippingV2PagosSummary,
  ShippingV2PagosWorkspace,
  ShippingV2PackingInvoiceData,
  ShippingV2PagoWriteInput,
  ShippingV2Pago,
  ShippingV2Proveedor,
  ShippingV2Recepcion,
  ShippingV2PackingStatusAction,
  ShippingV2RecepcionChecklistAction,
  ShippingV2ItemNovedadInput,
  ShippingV2TechnicalOption,
  ShippingV2OrdenArticulo,
  ShippingV2OrdenCompra,
  ShippingV2OrdenCompraWriteInput,
} from "@/types/shipping-v2";
import type { StaffSession } from "@/lib/session";
import { canAccessApp, isAdministratorRole, isProviderRole } from "@/lib/apps";
import { SHIPPING_V2_FACEBOOK_SUPER_GEEK_FIELD, SHIPPING_V2_TEXTO_FACEBOOK_FIELD, SHIPPING_V2_TEXTO_FACEBOOK_LEGACY_FIELD, getShippingV2ItemEditField, getShippingV2ItemEditFieldByKey } from "@/lib/shipping-v2/item-edit-config";
import { getShippingV2FacebookPublicationBlockReason, getShippingV2FacebookTextGenerationBlockReason } from "@/lib/shipping-v2/facebook-super-geek-text";
import { estadoSegunLlegada, requiereInspeccionPorDefecto } from "@/lib/shipping-v2/item-venta";
import { formulaFiltroArticulos, type FiltroArticulos } from "@/lib/shipping-v2/items-filtro";
import { formulaRecepcionAirtable } from "@/lib/shipping-v2/reception-visibility";
import { cantidadDeOpcion } from "@/lib/operaciones/opciones";
import type { ArticuloDelPedido } from "@/lib/operaciones/cierre";
import { evaluarCorreccionEstado, todasReservadas, type CampoCorregible } from "@/lib/shipping-v2/correccion-estado";
import type { ResumenPestanas } from "@/lib/shipping-v2/pestanas";
import {
  estadoAlPonerRastreo,
  modoLogisticoSegunOrigen,
  normalizarOrigen,
  ORIGEN_TIENDA,
  origenSegunZona,
  puedeEntrarACaja,
  tipoOperacionPermitido,
  vieneDeAfuera,
} from "@/lib/shipping-v2/item-origen";
import { validarReglaDistribucion } from "@/lib/shipping-v2/packing-costos";
import { calcularRepartoPacking, type ResultadoReparto } from "@/lib/shipping-v2/packing-reparto";
import { getDefaultItemFlowByOperation } from "@/lib/shipping-v2/item-operation-rules";
import {
  ESTADO_DADO_DE_BAJA,
  etiquetaComoActivo,
  evaluarDarDeBaja,
  evaluarPasarALaVenta,
  evaluarPasarAUsoLocal,
  evaluarRevertirBaja,
  requierePagoParteSeparada,
  situacionPago,
  valoresComoMercaderia,
  type ArticuloParaMovimiento,
} from "@/lib/shipping-v2/activos";
import {
  ESTADO_INICIAL_EN_CAMINO,
  esPagoHistorico,
  faltaRespaldo,
  validarRespaldo,
  type RespaldoAlRegistrar,
  type SituacionPago,
} from "@/lib/shipping-v2/pagos-situacion";
import {
  categoriaFinanzasDe,
  conceptoDePago,
  esConceptoLogistica,
  pagadoAPor,
  pendienteLogistica,
  situacionGasto,
  validarPagoLogistica,
  valorTrasPago,
  type ConceptoLogistica,
} from "@/lib/shipping-v2/logistica-pagos";
import { esProveedorLogistico } from "@/lib/shipping-v2/provider-types";
import {
  CATEGORIAS_REPUESTO_STOCK,
  ESTADO_AGOTADO,
  cambiosPiezaTrasConsumo,
  costoMejorasTrasAnular,
  costoSugeridoMejora,
  decidirCostoMejora,
  estadoPiezaTrasDevolver,
  evaluarAnulacion,
  evaluarEquipoParaIntervencion,
  evaluarPiezaParaMejora,
  validarPiezaRetirada,
  type DecisionCostoMejora,
  type PiezaRetiradaInput,
} from "@/lib/shipping-v2/mejoras";
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
import {
  ORDEN_COMPRA_FIELDS,
  ocIdDesdeNumero,
  resumenOrden,
  validarAnularPago,
  validarArticuloParaOrden,
  validarCabeceraOrden,
  validarQuitarDeOrden,
} from "@/lib/shipping-v2/ordenes-compra";
import { CAMPO_COLUMNAS_IMPORTACION, limpiarColumnasRecordadas } from "@/lib/shipping-v2/importar-lineas";
import { withShippingV2PackingProviderCostSummary } from "@/lib/shipping-v2/packing-calculations";
import { planShippingV2PackingItemSync } from "@/lib/shipping-v2/packing-item-sync";
import {
  calculateShippingV2PackingReviewProgress,
  getShippingV2PackingTopPendingStep,
  getShippingV2PackingWorkHint,
} from "@/lib/shipping-v2/packing-lifecycle";
import { calcularDisponibleVenta, evaluarDisponibilidadComercial } from "@/lib/shipping-v2/item-comercial";
import {
  appendEntradaHilo,
  articuloSalioDelInventario,
  esEtiquetaDeBloqueo,
  esNovedadBloqueante,
  esPerdidoEnTienda,
  esResponsableProveedor,
  estadoPrevioParaRestaurar,
  ETIQUETA_CON_NOVEDAD,
  ETIQUETA_PERDIDO,
  etiquetaDeBloqueo,
  etiquetaPropuesta,
  DECISION_VENDIDO_CON_NOVEDAD,
  construirHiloNovedad,
  isNovedadAbierta,
  normalizarEstadoNovedad,
  pideAclaracionAlVender,
  SHIPPING_V2_PROPUESTAS_PROVEEDOR,
  validarAccionNovedad,
  validarCierrePorVenta,
  validarRegistroNovedad,
  type ShippingV2DecisionArticulo,
  type ShippingV2NovedadRol,
  type ValoresAccionNovedad,
} from "@/lib/shipping-v2/novedades";
import { validarEvidencias } from "@/lib/shipping-v2/evidencias";
import {
  construirCorreoNovedad,
  evaluarEnlace,
  generarTokenEnlace,
  huellaToken,
  proveedorRecibeCorreo,
  TOKEN_ENLACE_REGEX,
  urlEnlaceNovedad,
  venceEnlace,
} from "@/lib/shipping-v2/novedades-correo";
import { enviarCorreoNovedad, leerConfigCorreoNovedades } from "@/lib/shipping-v2/novedades-correo-envio";
import {
  construirZonasRevision,
  getPerfilRevision,
  resolverEstadoInspeccion,
  type EstadoInspeccion,
  type GrupoDeclarable,
  type OpcionDeclarada,
  type PerfilRevision,
  type ResultadoPunto,
  type ZonaRevision,
} from "@/lib/shipping-v2/revision-tecnica";
import {
  aplicarCambiosEspec,
  camposDeCategoria,
  especificacionesEfectivas,
  parsearEspecificaciones,
  resumenTecnico,
  serializarEspecificaciones,
  type CampoEspec,
  type ValoresEspec,
} from "@/lib/shipping-v2/especificaciones";
import {
  getIntervencionesPorCategoria,
  intervencionAplica,
  type TipoIntervencion,
} from "@/lib/shipping-v2/intervenciones";
import {
  actualizarEquipamiento,
  confirmarEquipamiento,
  contarFallas,
  firmaVigente,
  guardarObservacion,
  limpiarHuerfanos,
  marcarPunto,
  parsearSnapshot,
  resultadosDe,
  serializarSnapshot,
  type SnapshotRevision,
} from "@/lib/shipping-v2/revision-tecnica-snapshot";
import type { ShippingV2ReceptionChecklistItemLike } from "@/lib/shipping-v2/reception-checklist";
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
import { esIdRegistro, evaluarSerie, evaluarSkuCompartido, nombreUnidad, normalizarSerie, seguimientoDe, seguimientoParaGuardar, siguienteSerieInterna } from "@/lib/shipping-v2/unidades-serie";
import { CAMPO_ESPECIFICACIONES, camposFichaCopiada, evaluarCopiaFicha, resultadosParaCopiar } from "@/lib/shipping-v2/copiar-unidad";
import { camposOriginalTrasSeparar, camposUnidadSeparada, evaluarSepararUnidad } from "@/lib/shipping-v2/separar-unidad";
import { camposArticuloFueraDeCaja, evaluarCancelarCaja } from "@/lib/shipping-v2/cancelar-caja";
import { assertShippingV2GeneratedSchema, SHIPPING_V2_COMPUTER_CATALOG_FIELDS, SHIPPING_V2_COMPUTER_CATALOG_SELECT_OPTIONS, SHIPPING_V2_CONNECTIVITY_CATALOG_FIELDS, SHIPPING_V2_CPU_CATALOG_FIELDS, SHIPPING_V2_CPU_CATALOG_SELECT_OPTIONS, SHIPPING_V2_EXTRA_FEATURES_CATALOG_FIELDS, SHIPPING_V2_FINANCE_FIELDS, SHIPPING_V2_FINANCE_SELECT_OPTIONS, SHIPPING_V2_ITEM_FIELDS, SHIPPING_V2_ITEM_SELECT_OPTIONS, SHIPPING_V2_PACKING_FIELDS, SHIPPING_V2_PACKING_SELECT_OPTIONS, SHIPPING_V2_PAYMENT_FIELDS, SHIPPING_V2_PAYMENT_SELECT_OPTIONS, SHIPPING_V2_PORTS_CATALOG_FIELDS, SHIPPING_V2_PROVIDER_FIELDS, SHIPPING_V2_TABLES } from "@/lib/shipping-v2/schema.generated";
import { calculateShippingV2BatteryState, shippingV2CategoryDoesNotUseScreenOrBattery, shippingV2CategoryHasBattery } from "@/lib/shipping-v2/technical-sheet";
import { fetchCuentaPorNombre, fetchCuentaPorNombreNormalizado } from "@/lib/finanzas/cuentas";
import { anularMovimiento, crearMovimiento } from "@/lib/finanzas/movimientos";
import {
  ACCION_CHECKLIST_CANAL,
  CANALES_PUBLICACION,
  TITULO_MAX,
  datosUnidadDeItem,
  escribirAccesorios,
  leerAccesorios,
  nombrePublicacion,
  revisarAnuncios,
  unidadViva,
  unidadesCubiertas,
  type AlcancePublicacion,
  type AnuncioPendiente,
  type UnidadParaRevisar,
  type CanalPublicacion,
  type DatosTienda,
  type DatosUnidadAnuncio,
  type EstadoPublicacion,
  type GestorPublicacionesDatos,
  type PlantillaPublicacion,
  type Publicacion,
} from "@/lib/shipping-v2/publicaciones";
import { iaAnunciosDisponible } from "@/lib/shipping-v2/ia-anuncios-servidor";
import {
  diferenciaCuadre,
  estadoTrasCuadre,
  planCuadre,
  TEXTO_CAUSA,
  type CausaCuadre,
  type DatosCuadre,
} from "@/lib/shipping-v2/cuadre";
import {
  agruparProductos,
  normalSku,
  registroEnTienda,
  planFusion,
  sugerirPrincipal,
  type ProductoFusion,
  type RegistroFusion,
} from "@/lib/shipping-v2/fusion";
import {
  compararConteo,
  entraEnConteo,
  esUnidad,
  fotoInicial,
  MOTIVO_AJUSTE,
  planAjustes,
  type AccionAjuste,
  type AlcanceConteo,
  type DecisionAjuste,
  type FotoConteo,
  type ItemConteo,
  type LineaConteo,
} from "@/lib/shipping-v2/conteo";
import {
  TIPOS_ASUNTO,
  detectarAsuntos,
  planSincronizacion,
  type AsuntoDetectado,
  type DatosRevision,
  type EstadoAsunto,
  type LineaVenta,
  type TipoAsunto,
} from "@/lib/shipping-v2/revision-inventario";
import { CAMPOS_ITEM, confirmacionValida, detectarVinculosDesconocidos, evaluarEliminacion, type ContextoEliminacion, type EvaluacionEliminacion } from "@/lib/shipping-v2/eliminar-item";

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
  // Tamaño original en bytes. Opcional porque las fotos de Items no lo usan,
  // pero las evidencias de novedades sí: el tope de un video (25 MB) es
  // distinto al de una foto (10 MB) y el servidor revalida el lote completo
  // sin confiar en lo que dijo el navegador.
  sizeBytes?: number;
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
  // Punto 9b: el comprobante es opcional; sin él el pago queda "Sin comprobante".

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
    costoMejoras: null,
    fleteAsignadoRegistro: null,
    arancelAsignadoRegistro: null,
    otrosCostosAsignadosRegistro: null,
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

function canAccessNovedad(novedad: ShippingV2Novedad, access?: ShippingV2AccessContext) {
  if (!access) return false;
  if (access.isAdmin) return true;
  if (!access.providerId) return false;
  // Punto 8: un proveedor solo ve lo que se le RECLAMA a él. Los asuntos
  // internos de la tienda (aunque sean de sus artículos) no se le muestran.
  if (!esResponsableProveedor(novedad.responsable)) return false;
  return novedad.proveedorResponsableIds.includes(access.providerId) || novedad.proveedorResponsableId === access.providerId;
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
  // "Rol general del item" (tipoItem) ya no se pregunta (punto 2, oct-2026).
  void tipoItem;
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
 *                a proveedor" arranca en "Registrado" (punto 9: el pago se ve aparte).
 *  · "edicion" → el estado NO se toca. La regla devuelve siempre el estado
 *                INICIAL del tipo de operación, así que aplicarla a un artículo
 *                que ya avanzó lo mandaría hacia atrás: uno "Disponible" o
 *                "Vendido" volvería a "Pendiente de pago" solo por corregirle
 *                el nombre. El ciclo de vida lo mueven los pasos del flujo
 *                (pago, packing, recepción, firma de inspección), no una
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
    [F.requiereInspeccion]: Boolean(input.requiereInspeccion),
    [F.skuProveedor]: normalizeSku(cleanString(input.skuProveedor)),
    [F.modelo]: cleanString(input.modelo),
    [F.marca]: cleanString(input.marca),
    [F.numeroSerie]: cleanString(input.numeroSerie),
    [F.seguimiento]: seguimientoParaGuardar(input.seguimiento),
    [F.condicion]: cleanString(input.condicion),
    [F.cantidad]: input.cantidad ?? undefined,
    [F.unidad]: cleanString(input.unidad),
    [F.costoProveedor]: input.costoProveedor ?? undefined,
    [F.precioVentaSugerido]: input.precioVentaSugerido ?? undefined,
    [F.precioVentaFinal]: input.precioVenta ?? undefined,
    [F.ubicacionActual]: cleanString(input.ubicacionActual),
    [F.trackingDirecto]: cleanString(input.trackingDirecto),
    [F.trackingHaciaIntermediario]: cleanString(input.trackingHaciaIntermediario),
    [F.trackingDesdeIntermediario]: cleanString(input.trackingDesdeIntermediario),
    [F.origenArticulo]: cleanString(input.origenArticulo),
    [F.transportistaOrigen]: cleanString(input.transportistaOrigenId) ? [cleanString(input.transportistaOrigenId)] : undefined,
    [F.transportistaEcuador]: cleanString(input.transportistaEcuadorId) ? [cleanString(input.transportistaEcuadorId)] : undefined,
    [F.fotos]: input.fotos?.map(keptAttachmentPayload),
    [F.observacionesInternas]: cleanString(input.observacionesInternas),
    [F.observacionVenta]: cleanString(input.observacionVenta),
    [F.estadoRevision]: cleanString(input.estadoRevision),
    [F.estadoTriangulacion]: cleanString(input.estadoTriangulacion),
    [F.estadoDespiece]: cleanString(input.estadoDespiece),
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
  // Selección múltiple desde el 4-oct-2026 (Software, Hardware, Logístico, Otro).
  const tiposProveedor = stringArray(f[F.tipoProveedor]);
  const tipoProveedor = tiposProveedor.join(", ");

  return {
    id: record.id,
    createdTime: record.createdTime,
    proveedorId,
    label,
    nombre: nombre || label,
    estado: firstString(f[F.estado] ?? f.Estado, "Activo"),
    tipoProveedor,
    tiposProveedor,
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
    // El origen ya no sale de "Tipo de proveedor" (que dejó de tener USA/Local).
    pais: firstString(f.Pais ?? f["País"] ?? f[F.paisZonaLogistica]),
    paisZonaLogistica: firstString(f[F.paisZonaLogistica] ?? f["País / zona logística"]),
    urlRastreo: firstString(f[F.urlRastreo] ?? f["URL rastreo"]),
    plantillaUrlRastreo: firstString(f[F.plantillaUrlRastreo] ?? f["Plantilla URL rastreo"]),
    website: firstString(f["Website proveedor"] ?? f.Website ?? f["Sitio web"] ?? f["Página web"]),
    pieFactura: firstString(f["Pie factura"]),
    logoProveedor: mapAttachments(f["Logo proveedor"] ?? f.Logo),
    permiteRastreoWeb: firstBoolean(f[F.permiteRastreoWeb] ?? f["Permite rastreo web"]),
    notasRastreo: firstString(f[F.notasRastreo] ?? f["Notas de rastreo"]),
    esCasillero: firstBoolean(f[F.esCasillero]),
    disenoFactura: firstString(f["Diseño de factura"]),
    nombreComercialFactura: firstString(f["Nombre comercial (factura)"]),
    esloganFactura: firstString(f["Eslogan (factura)"]),
    datosEmpresaFactura: firstString(f["Datos de empresa (factura)"]),
    columnasImportacion: limpiarColumnasRecordadas(f[CAMPO_COLUMNAS_IMPORTACION]),
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
  // "Packing relacionado" (F.packingRelacionado) es texto libre legacy, casi
  // siempre vacío en datos reales — el link de verdad, auto-mantenido por
  // Airtable como reverso de "Items incluidos" en Shipping Packings, es
  // "Shipping Packings". Se prioriza ese; el texto legacy queda de respaldo
  // por si algún registro viejo todavía lo trae.
  const packingRelacionado = f[F.packingRelacionado];
  const packingLinkIds = linkedRecordIds(f["Shipping Packings"]);
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
    seguimiento: firstString(f[F.seguimiento]) || undefined,
    accesoriosIncluidos: firstString(f[F.accesoriosIncluidos]) || undefined,
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
    costoMejoras: firstNumber(f["Costo de mejoras"]),
    unidadesDadasDeBaja: firstNumber(f["Unidades dadas de baja"]),
    unidadesEnPacking: firstNumber(f[F.unidadesEnPacking]),
    unidadesCompradas: firstNumber(f[F.unidadesCompradas]),
    ordenCompraId: linkedRecordIds(f[F.ordenCompra])[0] || undefined,
    fleteAsignadoRegistro: firstNumber(f[F.fleteAsignadoRegistro]),
    arancelAsignadoRegistro: firstNumber(f[F.arancelAsignadoRegistro]),
    otrosCostosAsignadosRegistro: firstNumber(f[F.otrosCostosAsignadosRegistro]),
    costoTotalEstimado: firstNumber(f["Costo total estimado"] ?? f["Costo Total Estimado"]),
    precioVentaSugerido: firstNumber(f[F.precioVentaSugerido]),
    precioVenta: firstNumber(f[F.precioVentaFinal]),
    qty: firstNumber(f[F.cantidad]),
    disponibleVenta: firstBoolean(f[F.disponibleVenta]),
    reservado: firstBoolean(f[F.reservado]),
    cantidadReservada: firstNumber(f[F.cantidadReservada]),
    usoLocal: firstBoolean(f[F.esUsoLocal]),
    esRepuesto: firstBoolean(f[F.esRepuesto]),
    esRegalo: firstBoolean(f[F.esRegalo]),
    conNovedad: firstBoolean(f["Con novedad"] ?? f.Novedad ?? f.Novedades),
    recibido: firstBoolean(f[F.recibido]),
    requiereInspeccion: firstBoolean(f[F.requiereInspeccion]),
    operacionComercialId: linkedRecordIds(f[SHIPPING_V2_ITEM_SOURCE_FIELDS.operacionComercial])[0] || undefined,
    revisadoFisicamente: firstBoolean(f["Revisado física/técnicamente"]),
    revisadoPor: firstString(f["Revisado por"]),
    fechaRevision: firstString(f["Fecha revisión"]),
    revisionTecnicaDetalle: firstString(f["Revisión técnica detalle"]),
    puntosRevisionFallidos: firstNumber(f["Puntos de revisión fallidos"]),
    especificacionesTecnicas: firstString(f["Especificaciones técnicas"]),
    resumenTecnico: firstString(f["Resumen técnico"]),
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
      // Por nombre literal: el generador de schema tiene una lista fija de
      // claves y estos dos campos no están en ella.
      almacenamiento2: firstString(f["Almacenamiento 2"]),
      almacenamiento2Tipo: firstString(f["Almacenamiento 2 tipo"]),
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
    origenArticulo: firstString(f[F.origenArticulo]) || undefined,
    transportistaOrigenId: linkedRecordIds(f[F.transportistaOrigen])[0] || undefined,
    transportistaEcuadorId: linkedRecordIds(f[F.transportistaEcuador])[0] || undefined,
    requierePacking: firstBoolean(f[F.requierePacking]),
    pagoV2ItemIds,
    pagoV2RegaloIds,
    packingId: firstString(packingLinkIds) || firstString(packingRelacionado) || undefined,
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
    unidadesCompradas: item.unidadesCompradas ?? null,
    unidadesEnPacking: item.unidadesEnPacking,
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
    orden: firstString(f[F.orden]),
    ordenCompraId: linkedRecordIds(f[F.ordenCompra])[0] || undefined,
    concepto: conceptoDePago(firstString(f[F.concepto])),
    packingLogisticaIds: linkedRecordIds(f[F.packingLogistica]),
    itemLogisticaIds: linkedRecordIds(f[F.itemLogistica]),
    pagadoA: firstString(f[F.pagadoA]),
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
    conNovedad: normalizeStatus(estado).includes("novedad") || ["perdido en tienda", "extraviado"].includes(normalizeStatus(estado)),
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
    prioridad: firstString(f.Prioridad),
    responsable: firstString(f["Responsable de solución"]),
    mensajeProveedor: firstString(f["Mensaje enviado al proveedor"]),
    fechaEnviadaProveedor: firstString(f["Fecha enviada a proveedor"]),
    fechaRespuestaProveedor: firstString(f["Fecha de respuesta del proveedor"]),
    montoReclamado: firstNumber(f["Monto reclamado"]),
    montoRecuperado: firstNumber(f["Monto recuperado"]),
    comprobanteSolucion: mapAttachments(f["Comprobante de solución"]),
    ultimaActualizacion: firstString(f["Última actualización"]),
    actualizadoPor: firstString(f["Actualizado por"]),
    bloqueaVenta: firstBoolean(f["Bloquea venta"]) === true,
    decision: firstString(f["Decisión sobre el artículo"]),
    ventaDesbloqueadaPor: firstString(f["Venta desbloqueada por"]),
    fechaDesbloqueo: firstString(f["Fecha de desbloqueo"]),
    estadoPrevioArticulo: firstString(f["Estado previo del artículo"]),
    comoAparecio: firstString(f["Cómo apareció"]),
    cantidadAfectada: firstNumber(f["Cantidad afectada"]),
    precioConDescuento: firstNumber(f["Precio con descuento"]),
    valorPerdida: firstNumber(f["Valor de la pérdida"]),
    perdidaPorDistribuir: firstBoolean(f["Pérdida por distribuir"]) === true,
  };
}

export async function getShippingV2Proveedores() {
  const records = await listRecords(SHIPPING_V2_TABLES.proveedores, { maxRecords: 100 });
  return records.map(mapProveedor);
}

export async function getShippingV2AccessContextForSession(session: StaffSession | null): Promise<ShippingV2AccessContext> {
  const role = session?.user.rol;
  // isSiteAdmin: el ÚNICO lugar del módulo que sabe si la sesión es
  // realmente el rol "Administrador" del sistema — no "staff interno"
  // (isAdmin ya significa eso, para todo lo demás). Reservado para acciones
  // que deben quedar fuera del alcance de cualquier otro staff, como
  // reabrir un packing cerrado.
  const isSiteAdmin = Boolean(session && isAdministratorRole(role));

  if (!session || isAdministratorRole(role) || ["manager", "gerente"].includes(normalizeStatus(role || ""))) {
    return session ? { ...staffShippingV2Access(), isSiteAdmin } : noShippingV2Access();
  }

  const email = session.user.email.trim().toLowerCase();
  const roleIsProvider = isProviderRole(role);
  if (!email) return roleIsProvider ? noShippingV2Access() : { ...staffShippingV2Access(), isSiteAdmin };

  const proveedores = await getShippingV2Proveedores();
  const provider = proveedores.find((item) => item.email?.trim().toLowerCase() === email);

  // Assumption: the current Staff session does not store a provider record id.
  // Provider access is derived from a Shipping Proveedor email match plus either
  // the user role "Proveedor" or the provider portal-access checkbox.
  if (provider && (roleIsProvider || provider.permiteAccesoPortalProveedor === true)) {
    return providerShippingV2Access(provider);
  }

  return roleIsProvider ? noShippingV2Access() : { ...staffShippingV2Access(), isSiteAdmin };
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
  return loadShippingV2Items(options, 200);
}

// Pagos necesita todos los artículos: limitar por antigüedad antes de filtrar
// pendientes puede ocultar compras y generar pagos incompletos de un packing.
// Sin maxRecords, listRecords recorre todas las páginas de Airtable.
async function getShippingV2PaymentItems(options: MapItemOptions = {}) {
  return loadShippingV2Items(options);
}

async function loadShippingV2Items(options: MapItemOptions, maxRecords?: number) {
  const proveedoresPromise = options.proveedores ? Promise.resolve(options.proveedores) : getShippingV2Proveedores();
  const [records, proveedores] = await Promise.all([
    listRecords(SHIPPING_V2_TABLES.items, {
      maxRecords,
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

/**
 * Items para la pantalla de Recepción. SIN techo de registros.
 *
 * getShippingV2Items trae como mucho los 200 más recientes por Fecha de
 * registro. Con 570 artículos en la base, esa ventana solo llegaba hasta el
 * 2026-07-28: todo lo anterior desaparecía de Recepción en silencio, sin
 * ningún aviso. Los 10 artículos de PK-20260610-47604 (junio) eran
 * invisibles, así que el packing no se podía revisar ni cerrar.
 *
 * Recepción es una bandeja de trabajo: si un artículo pendiente no sale en la
 * lista, el trabajo no se puede hacer. Aquí la completitud importa más que la
 * latencia, así que se pagina la tabla entera (≈6 peticiones para 570
 * registros, con el reintento por rate limit que ya tiene airtableRequest).
 * El filtro de visibilidad real lo sigue aplicando
 * shouldShowShippingV2ReceptionItem en la página.
 *
 * El tope de 5000 es solo un freno de seguridad para que esto no pueda
 * dispararse si la tabla crece de forma inesperada.
 */
//
// Velocidad (15-oct-2026, "Recepción demora mucho en cargar"): antes se leía
// la tabla ENTERA (789 artículos = 8 lecturas de 100, una detrás de otra) y
// luego se descartaba casi la mitad. Ahora Airtable devuelve solo lo que
// podría verse en Recepción (formulaRecepcionAirtable, el mismo criterio que
// shouldShowShippingV2ReceptionItem, que se sigue aplicando en la página) y
// se lee en 4 partes EN PARALELO, repartidas por el código del registro: con
// ~400 artículos visibles son ~4 lecturas simultáneas de una sola página.
const PARTES_RECEPCION = ["^rec[0-9A-F]", "^rec[G-V]", "^rec[W-Za-k]", "^rec[l-z]"];

export async function getShippingV2ReceptionItems(options: MapItemOptions = {}) {
  const proveedoresPromise = options.proveedores ? Promise.resolve(options.proveedores) : getShippingV2Proveedores();
  const F = SHIPPING_V2_ITEM_FIELDS;
  const condicion = formulaRecepcionAirtable({
    estado: F.estadoItem,
    revision: F.estadoRevision,
    recibido: F.recibido,
    operacionComercial: SHIPPING_V2_ITEM_SOURCE_FIELDS.operacionComercial,
    modoLogistico: F.modoLogistico,
    publicaciones: ["Fotos tomadas", "Shopify publicado", "Marketplace publicado", "Mercado Libre publicado", "Grupos Facebook publicado", SHIPPING_V2_FACEBOOK_SUPER_GEEK_FIELD],
  }, {
    estados: SHIPPING_V2_ITEM_SELECT_OPTIONS.estadoItem,
    revisiones: SHIPPING_V2_ITEM_SELECT_OPTIONS.estadoRevision,
    modos: SHIPPING_V2_ITEM_SELECT_OPTIONS.modoLogistico,
  });
  const [partes, proveedores] = await Promise.all([
    Promise.all(PARTES_RECEPCION.map((parte) => listRecords(SHIPPING_V2_TABLES.items, {
      maxRecords: 5000,
      filterByFormula: `AND(${condicion},REGEX_MATCH(RECORD_ID(),'${parte}'))`,
    }))).catch((error) => {
      // Red de seguridad: si Airtable rechazara la condición, Recepción no se
      // cae; se lee la tabla entera como antes (más lento, mismo resultado).
      console.error("Recepción: la lectura filtrada falló; se lee la tabla entera.", error);
      return listRecords(SHIPPING_V2_TABLES.items, { maxRecords: 5000 }).then((todos) => [todos]);
    }),
    proveedoresPromise,
  ]);
  const records = partes.flat();
  const labelsById = createShippingV2ProveedorLabelMap(proveedores);
  return records
    .map((record) => mapItem(record, options))
    .map((item) => applyItemProviderLabels(item, labelsById))
    .filter((item) => canAccessItem(item, options.access))
    .map((item) => sanitizeShippingV2ItemForAccess(item, options.access, options))
    .sort(compareShippingV2ItemListOrder);
}

/**
 * Punto 4 (8-oct): la pestaña Artículos es solo mercadería. Los activos de la
 * tienda ("Es uso local") tienen su propia pestaña.
 */
const FORMULA_SOLO_MERCADERIA = `NOT({${SHIPPING_V2_ITEM_FIELDS.esUsoLocal}})`;

/** Pestaña "Activos de la tienda": todos los activos (sin tope de 200). */
export async function getShippingV2Activos(access?: ShippingV2AccessContext): Promise<ShippingV2Item[]> {
  assertShippingV2Permission(access, "canViewItems", "No tienes acceso a los artículos.");
  if (access && !access.isAdmin) return []; // un proveedor externo no ve activos de la tienda
  const [records, proveedores] = await Promise.all([
    listRecords(SHIPPING_V2_TABLES.items, {
      pageSize: 100,
      maxRecords: 5000,
      filterByFormula: `{${SHIPPING_V2_ITEM_FIELDS.esUsoLocal}}`,
      sortField: SHIPPING_V2_ITEM_FIELDS.fechaRegistro,
      sortDirection: "desc",
    }),
    getShippingV2Proveedores(),
  ]);
  const labelsById = createShippingV2ProveedorLabelMap(proveedores);
  return records
    .map((record) => mapItem(record, { includeAiName: false }))
    .map((item) => applyItemProviderLabels(item, labelsById))
    .map((item) => sanitizeShippingV2ItemForAccess(item, access));
}

export async function getShippingV2ItemsPage(options: MapItemOptions & {
  pageSize?: number;
  offset?: string | null;
  sortBy?: ShippingV2ItemsListSortKey;
  /** Rediseño 15-oct-2026: filtro y búsqueda sobre TODO el inventario (ver items-filtro.ts). */
  filtro?: FiltroArticulos;
} = {}) {
  const pageSize = Math.min(Math.max(Math.trunc(options.pageSize ?? 100), 1), 100);
  const sort = getShippingV2ItemsListSort(options.sortBy);

  // El filtro por proveedor necesita su etiqueta ("eBay-Hardware"), que es lo
  // que Airtable ve en el vínculo; solo entonces se leen antes los proveedores.
  const proveedoresConocidos = options.proveedores ?? (options.filtro?.proveedor ? await getShippingV2Proveedores() : undefined);
  const proveedorEtiqueta = options.filtro?.proveedor
    ? proveedoresConocidos?.find((proveedor) => proveedor.id === options.filtro?.proveedor)?.proveedorId || undefined
    : undefined;
  const condicionFiltro = options.filtro ? formulaFiltroArticulos(options.filtro, { proveedorEtiqueta }) : "";
  const formula = condicionFiltro ? `AND(${FORMULA_SOLO_MERCADERIA},${condicionFiltro})` : FORMULA_SOLO_MERCADERIA;

  if (options.access && !options.access.isAdmin) {
    const proveedoresPromise = proveedoresConocidos ? Promise.resolve(proveedoresConocidos) : getShippingV2Proveedores();
    const [records, proveedores] = await Promise.all([
      listRecords(SHIPPING_V2_TABLES.items, {
        maxRecords: 200,
        sortField: sort.sortField,
        sortDirection: sort.sortDirection,
        filterByFormula: formula,
      }),
      proveedoresPromise,
    ]);
    const labelsById = createShippingV2ProveedorLabelMap(proveedores);

    return {
      items: await adjuntarSituacionPago(records
        .map((record) => mapItem(record, options))
        .map((item) => applyItemProviderLabels(item, labelsById))
        .filter((item) => canAccessItem(item, options.access))
        .map((item) => sanitizeShippingV2ItemForAccess(item, options.access, options))),
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
      filterByFormula: formula,
    }),
    proveedoresConocidos ? Promise.resolve(proveedoresConocidos) : getShippingV2Proveedores(),
  ]);
  const labelsById = createShippingV2ProveedorLabelMap(proveedores);

  return {
    items: await adjuntarSituacionPago(page.records
      .map((record) => mapItem(record, options))
      .map((item) => applyItemProviderLabels(item, labelsById))
      .filter((item) => canAccessItem(item, options.access))
      .map((item) => sanitizeShippingV2ItemForAccess(item, options.access, options))),
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
  if (input.disponibleVenta) return "Reservable";
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
    categoria: firstString(f[F.categoria]) || undefined,
    marca: firstString(f[F.marca]) || undefined,
    modelo: firstString(f[F.modelo]) || undefined,
    numeroSerie: firstString(f[F.numeroSerie]) || undefined,
    condicion: firstString(f[F.condicion]) || undefined,
    skusAnteriores: lineasTexto(f[CAMPO_SKUS_ANTERIORES]).join(" ") || undefined,
    seguimiento: firstString(f[F.seguimiento]) || undefined,
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
      F.categoria,
      F.marca,
      F.modelo,
      F.numeroSerie,
      F.condicion,
      CAMPO_SKUS_ANTERIORES,
      F.seguimiento,
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
        // El buscador es de Artículos (mercadería): los activos van aparte.
        filterByFormula: FORMULA_SOLO_MERCADERIA,
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

/**
 * Punto 10b (17-oct): la serie identifica a un equipo, así que no se repite en
 * todo el inventario. Devuelve la serie limpia para guardarla, o falla con un
 * mensaje que dice quién ya la tiene.
 */
async function validarSerieParaGuardar(valor: string, itemIdPropio?: string): Promise<string> {
  const serie = normalizarSerie(valor);
  const buscar = serie.replace(/'/g, "");
  const otros = buscar
    ? await listRecords(SHIPPING_V2_TABLES.items, {
      maxRecords: 3,
      fields: [getOfficialSkuField(), SHIPPING_V2_ITEM_FIELDS.numeroSerie],
      filterByFormula: `UPPER(SUBSTITUTE({${SHIPPING_V2_ITEM_FIELDS.numeroSerie}}," ",""))='${escapeFormulaString(buscar)}'`,
    })
    : [];
  const duenios = new Map(
    otros
      .filter((r) => r.id !== itemIdPropio)
      .map((r) => [normalizarSerie(firstString(r.fields[SHIPPING_V2_ITEM_FIELDS.numeroSerie])), firstString(r.fields[getOfficialSkuField()]) || r.id] as [string, string])
  );
  const evaluacion = evaluarSerie(serie, duenios);
  if (!evaluacion.ok) throw new Error(evaluacion.motivo);
  return evaluacion.serie;
}

/**
 * Punto 10b-4: el registro de una unidad a partir de su dirección
 * (/shipping-v2/items/LAP-000500/u/7HX2KQ3/…). La clave es la serie o, si la
 * unidad todavía no tiene, el id del registro. Si el SKU de la dirección ya no
 * coincide (por ejemplo tras una fusión), igual se encuentra por la serie.
 */
export async function idDeUnidadPorRuta(skuRuta: string, claveRuta: string): Promise<string | null> {
  if (esIdRegistro(claveRuta)) return claveRuta;
  const serie = normalizarSerie(claveRuta).replace(/'/g, "");
  if (!serie) return null;
  const F = SHIPPING_V2_ITEM_FIELDS;
  const registros = await listRecords(SHIPPING_V2_TABLES.items, {
    maxRecords: 5,
    fields: [getOfficialSkuField(), F.numeroSerie],
    filterByFormula: `UPPER(SUBSTITUTE({${F.numeroSerie}}," ",""))='${escapeFormulaString(serie)}'`,
  });
  const sku = normalizeSku(cleanString(skuRuta));
  const mismoSku = registros.find((r) => normalizeSku(firstString(r.fields[getOfficialSkuField()])) === sku);
  return (mismoSku ?? registros[0])?.id ?? null;
}

/**
 * Punto 10b-4: las unidades (y lotes) que comparten el SKU, de la más antigua a
 * la más nueva. Solo datos para ubicarlas; cada una se abre por su propio registro.
 */
export async function getShippingV2UnidadesDelProducto(skuValue: string, access?: ShippingV2AccessContext): Promise<ShippingV2UnidadHermana[]> {
  const sku = normalizeSku(cleanString(skuValue));
  if (!sku) return [];
  const F = SHIPPING_V2_ITEM_FIELDS;
  const registros = await listRecords(SHIPPING_V2_TABLES.items, {
    maxRecords: 100,
    fields: [
      getOfficialSkuField(), F.numeroSerie, F.estadoItem, F.cantidad, F.precioVentaFinal, F.recibido,
      "Revisado física/técnicamente", F.fichaTecnicaGenerada, F.fechaRegistro, F.proveedorCompra, F.proveedorLogistico,
    ],
    filterByFormula: `LOWER({${getOfficialSkuField()}}) = LOWER('${escapeFormulaString(sku)}')`,
  });
  return registros
    .filter((r) => canAccessItemRecord(r, access))
    .map((r) => ({
      id: r.id,
      sku: firstString(r.fields[getOfficialSkuField()]),
      numeroSerie: firstString(r.fields[F.numeroSerie]) || undefined,
      estado: firstString(r.fields[F.estadoItem], "Registrado"),
      cantidad: firstNumber(r.fields[F.cantidad]),
      precioVenta: canShippingV2(access, "canViewCosts") ? firstNumber(r.fields[F.precioVentaFinal]) : null,
      recibido: firstBoolean(r.fields[F.recibido]) === true,
      inspeccionFirmada: firstBoolean(r.fields["Revisado física/técnicamente"]) === true,
      fichaGenerada: firstBoolean(r.fields[F.fichaTecnicaGenerada]) === true,
      fechaRegistro: firstString(r.fields[F.fechaRegistro], r.createdTime) || undefined,
    }))
    .sort((a, b) => (a.fechaRegistro ?? "").localeCompare(b.fechaRegistro ?? "") || a.id.localeCompare(b.id));
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
  // Punto 10c-3: un código absorbido en una fusión no se vuelve a usar (sus
  // etiquetas viejas todavía pueden estar pegadas en la tienda).
  return records
    .flatMap((record) => [firstString(record.fields[getOfficialSkuField()]), ...lineasTexto(record.fields[CAMPO_SKUS_ANTERIORES])])
    .filter(Boolean);
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
  // Punto 10b: otra unidad u otro lote de un producto que ya existe. Ese SKU
  // SÍ se repite a propósito (cada registro guarda sus propios costos).
  const compartido = normalizeSku(cleanString(input.skuCompartido));
  if (compartido) {
    const existente = await findShippingV2ItemBySku(compartido);
    if (!existente) throw new Error(`El producto ${compartido} no existe en Shipping Items.`);
    const motivo = evaluarSkuCompartido(
      { sku: compartido, categoria: existente.categoria, usoLocal: existente.usoLocal },
      { categoria: cleanString(input.categoria), usoLocal: Boolean(input.usoLocal) }
    );
    if (motivo) throw new Error(motivo);
    return compartido;
  }
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

  // Punto 5 (8-oct): "Estado Item", "Estado de revisión" y "Reservado" ya no
  // se editan aquí (son de solo lectura en item-edit-config.ts y el chequeo de
  // arriba los rechaza). La única forma manual es "Corregir estado"
  // (corregirEstadoShippingV2): solo Administrador, con motivo.

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

  // Punto 9b: con "Unidades compradas" el pago ya no depende de la Cantidad
  // actual, así que corregir la Cantidad (conteo de la tienda) no lo altera.
  const cantidadAfectaPago = !(Number(input.item.unidadesCompradas) > 0);
  if (
    ((input.field === SHIPPING_V2_ITEM_FIELDS.cantidad && cantidadAfectaPago) || input.field === SHIPPING_V2_ITEM_FIELDS.costoProveedor) &&
    await itemHasActiveV2PaymentLink(input.item, { ignorarHistoricos: true })
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

  // Cambiar "Requiere inspección" en un artículo que ya llegó mueve su
  // etiqueta igual que en Recepción: si ahora la requiere y no está firmada
  // vuelve a "En revisión"; si ya no la requiere queda "Disponible".
  const inspeccionFlowFields: Record<string, unknown> = {};
  if (field === SHIPPING_V2_ITEM_FIELDS.requiereInspeccion && existing.recibido === true) {
    const requiere = normalizedValue === true;
    const firmada = existing.revisadoFisicamente === true;
    const estadoNuevo = estadoSegunLlegada({ estado: existing.estado, recibido: true, requiereInspeccion: requiere, inspeccionFirmada: firmada, usoLocal: existing.usoLocal, todasReservadas: todasReservadas(existing) });
    if (estadoNuevo) inspeccionFlowFields[SHIPPING_V2_ITEM_FIELDS.estadoItem] = estadoNuevo;
    const pendientes = new Set(["recibido pendiente de revision", "recibido correctamente", "pendiente de recepcion", "no aplica", ""]);
    if (pendientes.has(normalizeStatus(existing.estadoRevision || ""))) {
      inspeccionFlowFields[SHIPPING_V2_ITEM_FIELDS.estadoRevision] = requiere && !firmada ? "Recibido pendiente de revisión" : "Recibido correctamente";
    }
  }

  // Punto 9b: corregir la Cantidad de algo que todavía no está en un pago ni
  // se vendió corrige también lo comprado (fue un error al registrar).
  const compradasActual = Number(existing.unidadesCompradas) || 0;
  const corrigeCompradas =
    field === SHIPPING_V2_ITEM_FIELDS.cantidad &&
    typeof normalizedValue === "number" &&
    normalizedValue > 0 &&
    !paymentLinkedIdsForItem(existing).length &&
    (compradasActual === 0 || compradasActual === Number(existing.cantidad));
  // Punto 10b: la serie se guarda limpia (sin "S/N", en mayúsculas) y no se repite.
  const serieValidada = field === SHIPPING_V2_ITEM_FIELDS.numeroSerie && cleanString(normalizedValue)
    ? await validarSerieParaGuardar(cleanString(normalizedValue), id)
    : null;
  const fields: Record<string, unknown> = {
    [field]: field === getOfficialSkuField() ? normalizeSku(cleanString(normalizedValue)) : serieValidada ?? normalizedValue,
    ...(corrigeCompradas ? { [SHIPPING_V2_ITEM_FIELDS.unidadesCompradas]: normalizedValue } : {}),
    ...logisticsFlowFields,
    ...inspeccionFlowFields,
    [SHIPPING_V2_ITEM_FIELDS.ultimaActualizacion]: new Date().toISOString(),
    [SHIPPING_V2_ITEM_FIELDS.actualizadoPor]: options.actualizadoPor,
  };

  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id, fields }] }),
  });

  const updated = response.records?.[0];
  if (!updated) throw new Error("Airtable no devolvió el item actualizado.");

  let item = mapItem(updated);
  if (existing.packingId && ITEM_FIELDS_QUE_MUEVEN_REPARTO.has(field)) {
    const reparto = await repartirCostosPackingTrasCambio(existing.packingId, options.actualizadoPor, `Cambio de "${config.label}" en ${item.sku}.`);
    if (reparto?.estado === "aplicado") item = await releerItemRecord(id);
  }
  const visibleItem = sanitizeShippingV2ItemForAccess(item, options.access);
  if (shouldLogShippingV2ItemFieldEvent(config)) {
    // Las correcciones que solo puede hacer administración se marcan como tales
    // para poder auditarlas después: son excepciones al flujo, no operación normal.
    const esCorreccionAdmin = esAdmin && config.adminOnly === true;

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
    typecast?: boolean;
  }
) {
  const sku = await resolveOfficialSkuForCreate(input);
  // Punto 10b: la serie, si viene, se guarda limpia y no se repite.
  if (cleanString(input.numeroSerie)) {
    input = { ...input, numeroSerie: await validarSerieParaGuardar(cleanString(input.numeroSerie)) };
  }
  const fields = getItemFields(input, {
    [getOfficialSkuField()]: sku,
    [SHIPPING_V2_ITEM_FIELDS.metodoAsignacionSku]: undefined,
    // Punto 9b: lo que se compró queda fijo; el pago se calcula con esto.
    [SHIPPING_V2_ITEM_FIELDS.unidadesCompradas]: typeof input.cantidad === "number" && input.cantidad > 0 ? input.cantidad : undefined,
    ...options.extraFields,
    [SHIPPING_V2_ITEM_FIELDS.fechaRegistro]: new Date().toISOString(),
    [SHIPPING_V2_ITEM_FIELDS.registradoPor]: options.registradoPor,
  });

  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }], ...(options.typecast ? { typecast: true } : {}) }),
  });

  const created = response.records?.[0];
  if (!created) throw new Error("Airtable no devolvió el item creado.");

  // Segunda capa de la unicidad del SKU: el turno de arriba no cruza
  // instancias del servidor, así que se confirma releyendo. No aplica a otra
  // unidad o lote de un producto que ya existe (punto 10b).
  if (!cleanString(input.skuCompartido)) await verificarSkuUnicoTrasCrear(sku, created.id);

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

export async function createShippingV2Item(input: ShippingV2ItemWriteInput, options: { registradoPor: string; ordenCompraId?: string }) {
  const calculatedInput = completarAltaSegunLlegada(applyCalculatedItemFlow(prepararAltaSegunOrigen(input)));
  const normalizedInput = normalizeShippingV2ItemMoneyQuantityInput(calculatedInput.input, { mode: "create" });
  validateItemInput(normalizedInput);
  // Punto 10b: una UNIDAD es un solo equipo (cantidad 1, con su serie).
  if (seguimientoParaGuardar(normalizedInput.seguimiento) === "Unidad" && typeof normalizedInput.cantidad === "number" && normalizedInput.cantidad !== 1) {
    throw new Error("Una unidad es un solo equipo (cantidad 1): cada equipo se registra con su serie.");
  }
  await validateItemProviderRules(normalizedInput);
  // Punto 9d: desde "Registrar compra" el artículo nace dentro de su orden.
  const ordenCompraId = cleanString(options.ordenCompraId);
  const orden = ordenCompraId ? await ordenParaArticuloNuevo(ordenCompraId, normalizedInput) : null;

  return createShippingV2ItemRecord(normalizedInput, {
    registradoPor: options.registradoPor,
    extraFields: {
      ...calculatedInput.extraFields,
      ...(orden ? { [SHIPPING_V2_ITEM_FIELDS.ordenCompra]: [orden.id] } : {}),
    },
    eventDescription: orden ? `Artículo creado en la orden de compra ${orden.ocId} desde Portal Staff.` : undefined,
  });
}

/**
 * Auditoría Shipping V2, punto 2 (oct-2026) — "¿Dónde está el artículo?".
 *
 * Si el formulario manda el origen, los campos heredados "Modo logístico" y
 * "Requiere packing" salen de él (ya no se preguntan), el tipo de operación
 * se valida contra la tabla del dueño y se limpian los rastreos que no
 * corresponden al origen. Sin origen (otros llamadores) no cambia nada.
 */
function prepararAltaSegunOrigen(input: ShippingV2ItemWriteInput): ShippingV2ItemWriteInput {
  const origen = normalizarOrigen(input.origenArticulo);
  if (!origen) return input;
  if (!tipoOperacionPermitido(origen, input.tipoOperacion)) {
    throw new Error(`"${cleanString(input.tipoOperacion) || "Sin tipo"}" no aplica a un artículo con origen "${origen}".`);
  }
  const { modoLogistico, requierePacking } = modoLogisticoSegunOrigen(origen, Boolean(cleanString(input.packingDestinoId)));
  const extranjero = origen === "Proveedor extranjero";
  const local = origen === "Proveedor local";
  return {
    ...input,
    origenArticulo: origen,
    modoLogistico,
    requierePacking,
    // Casillero solo para lo extranjero.
    proveedorLogisticoId: extranjero ? input.proveedorLogisticoId : "",
    // Extranjero: tramo origen (→ casillero) y tramo Ecuador. Local: un solo rastreo.
    trackingHaciaIntermediario: extranjero ? input.trackingHaciaIntermediario : "",
    trackingDesdeIntermediario: extranjero ? input.trackingDesdeIntermediario : "",
    transportistaOrigenId: extranjero ? input.transportistaOrigenId : "",
    trackingDirecto: local ? input.trackingDirecto : "",
    transportistaEcuadorId: extranjero || local ? input.transportistaEcuadorId : "",
  };
}

/**
 * Auditoría Shipping V2, punto 1 (oct-2026) — tres cosas al dar de alta:
 *
 *  1. "Requiere inspección": lo que eligió quien registra, o el valor por
 *     defecto de la categoría.
 *  2. Lo que no viaja (modo logístico "No aplica": reajuste, uso local,
 *     despiece…) ya está en la tienda: nace con "Recibido" marcado y su
 *     etiqueta sale de la misma regla que en Recepción. Esto es provisional
 *     hasta que el formulario pregunte "¿Dónde está el artículo?" (etapa 2).
 *  3. "Disponible para venta" (= se puede reservar) lo calcula el sistema:
 *     todo artículo es reservable desde que nace, salvo que esté bloqueado.
 */
function completarAltaSegunLlegada(input: ShippingV2ItemWriteInput): {
  input: ShippingV2ItemWriteInput;
  extraFields: Record<string, unknown>;
} {
  // Un activo de la tienda no pide inspección salvo que se marque (punto 4).
  const requiereInspeccion = typeof input.requiereInspeccion === "boolean"
    ? input.requiereInspeccion
    : input.usoLocal === true
      ? false
      : requiereInspeccionPorDefecto({ categoria: input.categoria, tipoOperacion: input.tipoOperacion });
  const origen = normalizarOrigen(input.origenArticulo);
  const yaEnTienda = origen ? origen === ORIGEN_TIENDA : cleanString(input.modoLogistico) === "No aplica";
  const extraFields: Record<string, unknown> = {};
  let estado = input.estado;
  let estadoRevision = input.estadoRevision;
  let requierePacking = input.requierePacking;
  let modoLogistico = input.modoLogistico;
  if (origen) {
    // El origen manda sobre lo que calculó el tipo de operación (una "Compra a
    // proveedor" que ya está en la tienda no requiere packing).
    ({ modoLogistico, requierePacking } = modoLogisticoSegunOrigen(origen, Boolean(cleanString(input.packingDestinoId))));
  }
  if (yaEnTienda) {
    extraFields[SHIPPING_V2_ITEM_FIELDS.recibido] = true;
    estadoRevision = requiereInspeccion ? "Recibido pendiente de revisión" : "Recibido correctamente";
    estado = estadoSegunLlegada({ estado, recibido: true, requiereInspeccion, inspeccionFirmada: false, usoLocal: input.usoLocal }) ?? estado;
  } else if (origen && vieneDeAfuera(origen)) {
    // Viene en camino: espera recepción (Recepción → "Por llegar"). Antes
    // nacía "No aplica" y nunca aparecía en Recepción (C-2: LAP-000110).
    estadoRevision = "Pendiente de recepción";
    const tieneRastreo = Boolean(
      cleanString(input.trackingHaciaIntermediario) || cleanString(input.trackingDesdeIntermediario) || cleanString(input.trackingDirecto)
    );
    if (tieneRastreo && !cleanString(input.packingDestinoId)) {
      estado = estadoAlPonerRastreo({ estado, recibido: false }) ?? estado;
    }
  }
  const cantidad = typeof input.cantidad === "number" && input.cantidad > 0 ? input.cantidad : 1;
  const disponibleVenta = calcularDisponibleVenta({
    estado,
    estadoRevision,
    usoLocal: input.usoLocal,
    unidadesLibres: input.reservado === true ? 0 : cantidad,
  });
  return {
    input: { ...input, requiereInspeccion, estado, estadoRevision, disponibleVenta, requierePacking, modoLogistico },
    extraFields,
  };
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
    /**
     * Repuesto BAJO PEDIDO cotizado desde el presupuesto de una orden de
     * reparación. A diferencia del pedido clásico de Operaciones (que nace
     * como "Compra ya pagada"), este nace como compra PENDIENTE de pago al
     * proveedor —aparece en /shipping-v2/pagos— y pendiente de recepción —
     * aparece en /shipping-v2/recepcion hasta que alguien marque "Recibido".
     * Mientras no llegue, la orden no se puede facturar (ver
     * evaluarItemNoListo en lib/facturacion/gancho/construccion.ts).
     */
    desdePresupuesto?: boolean;
    /**
     * Unidades compradas al proveedor y cuántas son del cliente
     * (lib/operaciones/pedido.ts). Vacío = 1 y 1 (comportamiento anterior).
     * Las que sobran quedan libres para stock.
     */
    cantidad?: number;
    cantidadReservada?: number;
    /** true = viaja en un packing ("Pendiente de packing"); false = tracking directo. */
    requierePacking?: boolean;
  },
  options: { registradoPor: string }
) {
  const operacionId = cleanString(input.operacionId);
  const opcionId = cleanString(input.opcionId);
  if (!operacionId) throw new Error("Operación Comercial inválida para crear Shipping Item.");
  if (!opcionId) throw new Error("Opción origen inválida para crear Shipping Item.");

  const proveedorId = cleanString(input.proveedorId);
  if (proveedorId) await validateItemProviderRules({ proveedorId });

  // Punto 2 (oct-2026): el pedido viene en camino; local o extranjero según el
  // país del proveedor, y lo extranjero llega por el casillero por defecto.
  const proveedoresTodos = await getShippingV2Proveedores();
  const proveedorPedido = proveedoresTodos.find((p) => p.id === proveedorId);
  const origenPedido = origenSegunZona(proveedorPedido?.paisZonaLogistica);
  const casilleroPorDefecto = proveedoresTodos.find((p) => p.esCasillero === true && normalizeStatus(p.estado || "") === "activo");

  const nombre = cleanString(input.nombre) || "Artículo sin nombre";
  const precioVenta = input.precioVenta ?? null;
  const cantidad = Number.isInteger(input.cantidad) && (input.cantidad ?? 0) > 0 ? (input.cantidad as number) : 1;
  const cantidadReservada = Math.min(
    cantidad,
    Number.isInteger(input.cantidadReservada) && (input.cantidadReservada ?? 0) > 0 ? (input.cantidadReservada as number) : cantidad
  );

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
    // Punto 2 (oct-2026, aprobado por el dueño): todo pedido nace "Compra a
    // proveedor" pendiente de pago, para que el pago al proveedor se registre
    // en Pagos. Antes los pedidos de Operaciones nacían "Compra ya pagada" y
    // ese pago nunca quedaba registrado en Shipping V2.
    tipoOperacion: "Compra a proveedor",
    origenArticulo: origenPedido,
    proveedorLogisticoId: origenPedido === "Proveedor extranjero" ? casilleroPorDefecto?.id : undefined,
    // "Rol general" describe qué es la pieza dentro de un equipo, no cómo se
    // vende. Un pedido especial para un cliente es un artículo por derecho
    // propio, no una parte: "Equipo completo" es lo correcto salvo que la
    // categoría diga que es un repuesto. Lo que viene del presupuesto de una
    // orden de reparación es, por definición, una pieza para ese equipo.
    tipoItem: input.desdePresupuesto || categoria === "Repuesto" ? "Repuesto" : "Equipo completo",
    categoria,
    // Punto 9 (12-oct): el pago no es una etapa del estado. Nace "Registrado"
    // y su pago se ve aparte ("Falta respaldo" hasta subir el comprobante).
    estado: ESTADO_INICIAL_EN_CAMINO,
    // Todo pedido que llega DIRECTO (sin packing) nace "Pendiente de
    // recepción" para aparecer en /shipping-v2/recepcion: ahí se marca
    // Recibido. Antes solo los del presupuesto de una orden lo hacían, y los
    // pedidos "Compra ya pagada" nunca aparecían para recibirse (REP-000020,
    // REP-000022, REP-000026 quedaron atascados sin poder facturarse). Los que
    // llegan en packing reciben ese estado al recibirse el packing.
    ...(input.desdePresupuesto || input.requierePacking !== true ? { estadoRevision: "Pendiente de recepción" } : {}),
    proveedorId,
    requierePago: true,
    requierePacking: input.requierePacking === true,
    afectaInventario: true,
    // Auditoría Shipping V2, punto 1: todo artículo se puede reservar desde
    // que nace. Las unidades que sobran para stock quedan reservables ya; se
    // VENDEN cuando el artículo llega (item-venta.ts). Antes nacían apagadas
    // y no había camino para publicarlas (C-1).
    disponibleVenta: calcularDisponibleVenta({
      estado: ESTADO_INICIAL_EN_CAMINO,
      unidadesLibres: cantidad - cantidadReservada,
    }),
    requiereInspeccion: requiereInspeccionPorDefecto({ categoria }),
    // "Reservado" (bandera vieja) solo si TODAS las unidades son del cliente;
    // la cuenta real va en "Cantidad Reservada" (unidades.ts).
    reservado: cantidadReservada >= cantidad,
    modoLogistico: input.requierePacking === true ? "Pendiente de packing" : "Tracking directo",
    cantidad,
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
    eventDescription:
      `Item creado desde Operaciones Comerciales para opción ${opcionId}: ` +
      `${cantidad} unidad(es) compradas, ${cantidadReservada} reservadas para el cliente` +
      `${input.requierePacking ? ", llega en packing" : ", tracking directo"}.`,
    extraFields: {
      [SHIPPING_V2_ITEM_FIELDS.metodoAsignacionSku]: "Generado automáticamente",
      [SHIPPING_V2_ITEM_FIELDS.cantidadReservada]: cantidadReservada,
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
  // Punto 4 (8-oct): "Es uso local" no se cambia editando el artículo; solo
  // con las acciones de administrador. La edición conserva lo que había.
  normalizedInput.usoLocal = existing.usoLocal === true;
  // Punto 5 (8-oct): tampoco se cambian editando el artículo el estado, la
  // revisión, la casilla "Reservado" ni "Disponible para venta": los ponen
  // los procesos (o "Corregir estado", solo Administrador). La edición
  // completa conserva lo que había (antes podía reescribirlos — F-8).
  normalizedInput.estado = existing.estado ?? "";
  normalizedInput.estadoRevision = existing.estadoRevision ?? "";
  // Punto 10b: una serie nueva o cambiada se guarda limpia y no se repite.
  if (cleanString(normalizedInput.numeroSerie) && normalizarSerie(normalizedInput.numeroSerie) !== normalizarSerie(existing.numeroSerie)) {
    normalizedInput.numeroSerie = await validarSerieParaGuardar(cleanString(normalizedInput.numeroSerie), id);
  }
  normalizedInput.reservado = existing.reservado === true;
  normalizedInput.disponibleVenta = existing.disponibleVenta === true;

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
    ((nullableNumberChanged(normalizedInput.cantidad, existing.cantidad) && !(Number(existing.unidadesCompradas) > 0)) ||
      nullableNumberChanged(normalizedInput.costoProveedor, existing.costoProveedor)) &&
    await itemHasActiveV2PaymentLink(existing, { ignorarHistoricos: true })
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

  let item = mapItem(updated);
  await createShippingV2Event({
    action: "Actualizado",
    itemRecordId: item.id,
    itemName: item.nombre,
    registradoPor: options.actualizadoPor,
    descripcion: `Item ${item.sku} actualizado desde Portal Staff.`,
  });

  if (
    existing.packingId &&
    (nullableNumberChanged(normalizedInput.cantidad, existing.cantidad) ||
      nullableNumberChanged(normalizedInput.costoProveedor, existing.costoProveedor) ||
      item.esRegalo !== existing.esRegalo)
  ) {
    const reparto = await repartirCostosPackingTrasCambio(existing.packingId, options.actualizadoPor, `Cambio de cantidad/costo en ${item.sku}.`);
    if (reparto?.estado === "aplicado") item = await releerItemRecord(id);
  }

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
    // La segunda unidad usa las MISMAS opciones que la primera, a propósito:
    // así la ficha las trata igual y no hay dos vocabularios de tipos.
    "Almacenamiento 2": optionalTextField(input.almacenamiento2),
    "Almacenamiento 2 tipo": optionalSelectOption(SHIPPING_V2_ITEM_SELECT_OPTIONS.almacenamientoTipo, input.almacenamiento2Tipo),
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
    listRecords(SHIPPING_V2_TABLES.pagos, { sortField: SHIPPING_V2_PAYMENT_FIELDS.fechaCreacion, sortDirection: "desc" }),
    getShippingV2Proveedores(),
    getShippingV2PaymentItems({ includeAiName: false, access, sanitizeForAccess: false }),
  ]);
  const labelsById = createShippingV2ProveedorLabelMap(proveedores);
  const itemsById = new Map(items.map((item) => [item.id, item]));
  return records
    .map((record) => mapPago(record, { labelsById, itemsById }))
    .filter((pago) => canAccessPago(pago, access))
    .map((pago) => sanitizePagoForAccess(pago, access));
}

/**
 * Punto 9b (dueño, 12-oct): un proveedor con portal solo ve de sus pagos la
 * fecha, el método, el nº de transacción, la orden y sus artículos. Nunca la
 * cuenta o tarjeta, el comprobante, Finanzas ni quién lo registró.
 */
function sanitizePagoForAccess(pago: ShippingV2Pago, access?: ShippingV2AccessContext): ShippingV2Pago {
  if (!access?.providerId) return pago;
  return {
    ...pago,
    cuentaOrigen: undefined,
    comprobante: [],
    observacion: undefined,
    registradoPor: undefined,
    pagadoPor: undefined,
    estadoIntegracionFinanzas: undefined,
    movimientoFinanzasId: undefined,
    movimientoFinanzasIds: [],
  };
}

export async function getShippingV2PagoById(recordId: string, access?: ShippingV2AccessContext) {
  assertShippingV2Permission(access, "canViewPayments", "No tienes permiso para ver pagos de Shipping.");
  const id = cleanString(recordId);
  if (!id) throw new Error("Record ID de pago inválido.");
  const [record, proveedores, items] = await Promise.all([
    airtableRequest<AirtableRecordResponse>(`${tableUrl(SHIPPING_V2_TABLES.pagos)}/${encodeURIComponent(id)}`),
    getShippingV2Proveedores(),
    getShippingV2PaymentItems({ includeAiName: false, access, sanitizeForAccess: false }),
  ]);
  const pago = mapPago(record, {
    labelsById: createShippingV2ProveedorLabelMap(proveedores),
    itemsById: new Map(items.map((item) => [item.id, item])),
  });
  if (!canAccessPago(pago, access)) throw new Error("No tienes acceso a este pago.");
  return sanitizePagoForAccess(pago, access);
}

/**
 * Punto 9b: completar un pago ya registrado con su comprobante (nº de
 * transacción o enlace) y su orden. No toca montos, fechas ni Finanzas.
 */
export async function completarComprobanteShippingV2Pago(
  recordId: string,
  input: { transaccionId?: string; comprobanteUrl?: string; orden?: string },
  options: { registradoPor: string; access?: ShippingV2AccessContext }
) {
  assertShippingV2Permission(options.access, "canManagePayments", "No tienes permiso para modificar pagos de Shipping.");
  const pago = await getShippingV2PagoById(recordId, options.access);
  if (normalizeStatus(String(pago.estadoPago)) === "anulado") throw new Error("Este pago está anulado.");
  const transaccionId = cleanString(input.transaccionId);
  const comprobanteUrl = cleanString(input.comprobanteUrl);
  const orden = cleanString(input.orden);
  if (!transaccionId && !comprobanteUrl && !orden) throw new Error("Escribe el nº de transacción, el enlace o la orden.");
  const F = SHIPPING_V2_PAYMENT_FIELDS;
  await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.pagos), {
    method: "PATCH",
    body: JSON.stringify({
      records: [{
        id: pago.id,
        fields: compactFields({
          [F.transaccionId]: transaccionId || undefined,
          [F.comprobante]: comprobanteUrl ? attachmentFromUrl(comprobanteUrl) : undefined,
          [F.orden]: orden || undefined,
        }),
      }],
    }),
  });
  return getShippingV2PagoById(pago.id, options.access);
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

async function itemHasActiveV2PaymentLink(
  item: Pick<ShippingV2Item, "pagoV2ItemIds" | "pagoV2RegaloIds">,
  options: { ignorarHistoricos?: boolean } = {}
) {
  const paymentIds = paymentLinkedIdsForItem(item);
  if (!paymentIds.length) return false;
  const pagos = await getShippingV2Pagos(systemShippingV2Access());
  // Punto 9: el pago histórico solo deja constancia (sin monto real ni egreso):
  // no congela la cantidad ni el costo del artículo.
  const considerados = options.ignorarHistoricos ? pagos.filter((pago) => !esPagoHistorico(pago)) : pagos;
  const pagosById = new Map(considerados.map((pago) => [pago.id, pago]));
  const vinculados = options.ignorarHistoricos
    ? { pagoV2ItemIds: item.pagoV2ItemIds.filter((id) => !pagos.some((p) => p.id === id && esPagoHistorico(p))), pagoV2RegaloIds: item.pagoV2RegaloIds.filter((id) => !pagos.some((p) => p.id === id && esPagoHistorico(p))) }
    : item;
  return itemIsLinkedToActivePayment(vinculados, pagosById);
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

// El item ya trae packingId (ShippingV2Item.packingId) — la relación con
// Packings ya existe, aquí solo se resuelve el "PK-..." visible y el estado
// del packing para no obligar al frontend a ir a buscarlo aparte. packingsById
// es opcional: si no se pasa (por ejemplo, alguna otra pantalla que reutilice
// esta función sin necesitar agrupar por packing), el item queda igual que
// antes, solo sin esos dos campos de más.
function toPendingPaymentItem(item: ShippingV2Item, packingsById?: Map<string, ShippingV2Packing>): ShippingV2PagoPendingItem {
  const packing = item.packingId ? packingsById?.get(item.packingId) : undefined;
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
    unidadesCompradas: item.unidadesCompradas ?? null,
    unidadesEnPacking: item.unidadesEnPacking,
    fechaRegistro: item.fechaRegistro,
    pagoV2ItemIds: item.pagoV2ItemIds,
    pagoV2RegaloIds: item.pagoV2RegaloIds,
    packingId: item.packingId,
    packingIdVisible: packing?.packingId,
    packingEstado: packing?.estado,
  };
}

function getPaymentSupportMissing(pago: ShippingV2Pago) {
  // Punto 9: el pago histórico (compras pagadas antes del 12-oct) no pide
  // soporte ni egreso, por decisión del dueño.
  if (esPagoHistorico(pago)) return [];
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

export async function getShippingV2PendingPaymentItems(context?: { pagos?: ShippingV2Pago[]; items?: ShippingV2Item[]; packings?: ShippingV2Packing[]; access?: ShippingV2AccessContext }) {
  const [pagos, items, packings] = await Promise.all([
    context?.pagos ? Promise.resolve(context.pagos) : getShippingV2Pagos(context?.access),
    context?.items ? Promise.resolve(context.items) : getShippingV2PaymentItems({ includeAiName: false, access: context?.access }),
    context?.packings ? Promise.resolve(context.packings) : getShippingV2Packings(context?.access),
  ]);
  const pagosById = new Map(pagos.map((pago) => [pago.id, pago]));
  const packingsById = new Map(packings.map((packing) => [packing.id, packing]));
  return items
    // Punto 9 (12-oct): ningún proveedor da crédito. Toda compra sin un pago
    // registrado es "Falta respaldo" (antes se separaba en "Por pagar" y
    // "Pagados sin soporte" leyendo el Estado Item, que se perdía al viajar).
    .filter((item) => faltaRespaldo({
      requierePago: item.requierePago,
      esRegalo: item.esRegalo,
      cancelado: isCancelledItem(item),
      faltaProveedor: providerRequiredForPayment(item) && !item.proveedorId,
      enPagoVivo: itemIsLinkedToActivePayment(item, pagosById),
    }))
    .map((item) => toPendingPaymentItem(item, packingsById));
}

export async function getShippingV2PagosWorkspace(access?: ShippingV2AccessContext): Promise<ShippingV2PagosWorkspace> {
  assertShippingV2Permission(access, "canViewPayments", "No tienes permiso para ver pagos de Shipping.");
  const veOrdenes = canShippingV2(access, "canManagePayments") && !access?.providerId;
  const [pagos, proveedores, items, packings, ordenRecords] = await Promise.all([
    getShippingV2Pagos(access),
    getShippingV2Proveedores(),
    getShippingV2PaymentItems({ includeAiName: false, access }),
    // La relación item → packing ya existe (ShippingV2Item.packingId); acá
    // solo se resuelve el packing en sí para poder agrupar por él en la
    // pantalla de Pagos, sin inventar una relación paralela.
    getShippingV2Packings(access),
    veOrdenes ? listOrdenCompraRecords() : Promise.resolve([] as AirtableRecord[]),
  ]);
  const pagosById = new Map(pagos.map((pago) => [pago.id, pago]));
  const packingsById = new Map(packings.map((packing) => [packing.id, packing]));
  const canManagePayments = canShippingV2(access, "canManagePayments");
  // Punto 9d: lo que está en una orden se paga desde su orden; aquí sigue
  // apareciendo, agrupado por caja o suelto, solo lo que no tiene orden.
  const labelsOrdenes = createShippingV2ProveedorLabelMap(proveedores);
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const ordenes = ordenRecords.map((record) => construirOrden(mapOrdenCompraBase(record, labelsOrdenes), { itemsById, pagosById, packingsById }));
  const ordenIds = new Set(ordenes.map((orden) => orden.id));
  const enOrden = (itemId: string) => {
    const ordenId = itemsById.get(itemId)?.ordenCompraId;
    return Boolean(ordenId && ordenIds.has(ordenId));
  };
  const itemsPendientes = canManagePayments
    ? (await getShippingV2PendingPaymentItems({ pagos, items, packings, access })).filter((item) => !enOrden(item.id))
    : [];
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
  // Punto 9: ya no hay "items pagados sin pago": todo lo que no tiene pago
  // está en "Falta respaldo" (itemsPendientes).
  const itemsPagadosSinPago: Extract<ShippingV2PagoSupportCard, { kind: "item" }>[] = [];
  const pagadosSinSoporte = [...itemsPagadosSinPago, ...pagosIncompletos];
  const regalosEnCaja = canManagePayments
    ? items
      .filter((item) => item.esRegalo === true && Boolean(item.packingId) && !isCancelledItem(item) && !itemIsLinkedToActivePayment(item, pagosById) && !enOrden(item.id))
      .map((item) => toPendingPaymentItem(item, packingsById))
    : [];
  const labelsProveedores = createShippingV2ProveedorLabelMap(proveedores);
  const logistica = canManagePayments ? construirFilasLogistica({ packings, items, pagos, labelsById: labelsProveedores }) : [];
  const transportistas = canManagePayments ? transportistasParaFlete(proveedores, labelsProveedores) : [];
  return {
    pagos,
    proveedores: access?.providerId ? proveedores.filter((provider) => provider.id === access.providerId) : proveedores,
    ordenes,
    logistica,
    transportistas,
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
    regalosEnCaja,
    summary: computePagosSummary(itemsPendientes, pagosPendientes, pagadosSinSoporte, pagosCompletos),
  };
}

// ─── Pagos de logística (punto 9c, 13-oct-2026) ─────────────────────────────
// Reglas en lib/shipping-v2/logistica-pagos.ts. Cada caja, o cada artículo que
// viaja solo, tiene Flete (a la empresa logística), Arancel (a la SENAE) y
// Otros. Cada pago crea su egreso ("Logística Shipping") y manda lo pagado: el
// valor del gasto pasa a ser el total pagado y se reparte entre los artículos.

type ClaveGasto = "flete" | "arancel" | "otros";
const CLAVE_DE_CONCEPTO: Record<ConceptoLogistica, ClaveGasto> = { Flete: "flete", Arancel: "arancel", Otros: "otros" };

function pagadoLogistica(pagos: ShippingV2Pago[], destino: { packingId?: string; itemId?: string }, concepto: ConceptoLogistica) {
  return pagos
    .filter((p) => normalizeStatus(String(p.estadoPago)) !== "anulado" && p.concepto === concepto)
    .filter((p) => (destino.packingId ? (p.packingLogisticaIds ?? []).includes(destino.packingId) : (p.itemLogisticaIds ?? []).includes(destino.itemId ?? "")))
    .reduce((suma, p) => suma + (p.totalAPagar ?? p.total ?? 0), 0);
}

function construirFilasLogistica(input: {
  packings: ShippingV2Packing[];
  items: ShippingV2Item[];
  pagos: ShippingV2Pago[];
  labelsById: Map<string, string>;
}): ShippingV2LogisticaFila[] {
  const filas: ShippingV2LogisticaFila[] = [];
  const pagosById = new Map(input.pagos.map((p) => [p.id, p]));
  // Fase 2 (15-oct): ¿la compra de lo que viaja tiene su respaldo de pago? (chip "Compra" de Logística)
  const compraDe = (articulos: ShippingV2Item[]) => {
    const conCompra = articulos.filter((i) => i.requierePago === true && i.esRegalo !== true && !isCancelledItem(i));
    return {
      conCompra: conCompra.length,
      faltaRespaldo: conCompra.filter((i) => faltaRespaldo({
        requierePago: i.requierePago,
        esRegalo: i.esRegalo,
        cancelado: isCancelledItem(i),
        faltaProveedor: providerRequiredForPayment(i) && !i.proveedorId,
        enPagoVivo: itemIsLinkedToActivePayment(i, pagosById),
      })).length,
    };
  };
  const itemsPorPacking = new Map<string, ShippingV2Item[]>();
  for (const item of input.items) {
    if (item.packingId) itemsPorPacking.set(item.packingId, [...(itemsPorPacking.get(item.packingId) ?? []), item]);
  }
  for (const pk of input.packings) {
    if (normalizeStatus(pk.estado) === "cancelado") continue;
    const contenido = itemsPorPacking.get(pk.id) ?? [];
    const proveedores = Array.from(new Set(contenido.map((i) => i.proveedorNombre || input.labelsById.get(i.proveedorId || "") || "").filter(Boolean)));
    const transportistaId = pk.transportistaEc || pk.proveedorLogisticoEcId || "";
    const destino = { packingId: pk.id };
    filas.push({
      key: pk.id,
      tipo: "caja",
      packingId: pk.id,
      titulo: pk.packingId || pk.id,
      detalle: [proveedores.join(", "), `${contenido.length} art.`].filter(Boolean).join(" · "),
      estadoLogistico: pk.estado,
      transportistaId: transportistaId || undefined,
      transportistaNombre: transportistaId ? input.labelsById.get(transportistaId) || pk.transportistaEcNombre || pk.proveedorLogisticoEcNombre : undefined,
      fecha: pk.fechaCreacion || pk.createdTime || "",
      aplicaArancel: true,
      flete: situacionGasto(pk.flete ?? null, pagadoLogistica(input.pagos, destino, "Flete")),
      arancel: situacionGasto(pk.arancel ?? null, pagadoLogistica(input.pagos, destino, "Arancel")),
      otros: situacionGasto(pk.otrosCostos ?? null, pagadoLogistica(input.pagos, destino, "Otros")),
      pendiente: { falta: 0, sinFlete: false, pagado: 0 },
      compra: compraDe(contenido),
    });
  }
  for (const item of input.items) {
    if (item.packingId || !vieneDeAfuera(item.origenArticulo) || isCancelledItem(item)) continue;
    const extranjero = normalizarOrigen(item.origenArticulo) === "Proveedor extranjero";
    const transportistaId = item.transportistaEcuadorId || item.proveedorLogisticoId || "";
    const destino = { itemId: item.id };
    filas.push({
      key: item.id,
      tipo: "suelto",
      itemId: item.id,
      titulo: item.sku || item.id,
      detalle: [item.proveedorNombre || input.labelsById.get(item.proveedorId || "") || "", item.nombre].filter(Boolean).join(" · "),
      estadoLogistico: item.estado || "",
      transportistaId: transportistaId || undefined,
      transportistaNombre: transportistaId ? input.labelsById.get(transportistaId) : undefined,
      fecha: item.fechaRegistro || "",
      aplicaArancel: extranjero,
      flete: situacionGasto(item.fleteAsignadoRegistro ?? null, pagadoLogistica(input.pagos, destino, "Flete")),
      arancel: situacionGasto(item.arancelAsignadoRegistro ?? null, pagadoLogistica(input.pagos, destino, "Arancel")),
      otros: situacionGasto(item.otrosCostosAsignadosRegistro ?? null, pagadoLogistica(input.pagos, destino, "Otros")),
      pendiente: { falta: 0, sinFlete: false, pagado: 0 },
      compra: compraDe([item]),
    });
  }
  for (const fila of filas) fila.pendiente = pendienteLogistica(fila);
  return filas.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

function transportistasParaFlete(proveedores: ShippingV2Proveedor[], labelsById: Map<string, string>) {
  return proveedores
    .filter((p) => esProveedorLogistico(p) && normalizeStatus(p.estado || "activo") !== "inactivo")
    .map((p) => ({ id: p.id, nombre: labelsById.get(p.id) || p.nombre || p.id }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

function resumenPagoLogistica(p: ShippingV2Pago, labelsById: Map<string, string>): ShippingV2PagoLogisticaResumen {
  return {
    id: p.id,
    pagoId: p.pagoId,
    concepto: conceptoDePago(p.concepto) as ConceptoLogistica,
    monto: p.totalPagado ?? p.totalAPagar ?? p.total ?? 0,
    fecha: p.fechaPagoReal || p.fechaCreacion || "",
    pagadoA: (p.proveedorId ? labelsById.get(p.proveedorId) : "") || p.proveedorNombre || p.pagadoA || "",
    metodo: p.metodoPago && p.metodoPago !== "No aplica" ? p.metodoPago : "",
    conComprobante: Boolean(p.transaccionId || p.comprobante.length),
    registradoPor: p.registradoPor || p.pagadoPor || "",
  };
}

/**
 * Fase 1 (14-oct): "Costos de traerlo" de UNA caja o de UN artículo que viaja
 * solo. Es el único lugar donde se ven y se pagan su flete, arancel y otros.
 */
export async function getShippingV2CostosTraerlo(destino: { packingId?: string; itemId?: string }, access?: ShippingV2AccessContext): Promise<ShippingV2CostosTraerlo> {
  assertShippingV2Permission(access, "canViewCosts", "No tienes permiso para ver costos de Shipping.");
  const packingId = cleanString(destino.packingId);
  const itemId = cleanString(destino.itemId);
  if (Boolean(packingId) === Boolean(itemId)) throw new Error("Indica una caja o un artículo.");
  const [pk, item, pagos, proveedores] = await Promise.all([
    packingId ? getShippingV2PackingById(packingId, access, { includeItems: false, includeAiName: false }) : Promise.resolve(null),
    itemId ? getShippingV2ItemById(itemId, { includeAiName: false, access }) : Promise.resolve(null),
    getShippingV2Pagos(systemShippingV2Access()),
    getShippingV2Proveedores(),
  ]);
  if (item?.packingId) throw new Error(`${item.sku} viaja en una caja: sus costos están en la caja.`);
  const labelsById = createShippingV2ProveedorLabelMap(proveedores);
  const [fila] = construirFilasLogistica({ packings: pk ? [pk] : [], items: item ? [item] : [], pagos, labelsById });
  if (!fila) throw new Error("Este artículo no viene de afuera: no tiene costos logísticos.");
  const puedePagar = canShippingV2(access, "canManagePayments");
  const deEste = pagos
    .filter((p) => normalizeStatus(String(p.estadoPago)) !== "anulado" && esConceptoLogistica(p.concepto))
    .filter((p) => (packingId ? (p.packingLogisticaIds ?? []).includes(packingId) : (p.itemLogisticaIds ?? []).includes(itemId)))
    .map((p) => resumenPagoLogistica(p, labelsById))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  return {
    fila,
    pagos: deEste,
    transportistas: puedePagar ? transportistasParaFlete(proveedores, labelsById) : [],
    puedePagar,
  };
}

/**
 * Fase 1 (14-oct): costos de traerlo de todas las cajas y artículos sueltos,
 * para la pantalla Logística (columna "Costos" y filtro "Costos pendientes").
 */
export async function getShippingV2ResumenLogistica(context: { access?: ShippingV2AccessContext; packings?: ShippingV2Packing[]; proveedores?: ShippingV2Proveedor[] }): Promise<ShippingV2LogisticaFila[]> {
  assertShippingV2Permission(context.access, "canViewCosts", "No tienes permiso para ver costos de Shipping.");
  const [packings, proveedores, pagos, items] = await Promise.all([
    context.packings ? Promise.resolve(context.packings) : getShippingV2Packings(context.access),
    context.proveedores ? Promise.resolve(context.proveedores) : getShippingV2Proveedores(),
    getShippingV2Pagos(systemShippingV2Access()),
    getShippingV2PaymentItems({ includeAiName: false, access: context.access }),
  ]);
  return construirFilasLogistica({ packings, items, pagos, labelsById: createShippingV2ProveedorLabelMap(proveedores) });
}

export type ShippingV2PagoLogisticaInput = {
  concepto: string;
  packingId?: string;
  itemId?: string;
  monto: number;
  proveedorId?: string;
  pagadoA?: string;
  fechaPagoReal: string;
  metodoPago: string;
  cuentaOrigen: string;
  transaccionId?: string;
  comprobanteUrl?: string;
  orden?: string;
  observacion?: string;
};

/**
 * Registra el pago de un gasto de logística: crea el pago (Pagado) y su egreso
 * en Finanzas, y deja el valor del gasto igual a lo pagado en total (se
 * reparte de nuevo entre los artículos de la caja). Si el reparto falla, el
 * pago queda registrado y se avisa.
 */
export async function registrarPagoLogisticaShippingV2(input: ShippingV2PagoLogisticaInput, options: { registradoPor: string; access?: ShippingV2AccessContext }) {
  assertShippingV2Permission(options.access, "canManagePayments", "No tienes permiso para registrar pagos de Shipping.");
  assertShippingV2GeneratedSchema();
  const packingId = cleanString(input.packingId);
  const itemId = cleanString(input.itemId);
  const monto = Math.round(Number(input.monto) * 100) / 100;
  const error = validarPagoLogistica({ ...input, packingId, itemId, monto });
  if (error) throw new Error(error);
  const concepto = conceptoDePago(input.concepto) as ConceptoLogistica;
  if (!esConceptoLogistica(concepto)) throw new Error("Concepto inválido.");

  // Destino y su valor actual
  let titulo = "";
  let valorAntes: number | null = null;
  if (packingId) {
    const pk = await getShippingV2PackingById(packingId, systemShippingV2Access(), { includeItems: false, includeAiName: false });
    if (normalizeStatus(pk.estado) === "cancelado") throw new Error("Esta caja está cancelada.");
    titulo = pk.packingId || pk.id;
    valorAntes = concepto === "Flete" ? pk.flete ?? null : concepto === "Arancel" ? pk.arancel ?? null : pk.otrosCostos ?? null;
  } else {
    const item = await getShippingV2ItemById(itemId, { includeAiName: false, access: systemShippingV2Access() });
    if (item.packingId) throw new Error(`${item.sku} viaja en una caja: registra el gasto en la caja.`);
    titulo = item.sku || item.id;
    valorAntes = concepto === "Flete" ? item.fleteAsignadoRegistro ?? null : concepto === "Arancel" ? item.arancelAsignadoRegistro ?? null : item.otrosCostosAsignadosRegistro ?? null;
  }
  if (input.proveedorId) {
    const prov = await getShippingV2ProveedorById(cleanString(input.proveedorId));
    if (!prov) throw new Error("La empresa logística elegida no existe.");
  }
  const todos = await getShippingV2Pagos(systemShippingV2Access());
  const pagadoAntes = pagadoLogistica(todos, { packingId: packingId || undefined, itemId: itemId || undefined }, concepto);

  // 1. El pago
  const F = SHIPPING_V2_PAYMENT_FIELDS;
  const proveedorId = concepto === "Flete" ? cleanString(input.proveedorId) : "";
  const fields = compactFields({
    [F.pagoId]: generatePaymentId(),
    [F.estadoPago]: "Pendiente",
    [F.concepto]: concepto,
    [F.proveedor]: proveedorId ? [proveedorId] : undefined,
    [F.packingLogistica]: packingId ? [packingId] : undefined,
    [F.itemLogistica]: itemId ? [itemId] : undefined,
    [F.pagadoA]: pagadoAPor(concepto, input.pagadoA) || undefined,
    [F.totalAPagar]: monto,
    [F.fechaCreacion]: new Date().toISOString(),
    [F.orden]: cleanString(input.orden),
    [F.observacion]: cleanString(input.observacion) || `${concepto} de ${titulo}.`,
    [F.estadoIntegracionFinanzas]: "Pendiente de generar",
    [F.registradoPor]: options.registradoPor,
  });
  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.pagos), {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
  const creado = response.records?.[0];
  if (!creado) throw new Error("Airtable no devolvió el pago creado.");

  // 2. Pagado + egreso en Finanzas (mismo camino que una compra). Si falla,
  // el pago a medio crear se anula para que no cuente como pagado.
  let pago: ShippingV2Pago;
  try {
    pago = await markShippingV2PagoAsPaid(creado.id, {
      fechaPagoReal: input.fechaPagoReal,
      metodoPago: input.metodoPago,
      cuentaOrigen: input.cuentaOrigen,
      transaccionId: input.transaccionId,
      comprobanteUrl: input.comprobanteUrl,
      observacion: cleanString(input.observacion) || `${concepto} de ${titulo}.`,
    }, options);
  } catch (e) {
    await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.pagos), {
      method: "PATCH",
      body: JSON.stringify({ records: [{ id: creado.id, fields: {
        [F.estadoPago]: "Anulado",
        [F.estadoIntegracionFinanzas]: "Anulado",
        [F.fechaAnulacion]: new Date().toISOString(),
        [F.motivoAnulacion]: `No se pudo registrar el pago: ${e instanceof Error ? e.message : String(e)}`,
      } }] }),
    }).catch((err) => console.error("[Shipping V2 pago logística] no se pudo anular el pago incompleto", err));
    throw e;
  }

  // 3. Manda lo pagado: el gasto queda igual al total pagado y se reparte.
  const valorNuevo = valorTrasPago(pagadoAntes, monto);
  let aviso = "";
  if (valorNuevo !== (valorAntes ?? null)) {
    try {
      if (packingId) {
        const campo = concepto === "Flete" ? SHIPPING_V2_PACKING_FIELDS.flete : concepto === "Arancel" ? SHIPPING_V2_PACKING_FIELDS.arancel : SHIPPING_V2_PACKING_FIELDS.otrosCostos;
        await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.packings), {
          method: "PATCH",
          body: JSON.stringify({ records: [{ id: packingId, fields: { [campo]: valorNuevo } }] }),
        });
        const reparto = await repartirCostosPackingTrasCambio(packingId, options.registradoPor, `${concepto} pagado (${pago.pagoId}): ${valorAntes ?? 0} → ${valorNuevo}`);
        if (!reparto || reparto.estado === "omitido") aviso = `El ${concepto.toLowerCase()} de ${titulo} quedó en ${valorNuevo}, pero no se pudo repartir entre sus artículos (caja antigua). Revisa sus costos.`;
      } else {
        const clave = CLAVE_DE_CONCEPTO[concepto];
        await actualizarLlegadaShippingV2Item(itemId, clave === "otros" ? { otrosCostos: valorNuevo } : { [clave]: valorNuevo }, { actualizadoPor: options.registradoPor, access: systemShippingV2Access() });
      }
    } catch (e) {
      console.error("[Shipping V2 pago logística] no se pudo actualizar el valor del gasto", e);
      aviso = `El pago ${pago.pagoId} quedó registrado, pero no se pudo actualizar el ${concepto.toLowerCase()} de ${titulo} a ${valorNuevo}. Corrígelo a mano.`;
    }
  }
  await createShippingV2Event({
    action: "Otro",
    entity: packingId ? "Shipping Packing" : "Shipping Item",
    registradoPor: options.registradoPor,
    descripcion: `${concepto} de ${titulo} pagado (${pago.pagoId}, ${monto}).${valorNuevo !== (valorAntes ?? null) ? ` Valor del gasto: ${valorAntes ?? "vacío"} → ${valorNuevo}.` : ""}`,
    ...(packingId ? { packingRecordId: packingId } : { itemRecordId: itemId }),
  }).catch(() => undefined);
  return { pago, aviso };
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
  // Punto 9: registrar el respaldo de cualquier compra (todas ya están pagadas).
  if (estadoPago === "Pagado") normalizeAndValidatePaymentSupportInput(input);
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
    [F.orden]: cleanString(input.orden),
    [F.ordenCompra]: cleanString(input.ordenCompraId) ? [cleanString(input.ordenCompraId)] : undefined,
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
    try {
      return await markShippingV2PagoAsPaid(pago.id, input, options);
    } catch (e) {
      // Punto 9d: sin egreso en Finanzas el pago no puede quedar "Pagado" (los
      // artículos parecerían pagados). Se anula y se avisa (igual que logística).
      await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.pagos), {
        method: "PATCH",
        body: JSON.stringify({ records: [{ id: pago.id, fields: {
          [F.estadoPago]: "Anulado",
          [F.estadoIntegracionFinanzas]: "Anulado",
          [F.fechaAnulacion]: new Date().toISOString(),
          [F.motivoAnulacion]: `No se pudo registrar el pago: ${e instanceof Error ? e.message : String(e)}`,
        } }] }),
      }).catch((err) => console.error("[Shipping V2 pago] no se pudo anular el pago incompleto", err));
      throw e;
    }
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
      // Punto 9c: flete, arancel y otros gastos van a "Logística Shipping".
      categoria: categoriaFinanzasDe(pago.concepto) as "Compra Proveedor Shipping" | "Logística Shipping",
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
  // Punto 9: el pago ya no toca el Estado Item (antes lo ponía "Pagado" y esa
  // marca se perdía al viajar). La situación del pago se lee de los pagos.
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

// ─── Órdenes de compra (punto 9d, 14-oct-2026) ──────────────────────────────
// Reglas en lib/shipping-v2/ordenes-compra.ts. Una orden agrupa lo comprado en
// una sola compra a un proveedor (sus artículos) y el pago se registra contra
// la orden: un pago por el total, con un egreso en Finanzas. Lo que todavía no
// está en un pago vivo es lo que "falta". Roberto (portal) no ve órdenes.

const OC = ORDEN_COMPRA_FIELDS;

type OrdenCompraBase = Omit<ShippingV2OrdenCompra, "articulos" | "pagos" | "resumen">;

function fechaHoyEcuador() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function mapOrdenCompraBase(record: AirtableRecord, labelsById: Map<string, string> = new Map()): OrdenCompraBase {
  const f = record.fields;
  const proveedorId = firstString(f[OC.proveedor]);
  return {
    id: record.id,
    createdTime: record.createdTime,
    ocId: firstString(f[OC.ocId]) || ocIdDesdeNumero(firstNumber(f[OC.numero])) || record.id,
    proveedorId: proveedorId || undefined,
    proveedorNombre: proveedorId ? resolveShippingV2ProveedorLabel(proveedorId, labelsById) || undefined : undefined,
    numeroProveedor: firstString(f[OC.numeroProveedor]) || undefined,
    fechaCompra: firstString(f[OC.fechaCompra]) || undefined,
    observaciones: firstString(f[OC.observaciones]) || undefined,
    registradoPor: firstString(f[OC.registradoPor]) || undefined,
    fechaCreacion: firstString(f[OC.fechaCreacion], record.createdTime),
    anulada: firstBoolean(f[OC.anulada]) === true,
    motivoAnulacion: firstString(f[OC.motivoAnulacion]) || undefined,
    fechaAnulacion: firstString(f[OC.fechaAnulacion]) || undefined,
    itemIds: linkedRecordIds(f[OC.articulos]),
    pagoIds: linkedRecordIds(f[OC.pagos]),
  };
}

function articuloDeOrden(item: ShippingV2Item, pagosById: Map<string, ShippingV2Pago>, packingsById?: Map<string, ShippingV2Packing>): ShippingV2OrdenArticulo {
  let subtotal: number | null;
  try {
    subtotal = item.esRegalo ? 0 : calculateShippingV2PaymentItemSubtotal(item);
  } catch {
    subtotal = null;
  }
  return {
    id: item.id,
    sku: item.sku,
    nombre: item.nombre,
    categoria: item.categoria,
    estado: item.estado,
    skuProveedor: item.skuProveedor,
    cantidad: item.cantidad ?? null,
    unidadesCompradas: item.unidadesCompradas ?? null,
    costoProveedor: item.costoProveedor ?? null,
    costoTotalUnidad: item.costoTotalUnidad ?? null,
    subtotal,
    esRegalo: item.esRegalo === true,
    requierePago: item.requierePago === true,
    usoLocal: item.usoLocal === true,
    cancelado: isCancelledItem(item),
    enPagoVivo: itemIsLinkedToActivePayment(item, pagosById),
    packingId: item.packingId,
    packingIdVisible: item.packingId ? packingsById?.get(item.packingId)?.packingId : undefined,
    recibido: item.recibido === true,
  };
}

function construirOrden(
  base: OrdenCompraBase,
  ctx: { itemsById: Map<string, ShippingV2Item>; pagosById: Map<string, ShippingV2Pago>; packingsById?: Map<string, ShippingV2Packing> }
): ShippingV2OrdenCompra {
  const items = base.itemIds.map((id) => ctx.itemsById.get(id)).filter((i): i is ShippingV2Item => Boolean(i));
  const articulos = items.map((item) => articuloDeOrden(item, ctx.pagosById, ctx.packingsById));
  const pagos = base.pagoIds.map((id) => ctx.pagosById.get(id)).filter((p): p is ShippingV2Pago => Boolean(p));
  const resumen = resumenOrden({
    anulada: base.anulada,
    articulos: items.map((item, i) => ({ ...summarizePaymentItem(item), requierePago: item.requierePago, cancelado: articulos[i].cancelado, enPagoVivo: articulos[i].enPagoVivo })),
    pagos: pagos.map((p) => ({ id: p.id, estado: String(p.estadoPago), total: p.totalAPagar })),
  });
  return {
    ...base,
    articulos,
    pagos: pagos.map((p) => ({
      id: p.id,
      pagoId: p.pagoId,
      estadoPago: p.estadoPago,
      totalAPagar: p.totalAPagar,
      fechaPagoReal: p.fechaPagoReal,
      metodoPago: p.metodoPago,
      cuentaOrigen: p.cuentaOrigen,
      transaccionId: p.transaccionId,
      registradoPor: p.registradoPor || p.pagadoPor,
      motivoAnulacion: p.motivoAnulacion,
      fechaAnulacion: p.fechaAnulacion,
      conComprobante: Boolean(p.transaccionId || p.comprobante.length),
      cantidadItems: p.cantidadItems,
    })),
    resumen,
  };
}

function assertAccesoOrdenes(access?: ShippingV2AccessContext) {
  assertShippingV2Permission(access, "canViewPayments", "No tienes permiso para ver órdenes de compra.");
  if (access?.providerId) throw new Error("Las órdenes de compra no están disponibles en el portal del proveedor.");
}

async function listOrdenCompraRecords() {
  return listRecords(SHIPPING_V2_TABLES.ordenesCompra, { sortField: OC.fechaCreacion, sortDirection: "desc" });
}

export async function getShippingV2OrdenCompraById(recordId: string, access?: ShippingV2AccessContext): Promise<ShippingV2OrdenCompra> {
  assertAccesoOrdenes(access);
  const id = cleanString(recordId);
  if (!id) throw new Error("Orden de compra inválida.");
  const [record, proveedores] = await Promise.all([getRecordById(SHIPPING_V2_TABLES.ordenesCompra, id), getShippingV2Proveedores()]);
  if (!record) throw new Error("Orden de compra no encontrada.");
  const labelsById = createShippingV2ProveedorLabelMap(proveedores);
  const base = mapOrdenCompraBase(record, labelsById);
  const items = (await listRecordsByIds(SHIPPING_V2_TABLES.items, base.itemIds)).map((r) => applyItemProviderLabels(mapItem(r, { includeAiName: false }), labelsById));
  // Los pagos de la orden y los de sus artículos (para saber qué ya está pagado).
  const pagoIds = Array.from(new Set([...base.pagoIds, ...items.flatMap(paymentLinkedIdsForItem)]));
  const pagos = (await listRecordsByIds(SHIPPING_V2_TABLES.pagos, pagoIds)).map((r) => mapPago(r, { labelsById }));
  const packingIds = Array.from(new Set(items.map((i) => i.packingId).filter((x): x is string => Boolean(x))));
  const packings = packingIds.length ? (await listRecordsByIds(SHIPPING_V2_TABLES.packings, packingIds)).map(mapPacking) : [];
  return construirOrden(base, {
    itemsById: new Map(items.map((i) => [i.id, i])),
    pagosById: new Map(pagos.map((p) => [p.id, p])),
    packingsById: new Map(packings.map((p) => [p.id, p])),
  });
}

/** Órdenes del mismo proveedor (para "Mover a otra orden" del Administrador). */
export async function getShippingV2OrdenesDeProveedor(proveedorId: string, access?: ShippingV2AccessContext) {
  assertAccesoOrdenes(access);
  const id = cleanString(proveedorId);
  if (!id) return [];
  return (await listOrdenCompraRecords())
    .map((r) => mapOrdenCompraBase(r))
    .filter((o) => o.proveedorId === id && !o.anulada)
    .map((o) => ({ id: o.id, ocId: o.ocId, numeroProveedor: o.numeroProveedor, fechaCompra: o.fechaCompra }));
}

export async function createShippingV2OrdenCompra(input: ShippingV2OrdenCompraWriteInput, options: { registradoPor: string; access?: ShippingV2AccessContext }) {
  assertShippingV2Permission(options.access, "canEditItems", "No tienes permiso para registrar compras.");
  if (options.access?.providerId) throw new Error("Las compras se registran desde la tienda.");
  const proveedorId = cleanString(input.proveedorId);
  const fechaCompra = cleanString(input.fechaCompra) || fechaHoyEcuador();
  const error = validarCabeceraOrden({ proveedorId, fechaCompra });
  if (error) throw new Error(error);
  const proveedor = await getShippingV2ProveedorById(proveedorId);
  if (!proveedor) throw new Error("El proveedor elegido no existe.");
  if (!canBePurchaseProvider(proveedor)) throw new Error(`${proveedor.label} no es un proveedor de compra activo.`);

  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.ordenesCompra), {
    method: "POST",
    body: JSON.stringify({
      records: [{
        fields: compactFields({
          [OC.proveedor]: [proveedorId],
          [OC.numeroProveedor]: cleanString(input.numeroProveedor) || undefined,
          [OC.fechaCompra]: fechaCompra,
          [OC.observaciones]: cleanString(input.observaciones) || undefined,
          [OC.registradoPor]: options.registradoPor,
          [OC.fechaCreacion]: new Date().toISOString(),
        }),
      }],
    }),
  });
  const created = response.records?.[0];
  if (!created) throw new Error("Airtable no devolvió la orden creada.");
  // El código sale del número que pone Airtable: nunca se repite.
  const ocId = ocIdDesdeNumero(firstNumber(created.fields?.[OC.numero])) || created.id;
  await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.ordenesCompra), {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id: created.id, fields: { [OC.ocId]: ocId } }] }),
  });
  return { id: created.id, ocId, proveedorId, fechaCompra };
}

/** Un artículo nuevo puede nacer dentro de esta orden (mismo proveedor, compra o regalo). */
async function ordenParaArticuloNuevo(ordenId: string, input: ShippingV2ItemWriteInput) {
  const record = await getRecordById(SHIPPING_V2_TABLES.ordenesCompra, ordenId);
  if (!record) throw new Error("La orden de compra no existe.");
  const base = mapOrdenCompraBase(record);
  const error = validarArticuloParaOrden(
    { anulada: base.anulada, proveedorId: base.proveedorId },
    { proveedorId: cleanString(input.proveedorId), tipoOperacion: input.tipoOperacion }
  );
  if (error) throw new Error(error);
  return base;
}

/**
 * Registra el pago de una orden: lleva los artículos que todavía no están en un
 * pago vivo (todos, la primera vez; solo lo olvidado, si ya se había pagado) y
 * los regalos sin pago. Crea el egreso en Finanzas (mismo camino que Pagos).
 */
export async function registrarPagoOrdenCompra(
  ordenId: string,
  respaldo: RespaldoAlRegistrar & { observacion?: string },
  options: { registradoPor: string; access?: ShippingV2AccessContext }
) {
  assertShippingV2Permission(options.access, "canManagePayments", "No tienes permiso para registrar pagos de Shipping.");
  const orden = await getShippingV2OrdenCompraById(ordenId, options.access);
  if (orden.anulada) throw new Error("Esta orden está anulada.");
  const r = orden.resumen;
  if (r.sinCosto.length) throw new Error(`${r.sinCosto.join(", ")}: sin costo. Ponle costo en su ficha o márcalo como regalo.`);
  if (!r.porPagarIds.length) {
    throw new Error(r.situacion === "sin-pago" ? "Esta orden solo tiene regalos: no lleva pago." : "Esta orden ya está pagada.");
  }
  const error = validarRespaldo(respaldo);
  if (error) throw new Error(error);
  if (!orden.proveedorId) throw new Error("La orden no tiene proveedor.");
  return createShippingV2Pago(
    {
      proveedorId: orden.proveedorId,
      itemIds: r.porPagarIds,
      regalosIds: r.regalosPorAdjuntarIds,
      estadoPago: "Pagado",
      fechaPagoReal: respaldo.fechaPagoReal ?? undefined,
      metodoPago: respaldo.metodoPago ?? undefined,
      cuentaOrigen: respaldo.cuentaOrigen ?? undefined,
      transaccionId: respaldo.transaccionId ?? undefined,
      comprobanteUrl: respaldo.comprobanteUrl ?? undefined,
      orden: orden.numeroProveedor,
      ordenCompraId: orden.id,
      observacion: cleanString(respaldo.observacion) || `Pago de ${orden.ocId}${r.situacion === "falta" ? " (lo que faltaba)" : ""}.`,
    },
    options
  );
}

/** Borra una orden que quedó vacía (por ejemplo, si falló el primer artículo al registrar). */
/**
 * Punto 9d (entrega 2): recuerda qué es cada columna de la hoja de un
 * proveedor, para que la próxima carga salga sola. Solo personal de la tienda.
 */
export async function guardarColumnasImportacionProveedor(
  proveedorId: string,
  columnas: unknown,
  options: { access?: ShippingV2AccessContext }
) {
  assertShippingV2Permission(options.access, "canEditItems", "No tienes permiso para registrar compras.");
  if (options.access?.providerId) throw new Error("No disponible en el portal del proveedor.");
  const proveedor = await getShippingV2ProveedorById(proveedorId);
  if (!proveedor) throw new Error("Proveedor no encontrado.");
  const limpio = limpiarColumnasRecordadas(columnas);
  await patchAirtableRecords(SHIPPING_V2_TABLES.proveedores, [
    { id: proveedor.id, fields: { [CAMPO_COLUMNAS_IMPORTACION]: Object.keys(limpio).length ? JSON.stringify(limpio) : "" } },
  ]);
  return limpio;
}

export async function eliminarOrdenCompraVacia(ordenId: string, options: { access?: ShippingV2AccessContext }) {
  assertShippingV2Permission(options.access, "canEditItems", "No tienes permiso para registrar compras.");
  const id = cleanString(ordenId);
  const record = id ? await getRecordById(SHIPPING_V2_TABLES.ordenesCompra, id) : null;
  if (!record) return { eliminada: false };
  const base = mapOrdenCompraBase(record);
  if (base.itemIds.length || base.pagoIds.length) throw new Error("La orden tiene artículos o pagos: no se borra.");
  await airtableMutation<{ deleted?: boolean }>(`${tableUrl(SHIPPING_V2_TABLES.ordenesCompra)}/${encodeURIComponent(id)}`, { method: "DELETE" });
  return { eliminada: true };
}

/**
 * Solo Administrador: mueve un artículo a otra orden del mismo proveedor, o lo
 * deja sin orden. Si el artículo ya está en un pago vivo, primero se anula ese pago.
 */
export async function moverArticuloDeOrden(
  itemId: string,
  input: { destinoOrdenId?: string; motivo?: string },
  options: { registradoPor: string; access?: ShippingV2AccessContext }
) {
  if (options.access?.isSiteAdmin !== true) throw new Error("Solo el Administrador puede mover un artículo de orden.");
  const item = await getShippingV2ItemById(cleanString(itemId), { includeAiName: false, access: systemShippingV2Access() });
  if (!item.ordenCompraId) throw new Error(`${item.sku} no está en una orden de compra.`);
  const pagos = (await listRecordsByIds(SHIPPING_V2_TABLES.pagos, paymentLinkedIdsForItem(item))).map((r) => mapPago(r));
  const enPagoVivo = itemIsLinkedToActivePayment(item, new Map(pagos.map((p) => [p.id, p])));
  const motivo = cleanString(input.motivo);
  const error = validarQuitarDeOrden({ enPagoVivo, motivo });
  if (error) throw new Error(error);
  const destinoId = cleanString(input.destinoOrdenId);
  if (destinoId === item.ordenCompraId) throw new Error("El artículo ya está en esa orden.");
  let destinoOc = "";
  if (destinoId) {
    const destino = await getRecordById(SHIPPING_V2_TABLES.ordenesCompra, destinoId);
    if (!destino) throw new Error("La orden de destino no existe.");
    const base = mapOrdenCompraBase(destino);
    const e = validarArticuloParaOrden({ anulada: base.anulada, proveedorId: base.proveedorId }, item);
    if (e) throw new Error(e);
    destinoOc = base.ocId;
  }
  const origen = await getRecordById(SHIPPING_V2_TABLES.ordenesCompra, item.ordenCompraId);
  const origenOc = origen ? mapOrdenCompraBase(origen).ocId : "la orden anterior";
  await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id: item.id, fields: { [SHIPPING_V2_ITEM_FIELDS.ordenCompra]: destinoId ? [destinoId] : [] } }] }),
  });
  await createShippingV2Event({
    action: "Otro",
    itemRecordId: item.id,
    itemName: item.nombre,
    registradoPor: options.registradoPor,
    descripcion: `${item.sku}: de ${origenOc} a ${destinoOc || "sin orden"} (Administrador). Motivo: ${motivo}`,
  });
  return { sku: item.sku, origenOc, destinoOc };
}

/**
 * Solo Administrador: anula un pago de compra y su egreso en Finanzas (Finanzas
 * no borra: anula). Sus artículos vuelven a "Falta respaldo". Si el egreso ya
 * estaba anulado (un intento anterior a medias) se sigue con el pago.
 */
export async function anularPagoShippingV2(
  pagoRecordId: string,
  input: { motivo?: string },
  options: { registradoPor: string; access?: ShippingV2AccessContext }
) {
  if (options.access?.isSiteAdmin !== true) throw new Error("Solo el Administrador puede anular un pago.");
  const pago = await getShippingV2PagoById(pagoRecordId, options.access);
  if (conceptoDePago(pago.concepto) !== "Compra") throw new Error("Los pagos de flete, arancel u otros todavía no se anulan desde aquí.");
  const motivo = cleanString(input.motivo);
  const error = validarAnularPago({ estado: String(pago.estadoPago), motivo });
  if (error) throw new Error(error);
  const avisos: string[] = [];
  for (const movimientoId of pago.movimientoFinanzasIds) {
    try {
      const r = await anularMovimiento(movimientoId, `Pago ${pago.pagoId} anulado por ${options.registradoPor}: ${motivo}`);
      if (r.warning) avisos.push(r.warning);
    } catch (e) {
      if (!(e instanceof Error && e.message.includes("ya está anulado"))) throw e;
    }
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
          [F.motivoAnulacion]: `${motivo} (anulado por ${options.registradoPor})`,
        },
      }],
    }),
  });
  for (const itemId of [...pago.itemIds, ...pago.regalosIds]) {
    await createShippingV2Event({
      action: "Otro",
      itemRecordId: itemId,
      registradoPor: options.registradoPor,
      descripcion: `Pago ${pago.pagoId} anulado por el Administrador (egreso anulado en Finanzas). Motivo: ${motivo}`,
    });
  }
  return { pago: await getShippingV2PagoById(pago.id, options.access), avisos };
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
  const distributionRuleKeys: Array<keyof ShippingV2PackingWriteInput> = ["reglaDistribucionCostos"];
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
  if (normalized === "en revision") {
    return new Set(distributionRuleKeys);
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

/**
 * Avance real de revisión de varios packings, en UNA sola lectura acotada.
 *
 * La lista de packings solo trae el "Estado Packing" de Airtable, que es
 * manual y no dice nada de lo que pasó con el contenido de la caja. Sin esto,
 * un packing con 46 de 47 artículos sin revisar se ve igual que uno terminado.
 *
 * Se leen únicamente los 4 campos necesarios de Shipping Items (no el registro
 * entero) y se agrupan por el link "Shipping Packings". Las novedades se
 * pasan ya cargadas desde la página para no volver a consultarlas por packing.
 */
export async function getShippingV2PackingsReviewProgress(
  packings: ShippingV2Packing[],
  novedades: ShippingV2Novedad[] = []
): Promise<Map<string, ShippingV2PackingReviewSummary>> {
  const resumen = new Map<string, ShippingV2PackingReviewSummary>();
  if (!packings.length) return resumen;

  const F = SHIPPING_V2_ITEM_FIELDS;
  const records = await listRecords(SHIPPING_V2_TABLES.items, {
    fields: [
      F.sku,
      F.skuProveedor,
      F.nombre,
      F.estadoItem,
      F.recibido,
      F.requiereInspeccion,
      "Revisado física/técnicamente",
      "Fotos tomadas",
      "Shopify publicado",
      "Marketplace publicado",
      "Mercado Libre publicado",
      "Grupos Facebook publicado",
      F.esUsoLocal,
      "Shipping Packings",
    ],
  });

  const itemsPorPacking = new Map<string, ShippingV2ReceptionChecklistItemLike[]>();
  // Fase 2 (15-oct): para buscar una caja por el SKU, SKU proveedor o nombre de lo que lleva.
  const busquedaPorPacking = new Map<string, string[]>();
  for (const record of records) {
    const packingIds = linkedRecordIds(record.fields["Shipping Packings"]);
    if (!packingIds.length) continue;
    const textoBusqueda = [record.fields[F.sku], record.fields[F.skuProveedor], record.fields[F.nombre]].map((v) => firstString(v)).filter(Boolean).join(" ");
    const item: ShippingV2ReceptionChecklistItemLike = {
      id: record.id,
      sku: firstString(record.fields[F.sku]),
      estado: firstString(record.fields[F.estadoItem]),
      recibido: firstBoolean(record.fields[F.recibido]),
      requiereInspeccion: firstBoolean(record.fields[F.requiereInspeccion]),
      revisadoFisicamente: firstBoolean(record.fields["Revisado física/técnicamente"]),
      fotosTomadas: firstBoolean(record.fields["Fotos tomadas"]),
      shopifyPublicado: firstBoolean(record.fields["Shopify publicado"]),
      marketplacePublicado: firstBoolean(record.fields["Marketplace publicado"]),
      mercadoLibrePublicado: firstBoolean(record.fields["Mercado Libre publicado"]),
      gruposFacebookPublicado: firstBoolean(record.fields["Grupos Facebook publicado"]),
      usoLocal: firstBoolean(record.fields[F.esUsoLocal]),
    };
    for (const packingId of packingIds) {
      const bucket = itemsPorPacking.get(packingId);
      if (bucket) bucket.push(item);
      else itemsPorPacking.set(packingId, [item]);
      if (textoBusqueda) busquedaPorPacking.set(packingId, [...(busquedaPorPacking.get(packingId) ?? []), textoBusqueda]);
    }
  }

  for (const packing of packings) {
    const items = itemsPorPacking.get(packing.id) ?? [];
    const progress = calculateShippingV2PackingReviewProgress(items);
    const novedadesAbiertas = novedades.filter((novedad) =>
      isOpenNovedadStatus(novedad.estado) &&
      (novedad.packingId === packing.id || Boolean(novedad.itemId && packing.itemIds.includes(novedad.itemId)))
    ).length;
    resumen.set(packing.id, {
      progress,
      novedadesAbiertas,
      hint: getShippingV2PackingWorkHint({ estado: packing.estado, progress, novedadesAbiertas }),
      busqueda: (busquedaPorPacking.get(packing.id) ?? []).join(" · "),
    });
  }

  return resumen;
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
      // Nombre comercial (factura) pisa el nombre interno si está definido —
      // ej. Roberto-USA (nombre interno con el que trabaja el staff) factura
      // como "LV Electronics Recycling" (nombre público). Vacío en el resto
      // de proveedores, así que no cambia nada para ellos.
      name: provider.nombreComercialFactura || provider.nombre || provider.label,
      logoUrl: provider.logoProveedor[0]?.thumbnailUrl || provider.logoProveedor[0]?.url,
      website: provider.website,
      email: provider.email,
      invoiceFooter: provider.pieFactura,
      template: provider.disenoFactura,
      tagline: provider.esloganFactura,
      companyInfo: provider.datosEmpresaFactura,
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

// Mismo patrón que isPackingWeightOnlyInput: un proveedor con
// canEditPackingShippingFields (sin canEditPacking completo) solo puede
// tocar estos 3 campos — cualquier otro campo colado en el mismo request
// tumba la validación en vez de dejarlo pasar.
const PACKING_SHIPPING_FIELDS: ReadonlySet<keyof ShippingV2PackingWriteInput> = new Set(["trackingUsa", "transportistaUsa", "observaciones"]);

function isPackingShippingFieldsOnlyInput(input: ShippingV2PackingWriteInput) {
  const keys = Object.keys(input).filter((key) => Object.prototype.hasOwnProperty.call(input, key)) as Array<keyof ShippingV2PackingWriteInput>;
  return keys.length > 0 && keys.every((key) => PACKING_SHIPPING_FIELDS.has(key));
}

export async function updateShippingV2Packing(recordId: string, input: ShippingV2PackingWriteInput, options: { actualizadoPor: string; access?: ShippingV2AccessContext }) {
  const canEditPacking = canShippingV2(options.access, "canEditPacking");
  const canEditWeightOnly = isPackingWeightOnlyInput(input) && canShippingV2(options.access, "canEditPackingWeight");
  const canEditShippingFieldsOnly = isPackingShippingFieldsOnlyInput(input) && canShippingV2(options.access, "canEditPackingShippingFields");
  if (!canEditPacking && !canEditWeightOnly && !canEditShippingFieldsOnly) {
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
  if (COSTOS_PACKING_INPUT_KEYS.some((key) => hasOwnInput(input, key))) {
    await repartirCostosPackingTrasCambio(id, options.actualizadoPor, "Cambio de costos o regla del packing.");
  }
  return getShippingV2PackingById(id, options.access, { includeAiName: false });
}

function isPackingCandidate(item: ShippingV2Item) {
  // Punto 2 (oct-2026): si el artículo ya sabe de dónde viene, cualquier cosa
  // que venga de afuera y no haya llegado puede ir en una caja, local o
  // extranjera, aunque haya viajado solo hasta el casillero ("En tránsito").
  // Ya no depende de "Modo logístico" ni de "Requiere packing".
  if (normalizarOrigen(item.origenArticulo)) return puedeEntrarACaja(item);
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
    if (!item.requierePacking && !normalizarOrigen(item.origenArticulo)) throw new Error(`El item ${item.sku} no requiere packing.`);
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
  await repartirCostosPackingTrasCambio(id, options.registradoPor, "Items agregados al packing.");
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
        // Fuera del packing ya no carga flete/arancel/otros de esa caja (misma
        // regla que al cancelar la caja: cancelar-caja.ts).
        fields: camposArticuloFueraDeCaja(options.registradoPor),
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
  await repartirCostosPackingTrasCambio(id, options.registradoPor, "Item removido del packing.");
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

// ─── Reparto de costos del packing (flete, arancel, otros) ───────────────────
//
// El cálculo vive en packing-reparto.ts (puro, con pruebas). Aquí solo se lee
// el packing, se llama a calcularRepartoPacking() y se guardan en cada Item el
// monto de su REGISTRO y sus "Unidades en packing". Las fórmulas de Airtable
// ("Costo flete asignado" y hermanas) dividen ese monto entre las unidades, de
// modo que Airtable y el portal muestran el mismo número.

export type ShippingV2RecalculoCostosPacking =
  | {
      estado: "aplicado" | "vista-previa" | "sin-cambios";
      packingRecordId: string;
      packingId: string;
      reparto: Extract<ResultadoReparto, { ok: true }>;
      /** Registros cuyo valor guardado cambia (o cambiaría en vista previa). */
      cambios: Array<{
        id: string;
        sku: string;
        antes: { unidades: number | null; flete: number | null; arancel: number | null; otros: number | null; fletePorUnidad: number | null; totalUnidad: number | null };
        despues: { unidades: number; flete: number; arancel: number; otros: number; fletePorUnidad: number; totalUnidad: number };
      }>;
    }
  | { estado: "omitido"; packingRecordId: string; packingId: string; motivo: string };

const enCentavos = (valor: number | null | undefined) => (typeof valor === "number" && Number.isFinite(valor) ? Math.round(valor * 100) : null);

export async function recalcularCostosShippingV2Packing(
  packingRecordId: string,
  options: { registradoPor: string; vistaPrevia?: boolean; access?: ShippingV2AccessContext; motivo?: string }
): Promise<ShippingV2RecalculoCostosPacking> {
  assertShippingV2GeneratedSchema();
  const id = cleanString(packingRecordId);
  if (!id) throw new Error("Record ID de packing inválido.");
  // Valida acceso con el contexto de quien llama, pero los items se leen SIN
  // sanear: el reparto necesita el costo proveedor real aunque quien dispara
  // el recálculo no pueda verlo.
  const packing = await getShippingV2PackingById(id, options.access, { includeItems: false, includeAiName: false });
  const records = await listRecordsByIds(SHIPPING_V2_TABLES.items, packing.itemIds);
  const items = records.map((record) => mapItem(record, { includeAiName: false }));

  const reparto = calcularRepartoPacking(
    {
      estado: packing.estado,
      regla: packing.reglaDistribucionCostos,
      flete: packing.flete,
      arancel: packing.arancel,
      otrosCostos: packing.otrosCostos,
    },
    items.map((item) => ({
      id: item.id,
      sku: item.sku,
      cantidad: item.cantidad,
      unidadesEnPacking: item.unidadesEnPacking,
      costoProveedor: item.costoProveedor,
      esRegalo: item.esRegalo,
    }))
  );
  if (!reparto.ok) {
    return { estado: "omitido", packingRecordId: id, packingId: packing.packingId, motivo: reparto.motivo };
  }

  const itemsById = new Map(items.map((item) => [item.id, item]));
  const cambios = reparto.registros
    .map((registro) => {
      const item = itemsById.get(registro.id)!;
      const igual =
        item.unidadesEnPacking === registro.unidades &&
        enCentavos(item.fleteAsignadoRegistro) === enCentavos(registro.fleteRegistro) &&
        enCentavos(item.arancelAsignadoRegistro) === enCentavos(registro.arancelRegistro) &&
        enCentavos(item.otrosCostosAsignadosRegistro) === enCentavos(registro.otrosRegistro);
      if (igual) return null;
      return {
        id: registro.id,
        sku: registro.sku,
        antes: {
          unidades: item.unidadesEnPacking,
          flete: item.fleteAsignadoRegistro,
          arancel: item.arancelAsignadoRegistro,
          otros: item.otrosCostosAsignadosRegistro,
          fletePorUnidad: item.costoFleteAsignado,
          totalUnidad: item.costoTotalUnidad,
        },
        despues: {
          unidades: registro.unidades,
          flete: registro.fleteRegistro,
          arancel: registro.arancelRegistro,
          otros: registro.otrosRegistro,
          fletePorUnidad: registro.fletePorUnidad,
          totalUnidad: registro.totalUnidad,
        },
      };
    })
    .filter((cambio): cambio is NonNullable<typeof cambio> => cambio !== null);

  const base = { packingRecordId: id, packingId: packing.packingId, reparto, cambios };
  if (options.vistaPrevia) return { estado: "vista-previa", ...base };
  if (!cambios.length) return { estado: "sin-cambios", ...base };

  await patchAirtableRecords(SHIPPING_V2_TABLES.items, cambios.map((cambio) => ({
    id: cambio.id,
    fields: {
      [SHIPPING_V2_ITEM_FIELDS.unidadesEnPacking]: cambio.despues.unidades,
      [SHIPPING_V2_ITEM_FIELDS.fleteAsignadoRegistro]: cambio.despues.flete,
      [SHIPPING_V2_ITEM_FIELDS.arancelAsignadoRegistro]: cambio.despues.arancel,
      [SHIPPING_V2_ITEM_FIELDS.otrosCostosAsignadosRegistro]: cambio.despues.otros,
    },
  })));

  const t = reparto.totales;
  await createShippingV2Event({
    action: "Actualizado",
    entity: "Shipping Packing",
    packingRecordId: id,
    registradoPor: options.registradoPor,
    descripcion:
      `Costos del packing repartidos (${packing.reglaDistribucionCostos || "sin regla"}) en ${cambios.length} registro(s): ` +
      `flete ${formatMoneyForEvent(t.flete)}, arancel ${formatMoneyForEvent(t.arancel)}, otros ${formatMoneyForEvent(t.otros)} ` +
      `sobre ${t.unidades} unidad(es) y subtotal proveedor ${formatMoneyForEvent(t.subtotalProveedor)}.`,
    observacion: [options.motivo, ...reparto.advertencias].filter(Boolean).join(" ") || undefined,
  });
  invalidateShippingV2ItemSearchIndexCache();
  return { estado: "aplicado", ...base };
}

function formatMoneyForEvent(valor: number) {
  return `$${valor.toFixed(2)}`;
}

/**
 * Recalcula después de una escritura que ya se hizo (editar flete, agregar o
 * quitar items, cambiar costo o cantidad). No lanza: la escritura original ya
 * quedó guardada y deshacerla sería peor. Si el reparto no se puede hacer o
 * falla, queda registrado para revisión.
 */
async function repartirCostosPackingTrasCambio(packingRecordId: string, registradoPor: string, motivo: string) {
  try {
    const resultado = await recalcularCostosShippingV2Packing(packingRecordId, {
      registradoPor,
      access: systemShippingV2Access(),
      motivo,
    });
    if (resultado.estado === "omitido") {
      console.warn("[Shipping V2 reparto costos] omitido", { packingRecordId, motivo: resultado.motivo });
    }
    return resultado;
  } catch (error) {
    console.error("[Shipping V2 reparto costos] error", { packingRecordId, error });
    await createShippingV2Event({
      action: "Otro",
      entity: "Shipping Packing",
      packingRecordId,
      registradoPor,
      descripcion: "No se pudieron repartir los costos del packing. Revisa flete/arancel/otros de sus artículos.",
      observacion: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

const COSTOS_PACKING_INPUT_KEYS = ["flete", "arancel", "otrosCostos", "reglaDistribucionCostos"] as const;

/** Campos del item cuyo cambio mueve el reparto de su packing. */
const ITEM_FIELDS_QUE_MUEVEN_REPARTO: ReadonlySet<string> = new Set([
  SHIPPING_V2_ITEM_FIELDS.cantidad,
  SHIPPING_V2_ITEM_FIELDS.costoProveedor,
  SHIPPING_V2_ITEM_FIELDS.esRegalo,
  SHIPPING_V2_ITEM_FIELDS.tipoOperacion,
]);

/** Vuelve a leer el item para devolver los costos por unidad ya recalculados. */
async function releerItemRecord(recordId: string) {
  const record = await airtableRequest<AirtableRecordResponse>(`${tableUrl(SHIPPING_V2_TABLES.items)}/${encodeURIComponent(recordId)}`);
  return mapItem(record);
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

/**
 * ¿Esta novedad sigue pidiendo trabajo?
 *
 * Antes se comparaba contra una lista de palabras ("resuelta", "cerrada"…) que
 * NO incluía dos estados reales de Airtable: "Rechazada" y "Cerrada sin
 * respuesta". Ambos contaban como abiertos para siempre, así que bloqueaban el
 * cierre de ciclo del packing y la disponibilidad del artículo sin que hubiera
 * forma de desbloquearlos. La lista buena vive en novedades.ts.
 */
function isOpenNovedadStatus(status: string) {
  return isNovedadAbierta(status);
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
  options: {
    actualizadoPor: string;
    /**
     * Solo firmarShippingV2InspeccionTecnica lo pasa. "Revisado" tiene UNA
     * sola forma de marcarse: firmar la ficha de inspección técnica (decisión
     * del dueño, 4-oct-2026). Desmarcarlo (reabrir la inspección) sí se puede
     * desde la pantalla de inspección.
     */
    desdeFirmaInspeccion?: boolean;
  }
) {
  const id = cleanString(recordId);
  if (!id) throw new Error("Record ID de item inválido.");
  if (input.action === "reviewed" && input.value === true && options.desdeFirmaInspeccion !== true) {
    throw new Error("“Revisado” se marca solo al firmar la ficha de inspección técnica.");
  }
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

  // La etiqueta "Estado Item" ya no la mueve un botón: la pone el sistema
  // cuando el artículo llega y, si requiere inspección, cuando se firma
  // (lib/shipping-v2/item-venta.ts → estadoSegunLlegada). Esto también saca
  // de "Pagado"/"Pendiente de pago" a lo que llega directo sin packing (C-1).
  const requiereInspeccion = item.requiereInspeccion === true;
  let estadoNuevo: string | null = null;

  if (input.action === "received") {
    if (input.value) {
      const currentReviewStatus = normalizeStatus(item.estadoRevision || "");
      if (!currentReviewStatus || currentReviewStatus === "pendiente de recepcion" || currentReviewStatus === "pendiente de recepción" || currentReviewStatus === "no aplica") {
        // Sin inspección pendiente (no la requiere o ya está firmada) no queda
        // nada que revisar: "Recibido correctamente".
        fields[SHIPPING_V2_ITEM_FIELDS.estadoRevision] = requiereInspeccion && item.revisadoFisicamente !== true
          ? "Recibido pendiente de revisión"
          : "Recibido correctamente";
      }
      estadoNuevo = estadoSegunLlegada({
        estado: item.estado,
        recibido: true,
        requiereInspeccion,
        inspeccionFirmada: item.revisadoFisicamente === true,
        usoLocal: item.usoLocal,
        todasReservadas: todasReservadas(item),
      });
    } else {
      fields[SHIPPING_V2_ITEM_FIELDS.estadoRevision] = "Pendiente de recepción";
      // "Disponible para venta" (= se puede reservar) NO se apaga: reservar
      // no depende de que el artículo esté en la tienda. Lo que deja de poder
      // hacerse es VENDERLO, y eso ya lo impide la regla de item-venta.ts.
      if (["recibido", "en revision", "en revisión", "disponible"].includes(normalizeStatus(item.estado))) {
        fields[SHIPPING_V2_ITEM_FIELDS.estadoItem] = "Recibido";
      }
      for (const [action, config] of Object.entries(RECEPTION_CHECKLIST_FIELDS) as Array<[ShippingV2RecepcionChecklistAction, ReceptionChecklistFieldConfig]>) {
        if (action !== "received" && action !== "facebook-super-geek") fields[config.checked] = false;
      }
    }
  } else if (input.action === "reviewed") {
    fields[SHIPPING_V2_ITEM_FIELDS.estadoRevision] = input.value ? "Recibido correctamente" : "Recibido pendiente de revisión";
    // Firmar → "Disponible". Reabrir → vuelve a "En revisión".
    estadoNuevo = estadoSegunLlegada({
      estado: item.estado,
      recibido: item.recibido === true,
      requiereInspeccion,
      inspeccionFirmada: input.value,
      usoLocal: item.usoLocal,
      todasReservadas: todasReservadas(item),
    });
  }
  if (estadoNuevo) fields[SHIPPING_V2_ITEM_FIELDS.estadoItem] = estadoNuevo;

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
    descripcion: `Recepción: ${checklistFields.label} = ${input.value ? "sí" : "no"}.` +
      (estadoNuevo ? ` Estado: ${item.estado || "—"} → ${estadoNuevo}.` : ""),
    observacion: note,
  });
  if (estadoNuevo) invalidateShippingV2ItemSearchIndexCache();

  // Cierre automático del ciclo del packing. Va después del evento para que el
  // historial conserve el orden real: primero la casilla, luego el cierre que
  // esa casilla provocó.
  const packingsDelItem = linkedRecordIds(updated.fields["Shipping Packings"]);
  if (packingsDelItem.length) {
    const cerrados = await autoCerrarShippingV2PackingsDeItem(packingsDelItem, options.actualizadoPor);
    if (cerrados.length) return { ...updatedItem, packingsCerradosAutomaticamente: cerrados };
  }

  return updatedItem;
}

/**
 * Cierra solo el ciclo de los packings de un artículo, si ya corresponde.
 *
 * El estado "Ciclo cerrado" no tiene ninguna decisión humana dentro: es
 * enteramente derivable de los artículos (todos con su checklist completo) y
 * de las novedades (ninguna abierta). Obligar a alguien a entrar al detalle
 * del packing y pulsar un botón para confirmar algo que el sistema ya sabe es
 * trabajo inventado, y es la razón de que ningún packing llegara nunca a
 * cerrarse.
 *
 * Distinto es cerrar CON artículos incompletos o CON novedades: eso sí es un
 * juicio y sigue siendo manual, con justificación y solo para administradores.
 *
 * Nunca lanza: es un efecto secundario de guardar una casilla en Recepción.
 * Si el cierre automático falla, la casilla igual se guardó y el cierre se
 * puede hacer a mano; romper el guardado por esto sería peor.
 */
async function autoCerrarShippingV2PackingsDeItem(
  packingIds: string[],
  actor: string
): Promise<string[]> {
  const cerrados: string[] = [];
  for (const packingId of packingIds) {
    try {
      const packing = await getShippingV2PackingById(packingId, systemShippingV2Access());
      if (normalizeStatus(packing.estado) !== "en revision") continue;

      const progreso = calculateShippingV2PackingReviewProgress(packing.items);
      if (!progreso.completo) continue;

      const novedadesAbiertas = await getOpenNovedadesForPacking(packing);
      if (novedadesAbiertas.length) continue;

      await patchPackingStatus({
        packing,
        estado: "Cerrado final",
        actor,
        access: systemShippingV2Access(),
        descripcion: `Ciclo cerrado automáticamente: los ${progreso.total} artículos completaron su checklist y no hay novedades abiertas.`,
      });
      cerrados.push(packing.packingId || packing.id);
    } catch (error) {
      console.error(`No se pudo cerrar automáticamente el packing ${packingId}:`, error);
    }
  }
  return cerrados;
}

function generateItemNovedadId(item: ShippingV2Item) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const time = String(Date.now()).slice(-5);
  return `NOV-${item.sku || item.id}-${date}-${time}`;
}

// ─── Novedades (auditoría Shipping V2, punto 8 · 10-oct-2026) ──────────────
// Las reglas viven en lib/shipping-v2/novedades.ts (puras, con pruebas). Aquí
// solo se lee, se valida con esas reglas y se escribe. Resumen:
//  · El tipo decide quién resuelve; solo 3 estados; el proveedor solo responde.
//  · La venta se bloquea con la casilla "Bloquea venta" y SOLO el
//    Administrador la quita. Mientras haya un bloqueo, el artículo muestra
//    "Con novedad" (o "Perdido en tienda") y no se reserva ni se vende.
//  · Al resolver se elige qué pasa con el artículo y el sistema lo EJECUTA.

const CAMPOS_NOVEDAD = {
  bloqueaVenta: "Bloquea venta",
  decision: "Decisión sobre el artículo",
  desbloqueadaPor: "Venta desbloqueada por",
  fechaDesbloqueo: "Fecha de desbloqueo",
  estadoPrevio: "Estado previo del artículo",
  comoAparecio: "Cómo apareció",
  cantidadAfectada: "Cantidad afectada",
  precioConDescuento: "Precio con descuento",
  valorPerdida: "Valor de la pérdida",
  perdidaPorDistribuir: "Pérdida por distribuir",
  // Punto 8c: enlace temporal del correo al proveedor.
  enlaceHuella: "Enlace proveedor (huella)",
  enlaceVence: "Enlace proveedor vence",
  ultimoCorreo: "Último correo al proveedor",
} as const;

/** Rol de la sesión frente a una novedad. El servidor nunca confía en la pantalla. */
function rolNovedad(access?: ShippingV2AccessContext): ShippingV2NovedadRol {
  if (!access) return "ninguno";
  if (access.isAdmin === true) return access.isSiteAdmin === true ? "admin" : "staff";
  if (access.providerId && access.permissions.canRespondNovedades === true) return "proveedor";
  return "ninguno";
}

/** Pone la etiqueta de bloqueo y apaga "Disponible para venta". */
async function aplicarBloqueoEnArticulo(item: ShippingV2Item, etiqueta: string, actor: string): Promise<ShippingV2Item> {
  // "Perdido en tienda" manda sobre "Con novedad".
  const destino = esPerdidoEnTienda(item.estado) ? item.estado : etiqueta;
  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
    method: "PATCH",
    // typecast: crea la opción "Perdido en tienda" la primera vez.
    body: JSON.stringify({
      typecast: true,
      records: [{
        id: item.id,
        fields: {
          [SHIPPING_V2_ITEM_FIELDS.estadoItem]: destino,
          [SHIPPING_V2_ITEM_FIELDS.disponibleVenta]: false,
          [SHIPPING_V2_ITEM_FIELDS.ultimaActualizacion]: new Date().toISOString(),
          [SHIPPING_V2_ITEM_FIELDS.actualizadoPor]: actor,
        },
      }],
    }),
  });
  const updated = response.records?.[0];
  invalidateShippingV2ItemSearchIndexCache();
  return updated ? mapItem(updated) : item;
}

export async function createShippingV2ItemNovedad(
  recordId: string,
  input: ShippingV2ItemNovedadInput,
  options: { registradoPor: string; access?: ShippingV2AccessContext; origin?: string }
) {
  const id = cleanString(recordId);
  if (!id) throw new Error("Record ID de item inválido.");
  const resultado = await withLock(`shipping-item:${id}`, async () => {
    const item = await getShippingV2ItemById(id, { includeAiName: false, access: systemShippingV2Access() });
    const validacion = validarRegistroNovedad({
      tipo: input.tipo,
      responsable: input.responsable,
      descripcion: input.descripcion,
      bloquearVenta: input.bloquearVenta === true,
      // Solo el personal de la tienda registra (un proveedor nunca).
      esPersonalTienda: options.access?.isAdmin === true,
      articulo: { estado: item.estado, cantidad: item.cantidad, recibido: item.recibido, proveedorCompraId: item.proveedorId },
    });
    if (!validacion.ok) throw new Error(validacion.motivo);

    const descripcion = cleanString(input.descripcion);
    const packingId = cleanString(input.packingId);
    const ahora = new Date().toISOString();
    const conProveedor = validacion.responsable === "Proveedor";

    const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.novedades), {
      method: "POST",
      body: JSON.stringify({
        typecast: true,
        records: [{
          fields: compactFields({
            "Novedad ID": generateItemNovedadId(item),
            "Tipo de novedad": validacion.tipo,
            "Item relacionado": [item.id],
            "Packing relacionado": packingId ? [packingId] : undefined,
            // Siempre el proveedor de COMPRA (a quien se le reclama), nunca el
            // logístico.
            "Proveedor responsable": item.proveedorId ? [item.proveedorId] : undefined,
            "Responsable de solución": validacion.responsable,
            "Estado Novedad": "Abierta",
            "Descripción": descripcion,
            "Fecha de registro": ahora,
            "Registrado por": options.registradoPor,
            "Fecha enviada a proveedor": conProveedor ? ahora : undefined,
            [CAMPOS_NOVEDAD.bloqueaVenta]: validacion.bloqueaVenta ? true : undefined,
            [CAMPOS_NOVEDAD.estadoPrevio]: validacion.bloqueaVenta ? item.estado : undefined,
          }),
        }],
      }),
    });
    const created = response.records?.[0];
    if (!created) throw new Error("Airtable no devolvió la novedad creada.");

    // Sin la casilla, el artículo no cambia: se puede seguir vendiendo.
    let updatedItem = item;
    let aviso = "";
    if (validacion.bloqueaVenta) {
      try {
        updatedItem = await aplicarBloqueoEnArticulo(item, esPerdidoEnTienda(validacion.tipo) ? ETIQUETA_PERDIDO : ETIQUETA_CON_NOVEDAD, options.registradoPor);
      } catch (error) {
        // La novedad YA quedó guardada: no se lanza error (un reintento la
        // duplicaría). Se avisa para bloquear de nuevo desde Novedades.
        console.error("Novedad creada, pero no se pudo bloquear el artículo:", error);
        aviso = "La novedad se guardó, pero el artículo no se pudo bloquear. Ábrela en Novedades y pulsa “Bloquear venta”.";
      }
    }

    await createShippingV2Event({
      action: "Novedad abierta",
      entity: "Shipping Novedad",
      itemRecordId: item.id,
      packingRecordId: packingId || undefined,
      novedadRecordId: created.id,
      registradoPor: options.registradoPor,
      descripcion: `Novedad registrada: ${validacion.tipo}${conProveedor ? " (con el proveedor)" : ""}${validacion.bloqueaVenta ? " · venta bloqueada" : ""}.`,
      observacion: descripcion,
      estadoAnterior: validacion.bloqueaVenta ? item.estado : undefined,
      estadoNuevo: validacion.bloqueaVenta ? updatedItem.estado : undefined,
    });

    return { item: updatedItem, novedad: mapNovedad(created), aviso, conProveedor };
  });

  // Punto 8c: correo al proveedor. Fuera del candado del artículo (el orden
  // permitido es novedad → artículo, nunca al revés). Si falla, la novedad
  // igual quedó guardada: solo se avisa.
  let aviso = resultado.aviso;
  let correo = "";
  if (resultado.conProveedor && options.origin) {
    const envio = await withLock(`shipping-novedad:${resultado.novedad.id}`, () =>
      notificarProveedorPorCorreo(resultado.novedad.id, { motivo: "nueva", origin: options.origin! })
    ).catch((error): { enviadoA?: string; aviso: string } => {
      console.error("No se pudo avisar por correo la novedad nueva:", error);
      return { aviso: "La novedad se guardó, pero no se pudo enviar el correo al proveedor." };
    });
    if (envio.aviso) aviso = [aviso, envio.aviso].filter(Boolean).join(" ");
    correo = envio.enviadoA ?? "";
  }
  return { item: resultado.item, novedad: resultado.novedad, aviso, correo };
}

// ─── Correo al proveedor (punto 8c · 11-oct-2026) ───────────────────────────

/**
 * Envía al proveedor el correo con el botón RESPONDER y deja anotado en la
 * novedad cuándo y a quién se envió (o por qué no).
 *
 * Quien la llama debe tener el candado `shipping-novedad:` de esta novedad.
 * NUNCA lanza error: la novedad ya está guardada y el correo es un extra.
 */
async function notificarProveedorPorCorreo(
  novedadRecordId: string,
  opciones: { motivo: "nueva" | "respuesta"; origin: string; mensaje?: string }
): Promise<{ enviadoA?: string; aviso: string }> {
  const ahora = new Date();
  const anotar = async (texto: string, extra: Record<string, unknown> = {}) => {
    await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.novedades), {
      method: "PATCH",
      body: JSON.stringify({ records: [{ id: novedadRecordId, fields: { ...extra, [CAMPOS_NOVEDAD.ultimoCorreo]: `[${ahora.toISOString()}] ${texto}` } }] }),
    }).catch((error) => console.error("No se pudo anotar el correo en la novedad:", error));
  };

  try {
    const record = await airtableRequest<AirtableRecordResponse>(
      `${tableUrl(SHIPPING_V2_TABLES.novedades)}/${encodeURIComponent(novedadRecordId)}`
    );
    const novedad = mapNovedad(record);
    if (!esResponsableProveedor(novedad.responsable)) return { aviso: "" };

    const proveedor = novedad.proveedorResponsableId ? await getShippingV2ProveedorById(novedad.proveedorResponsableId) : null;
    if (!proveedor || !proveedorRecibeCorreo({ email: proveedor.email, permisosPortal: proveedor.permisosPortal })) {
      await anotar("No se envió: el proveedor no tiene portal (correo registrado y permiso “Responder novedades”).");
      return { aviso: "El proveedor no tiene portal: no se le envió correo. Avísale por otro medio y anota su respuesta en la novedad." };
    }

    const { config, falta } = leerConfigCorreoNovedades();
    if (!config) {
      console.error("Correo de novedades sin configurar. Falta:", falta.join(", "));
      await anotar(`No se envió: falta configurar el correo de staff (${falta.join(", ")}).`);
      return { aviso: "La novedad se guardó, pero el correo al proveedor no salió: falta configurar el correo de staff en Vercel." };
    }

    const itemRecord = novedad.itemId ? await getRecordById(SHIPPING_V2_TABLES.items, novedad.itemId) : null;
    const sku = itemRecord ? firstString(itemRecord.fields[getOfficialSkuField()], novedad.itemId) : "";
    const articulo = itemRecord ? firstString(itemRecord.fields[SHIPPING_V2_ITEM_FIELDS.nombre]) : "";

    // Primero se guarda la huella del enlace nuevo (reemplaza al anterior) y
    // después se envía: así el botón ya funciona cuando llega el correo.
    const token = generarTokenEnlace();
    const vence = venceEnlace(ahora);
    await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.novedades), {
      method: "PATCH",
      body: JSON.stringify({ records: [{ id: novedadRecordId, fields: { [CAMPOS_NOVEDAD.enlaceHuella]: huellaToken(token), [CAMPOS_NOVEDAD.enlaceVence]: vence } }] }),
    });

    const correo = construirCorreoNovedad({
      motivo: opciones.motivo,
      proveedorNombre: proveedor.nombre,
      novedadId: novedad.novedadId,
      sku,
      articulo,
      tipo: novedad.tipo,
      descripcion: novedad.descripcion ?? "",
      mensaje: opciones.mensaje,
      url: urlEnlaceNovedad(opciones.origin, token),
      vence,
      correoRespuesta: config.correoRespuesta,
    });
    const para = String(proveedor.email).trim();
    try {
      await enviarCorreoNovedad(config, { para, asunto: correo.asunto, html: correo.html, texto: correo.texto });
    } catch (error) {
      const detalle = error instanceof Error ? error.message : "error inesperado";
      console.error("No se pudo enviar el correo de la novedad:", { novedadRecordId, detalle });
      await anotar(`No se envió a ${para}: ${detalle}`);
      return { aviso: `La novedad se guardó, pero el correo a ${para} no salió (${detalle}). Avísale por otro medio.` };
    }
    await anotar(`Enviado a ${para} (${opciones.motivo === "nueva" ? "novedad nueva" : "nuestra respuesta"}). El enlace vence el ${vence.slice(0, 10)}.`);
    return { enviadoA: para, aviso: "" };
  } catch (error) {
    console.error("Falló el aviso por correo de la novedad:", error);
    await anotar(`No se envió: ${error instanceof Error ? error.message : "error inesperado"}`);
    return { aviso: "La novedad se guardó, pero no se pudo enviar el correo al proveedor." };
  }
}

/** Lo que ve el proveedor al abrir el enlace del correo (sin iniciar sesión). */
export type VistaNovedadPorEnlace =
  | { estado: "no-existe" | "vencido" }
  | { estado: "sin-turno"; novedadId: string; sku: string; articulo: string }
  | {
      estado: "vigente";
      novedadId: string;
      proveedorNombre: string;
      sku: string;
      articulo: string;
      tipo: string;
      fechaRegistro: string;
      vence: string;
      hilo: Array<{ fecha: string; autor: string; texto: string; lado: "super-geek" | "proveedor" }>;
      evidencias: Array<{ url: string; nombre: string; miniatura: string; esImagen: boolean }>;
      propuestas: Array<{ valor: string; label: string }>;
    };

/** Busca la novedad por la huella del código. Solo hex: no hay nada que escapar. */
async function buscarNovedadPorToken(token: string): Promise<AirtableRecord | null> {
  if (!TOKEN_ENLACE_REGEX.test(token)) return null;
  const records = await listRecords(SHIPPING_V2_TABLES.novedades, {
    filterByFormula: `{${CAMPOS_NOVEDAD.enlaceHuella}} = '${huellaToken(token)}'`,
    maxRecords: 1,
  });
  return records[0] ?? null;
}

/** La novedad está esperando la respuesta del proveedor por este medio. */
function novedadAdmiteRespuestaPorEnlace(novedad: ShippingV2Novedad) {
  return normalizarEstadoNovedad(novedad.estado) === "Abierta" && esResponsableProveedor(novedad.responsable);
}

export async function leerNovedadPorEnlace(token: string): Promise<VistaNovedadPorEnlace> {
  const record = await buscarNovedadPorToken(token);
  if (!record) return { estado: "no-existe" };
  const original = mapNovedad(record);
  const enlace = evaluarEnlace({ token, huellaGuardada: firstString(record.fields[CAMPOS_NOVEDAD.enlaceHuella]), vence: firstString(record.fields[CAMPOS_NOVEDAD.enlaceVence]) });
  if (!enlace.ok) return { estado: enlace.motivo === "vencido" ? "vencido" : "no-existe" };

  const itemRecord = original.itemId ? await getRecordById(SHIPPING_V2_TABLES.items, original.itemId) : null;
  const sku = itemRecord ? firstString(itemRecord.fields[getOfficialSkuField()]) : "";
  const articulo = itemRecord ? firstString(itemRecord.fields[SHIPPING_V2_ITEM_FIELDS.nombre]) : "";
  if (!novedadAdmiteRespuestaPorEnlace(original)) return { estado: "sin-turno", novedadId: original.novedadId, sku, articulo };

  const proveedor = original.proveedorResponsableId ? await getShippingV2ProveedorById(original.proveedorResponsableId) : null;
  const novedad = ocultarDatosInternosNovedad(original);
  // Del lado de la tienda no se muestran nombres del personal: solo "SUPER GEEK".
  const hilo = construirHiloNovedad(novedad).map((entrada) => ({
    fecha: entrada.fecha,
    autor: entrada.lado === "super-geek" ? "SUPER GEEK" : entrada.autor,
    texto: entrada.texto,
    lado: entrada.lado,
  }));
  return {
    estado: "vigente",
    novedadId: novedad.novedadId,
    proveedorNombre: proveedor?.nombre ?? "",
    sku,
    articulo,
    tipo: novedad.tipo,
    fechaRegistro: novedad.fechaRegistro ?? "",
    vence: firstString(record.fields[CAMPOS_NOVEDAD.enlaceVence]),
    hilo,
    evidencias: novedad.evidencias.map((a) => ({
      url: a.url,
      nombre: a.filename || "Archivo",
      miniatura: a.thumbnailUrl || a.url,
      esImagen: String(a.type || "").startsWith("image/"),
    })),
    propuestas: SHIPPING_V2_PROPUESTAS_PROVEEDOR.map((p) => ({ valor: p.valor, label: p.label })),
  };
}

export type RespuestaPorEnlace =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * El proveedor responde desde el enlace. Mismas reglas que "Responder" en el
 * portal; el enlace queda inutilizado al guardar (un solo uso).
 */
export async function responderNovedadPorEnlace(
  token: string,
  input: { texto: string; propuesta?: string },
  meta: { ip?: string } = {}
): Promise<RespuestaPorEnlace> {
  const encontrado = await buscarNovedadPorToken(token);
  if (!encontrado) return { ok: false, status: 404, error: "Este enlace ya no es válido. Si ya respondió, su respuesta quedó registrada." };
  const id = encontrado.id;

  return withLock(`shipping-novedad:${id}`, async (): Promise<RespuestaPorEnlace> => {
    // Se vuelve a leer dentro del candado: dos envíos a la vez no se duplican.
    const record = await airtableRequest<AirtableRecordResponse>(`${tableUrl(SHIPPING_V2_TABLES.novedades)}/${encodeURIComponent(id)}`);
    const enlace = evaluarEnlace({ token, huellaGuardada: firstString(record.fields[CAMPOS_NOVEDAD.enlaceHuella]), vence: firstString(record.fields[CAMPOS_NOVEDAD.enlaceVence]) });
    if (!enlace.ok) {
      return enlace.motivo === "vencido"
        ? { ok: false, status: 410, error: "Este enlace venció. Puede responder desde el portal de proveedores o escribirnos por correo." }
        : { ok: false, status: 404, error: "Este enlace ya no es válido. Si ya respondió, su respuesta quedó registrada." };
    }
    const novedad = mapNovedad(record);
    if (!novedadAdmiteRespuestaPorEnlace(novedad)) {
      return { ok: false, status: 409, error: "Esta novedad ya no espera su respuesta." };
    }

    const texto = cleanString(input.texto).slice(0, 4000);
    const propuesta = cleanString(input.propuesta);
    const validacion = validarAccionNovedad({
      accion: "responder",
      novedad: { estado: novedad.estado, responsable: novedad.responsable, tipo: novedad.tipo, bloqueaVenta: novedad.bloqueaVenta, decision: novedad.decision },
      rol: "proveedor",
      valores: { texto, propuesta },
    });
    if (!validacion.ok) return { ok: false, status: 400, error: validacion.motivo };

    const proveedor = novedad.proveedorResponsableId ? await getShippingV2ProveedorById(novedad.proveedorResponsableId) : null;
    const autor = `${proveedor?.nombre || "Proveedor"} (desde el correo)`;
    const now = new Date().toISOString();
    const cuerpo = propuesta ? `Propone: ${etiquetaPropuesta(propuesta)}. ${texto}` : texto;
    const fields: Record<string, unknown> = {
      "Respuesta del proveedor": appendEntradaHilo(novedad.respuestaProveedor, autor, cuerpo, now),
      "Fecha de respuesta del proveedor": now,
      "Última actualización": now,
      "Actualizado por": autor,
      // Un solo uso.
      [CAMPOS_NOVEDAD.enlaceHuella]: null,
      [CAMPOS_NOVEDAD.enlaceVence]: null,
    };
    if (propuesta) fields["Solución"] = propuesta;
    await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.novedades), {
      method: "PATCH",
      body: JSON.stringify({ typecast: true, records: [{ id, fields }] }),
    });

    await createShippingV2Event({
      action: "Cambio de estado",
      entity: "Shipping Novedad",
      novedadRecordId: id,
      itemRecordId: novedad.itemId,
      packingRecordId: novedad.packingId,
      registradoPor: autor,
      descripcion: "Novedad — el proveedor respondió desde el enlace del correo.",
      observacion: [texto, propuesta ? `Propuesta: ${etiquetaPropuesta(propuesta)}` : "", meta.ip ? `IP ${meta.ip}` : ""].filter(Boolean).join(" · "),
      estadoAnterior: novedad.estado,
      estadoNuevo: novedad.estado,
    }).catch((error) => console.error("No se pudo registrar el evento de la respuesta por enlace:", error));

    return { ok: true };
  });
}

/**
 * Recalcula el bloqueo y la disponibilidad de un artículo según sus novedades.
 *
 *  · Con alguna novedad que bloquea: etiqueta "Con novedad" (o "Perdido en
 *    tienda") y sin venta. Nunca toca un artículo que ya salió.
 *  · Sin bloqueos y con etiqueta de bloqueo: vuelve a su etapa. Si llegó, con
 *    la regla de llegada (Disponible / En revisión / Uso local / Reservado);
 *    si no llegó, a la etapa que tenía antes de bloquearse.
 *  · Un veredicto de problema viejo (Dañado, Faltante…) sin bloqueos pasa a
 *    "Aceptado con observación", que no bloquea.
 */
async function recalcularDisponibilidadItem(itemRecordId: string, actor: string, opciones: { estadoPrevioPreferido?: string } = {}) {
  const id = cleanString(itemRecordId);
  if (!id) return null;

  const item = await getShippingV2ItemById(id, { includeAiName: false, access: systemShippingV2Access() });
  const novedades = await getShippingV2NovedadesForItem(id, systemShippingV2Access());
  const bloqueantes = novedades.filter((novedad) => esNovedadBloqueante(novedad)).length;
  const etiqueta = etiquetaDeBloqueo(novedades);
  const salio = articuloSalioDelInventario({ estado: item.estado, cantidad: item.cantidad });

  const fields: Record<string, unknown> = {};

  if (etiqueta && !salio && normalizeStatus(item.estado) !== normalizeStatus(etiqueta)) {
    fields[SHIPPING_V2_ITEM_FIELDS.estadoItem] = etiqueta;
  }
  // Sin bloqueos: sale de la etiqueta de bloqueo. Con 0 unidades no se toca
  // (nunca "resucitar" algo que ya no existe).
  if (!etiqueta && esEtiquetaDeBloqueo(item.estado) && normalizarUnidades(item.cantidad) > 0) {
    fields[SHIPPING_V2_ITEM_FIELDS.estadoItem] = item.recibido === true
      ? estadoSegunLlegada({
        estado: "En revisión",
        recibido: true,
        requiereInspeccion: item.requiereInspeccion === true,
        inspeccionFirmada: item.revisadoFisicamente === true,
        usoLocal: item.usoLocal,
        todasReservadas: todasReservadas(item),
      }) ?? "En revisión"
      : (opciones.estadoPrevioPreferido && !esEtiquetaDeBloqueo(opciones.estadoPrevioPreferido) ? opciones.estadoPrevioPreferido : null)
        ?? estadoPrevioParaRestaurar(novedades) ?? "Recibido";
  }

  const estadoRevisionFinal = bloqueantes === 0 &&
    !evaluarDisponibilidadComercial({ estadoRevision: item.estadoRevision }).apartable
    ? "Aceptado con observación"
    : item.estadoRevision;
  if (estadoRevisionFinal !== item.estadoRevision) {
    fields[SHIPPING_V2_ITEM_FIELDS.estadoRevision] = estadoRevisionFinal;
  }

  const disponible = calcularDisponibleVenta({
    estado: (fields[SHIPPING_V2_ITEM_FIELDS.estadoItem] as string) ?? item.estado,
    estadoRevision: estadoRevisionFinal,
    usoLocal: item.usoLocal,
    novedadesAbiertas: bloqueantes,
    unidadesLibres: unidadesLibres({ cantidad: item.cantidad, cantidadReservada: item.cantidadReservada, reservado: item.reservado }),
  });
  if (disponible !== item.disponibleVenta) {
    fields[SHIPPING_V2_ITEM_FIELDS.disponibleVenta] = disponible;
  }

  if (!Object.keys(fields).length) return item;

  fields[SHIPPING_V2_ITEM_FIELDS.ultimaActualizacion] = new Date().toISOString();
  fields[SHIPPING_V2_ITEM_FIELDS.actualizadoPor] = actor;

  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
    method: "PATCH",
    body: JSON.stringify({ typecast: true, records: [{ id, fields }] }),
  });
  const updated = response.records?.[0];
  invalidateShippingV2ItemSearchIndexCache();
  if (fields[SHIPPING_V2_ITEM_FIELDS.estadoItem]) {
    await createShippingV2Event({
      action: "Cambio de estado",
      itemRecordId: id,
      itemName: item.nombre,
      registradoPor: actor,
      descripcion: etiqueta ? `Venta bloqueada por novedad (${etiqueta}).` : "Venta desbloqueada: sin novedades que la bloqueen.",
      estadoAnterior: item.estado,
      estadoNuevo: String(fields[SHIPPING_V2_ITEM_FIELDS.estadoItem]),
    }).catch((error) => console.error("No se pudo registrar el evento del bloqueo:", error));
  }
  return updated ? mapItem(updated) : item;
}

/**
 * Ejecuta una acción sobre una novedad. Única puerta de escritura del ciclo.
 *
 * Al resolver con una decisión que mueve el artículo, se usa el orden "la
 * marca es la llave" (como al anular una mejora, punto 3):
 *  1. Se valida TODO (reglas de la novedad + reglas del movimiento).
 *  2. Se escribe la novedad (ya no está Abierta: un segundo clic no ejecuta
 *     dos veces).
 *  3. Se ejecuta el movimiento (baja, activo, despiece, precio).
 *  4. Si el movimiento falla, la novedad vuelve a como estaba y se avisa.
 */
export async function transitionShippingV2Novedad(
  novedadRecordId: string,
  input: {
    accion: string;
    valores?: ValoresAccionNovedad;
    actor: string;
    access?: ShippingV2AccessContext;
    /** Dirección pública del portal, para el enlace del correo (punto 8c). */
    origin?: string;
  }
) {
  const rol = rolNovedad(input.access);
  if (rol === "ninguno") throw new Error("No tienes permiso para gestionar novedades.");
  const id = cleanString(novedadRecordId);
  if (!id) throw new Error("Record ID de novedad inválido.");

  return withLock(`shipping-novedad:${id}`, async () => {
    const record = await airtableRequest<AirtableRecordResponse>(
      `${tableUrl(SHIPPING_V2_TABLES.novedades)}/${encodeURIComponent(id)}`
    );
    const novedad = mapNovedad(record);
    if (!canAccessNovedad(novedad, input.access)) throw new Error("No tienes acceso a esta novedad.");

    const valores = input.valores ?? {};
    const validacion = validarAccionNovedad({
      accion: input.accion,
      novedad: { estado: novedad.estado, responsable: novedad.responsable, tipo: novedad.tipo, bloqueaVenta: novedad.bloqueaVenta, decision: novedad.decision },
      rol,
      valores,
    });
    if (!validacion.ok) throw new Error(validacion.motivo);

    const { config, decision } = validacion;
    const accion = config.accion;
    const actor = input.actor;
    const now = new Date().toISOString();
    const texto = cleanString(valores.texto);
    const propuesta = cleanString(valores.propuesta);
    const fields: Record<string, unknown> = {
      "Última actualización": now,
      "Actualizado por": actor,
    };
    const cerrar = () => {
      fields["Estado Novedad"] = "Cerrada";
      fields["Fecha de cierre"] = now;
      fields["Cerrado por"] = actor;
    };
    const desbloquear = (quien: string) => {
      fields[CAMPOS_NOVEDAD.bloqueaVenta] = false;
      fields[CAMPOS_NOVEDAD.desbloqueadaPor] = quien;
      fields[CAMPOS_NOVEDAD.fechaDesbloqueo] = now;
    };

    // El artículo, cuando la acción lo necesita.
    const necesitaArticulo = accion === "bloquear" || accion === "resolver";
    const item = necesitaArticulo && novedad.itemId
      ? await getShippingV2ItemById(novedad.itemId, { includeAiName: false, access: systemShippingV2Access() })
      : null;
    let ejecutar: null | (() => Promise<string>) = null;

    switch (accion) {
      case "responder":
      case "registrar-respuesta": {
        // Por los proveedores sin portal escribe alguien de la tienda: queda
        // claro en el historial.
        const autor = accion === "responder" ? actor : `${actor} (por el proveedor)`;
        const cuerpo = propuesta ? `Propone: ${etiquetaPropuesta(propuesta)}. ${texto}` : texto;
        fields["Respuesta del proveedor"] = appendEntradaHilo(novedad.respuestaProveedor, autor, cuerpo, now);
        fields["Fecha de respuesta del proveedor"] = now;
        if (propuesta) fields["Solución"] = propuesta;
        // Ya respondió: el enlace del correo deja de servir (punto 8c).
        fields[CAMPOS_NOVEDAD.enlaceHuella] = null;
        fields[CAMPOS_NOVEDAD.enlaceVence] = null;
        break;
      }
      case "contestar":
        fields["Mensaje enviado al proveedor"] = appendEntradaHilo(novedad.mensajeProveedor, actor, texto, now);
        fields["Fecha enviada a proveedor"] = now;
        break;
      case "cumplida":
        cerrar();
        fields["Observación final"] = texto || novedad.descripcionSolucion || novedad.decision || "Cumplida";
        if (typeof valores.montoRecuperado === "number") fields["Monto recuperado"] = valores.montoRecuperado;
        break;
      case "reabrir":
        fields["Estado Novedad"] = "Abierta";
        fields["Fecha de cierre"] = null;
        fields["Cerrado por"] = null;
        fields[CAMPOS_NOVEDAD.decision] = null;
        fields["Observación final"] = `Reabierta por ${actor}: ${texto}`;
        break;
      case "bloquear":
        if (!item) throw new Error("La novedad no tiene artículo.");
        if (articuloSalioDelInventario({ estado: item.estado, cantidad: item.cantidad })) {
          throw new Error(`El artículo ya salió del inventario (${item.estado}): no hay nada que bloquear.`);
        }
        fields[CAMPOS_NOVEDAD.bloqueaVenta] = true;
        fields[CAMPOS_NOVEDAD.desbloqueadaPor] = null;
        fields[CAMPOS_NOVEDAD.fechaDesbloqueo] = null;
        if (!esEtiquetaDeBloqueo(item.estado)) fields[CAMPOS_NOVEDAD.estadoPrevio] = item.estado;
        break;
      case "desbloquear":
        desbloquear(`${actor}: ${texto}`);
        break;
      case "resolver": {
        if (!decision) throw new Error("Elige qué pasa con el artículo.");
        // Novedades viejas de caja (sin artículo): solo se cierran.
        if (!item && (decision.mueveArticulo || decision.pidePrecio)) throw new Error("La novedad no tiene artículo: solo se puede cerrar con “No requiere solución” o “No procedía”.");
        fields["Estado Novedad"] = validacion.estadoDestino;
        fields[CAMPOS_NOVEDAD.decision] = decision.valor;
        fields["Descripción de solución"] = texto;
        if (propuesta) fields["Solución"] = propuesta;
        if (typeof valores.montoReclamado === "number") fields["Monto reclamado"] = valores.montoReclamado;
        if (typeof valores.montoRecuperado === "number") fields["Monto recuperado"] = valores.montoRecuperado;
        if (validacion.estadoDestino === "Cerrada") {
          cerrar();
          fields["Observación final"] = texto;
        }
        const comoAparecio = cleanString(valores.comoAparecio);
        if (comoAparecio) fields[CAMPOS_NOVEDAD.comoAparecio] = comoAparecio;
        // Solo el Administrador desbloquea; "No procedía" (también suyo)
        // quita el bloqueo: no había problema.
        if (novedad.bloqueaVenta && (valores.desbloquear === true || decision.valor === "No procedía")) {
          desbloquear(`${actor}: al resolver (${decision.valor})`);
        }
        ejecutar = item ? await prepararDecisionNovedad({ novedad, item, decision: decision.valor, valores, texto, actor, access: input.access, fields, desbloquear }) : null;
        break;
      }
    }

    const escribir = async (campos: Record<string, unknown>) => {
      const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.novedades), {
        method: "PATCH",
        // typecast: crea opciones nuevas ("Sin compensación"…) la primera vez.
        // Los null son intencionales (limpiar campos): no pasa por compactFields.
        body: JSON.stringify({ typecast: true, records: [{ id, fields: campos }] }),
      });
      const updated = response.records?.[0];
      if (!updated) throw new Error("Airtable no devolvió la novedad actualizada.");
      return updated;
    };

    let updated = await escribir(fields);
    let mensaje = "";
    if (ejecutar) {
      try {
        mensaje = await ejecutar();
      } catch (error) {
        // NO se revierte la novedad: el movimiento pudo quedar a medias (por
        // ejemplo, la baja se escribió y falló un paso posterior) y volver a
        // dejarla Abierta permitiría ejecutarlo dos veces. Queda resuelta, con
        // el aviso escrito, para revisar el artículo a mano.
        const detalle = error instanceof Error ? error.message : "error inesperado";
        console.error("Falló el movimiento de una novedad ya resuelta:", { id, decision: decision?.valor, detalle });
        await escribir({
          "Observación final": `${fields["Observación final"] ?? novedad.observacionFinal ?? ""}\n⚠ El movimiento "${decision?.valor}" falló: ${detalle}. Revisar el artículo.`.trim(),
        }).catch((e) => console.error("Tampoco se pudo anotar el fallo en la novedad:", e));
        throw new Error(`La novedad quedó resuelta, pero "${decision?.valor}" no se completó en el artículo: ${detalle}. Revisa el artículo en su ficha antes de repetir nada.`);
      }
    }
    const novedadActualizada = mapNovedad(updated);

    await createShippingV2Event({
      action: "Cambio de estado",
      entity: "Shipping Novedad",
      novedadRecordId: id,
      itemRecordId: novedad.itemId,
      packingRecordId: novedad.packingId,
      registradoPor: actor,
      descripcion: `Novedad — ${config.label}${decision ? `: ${decision.valor}` : ""} (${novedad.estado} → ${novedadActualizada.estado}).`,
      observacion: [texto, propuesta ? `Propuesta: ${etiquetaPropuesta(propuesta)}` : "", mensaje].filter(Boolean).join(" · "),
      estadoAnterior: novedad.estado,
      estadoNuevo: novedadActualizada.estado,
    }).catch((error) => console.error("No se pudo registrar el evento de la novedad:", error));

    // Punto 8c: cada vez que le contestamos, le llega un correo con el botón
    // RESPONDER. Ya estamos dentro del candado de esta novedad.
    if (accion === "contestar" && input.origin) {
      const envio = await notificarProveedorPorCorreo(id, { motivo: "respuesta", origin: input.origin, mensaje: texto });
      const aviso = envio.enviadoA ? `Se envió un correo a ${envio.enviadoA}.` : envio.aviso;
      if (aviso) mensaje = `${mensaje} ${aviso}`.trim();
    }

    // El bloqueo y la disponibilidad del artículo se recalculan con lo que
    // quedó. Si falla, la novedad igual quedó guardada.
    let itemFinal: ShippingV2Item | null = null;
    if (novedad.itemId && ["bloquear", "desbloquear", "resolver", "cumplida", "reabrir"].includes(accion)) {
      const itemId = novedad.itemId;
      // Al desbloquear, la etapa a la que vuelve es la que tenía al bloquearse ESTA novedad.
      const seDesbloquea = fields[CAMPOS_NOVEDAD.bloqueaVenta] === false;
      try {
        // Con el candado del artículo: así no se cruza con el registro de otra
        // novedad que lo está bloqueando en ese mismo momento.
        itemFinal = await withLock(`shipping-item:${itemId}`, () =>
          recalcularDisponibilidadItem(itemId, actor, seDesbloquea ? { estadoPrevioPreferido: novedad.estadoPrevioArticulo } : {})
        );
      } catch (error) {
        console.error("No se pudo recalcular la disponibilidad del item tras la novedad:", error);
        if (accion === "bloquear" || accion === "desbloquear") {
          mensaje = `${mensaje} Ojo: la novedad se guardó, pero el artículo no se actualizó; vuelve a abrir su ficha para comprobarlo.`.trim();
        }
      }
    }

    return { novedad: novedadActualizada, item: itemFinal, mensaje };
  });
}

// ─── Cartel al vender (punto 8b · 10-oct-2026) ──────────────────────────────
// Lo usan Facturación (factura, recibo, reserva) y Técnicos (repuesto en una
// orden), cada uno con su propia sesión. Solo exponen lo mínimo de la novedad
// y solo pueden cerrar una novedad ABIERTA, sin bloqueo, del artículo vendido.

export type NovedadParaVenta = {
  id: string;
  novedadId: string;
  tipo: string;
  descripcion: string;
  conProveedor: boolean;
  fechaRegistro: string;
};

/** Novedades de un artículo que piden aclaración al venderlo. */
export async function getNovedadesParaVenta(itemRecordId: string): Promise<NovedadParaVenta[]> {
  const id = cleanString(itemRecordId);
  if (!id) return [];
  const novedades = await getShippingV2NovedadesForItem(id, systemShippingV2Access());
  return novedades
    .filter((novedad) => pideAclaracionAlVender(novedad))
    .map((novedad) => ({
      id: novedad.id,
      novedadId: novedad.novedadId,
      tipo: novedad.tipo,
      descripcion: novedad.descripcion ?? "",
      conProveedor: esResponsableProveedor(novedad.responsable),
      fechaRegistro: novedad.fechaRegistro ?? "",
    }));
}

export type CierrePorVenta = { novedadId: string; itemId: string; texto: string; reclamoContinua?: boolean };

/**
 * Cierra las novedades de lo que se acaba de vender (después de emitir con
 * éxito). Cada una por separado: si una falla, las demás siguen. Devuelve los
 * errores para avisar en pantalla; la venta ya está hecha y no se toca.
 */
export async function cerrarNovedadesPorVenta(
  cierres: CierrePorVenta[],
  input: { documento: string; actor: string }
): Promise<{ cerradas: number; errores: string[] }> {
  const errores: string[] = [];
  let cerradas = 0;
  const documento = cleanString(input.documento) || "documento";
  const vistos = new Set<string>();
  for (const cierre of cierres) {
    const id = cleanString(cierre.novedadId);
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    try {
      await withLock(`shipping-novedad:${id}`, async () => {
        const record = await airtableRequest<AirtableRecordResponse>(
          `${tableUrl(SHIPPING_V2_TABLES.novedades)}/${encodeURIComponent(id)}`
        );
        const novedad = mapNovedad(record);
        const v = validarCierrePorVenta({ novedad, itemId: cleanString(cierre.itemId), texto: cierre.texto, reclamoContinua: cierre.reclamoContinua });
        if (!v.ok) throw new Error(v.motivo);
        const now = new Date().toISOString();
        const texto = `${cleanString(cierre.texto)} (${documento})`;
        const fields: Record<string, unknown> = {
          "Estado Novedad": v.estadoDestino,
          "Decisión sobre el artículo": DECISION_VENDIDO_CON_NOVEDAD,
          "Descripción de solución": texto,
          "Última actualización": now,
          "Actualizado por": input.actor,
        };
        if (v.estadoDestino === "Cerrada") {
          fields["Fecha de cierre"] = now;
          fields["Cerrado por"] = input.actor;
          fields["Observación final"] = texto;
        }
        await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.novedades), {
          method: "PATCH",
          // typecast: crea la opción "Vendido con novedad" la primera vez.
          body: JSON.stringify({ typecast: true, records: [{ id, fields }] }),
        });
        await createShippingV2Event({
          action: "Cambio de estado",
          entity: "Shipping Novedad",
          novedadRecordId: id,
          itemRecordId: novedad.itemId,
          registradoPor: input.actor,
          descripcion: `Novedad — Vendido con novedad (${novedad.estado} → ${v.estadoDestino}). ${documento}.`,
          observacion: cleanString(cierre.texto),
          estadoAnterior: novedad.estado,
          estadoNuevo: v.estadoDestino,
        }).catch((error) => console.error("No se pudo registrar el evento del cierre por venta:", error));
      });
      cerradas += 1;
    } catch (error) {
      errores.push(`${cierre.novedadId}: ${error instanceof Error ? error.message : "error inesperado"}`);
    }
  }
  return { cerradas, errores };
}

/**
 * Prepara la decisión de "Resolver": valida el movimiento ANTES de escribir la
 * novedad y devuelve la función que lo ejecuta después (o null si la decisión
 * no mueve nada). También completa los campos de la novedad que dependen del
 * artículo (cantidad, valor de la pérdida, precio).
 */
async function prepararDecisionNovedad(input: {
  novedad: ShippingV2Novedad;
  item: ShippingV2Item;
  decision: ShippingV2DecisionArticulo;
  valores: ValoresAccionNovedad;
  texto: string;
  actor: string;
  access?: ShippingV2AccessContext;
  fields: Record<string, unknown>;
  desbloquear: (quien: string) => void;
}): Promise<null | (() => Promise<string>)> {
  const { novedad, item, decision, valores, texto, actor, fields } = input;
  const F = SHIPPING_V2_ITEM_FIELDS;
  const ref = novedad.novedadId || novedad.id;
  const salio = articuloSalioDelInventario({ estado: item.estado, cantidad: item.cantidad });
  const total = normalizarUnidades(item.cantidad);
  const cantidad = Number(valores.cantidad);

  switch (decision) {
    case "No requiere solución":
    case "Reparado":
    case "No procedía":
      return null;

    case "Vendido con novedad":
      // Solo lo pone el cartel al vender (cerrarNovedadesPorVenta).
      throw new Error("“Vendido con novedad” solo se registra desde el cartel al vender.");

    case "Se vende con descuento": {
      if (salio) throw new Error(`El artículo ya salió del inventario (${item.estado}).`);
      if (input.access?.permissions.canEditItems !== true) throw new Error("No tienes permiso para cambiar el precio del artículo.");
      const precio = Math.round(Number(valores.precio) * 100) / 100;
      fields[CAMPOS_NOVEDAD.precioConDescuento] = precio;
      return async () => {
        await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
          method: "PATCH",
          body: JSON.stringify({ records: [{ id: item.id, fields: { [F.precioVentaFinal]: precio, [F.ultimaActualizacion]: new Date().toISOString(), [F.actualizadoPor]: actor } }] }),
        });
        invalidateShippingV2ItemSearchIndexCache();
        await createShippingV2Event({
          action: "Actualizado",
          itemRecordId: item.id,
          itemName: item.nombre,
          registradoPor: actor,
          descripcion: `Precio de venta ${item.precioVenta ?? "—"} → ${precio} por la novedad ${ref} (se vende con descuento).`,
          observacion: texto,
        }).catch((error) => console.error("No se pudo registrar el evento del precio:", error));
        return `Nuevo precio de venta: $${precio.toFixed(2)}.`;
      };
    }

    case "Dar de baja":
    case "Devuelto al proveedor": {
      const devuelto = decision === "Devuelto al proveedor";
      const pago = await situacionPagoDeItem(item);
      const ev = evaluarDarDeBaja(
        {
          sku: item.sku,
          usoLocal: item.usoLocal,
          recibido: item.recibido,
          estado: item.estado,
          cantidad: item.cantidad,
          cantidadReservada: item.cantidadReservada,
          reservado: item.reservado,
          enPacking: Boolean(cleanString(item.packingId)),
          pago,
        },
        { cantidad, esAdministrador: input.access?.isSiteAdmin === true, motivo: `Novedad ${ref}: ${texto}`, permitirSinRecibir: true }
      );
      if (!ev.ok) throw new Error(ev.motivo);
      fields[CAMPOS_NOVEDAD.cantidadAfectada] = cantidad;
      if (esPerdidoEnTienda(novedad.tipo)) {
        // Cableado del punto 17: lo extraviado queda valorado. "Por
        // distribuir" (descuento a los empleados) solo si se perdió EN LA
        // TIENDA: ya había llegado y lo resolvemos nosotros.
        fields[CAMPOS_NOVEDAD.valorPerdida] = Math.round((item.costoTotalUnidad ?? 0) * cantidad * 100) / 100;
        fields[CAMPOS_NOVEDAD.perdidaPorDistribuir] = item.recibido === true && !esResponsableProveedor(novedad.responsable);
      }
      if (cantidad >= total) input.desbloquear(`Sistema: el artículo salió (${decision})`);
      const motivo = `${devuelto ? "Devuelto al proveedor" : "Baja"} por la novedad ${ref}: ${texto}`;
      return async () => {
        const resultado = await moverActivoShippingV2(
          item.id,
          { accion: "baja", cantidad, motivo, permitirSinRecibir: true },
          { actor, access: input.access }
        );
        return resultado.mensaje;
      };
    }

    case "Pasa a activo": {
      const pago = await situacionPagoDeItem(item);
      const ev = evaluarPasarAUsoLocal(
        {
          sku: item.sku,
          usoLocal: item.usoLocal,
          recibido: item.recibido,
          estado: item.estado,
          cantidad: item.cantidad,
          cantidadReservada: item.cantidadReservada,
          reservado: item.reservado,
          enPacking: Boolean(cleanString(item.packingId)),
          pago,
        },
        { cantidad, esAdministrador: input.access?.isSiteAdmin === true, motivo: `Novedad ${ref}: ${texto}` }
      );
      if (!ev.ok) throw new Error(ev.motivo);
      fields[CAMPOS_NOVEDAD.cantidadAfectada] = cantidad;
      if (ev.modo === "todo") input.desbloquear("Sistema: el artículo pasó a activo de la tienda");
      return async () => {
        const resultado = await moverActivoShippingV2(
          item.id,
          { accion: "uso-local", cantidad, motivo: `Pasa a activo por la novedad ${ref}: ${texto}` },
          { actor, access: input.access }
        );
        return resultado.mensaje;
      };
    }

    case "Va a despiece": {
      if (input.access?.isSiteAdmin !== true) throw new Error("Solo un Administrador puede mandar un artículo a despiece.");
      if (salio) throw new Error(`El artículo ya salió del inventario (${item.estado}).`);
      if (item.recibido !== true) throw new Error("Para despiezar, el artículo tiene que estar en la tienda (Recibido).");
      if (item.usoLocal === true) throw new Error("Es un activo de la tienda: primero pásalo a la venta.");
      if (unidadesLibres({ cantidad: item.cantidad, cantidadReservada: item.cantidadReservada, reservado: item.reservado }) < total) {
        throw new Error("Tiene unidades reservadas para un cliente. Libera la reserva primero.");
      }
      input.desbloquear("Sistema: el artículo va a despiece");
      return async () => {
        await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
          method: "PATCH",
          body: JSON.stringify({
            records: [{ id: item.id, fields: { [F.estadoItem]: "Destinado a partes", [F.disponibleVenta]: false, [F.ultimaActualizacion]: new Date().toISOString(), [F.actualizadoPor]: actor } }],
          }),
        });
        invalidateShippingV2ItemSearchIndexCache();
        await createShippingV2Event({
          action: "Cambio de estado",
          itemRecordId: item.id,
          itemName: item.nombre,
          registradoPor: actor,
          descripcion: `Va a despiece por la novedad ${ref}.`,
          observacion: texto,
          estadoAnterior: item.estado,
          estadoNuevo: "Destinado a partes",
        }).catch((error) => console.error("No se pudo registrar el evento del despiece:", error));
        return `${item.sku} quedó "Destinado a partes". Desármalo desde su ficha (pestaña Despiece).`;
      };
    }
  }
}

/**
 * Lee una novedad por su record ID aplicando el mismo control de acceso que el
 * resto del módulo. Existe porque las evidencias se suben DESPUÉS de crear la
 * novedad (Airtable solo acepta adjuntos contra un registro que ya existe) y
 * hay que releerla para saber cuántas tiene y quién puede tocarla.
 */
async function fetchShippingV2NovedadById(
  novedadRecordId: string,
  access?: ShippingV2AccessContext
): Promise<ShippingV2Novedad> {
  const id = cleanString(novedadRecordId);
  if (!id) throw new Error("Record ID de novedad inválido.");
  const record = await airtableRequest<AirtableRecordResponse>(
    `${tableUrl(SHIPPING_V2_TABLES.novedades)}/${encodeURIComponent(id)}`
  );
  const novedad = mapNovedad(record);
  if (!canAccessNovedad(novedad, access)) throw new Error("No tienes acceso a esta novedad.");
  return novedad;
}

/**
 * Sube fotos y videos cortos al campo `Evidencias` de una novedad.
 *
 * Tolerante a propósito: si de 3 archivos falla 1, los otros 2 quedan
 * guardados y se devuelve un `warning`. El técnico está parado frente al
 * artículo con el celular en la mano; perder las tres fotos porque una pesaba
 * de más lo obligaría a repetir todo.
 */
export async function addEvidenciasToShippingV2Novedad(
  novedadRecordId: string,
  archivos: ShippingV2AttachmentUpload[],
  options: { actor: string; access?: ShippingV2AccessContext }
) {
  assertShippingV2Permission(options.access, "canViewNovedades", "No tienes permiso para gestionar novedades.");
  const novedad = await fetchShippingV2NovedadById(novedadRecordId, options.access);

  const validacion = validarEvidencias(
    // Sin tamaño declarado se asume lo peor: mejor rechazar que dejar pasar
    // un archivo que Airtable va a rebotar. El default NUNCA debe abrir.
    archivos.map((archivo) => ({
      name: archivo.filename,
      type: archivo.contentType,
      size: archivo.sizeBytes ?? Number.POSITIVE_INFINITY,
    })),
    { yaSubidas: novedad.evidencias.length }
  );
  if (!validacion.ok) throw new Error(validacion.motivo);

  const fallidos: string[] = [];
  for (const archivo of archivos) {
    try {
      await uploadAttachmentToRecord({
        recordId: novedad.id,
        attachmentFieldIdOrName: "Evidencias",
        filename: archivo.filename,
        contentType: archivo.contentType,
        fileBase64: archivo.fileBase64,
      });
    } catch (error) {
      console.error("No se pudo subir una evidencia de la novedad:", error);
      fallidos.push(archivo.filename);
    }
  }

  if (fallidos.length === archivos.length) {
    throw new Error("No se pudo subir ninguna evidencia. Revisa tu conexión e intenta de nuevo.");
  }

  // Los archivos YA están en Airtable. Si la relectura falla (corte de red,
  // límite de la API), no se puede decirle al usuario que la subida falló:
  // volvería a subir las mismas fotos y quedarían duplicadas. Se devuelve la
  // versión previa y la pantalla se refresca sola en la siguiente carga.
  let actualizada = novedad;
  let releyoOk = true;
  try {
    actualizada = await fetchShippingV2NovedadById(novedad.id, options.access);
  } catch (error) {
    console.error("Evidencias subidas, pero no se pudo releer la novedad:", error);
    releyoOk = false;
  }
  const subidas = archivos.length - fallidos.length;

  // Misma huella que al eliminar: quién tocó la evidencia y cuándo. Sin esto,
  // una novedad podía ganar adjuntos sin que nada lo registrara.
  try {
    await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.novedades), {
      method: "PATCH",
      body: JSON.stringify({
        records: [{
          id: novedad.id,
          fields: { "Última actualización": new Date().toISOString(), "Actualizado por": options.actor },
        }],
      }),
    });
  } catch (error) {
    console.error("No se pudo sellar la novedad tras subir evidencias:", error);
  }

  await createShippingV2Event({
    action: "Actualizado",
    entity: "Shipping Novedad",
    novedadRecordId: novedad.id,
    itemRecordId: novedad.itemId,
    packingRecordId: novedad.packingId,
    registradoPor: options.actor,
    descripcion: subidas === 1 ? "Evidencia agregada a la novedad." : `${subidas} evidencias agregadas a la novedad.`,
  });

  const avisos: string[] = [];
  if (fallidos.length) avisos.push(`No se pudieron subir: ${fallidos.join(", ")}.`);
  if (!releyoOk) avisos.push("Las evidencias se guardaron; recarga la pantalla para verlas.");

  return {
    novedad: actualizada,
    warning: avisos.length ? avisos.join(" ") : null,
    uploadedCount: subidas,
  };
}

/**
 * Quita una evidencia. Airtable no borra adjuntos de a uno: se reescribe el
 * campo con las que se conservan, referenciándolas por su URL actual.
 */
export async function removeEvidenciaFromShippingV2Novedad(
  novedadRecordId: string,
  input: { attachmentId?: string | null; url?: string | null; filename?: string | null },
  options: { actor: string; access?: ShippingV2AccessContext }
) {
  assertShippingV2Permission(options.access, "canViewNovedades", "No tienes permiso para gestionar novedades.");
  // Un proveedor PUEDE subir evidencia (su foto del empaque, su comprobante),
  // pero NO puede borrar la nuestra: la evidencia es justamente lo que
  // sostiene el reclamo en su contra. Borrar es acción de staff.
  if (options.access && options.access.mode === "provider") {
    throw new Error("Un proveedor no puede eliminar evidencias de una novedad.");
  }
  const novedad = await fetchShippingV2NovedadById(novedadRecordId, options.access);

  const attachmentId = cleanString(input.attachmentId);
  const url = cleanString(input.url);
  const filename = cleanString(input.filename);
  if (!attachmentId && !url && !filename) {
    throw new Error("Falta identificar la evidencia a eliminar.");
  }

  // Se busca por id, y si no aparece se baja a la URL y luego al nombre. La
  // URL importa porque Airtable la firma y la rota entre lecturas: la que
  // tiene el navegador puede no ser la que acaba de llegar del servidor, y sin
  // respaldo esa evidencia no se podría borrar nunca.
  //
  // Se descarta UNA SOLA posición, no todas las que coincidan: dos fotos del
  // mismo celular pueden llamarse igual ("image.jpg") y borrar ambas perdería
  // evidencia buena.
  const posicion = (() => {
    if (attachmentId) {
      const porId = novedad.evidencias.findIndex((evidencia) => evidencia.id === attachmentId);
      if (porId >= 0) return porId;
    }
    if (url) {
      const porUrl = novedad.evidencias.findIndex((evidencia) => evidencia.url === url);
      if (porUrl >= 0) return porUrl;
    }
    if (filename) {
      const porNombre = novedad.evidencias.findIndex((evidencia) => evidencia.filename === filename);
      if (porNombre >= 0) return porNombre;
    }
    return -1;
  })();

  if (posicion < 0) throw new Error("No se encontró la evidencia en la novedad.");

  const conservadas = novedad.evidencias.filter((_, indice) => indice !== posicion);

  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.novedades), {
    method: "PATCH",
    body: JSON.stringify({
      records: [{
        id: novedad.id,
        fields: {
          Evidencias: conservadas.map(keptAttachmentPayload),
          "Última actualización": new Date().toISOString(),
          "Actualizado por": options.actor,
        },
      }],
    }),
  });

  const updated = response.records?.[0];
  if (!updated) throw new Error("Airtable no devolvió la novedad actualizada.");

  await createShippingV2Event({
    action: "Actualizado",
    entity: "Shipping Novedad",
    novedadRecordId: novedad.id,
    itemRecordId: novedad.itemId,
    packingRecordId: novedad.packingId,
    registradoPor: options.actor,
    descripcion: "Evidencia eliminada de la novedad.",
  });

  return mapNovedad(updated);
}

async function getOpenNovedadesForPacking(packing: ShippingV2Packing) {
  const records = await listRecords(SHIPPING_V2_TABLES.novedades);
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

/**
 * Aplica un cambio de estado del packing a sus artículos.
 *
 * `estadoDestino` es obligatorio y actúa de guarda: solo se escriben los
 * artículos que siguen en una etapa ANTERIOR. Los que ya pasaron por
 * recepción, ya están a la venta, ya se vendieron o ya se consumieron se
 * dejan intactos — ver packing-item-sync.ts para el caso real que motivó esto.
 *
 * Devuelve el plan para que quien llama pueda contarlo en el evento y en la
 * respuesta al usuario.
 */
async function updatePackingItemsForStatus(
  packing: ShippingV2Packing,
  estadoDestino: string,
  fields: Record<string, unknown>
) {
  const vacio = { aplicar: [], omitidos: [], resumen: "El packing no tiene artículos vinculados." };
  if (!packing.itemIds.length) return vacio;

  // packing.items viene cargado por getShippingV2PackingById. Si por acceso
  // restringido llegara vacío, no se escribe nada: es preferible no avanzar a
  // pisar artículos cuyo estado no se pudo leer.
  if (!packing.items.length) return vacio;

  const plan = planShippingV2PackingItemSync(packing.items, estadoDestino);
  if (!plan.aplicar.length) return plan;

  await patchAirtableRecords(SHIPPING_V2_TABLES.items, plan.aplicar.map((item) => ({
    id: item.id,
    fields,
  })));
  return plan;
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
    const planTransito = await updatePackingItemsForStatus(packing, "En tránsito", {
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
      descripcion: `Packing marcado en tránsito desde Portal Staff. ${planTransito.resumen}`,
    });
  }

  if (input.action === "mark-received") {
    if (currentStatus !== "en transito") throw new Error("Solo puedes marcar recibido un packing en tránsito.");
    // Último momento en que "Cantidad" todavía es lo que viajó: se guardan
    // las "Unidades en packing" y el reparto antes de que el packing pase a
    // Recibido y las ventas empiecen a bajar el stock.
    await repartirCostosPackingTrasCambio(id, input.actor, "Unidades fijadas al recibir el packing.");
    const planRecibido = await updatePackingItemsForStatus(packing, "Recibido", {
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
      descripcion: `Packing marcado como recibido desde Portal Staff. Los items quedan pendientes de confirmación de recepción. ${planRecibido.resumen}`,
    });
  }

  if (input.action === "start-review") {
    if (currentStatus !== "recibido") throw new Error("Solo puedes iniciar revisión de un packing recibido.");
    const planRevision = await updatePackingItemsForStatus(packing, "En revisión", {
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
      descripcion: `Revisión de packing iniciada desde Portal Staff. ${planRevision.resumen}`,
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

    // El ciclo se cierra cuando TODOS los artículos terminaron el suyo: las 7
    // casillas de reception-checklist.ts. Antes esto no se miraba y el botón
    // se habilitaba aunque no hubiera nada revisado, así que el indicador de
    // la pantalla y la validación real decían cosas distintas.
    //
    // El Administrador puede cerrar igual registrando una justificación —
    // mismo mecanismo que ya existe para cerrar un packing con novedad—, para
    // que un dato imposible de completar no deje el packing atascado.
    const progresoCiclo = calculateShippingV2PackingReviewProgress(packing.items);
    if (!progresoCiclo.completo) {
      const topPaso = getShippingV2PackingTopPendingStep(progresoCiclo);
      const detalle = topPaso ? ` Lo que más falta: ${topPaso.label} (${topPaso.cantidad}).` : "";
      const faltante = progresoCiclo.total === 0
        ? "Este packing no tiene artículos vinculados."
        : `Faltan ${progresoCiclo.pendientes} de ${progresoCiclo.total} artículos por completar su ciclo.${detalle}`;

      if (!input.access?.isAdmin) throw new Error(`${faltante} Complétalos en Recepción antes de cerrar el ciclo.`);
      if (!decision) throw new Error(`${faltante} Solo un administrador puede cerrarlo igualmente, y debe registrar una justificación.`);
    }

    const resumenCiclo = progresoCiclo.completo
      ? `Ciclo completo en los ${progresoCiclo.total} artículos.`
      : `Cerrado con ${progresoCiclo.pendientes} de ${progresoCiclo.total} artículos sin completar, por decisión administrativa.`;

    return patchPackingStatus({
      packing,
      estado: "Cerrado final",
      actor: input.actor,
      access: input.access,
      descripcion: currentStatus === "con novedad"
        ? `Packing con novedad cerrado final con decisión administrativa. ${resumenCiclo}`
        : `Packing cerrado final desde Portal Staff. ${resumenCiclo}`,
      observacion: decision,
    });
  }

  if (input.action === "cancel") {
    // Punto 10a (C-5, decisiones 1a y 2a del 16-oct): solo antes de salir,
    // sin pagos de logística vivos, y los artículos salen sueltos.
    const pagos = await getShippingV2Pagos(systemShippingV2Access());
    const pagosLogisticaVivos = pagos
      .filter((p) => normalizeStatus(String(p.estadoPago)) !== "anulado" && esConceptoLogistica(p.concepto))
      .filter((p) => (p.packingLogisticaIds ?? []).includes(packing.id))
      .map((p) => ({ concepto: p.concepto, total: p.totalAPagar ?? p.total ?? null, referencia: p.pagoId }));
    const evaluacion = evaluarCancelarCaja({
      estado: packing.estado,
      esAdministrador: input.access?.isSiteAdmin === true,
      motivo: decision,
      pagosLogisticaVivos,
    });
    if (!evaluacion.ok) throw new Error(evaluacion.motivo);

    // Primero los artículos (si algo falla, la caja sigue viva y se puede
    // reintentar); después la caja queda Cancelada y vacía en una sola escritura.
    const articulos = packing.items.filter((item) => packing.itemIds.includes(item.id));
    if (articulos.length !== packing.itemIds.length) {
      throw new Error("No se pudieron leer todos los artículos de la caja. Intenta de nuevo.");
    }
    await patchAirtableRecords(SHIPPING_V2_TABLES.items, articulos.map((item) => ({
      id: item.id,
      fields: camposArticuloFueraDeCaja(input.actor, now),
    })));
    const titulo = packing.packingId || packing.id;
    for (const item of articulos) {
      await createShippingV2Event({
        action: "Cambio de estado",
        entity: "Shipping Item",
        itemRecordId: item.id,
        itemName: item.nombre,
        registradoPor: input.actor,
        descripcion: `Salió de la caja ${titulo} al cancelarla; queda pendiente de caja.`,
        estadoAnterior: item.estado,
        estadoNuevo: "Pendiente de packing",
        observacion: decision,
      });
    }
    invalidateShippingV2ItemSearchIndexCache();
    const skus = articulos.map((item) => item.sku || item.id).join(", ");
    return patchPackingStatus({
      packing,
      estado: "Cancelado",
      actor: input.actor,
      access: input.access,
      fields: {
        "Fecha de cancelación": now,
        "Motivo de cancelación": decision,
        [SHIPPING_V2_PACKING_FIELDS.itemsIncluidos]: [],
      },
      descripcion: articulos.length
        ? `Caja cancelada desde Portal Staff. Salieron sueltos ${articulos.length} artículo(s): ${skus}.`
        : "Caja cancelada desde Portal Staff (sin artículos).",
      observacion: decision,
    });
  }

  if (input.action === "reopen") {
    // Solo el rol "Administrador" del sistema — no cualquier staff (isAdmin
    // ya es amplio: técnico, atención, etc.). Ver la nota en isSiteAdmin.
    if (!input.access?.isSiteAdmin) throw new Error("Solo un administrador del sistema puede reabrir un packing cerrado.");
    if (currentStatus !== "cerrado") throw new Error("Solo puedes reabrir un packing que esté Cerrado.");
    if (!decision) throw new Error("Registra un motivo para reabrir el packing.");
    // Deliberadamente acotado a Cerrado → En Proceso: en ese punto los items
    // siguen en "En packing" (mark-in-transit es lo único que los mueve de
    // ahí) y todavía no puede existir ninguna novedad (nacen desde "En
    // revisión" en adelante) — no hay nada más que revertir.
    return patchPackingStatus({
      packing,
      estado: OPEN_PACKING_STATUS,
      actor: input.actor,
      access: input.access,
      descripcion: "Packing reabierto por un administrador del sistema desde Portal Staff.",
      observacion: decision,
    });
  }

  throw new Error("Acción de estado no soportada.");
}

export async function getShippingV2Recepciones() {
  const records = await listRecords(SHIPPING_V2_TABLES.recepciones, { maxRecords: 200 });
  return records.map(mapRecepcion);
}

export async function getShippingV2Novedades(access?: ShippingV2AccessContext) {
  // Todas (antes solo las 200 primeras: las más nuevas podían quedar fuera).
  const records = await listRecords(SHIPPING_V2_TABLES.novedades);
  const novedades = records.map(mapNovedad);
  if (!access || access.isAdmin) return novedades;
  if (!access.providerId) return [];
  return novedades.filter((novedad) => canAccessNovedad(novedad, access));
}

/** Punto 8: lo que un proveedor NO debe recibir de una novedad (decisiones, notas, bloqueo, pérdidas). */
function ocultarDatosInternosNovedad(original: ShippingV2Novedad): ShippingV2Novedad {
  return {
    ...original,
    decision: "",
    registradoPor: "",
    cerradoPor: "",
    actualizadoPor: "",
    estadoPrevioArticulo: "",
    ventaDesbloqueadaPor: "",
    precioConDescuento: null,
    valorPerdida: null,
    perdidaPorDistribuir: false,
    cantidadAfectada: null,
    comoAparecio: "",
    bloqueaVenta: false,
    observacionFinal: "",
    descripcionSolucion: "",
  };
}

/**
 * Novedades listas para el panel: con SKU, proveedor y packing ya resueltos.
 *
 * El panel tiene que poder decidir sin abrir otra pantalla ("¿de qué artículo
 * es esta novedad y a quién se la reclamo?"), así que se resuelven aquí en
 * lecturas acotadas en vez de dejar que la tabla dispare una consulta por fila.
 */
export async function getShippingV2NovedadesPanel(access?: ShippingV2AccessContext) {
  const novedades = await getShippingV2Novedades(access);
  if (!novedades.length) return [];

  const F = SHIPPING_V2_ITEM_FIELDS;
  const itemIds = Array.from(new Set(novedades.flatMap((novedad) => novedad.itemIds)));
  const packingIds = Array.from(new Set(novedades.flatMap((novedad) => novedad.packingIds)));

  const [itemRecords, packingRecords, proveedores] = await Promise.all([
    itemIds.length ? listRecordsByIds(SHIPPING_V2_TABLES.items, itemIds) : Promise.resolve([]),
    packingIds.length ? listRecordsByIds(SHIPPING_V2_TABLES.packings, packingIds) : Promise.resolve([]),
    getShippingV2Proveedores(),
  ]);

  const itemsById = new Map(itemRecords.map((record) => [record.id, record]));
  const packingsById = new Map(packingRecords.map((record) => [record.id, record]));
  const labelsById = createShippingV2ProveedorLabelMap(proveedores);

  // Punto 8: a un proveedor no le llegan los datos internos de la tienda.
  const esProveedor = !access?.isAdmin;
  return novedades.map((original) => {
    const novedad = esProveedor ? ocultarDatosInternosNovedad(original) : original;
    const itemRecord = novedad.itemId ? itemsById.get(novedad.itemId) : undefined;
    const packingRecord = novedad.packingId ? packingsById.get(novedad.packingId) : undefined;
    return {
      ...novedad,
      itemSku: itemRecord ? firstString(itemRecord.fields[getOfficialSkuField()], itemRecord.id) : "",
      itemNombre: itemRecord ? firstString(itemRecord.fields[F.nombre]) : "",
      itemCantidad: itemRecord && !esProveedor ? firstNumber(itemRecord.fields[F.cantidad]) : null,
      packingLabel: packingRecord ? firstString(packingRecord.fields[SHIPPING_V2_PACKING_FIELDS.packingId], packingRecord.id) : "",
      proveedorResponsableNombre: resolveShippingV2ProveedorLabel(novedad.proveedorResponsableId, labelsById),
    };
  });
}

export async function getShippingV2NovedadesForItem(itemRecordId: string, access?: ShippingV2AccessContext) {
  const itemId = cleanString(itemRecordId);
  if (!itemId) return [];
  await getShippingV2ItemById(itemId, { includeAiName: false, access });

  // Todas (antes tope de 500): con más novedades, las de este artículo podían quedar fuera.
  const records = await listRecords(SHIPPING_V2_TABLES.novedades);
  return records
    .map(mapNovedad)
    .filter((novedad) => novedad.itemIds.includes(itemId))
    .filter((novedad) => canAccessNovedad(novedad, access))
    .map((novedad) => (access && !access.isAdmin ? ocultarDatosInternosNovedad(novedad) : novedad))
    .sort((a, b) => {
      const bTime = Date.parse(b.fechaRegistro || b.createdTime || "");
      const aTime = Date.parse(a.fechaRegistro || a.createdTime || "");
      return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
    });
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
    novedadesAbiertas: novedades.filter((novedad) => isNovedadAbierta(novedad.estado)).length,
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
  /** Punto 10b-5: "S/N …" de una unidad, o "Lote 05-ago · más antiguo" si hay varios lotes del SKU. */
  detalle?: string;
  /** Punto 10b-5: para ordenar los lotes del más antiguo al más nuevo. */
  fechaRegistro?: string;
  numeroSerie?: string;
};

const ORDEN_STOCK_LINK_FIELD = "Orden de Reparación (Stock)";

function mapRepuestoStockResumen(record: AirtableRecord): ShippingV2RepuestoStockResumen {
  const f = record.fields;
  return {
    id: record.id,
    sku: firstString(f[SHIPPING_V2_ITEM_FIELDS.sku], record.id),
    nombre: firstString(f[SHIPPING_V2_ITEM_FIELDS.nombre], "Artículo sin nombre"),
    precioVentaFinal: firstNumber(f[SHIPPING_V2_ITEM_FIELDS.precioVentaFinal]),
    fechaRegistro: firstString(f[SHIPPING_V2_ITEM_FIELDS.fechaRegistro], record.createdTime) || undefined,
    numeroSerie: normalizarSerie(firstString(f[SHIPPING_V2_ITEM_FIELDS.numeroSerie])) || undefined,
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
// La lista vive en mejoras.ts: la usan también las Mejoras (punto 3).

function escapeAirtableSearchTerm(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Items montables, disponibles para venta y sin reservar — candidatos a
// agregarse como repuesto de stock a una orden de reparación.
//
// El texto buscado se filtra EN LA FÓRMULA de Airtable, no en JS después de
// traer un lote — antes traía como mucho maxRecords y recién ahí filtraba
// por nombre/SKU, así que un item que calzaba con la búsqueda pero caía
// fuera de ese lote (orden interno de Airtable, no alfabético) era invisible
// aunque su SKU se escribiera exacto. Con cientos de repuestos disponibles
// ya pasaba de sobra: RAM-000010 nunca aparecía aunque cumplía todas las
// condiciones, simplemente porque Airtable la devolvía después del corte.
export async function buscarShippingItemsRepuestoStockDisponibles(
  query?: string
): Promise<ShippingV2RepuestoStockResumen[]> {
  assertShippingV2GeneratedSchema();
  const categoriasOr = CATEGORIAS_REPUESTO_STOCK.map(
    (c) => `{${SHIPPING_V2_ITEM_FIELDS.categoria}}="${c}"`
  ).join(",");

  const condiciones = [
    `OR(${categoriasOr})`,
    `{${SHIPPING_V2_ITEM_FIELDS.disponibleVenta}}=1`,
    `{${SHIPPING_V2_ITEM_FIELDS.reservado}}=0`,
  ];

  const q = cleanString(query).toLowerCase();
  if (q) {
    const escaped = escapeAirtableSearchTerm(q);
    condiciones.push(
      `OR(SEARCH("${escaped}", LOWER({${SHIPPING_V2_ITEM_FIELDS.sku}}&"")), SEARCH("${escaped}", LOWER({${SHIPPING_V2_ITEM_FIELDS.nombre}}&"")), SEARCH("${escaped}", LOWER(SUBSTITUTE({${SHIPPING_V2_ITEM_FIELDS.numeroSerie}}&""," ",""))))`
    );
  }

  const records = await listRecords(SHIPPING_V2_TABLES.items, {
    // Sin texto de búsqueda es solo navegación libre — un tope razonable
    // evita traer de golpe todo el inventario montable. Con texto, Airtable
    // ya hizo el filtro exacto: no debería haber cientos de coincidencias
    // para un SKU o nombre concretos, así que el tope sube de largo.
    maxRecords: q ? 500 : 200,
    filterByFormula: `AND(${condiciones.join(",")})`,
    sortField: SHIPPING_V2_ITEM_FIELDS.nombre,
    sortDirection: "asc",
  });

  // Punto 10b-5: los lotes de un mismo SKU, del más antiguo al más nuevo (se
  // usa primero lo que entró primero); las unidades, con su serie.
  const lista = records.map(mapRepuestoStockResumen)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es") || a.sku.localeCompare(b.sku) || (a.fechaRegistro ?? "").localeCompare(b.fechaRegistro ?? ""));
  const porSku = new Map<string, number>();
  for (const r of lista) porSku.set(r.sku, (porSku.get(r.sku) ?? 0) + 1);
  const vistos = new Set<string>();
  return lista.map((r) => {
    if (r.numeroSerie) return { ...r, detalle: `S/N ${r.numeroSerie}` };
    if ((porSku.get(r.sku) ?? 0) < 2) return r;
    const primero = !vistos.has(r.sku);
    vistos.add(r.sku);
    const fecha = r.fechaRegistro ? new Date(r.fechaRegistro) : null;
    const texto = fecha && !Number.isNaN(fecha.getTime()) ? fecha.toLocaleDateString("es-EC", { day: "2-digit", month: "short", timeZone: "America/Guayaquil" }).replace(".", "") : "";
    return { ...r, detalle: `Lote ${texto}${primero ? " · más antiguo" : ""}`.trim() };
  });
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
  // Punto 8: una novedad con la venta bloqueada (o cualquier otro bloqueo)
  // impide montarlo aunque ya tenga unidades apartadas.
  const comercialRepuesto = evaluarDisponibilidadComercial({
    estado: firstString(f[SHIPPING_V2_ITEM_FIELDS.estadoItem]),
    estadoRevision: firstString(f[SHIPPING_V2_ITEM_FIELDS.estadoRevision]),
    usoLocal: firstBoolean(f[SHIPPING_V2_ITEM_FIELDS.esUsoLocal]),
  });
  if (!comercialRepuesto.apartable) throw new Error(comercialRepuesto.detalle);
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
  const etiquetaReserva = etiquetaTrasCompromisoItem(f, compromiso.reservado);
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
            // Solo se cierra el estado cuando ya no quedan unidades libres
            // y el artículo ya llegó (punto 6).
            ...(etiquetaReserva ? { [SHIPPING_V2_ITEM_FIELDS.estadoItem]: etiquetaReserva } : {}),
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
    estadoNuevo: etiquetaReserva ?? estadoAnterior,
  });

  return resumen;
}

/**
 * Punto 6 (9-oct): etiqueta tras apartar o soltar unidades, con la MISMA regla
 * de llegada que Recepción. Lo que viene en camino conserva su etapa; lo que
 * ya llegó queda Reservado (todo apartado), Disponible o En revisión.
 */
function etiquetaTrasCompromisoItem(f: Record<string, unknown>, todasApartadas: boolean): string | null {
  return estadoSegunLlegada({
    estado: firstString(f[SHIPPING_V2_ITEM_FIELDS.estadoItem]),
    recibido: f[SHIPPING_V2_ITEM_FIELDS.recibido] === true,
    requiereInspeccion: f[SHIPPING_V2_ITEM_FIELDS.requiereInspeccion] === true,
    inspeccionFirmada: f["Revisado física/técnicamente"] === true,
    usoLocal: f[SHIPPING_V2_ITEM_FIELDS.esUsoLocal] === true,
    todasReservadas: todasApartadas,
  });
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

  // La etiqueta solo se mueve dentro del camino de llegada (estadoSegunLlegada):
  // si entre medias pasó a otro estado (Vendido, Con novedad…), quitar el
  // repuesto de la orden no puede resucitarlo a la venta — mismo criterio que
  // liberarItem() de reservas.
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
  // Punto 6: la etiqueta sale de la regla de llegada (no "Disponible" a ciegas).
  const etiquetaLiberada = etiquetaTrasCompromisoItem(f, liberacion.reservado);

  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
    method: "PATCH",
    body: JSON.stringify({
      records: [
        {
          id,
          fields: {
            ...(etiquetaLiberada ? { [SHIPPING_V2_ITEM_FIELDS.estadoItem]: etiquetaLiberada } : {}),
            [SHIPPING_V2_ITEM_FIELDS.cantidadReservada]: liberacion.cantidadReservada,
            [SHIPPING_V2_ITEM_FIELDS.reservado]: liberacion.reservado,
            // Punto 8: soltar una unidad no reabre la venta de algo bloqueado.
            [SHIPPING_V2_ITEM_FIELDS.disponibleVenta]: liberacion.disponibleVenta && evaluarDisponibilidadComercial({
              estado: etiquetaLiberada ?? estadoActual,
              estadoRevision: firstString(f[SHIPPING_V2_ITEM_FIELDS.estadoRevision]),
              usoLocal: firstBoolean(f[SHIPPING_V2_ITEM_FIELDS.esUsoLocal]),
            }).apartable,
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
    estadoNuevo: etiquetaLiberada ?? estadoActual,
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

/** Punto 10b (decisión 6a, 16-oct): desarmar, cancelar o revertir es solo del Administrador. */
function assertAdminDespiece(access?: ShippingV2AccessContext) {
  if (access?.isSiteAdmin !== true) throw new Error("Solo un Administrador puede desarmar equipos.");
}

/** Vínculos que significan que una pieza ya está comprometida o se usó. */
const VINCULOS_PIEZA_EN_USO = ["Reservas", "Shipping Intervenciones", "Orden de Reparación (Stock)", "Presupuesto por Orden", "Operación Comercial"];

function mapPiezaDespiece(record: AirtableRecord): PiezaDespiece {
  const F = SHIPPING_V2_ITEM_FIELDS;
  const f = record.fields;
  return {
    cantidadReservada: firstNumber(f[F.cantidadReservada]) ?? 0,
    enUso: VINCULOS_PIEZA_EN_USO.some((campo) => linkedRecordIds(f[campo]).length > 0),
    requiereInspeccion: firstBoolean(f[F.requiereInspeccion]) === true,
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
  const estadoDespiece = firstString(f[SHIPPING_V2_ITEM_FIELDS.estadoDespiece]) || "No aplica";
  const completado = estadoDespiece === "Despiece completo" || estadoDespiece === "Despiece parcial";
  const reversion = puedeRevertirseDespiece(piezas);

  return {
    padreId: id,
    sku: firstString(f[SHIPPING_V2_ITEM_FIELDS.sku]),
    cantidad: firstNumber(f[SHIPPING_V2_ITEM_FIELDS.cantidad]) ?? 0,
    varias: !evaluacion.puede && evaluacion.motivo === "varias-unidades",
    completado,
    puedeRevertir: completado && piezas.length > 0 && reversion.puede,
    motivoNoRevertible: reversion.mensaje,
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
    puedeCancelar: !completado && piezas.length > 0 && cancelacion.puede,
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
  assertAdminDespiece(options.access);
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

  // Punto 10b (4a): la pieza nace "en espera" y sin venta hasta completar.
  const pieza = await createShippingV2ItemRecord({ ...itemInput, estado: ESTADO_PIEZA_EN_ESPERA, disponibleVenta: false } as ShippingV2ItemWriteInput, {
    registradoPor: options.registradoPor,
    eventDescription: `Pieza recuperada del despiece de ${firstString(padreRecord.fields[SHIPPING_V2_ITEM_FIELDS.sku])}. En espera hasta completar el despiece.`,
    // La pieza sale de un equipo que ya está en la tienda: nace recibida.
    extraFields: { [CAMPO_ITEM_PADRE]: [padreId], "Es parte recuperada": true, [SHIPPING_V2_ITEM_FIELDS.recibido]: true },
    // Crea la opción "Pieza en espera" la primera vez.
    typecast: true,
  });

  // El equipo entra en "Despiece en proceso" en cuanto nace la primera pieza,
  // y deja de venderse: ya lo están desarmando (punto 10b).
  if (resumen.estadoDespiece !== "Despiece en proceso") {
    await airtableMutation(tableUrl(SHIPPING_V2_TABLES.items), {
      method: "PATCH",
      body: JSON.stringify({
        records: [{
          id: padreId,
          fields: {
            [SHIPPING_V2_ITEM_FIELDS.estadoDespiece]: "Despiece en proceso",
            [SHIPPING_V2_ITEM_FIELDS.estadoItem]: "Destinado a partes",
            [SHIPPING_V2_ITEM_FIELDS.disponibleVenta]: false,
          },
        }],
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
  assertAdminDespiece(options.access);
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
  assertAdminDespiece(options.access);
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

/** Borra registros de Shipping Items (de a 10, el máximo de Airtable por llamada). */
async function borrarRegistrosItems(ids: string[]) {
  for (let i = 0; i < ids.length; i += 10) {
    const lote = ids.slice(i, i + 10);
    const query = lote.map((rid) => `records[]=${encodeURIComponent(rid)}`).join("&");
    await airtableMutation(`${tableUrl(SHIPPING_V2_TABLES.items)}?${query}`, { method: "DELETE" });
  }
}

/**
 * Etiqueta con la que el equipo vuelve a la tienda al cancelar o revertir su
 * despiece: la de antes de desarmarlo. Si lo mandó a despiece una novedad,
 * sigue "Destinado a partes". Si no, "Disponible", o "En revisión" si su
 * categoría pide inspección y nunca se firmó (no se pide una inspección nueva:
 * decisión 5a del 16-oct).
 */
async function estadoAlVolverDelDespiece(padreId: string, f: Record<string, unknown>): Promise<string> {
  const novedades = await getShippingV2NovedadesForItem(padreId, systemShippingV2Access()).catch(() => []);
  if (novedades.some((n) => normalizeStatus(n.decision ?? "") === "va a despiece")) return "Destinado a partes";
  const requiere = firstBoolean(f[SHIPPING_V2_ITEM_FIELDS.requiereInspeccion]) === true;
  const firmada = firstBoolean(f["Revisado física/técnicamente"]) === true;
  return requiere && !firmada ? "En revisión" : "Disponible";
}

/**
 * Cierra el despiece: descuenta la unidad desarmada del equipo padre y lo saca
 * de la venta. Es la tercera forma legítima de reducir inventario —junto a la
 * factura y el recibo— y la única que no es una venta: el equipo no se vendió,
 * cambió de forma. Por eso no genera ningún movimiento financiero.
 *
 * Punto 10b (4a): recién aquí las piezas dejan de estar "en espera" y pasan a
 * "En revisión" (si su categoría pide inspección) o "Disponible".
 */
export async function completarDespiece(
  input: { padreId: string; completo: boolean; motivo?: string },
  options: { registradoPor: string; access?: ShippingV2AccessContext }
) {
  assertAdminDespiece(options.access);
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

    // Las piezas salen de la espera.
    const enEspera = resumen.piezas.filter((p) => normalizeStatus(p.estadoItem) === normalizeStatus(ESTADO_PIEZA_EN_ESPERA));
    if (enEspera.length) {
      await patchAirtableRecords(SHIPPING_V2_TABLES.items, enEspera.map((p) => ({
        id: p.id,
        fields: {
          [SHIPPING_V2_ITEM_FIELDS.estadoItem]: p.requiereInspeccion ? "En revisión" : "Disponible",
          [SHIPPING_V2_ITEM_FIELDS.estadoRevision]: p.requiereInspeccion ? "Recibido pendiente de revisión" : "Recibido correctamente",
          [SHIPPING_V2_ITEM_FIELDS.ultimaActualizacion]: new Date().toISOString(),
          [SHIPPING_V2_ITEM_FIELDS.actualizadoPor]: options.registradoPor,
        },
      })));
      for (const p of enEspera) {
        await recalcularDisponibilidadItem(p.id, options.registradoPor).catch((error) =>
          console.error("No se pudo recalcular la pieza al completar el despiece:", p.sku, error)
        );
      }
    }

    await createShippingV2Event({
      action: "Cambio de estado",
      entity: "Shipping Item",
      itemRecordId: padreId,
      itemName: firstString(padreRecord.fields[SHIPPING_V2_ITEM_FIELDS.nombre]),
      registradoPor: options.registradoPor,
      descripcion: `${cierre.estadoDespiecePadre}: se recuperaron ${resumen.piezas.length} pieza(s), ya disponibles. La unidad desarmada se descontó del inventario.`,
      estadoAnterior,
      estadoNuevo: cierre.estadoItemPadre,
    });

    invalidateShippingV2ItemSearchIndexCache();
    return getResumenDespiece(padreId, options.access);
  });
}

/**
 * Cancela un despiece EN PROCESO (decisión 5a): borra las piezas en espera y
 * el equipo vuelve como estaba. Un despiece ya completado se revierte con
 * revertirDespiece.
 */
export async function cancelarDespiece(
  input: { padreId: string },
  options: { registradoPor: string; access?: ShippingV2AccessContext }
) {
  assertAdminDespiece(options.access);
  const padreId = cleanString(input.padreId);
  if (!padreId) throw new Error("Record ID del equipo padre inválido.");

  return withLock(`shipping-item:${padreId}`, async () => {
    const resumen = await getResumenDespiece(padreId, options.access);
    if (resumen.completado) throw new Error("El despiece ya se completó: usa \"Revertir despiece\".");
    const cancelacion = puedeCancelarseDespiece(resumen.piezas);
    if (!cancelacion.puede) throw new Error(cancelacion.mensaje ?? "No se puede cancelar este despiece.");

    const padreRecord = await leerRegistroItem(padreId);
    const estadoAnterior = firstString(padreRecord.fields[SHIPPING_V2_ITEM_FIELDS.estadoItem]);
    const estadoNuevo = await estadoAlVolverDelDespiece(padreId, padreRecord.fields);
    await borrarRegistrosItems(resumen.piezas.map((p) => p.id));
    await airtableMutation(tableUrl(SHIPPING_V2_TABLES.items), {
      method: "PATCH",
      body: JSON.stringify({
        records: [{
          id: padreId,
          fields: {
            [SHIPPING_V2_ITEM_FIELDS.estadoDespiece]: "Cancelado",
            [SHIPPING_V2_ITEM_FIELDS.estadoItem]: estadoNuevo,
            [SHIPPING_V2_ITEM_FIELDS.ultimaActualizacion]: new Date().toISOString(),
            [SHIPPING_V2_ITEM_FIELDS.actualizadoPor]: options.registradoPor,
          },
        }],
      }),
    });
    await recalcularDisponibilidadItem(padreId, options.registradoPor).catch((error) =>
      console.error("No se pudo recalcular el equipo al cancelar el despiece:", error)
    );
    await createShippingV2Event({
      action: "Cambio de estado",
      entity: "Shipping Item",
      itemRecordId: padreId,
      itemName: firstString(padreRecord.fields[SHIPPING_V2_ITEM_FIELDS.nombre]),
      registradoPor: options.registradoPor,
      descripcion: `Despiece cancelado: se borraron ${resumen.piezas.length} pieza(s) en espera (${resumen.piezas.map((p) => p.sku).join(", ") || "ninguna"}).`,
      estadoAnterior,
      estadoNuevo,
    });
    invalidateShippingV2ItemSearchIndexCache();
    return getResumenDespiece(padreId, options.access);
  });
}

/**
 * Revierte un despiece YA COMPLETADO (decisión 5a, solo Administrador): si
 * ninguna pieza se vendió, reservó o usó, se borran las piezas y el equipo
 * vuelve a existir entero, directo a la venta (sin inspección nueva).
 */
export async function revertirDespiece(
  input: { padreId: string; motivo?: string },
  options: { registradoPor: string; access?: ShippingV2AccessContext }
) {
  assertAdminDespiece(options.access);
  const padreId = cleanString(input.padreId);
  if (!padreId) throw new Error("Record ID del equipo padre inválido.");
  const motivo = cleanString(input.motivo);
  if (!motivo) throw new Error("Escribe el motivo para revertir el despiece.");

  return withLock(`shipping-item:${padreId}`, async () => {
    const resumen = await getResumenDespiece(padreId, options.access);
    if (!resumen.completado) throw new Error("Este despiece no está completado: usa \"Cancelar despiece\".");
    const reversion = puedeRevertirseDespiece(resumen.piezas);
    if (!reversion.puede) throw new Error(reversion.mensaje ?? "No se puede revertir este despiece.");

    const padreRecord = await leerRegistroItem(padreId);
    const estadoAnterior = firstString(padreRecord.fields[SHIPPING_V2_ITEM_FIELDS.estadoItem]);
    const estadoNuevo = await estadoAlVolverDelDespiece(padreId, padreRecord.fields);
    await borrarRegistrosItems(resumen.piezas.map((p) => p.id));
    await airtableMutation(tableUrl(SHIPPING_V2_TABLES.items), {
      method: "PATCH",
      body: JSON.stringify({
        records: [{
          id: padreId,
          fields: {
            [SHIPPING_V2_ITEM_FIELDS.cantidad]: 1,
            [SHIPPING_V2_ITEM_FIELDS.estadoDespiece]: "Cancelado",
            [SHIPPING_V2_ITEM_FIELDS.estadoItem]: estadoNuevo,
            [SHIPPING_V2_ITEM_FIELDS.ultimaActualizacion]: new Date().toISOString(),
            [SHIPPING_V2_ITEM_FIELDS.actualizadoPor]: options.registradoPor,
          },
        }],
      }),
    });
    await recalcularDisponibilidadItem(padreId, options.registradoPor).catch((error) =>
      console.error("No se pudo recalcular el equipo al revertir el despiece:", error)
    );
    await createShippingV2Event({
      action: "Cambio de estado",
      entity: "Shipping Item",
      itemRecordId: padreId,
      itemName: firstString(padreRecord.fields[SHIPPING_V2_ITEM_FIELDS.nombre]),
      registradoPor: options.registradoPor,
      descripcion: `Despiece revertido por Administrador: se borraron ${resumen.piezas.length} pieza(s) (${resumen.piezas.map((p) => p.sku).join(", ")}) y el equipo vuelve entero.`,
      estadoAnterior,
      estadoNuevo,
      observacion: motivo,
    });
    invalidateShippingV2ItemSearchIndexCache();
    return getResumenDespiece(padreId, options.access);
  });
}

/**
 * Separa UNA unidad de un registro con varias (punto 10b): nace un registro
 * nuevo con el MISMO SKU, 1 unidad y su parte exacta de costos; el original
 * queda con una menos. Primero se crea la nueva y después se descuenta del
 * original: si algo falla, no se pierde ninguna unidad. Ver separar-unidad.ts.
 */
export async function separarUnaUnidadShippingV2(
  itemId: string,
  options: { actor: string; access?: ShippingV2AccessContext; motivo?: string }
): Promise<{ nuevoId: string; sku: string; mensaje: string }> {
  const id = cleanString(itemId);
  if (!id) throw new Error("Record ID de item inválido.");
  return withLock(`shipping-item:${id}`, async () => {
    const original = await leerRegistroItem(id);
    const f = original.fields;
    const F = SHIPPING_V2_ITEM_FIELDS;
    const evaluacion = evaluarSepararUnidad({
      cantidad: firstNumber(f[F.cantidad]),
      cantidadReservada: firstNumber(f[F.cantidadReservada]),
      reservado: firstBoolean(f[F.reservado]),
      estado: firstString(f[F.estadoItem]),
      usoLocal: firstBoolean(f[F.esUsoLocal]),
    }, { esAdministrador: options.access?.isSiteAdmin === true });
    if (!evaluacion.ok) throw new Error(evaluacion.motivo);

    const sku = firstString(f[F.sku]);
    const total = firstNumber(f[F.cantidad]) ?? 0;
    const motivo = cleanString(options.motivo);
    const nota = `Unidad separada de ${sku} (${total} → ${total - 1}) el ${new Date().toISOString().slice(0, 10)}${motivo ? `: ${motivo}` : ""}.`;
    const ahora = new Date().toISOString();
    const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
      method: "POST",
      body: JSON.stringify({ records: [{ fields: camposUnidadSeparada(f, { nota, actor: options.actor, ahora }) }] }),
    });
    const creado = response.records?.[0];
    if (!creado) throw new Error("Airtable no devolvió la unidad separada.");
    try {
      await airtableMutation(tableUrl(SHIPPING_V2_TABLES.items), {
        method: "PATCH",
        body: JSON.stringify({ records: [{ id, fields: camposOriginalTrasSeparar(f, { actor: options.actor, ahora }) }] }),
      });
    } catch (error) {
      console.error("CRÍTICO: se creó la unidad separada pero no se descontó del original:", { sku, nuevo: creado.id }, error);
      throw new Error(`Se creó la unidad nueva de ${sku}, pero no se pudo descontar del registro original. Corrige su cantidad a mano (${total - 1}).`);
    }
    await recalcularDisponibilidadItem(id, options.actor).catch((error) => console.error("No se pudo recalcular el original:", error));
    await recalcularDisponibilidadItem(creado.id, options.actor).catch((error) => console.error("No se pudo recalcular la unidad separada:", error));
    const nombre = firstString(f[F.nombre]);
    await createShippingV2Event({ action: "Creado", itemRecordId: creado.id, itemName: nombre, registradoPor: options.actor, descripcion: nota });
    await createShippingV2Event({ action: "Actualizado", itemRecordId: id, itemName: nombre, registradoPor: options.actor, descripcion: `Se separó 1 unidad en un registro propio (mismo SKU). Quedan ${total - 1}.`, observacion: motivo || undefined });
    invalidateShippingV2ItemSearchIndexCache();
    return { nuevoId: creado.id, sku, mensaje: `Se separó 1 unidad de ${sku}. El registro original queda con ${total - 1}.` };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// INSPECCIÓN TÉCNICA
//
// Lo que el equipo TRAE no se guarda dos veces: vive en los mismos campos que
// usa la ficha técnica (`Conectividad V2`, `Puertos V2`, `Características
// extras V2`). El respaldo JSON solo guarda una COPIA de lo que se firmó, para
// poder detectar que alguien cambió el equipamiento después de la firma.
// ═══════════════════════════════════════════════════════════════════════════

export type ShippingV2InspeccionDeclarable = {
  id: string;
  nombre: string;
  declarada: boolean;
};

export type ShippingV2InspeccionGrupo = {
  grupo: GrupoDeclarable;
  titulo: string;
  catalogo: string;
  opciones: ShippingV2InspeccionDeclarable[];
};

export type ShippingV2InspeccionTecnica = {
  item: ShippingV2Item;
  zonas: ZonaRevision[];
  snapshot: SnapshotRevision;
  estado: EstadoInspeccion;
  grupos: ShippingV2InspeccionGrupo[];
  intervenciones: ShippingV2Intervencion[];
  /** Novedades abiertas del item, para no volver a crear la misma. */
  novedadesAbiertas: ShippingV2Novedad[];
  /** Datos técnicos de la categoría. Vacío en Laptop/Desktop/All in One y en las que no llevan. */
  especificaciones: ShippingV2EspecificacionesItem;
  /** Trabajos que aplican a ESTE tipo de item. El servidor valida lo mismo. */
  trabajos: {
    perfil: PerfilRevision;
    mantenimientos: string[];
    mejoras: string[];
  };
};

export type ShippingV2EspecificacionesItem = {
  campos: CampoEspec[];
  /** Lo guardado, con los huecos cubiertos por lo que ya sabía la ficha. */
  valores: ValoresEspec;
  /** La línea que va en la etiqueta con estos valores. */
  resumen: string;
};

/**
 * Los dos campos de Airtable que hay que escribir para guardar datos técnicos.
 *
 * Lo usan la inspección y la ficha: así las dos pantallas escriben igual, y el
 * resumen de la etiqueta se recalcula siempre con la misma regla.
 *
 * Se parte de lo que el usuario VE: lo guardado más lo heredado de la ficha.
 * De otro modo, al tocar un solo campo lo heredado seguiría dependiendo de la
 * ficha en vez de quedar guardado de verdad.
 */
function camposEspecificacionesParaGuardar(
  item: ShippingV2Item,
  cambios: Record<string, unknown>,
  firma: { actor: string; ahora: string }
): Record<string, unknown> {
  if (camposDeCategoria(item.categoria).length === 0) return {};
  const actual = parsearEspecificaciones(item.especificacionesTecnicas);
  const base = {
    ...actual,
    valores: {
      ...actual.valores,
      ...especificacionesEfectivas(item.categoria, actual.valores, item.technicalSheet),
    },
  };
  const nuevo = aplicarCambiosEspec(base, item.categoria, cambios, firma);
  return {
    "Especificaciones técnicas": serializarEspecificaciones(nuevo),
    "Resumen técnico": resumenTecnico(item.categoria, nuevo.valores),
  };
}

/**
 * Guarda datos técnicos SIN pasar por la inspección.
 *
 * A propósito no exige que la inspección esté abierta: las especificaciones
 * son información de venta, no una prueba del equipo. Corregir "DDR3" por
 * "DDR4" no puede obligar a reabrir y volver a firmar una inspección entera,
 * ni dejar el item sin publicar mientras tanto.
 */
export async function guardarShippingV2Especificaciones(
  recordId: string,
  cambios: Record<string, string>,
  options: { actor: string; access?: ShippingV2AccessContext }
): Promise<{ item: ShippingV2Item; especificaciones: ShippingV2EspecificacionesItem }> {
  assertShippingV2Permission(options.access, "canUseRecepcion", "No tienes permiso para usar Recepción.");
  const id = cleanString(recordId);
  if (!id) throw new Error("Record ID de item inválido.");

  const item = await getShippingV2ItemById(id, { includeAiName: false, access: options.access });
  if (camposDeCategoria(item.categoria).length === 0) {
    throw new Error(`La categoría ${item.categoria || "de este item"} no tiene datos técnicos propios.`);
  }

  const ahora = new Date().toISOString();
  await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
    method: "PATCH",
    body: JSON.stringify({
      records: [{
        id,
        fields: {
          ...camposEspecificacionesParaGuardar(item, cambios, { actor: options.actor, ahora }),
          "Última actualización": ahora,
          "Actualizado por": options.actor,
        },
      }],
    }),
  });

  const actualizado = await getShippingV2ItemById(id, { includeAiName: false, access: options.access });
  return { item: actualizado, especificaciones: especificacionesDeItem(actualizado) };
}

/** Datos técnicos de un item tal como los ve la pantalla. */
export function especificacionesDeItem(item: ShippingV2Item): ShippingV2EspecificacionesItem {
  const campos = camposDeCategoria(item.categoria);
  const guardadas = parsearEspecificaciones(item.especificacionesTecnicas).valores;
  const valores = especificacionesEfectivas(item.categoria, guardadas, item.technicalSheet);
  return { campos, valores, resumen: resumenTecnico(item.categoria, valores) };
}

export type ShippingV2Intervencion = {
  id: string;
  etiqueta: string;
  tipo: string;
  detalle?: string;
  nota?: string;
  itemId?: string;
  repuestoId?: string;
  cantidadUsada: number | null;
  costoRepuesto: number | null;
  /** Punto 3: lo que la mejora sumó al costo del equipo. */
  costoSumado: number | null;
  /** Punto 3: valor de la pieza retirada que se restó del equipo. */
  valorPiezaRetirada: number | null;
  /** Punto 3: artículo creado con la pieza que salió. */
  piezaRetiradaId?: string;
  /** Punto 3 (8-oct): anulada por un Administrador (no se borra). */
  anulada: boolean;
  anuladaPor?: string;
  fechaAnulacion?: string;
  motivoAnulacion?: string;
  resultadoAnulacion?: string;
  realizadoPor?: string;
  fecha?: string;
};

const INTERVENCION_TIPOS = new Set(["Mantenimiento", "Mejora"]);

function mapIntervencion(record: AirtableRecord): ShippingV2Intervencion {
  const f = record.fields;
  const itemIds = linkedRecordIds(f.Item);
  const repuestoIds = linkedRecordIds(f["Repuesto usado"]);
  return {
    id: record.id,
    etiqueta: firstString(f["Intervención"], record.id),
    tipo: firstString(f.Tipo, "Mantenimiento"),
    detalle: firstString(f.Detalle),
    nota: firstString(f.Nota),
    itemId: itemIds[0],
    repuestoId: repuestoIds[0],
    cantidadUsada: firstNumber(f["Cantidad usada"]),
    costoRepuesto: firstNumber(f["Costo repuesto"]),
    costoSumado: firstNumber(f["Costo sumado al equipo"]),
    valorPiezaRetirada: firstNumber(f["Valor pieza retirada"]),
    piezaRetiradaId: linkedRecordIds(f["Pieza retirada"])[0],
    anulada: firstBoolean(f["Anulada"]) === true,
    anuladaPor: firstString(f["Anulada por"]) || undefined,
    fechaAnulacion: firstString(f["Fecha de anulación"]) || undefined,
    motivoAnulacion: firstString(f["Motivo de anulación"]) || undefined,
    resultadoAnulacion: firstString(f["Resultado de anulación"]) || undefined,
    realizadoPor: firstString(f["Realizado por"]),
    fecha: firstString(f.Fecha, record.createdTime),
  };
}

/**
 * Arma la ficha COMPLETA a partir de la actual más los cambios.
 *
 * `updateShippingV2ItemTechnicalSheet` no hace merge: reescribe todos los
 * campos, y lo que no venga en el input queda en null. Su único llamador
 * anterior era el formulario de ficha, que siempre manda todo. La inspección
 * manda parciales (un campo suelto al salir de un input), así que sin esta
 * mezcla, anotar "512 GB" en Almacenamiento borraría marca, modelo, CPU, RAM,
 * sistema operativo y las tres listas de conectividad/puertos/extras.
 */
function mezclarFichaTecnica(
  actual: ShippingV2TechnicalSheet,
  cambios: ShippingV2TechnicalSheetInput
): ShippingV2TechnicalSheetInput {
  return {
    marcaFicha: actual.marcaFicha,
    modeloFicha: actual.modeloFicha,
    sistemaOperativo: actual.sistemaOperativo,
    pantallaTamano: actual.pantallaTamano,
    pantallaResolucion: actual.pantallaResolucion,
    cpuMarca: actual.cpuMarca,
    cpuModelo: actual.cpuModelo,
    cpuFrecuenciaBase: actual.cpuFrecuenciaBase,
    cpuFrecuenciaTurbo: actual.cpuFrecuenciaTurbo,
    ramCapacidad: actual.ramCapacidad,
    ramTipo: actual.ramTipo,
    almacenamientoPrincipal: actual.almacenamientoPrincipal,
    almacenamientoTipo: actual.almacenamientoTipo,
    almacenamiento2: actual.almacenamiento2,
    almacenamiento2Tipo: actual.almacenamiento2Tipo,
    gpu: actual.gpu,
    gpuIntegrada: actual.gpuIntegrada,
    bateriaSalud: actual.bateriaSalud,
    connectivityV2Ids: actual.connectivityV2Ids,
    portV2Ids: actual.portV2Ids,
    extraFeatureV2Ids: actual.extraFeatureV2Ids,
    observacionFichaTecnica: actual.observacionFichaTecnica,
    ...cambios,
  } as ShippingV2TechnicalSheetInput;
}

/** Lo que el item declara tener, en la forma que espera `construirZonasRevision`. */
function declaradasDeItem(item: ShippingV2Item): OpcionDeclarada[] {
  const hoja = item.technicalSheet;
  return [
    ...hoja.connectivityV2Names.map((nombre) => ({ nombre, grupo: "conectividad" as GrupoDeclarable })),
    ...hoja.portV2Names.map((nombre) => ({ nombre, grupo: "puerto" as GrupoDeclarable })),
    ...hoja.extraFeatureV2Names.map((nombre) => ({ nombre, grupo: "extra" as GrupoDeclarable })),
  ];
}

export async function getShippingV2InspeccionTecnica(
  recordId: string,
  options: { access?: ShippingV2AccessContext } = {}
): Promise<ShippingV2InspeccionTecnica> {
  assertShippingV2Permission(options.access, "canUseRecepcion", "No tienes permiso para usar Recepción.");
  const id = cleanString(recordId);
  if (!id) throw new Error("Record ID de item inválido.");

  const [item, catalogos, intervenciones, novedades] = await Promise.all([
    getShippingV2ItemById(id, { includeAiName: false, access: options.access }),
    getShippingV2TechnicalOptionSets(),
    getShippingV2IntervencionesDeItem(id),
    getShippingV2NovedadesForItem(id, options.access),
  ]);

  const declaradas = declaradasDeItem(item);
  const zonas = construirZonasRevision(item.categoria, declaradas);

  // El respaldo puede traer resultados de puntos que ya no existen: pasa cuando
  // se desmarca una característica. Se limpian ANTES de calcular nada, para que
  // una falla huérfana no siga contando.
  const crudo = parsearSnapshot(item.revisionTecnicaDetalle, item.categoria);
  const { snapshot } = limpiarHuerfanos(crudo, zonas);

  const estado = resolverEstadoInspeccion({
    zonas,
    resultados: resultadosDe(snapshot),
    equipamientoConfirmado: firmaVigente(snapshot, declaradas),
  });

  const marcadas = (ids: string[]) => new Set(ids);
  const conectividad = marcadas(item.technicalSheet.connectivityV2Ids);
  const puertos = marcadas(item.technicalSheet.portV2Ids);
  const extras = marcadas(item.technicalSheet.extraFeatureV2Ids);

  const grupos: ShippingV2InspeccionGrupo[] = [
    {
      grupo: "conectividad", titulo: "Conectividad", catalogo: "Catálogo Conectividad",
      opciones: catalogos.connectivity.map((o) => ({ id: o.id, nombre: o.name, declarada: conectividad.has(o.id) })),
    },
    {
      grupo: "puerto", titulo: "Puertos", catalogo: "Catálogo Puertos",
      opciones: catalogos.ports.map((o) => ({ id: o.id, nombre: o.name, declarada: puertos.has(o.id) })),
    },
    {
      grupo: "extra", titulo: "Características del equipo", catalogo: "Catálogo Características Extras",
      opciones: catalogos.extraFeatures.map((o) => ({ id: o.id, nombre: o.name, declarada: extras.has(o.id) })),
    },
  ];

  return {
    item,
    zonas,
    snapshot,
    estado,
    grupos,
    intervenciones,
    novedadesAbiertas: novedades,
    // Los trabajos que aplican a esta categoría salen del servidor, del mismo
    // módulo que valida al guardar: la pantalla no puede ofrecer algo que el
    // servidor vaya a rechazar.
    trabajos: getIntervencionesPorCategoria(item.categoria),
    especificaciones: especificacionesDeItem(item),
  };
}

export type ShippingV2InspeccionCambios = {
  /** Marcar o desmarcar puntos. `resultado: null` desmarca. */
  puntos?: { puntoId: string; resultado: ResultadoPunto | null }[];
  observaciones?: { zonaId: string; nota: string }[];
  /** Ids de opciones por grupo. Si viene, reemplaza lo declarado. */
  equipamiento?: { conectividadIds: string[]; puertosIds: string[]; extrasIds: string[]; confirmar?: boolean };
  /** Datos de la ficha capturados durante la inspección. */
  ficha?: ShippingV2TechnicalSheetInput;
  /** Datos técnicos de la categoría: { campoId: valor }. "" borra el campo. */
  especificaciones?: Record<string, string>;
  /** Punto 10d: "Accesorios incluidos" (una línea por accesorio, o "Sin accesorios"). */
  accesorios?: string;
};

// Los artículos que no requieren inspección no pasan por la pantalla de
// Inspección (decisión del dueño, 4-oct-2026). Si alguno sí la necesita, se
// marca "Requiere inspección" en su ficha y vuelve a aparecer.
const MENSAJE_NO_REQUIERE_INSPECCION =
  "Este artículo no requiere inspección técnica. Si la necesita, marca “Requiere inspección” en su ficha.";

/**
 * Guarda la inspección. Pensada para llamarse seguido (autoguardado): siempre
 * relee el estado actual y escribe el respaldo completo, así dos pestañas
 * abiertas no se pisan a medias.
 */
export async function guardarShippingV2InspeccionTecnica(
  recordId: string,
  cambios: ShippingV2InspeccionCambios,
  options: { actor: string; access?: ShippingV2AccessContext }
) {
  assertShippingV2Permission(options.access, "canUseRecepcion", "No tienes permiso para usar Recepción.");
  const id = cleanString(recordId);
  if (!id) throw new Error("Record ID de item inválido.");

  let item = await getShippingV2ItemById(id, { includeAiName: false, access: options.access });
  if (item.recibido !== true) {
    throw new Error("Marca primero el item como Recibido antes de inspeccionarlo.");
  }
  if (item.requiereInspeccion !== true) {
    throw new Error(MENSAJE_NO_REQUIERE_INSPECCION);
  }
  // Una inspección firmada no se edita a escondidas. Sin esta guarda, desmarcar
  // una característica borraría resultados y tumbaría la firma del snapshot,
  // pero el item seguiría marcado como "Revisado" y se publicaría igual.
  if (item.revisadoFisicamente === true) {
    throw new Error(
      "Esta inspección ya está firmada. Para modificarla, usa “Reabrir inspección” en la barra inferior."
    );
  }

  const ahora = new Date().toISOString();

  // ── 1) El equipamiento y la ficha van por el camino de siempre ──
  // `updateShippingV2ItemTechnicalSheet` normaliza frecuencias, calcula el
  // estado de batería y alimenta los catálogos. Escribir los campos a mano
  // aquí perdería todo eso.
  const parcial: ShippingV2TechnicalSheetInput = { ...(cambios.ficha ?? {}) };
  if (cambios.equipamiento) {
    parcial.connectivityV2Ids = cambios.equipamiento.conectividadIds;
    parcial.portV2Ids = cambios.equipamiento.puertosIds;
    parcial.extraFeatureV2Ids = cambios.equipamiento.extrasIds;
  }
  if (Object.keys(parcial).length > 0) {
    const entradaFicha = mezclarFichaTecnica(item.technicalSheet, parcial);
    await updateShippingV2ItemTechnicalSheet(id, entradaFicha, { actualizadoPor: options.actor });
    item = await getShippingV2ItemById(id, { includeAiName: false, access: options.access });
  }

  // ── 2) El respaldo de la inspección ──
  const declaradas = declaradasDeItem(item);
  const zonas = construirZonasRevision(item.categoria, declaradas);
  const textoPorPunto = new Map(zonas.flatMap((z) => z.puntos.map((p) => [p.id, p.texto] as const)));

  let snapshot = parsearSnapshot(item.revisionTecnicaDetalle, item.categoria);

  if (cambios.equipamiento?.confirmar) {
    snapshot = confirmarEquipamiento(snapshot, { opciones: declaradas, actor: options.actor, ahora });
  } else if (cambios.equipamiento) {
    // Cambiar lo declarado sin firmar tumba la firma anterior: ya no es lo
    // mismo que se firmó.
    snapshot = actualizarEquipamiento(snapshot, { opciones: declaradas, actor: options.actor, ahora });
  }

  for (const punto of cambios.puntos ?? []) {
    const texto = textoPorPunto.get(punto.puntoId);
    if (!texto && punto.resultado !== null) {
      // Un punto que no existe en esta categoría: se ignora en vez de romper.
      console.warn("[Shipping V2 inspección] punto desconocido, ignorado:", punto.puntoId);
      continue;
    }
    snapshot = marcarPunto(snapshot, {
      puntoId: punto.puntoId,
      texto: texto ?? "",
      resultado: punto.resultado,
      actor: options.actor,
      ahora,
    });
  }

  for (const obs of cambios.observaciones ?? []) {
    snapshot = guardarObservacion(snapshot, { zonaId: obs.zonaId, nota: obs.nota, actor: options.actor, ahora });
  }

  const limpio = limpiarHuerfanos(snapshot, zonas);
  snapshot = limpio.snapshot;

  // ── 3) Datos técnicos de la categoría ──
  const camposEspec = cambios.especificaciones
    ? camposEspecificacionesParaGuardar(item, cambios.especificaciones, { actor: options.actor, ahora })
    : {};

  await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
    method: "PATCH",
    body: JSON.stringify({
      records: [{
        id,
        fields: {
          ...camposEspec,
          ...(cambios.accesorios !== undefined
            ? { [SHIPPING_V2_ITEM_FIELDS.accesoriosIncluidos]: escribirAccesorios(leerAccesorios(cambios.accesorios)) }
            : {}),
          "Revisión técnica detalle": serializarSnapshot(snapshot),
          "Puntos de revisión fallidos": contarFallas(snapshot, zonas),
          "Última actualización": ahora,
          "Actualizado por": options.actor,
        },
      }],
    }),
  });

  const actualizado = await getShippingV2ItemById(id, { includeAiName: false, access: options.access });
  const estado = resolverEstadoInspeccion({
    zonas,
    resultados: resultadosDe(snapshot),
    equipamientoConfirmado: firmaVigente(snapshot, declaradas),
  });

  return { item: actualizado, snapshot, zonas, estado, especificaciones: especificacionesDeItem(actualizado) };
}

/**
 * Firma la inspección.
 *
 * NO decide si está completa: eso lo calcula `resolverEstadoInspeccion`. Aquí
 * solo se comprueba y se sella, escribiendo por el camino de siempre
 * (`updateShippingV2ReceptionChecklistItem`) para no perder sus efectos: pasar
 * el `Estado de revisión`, mover el `Estado Item` y registrar el evento.
 */
export async function firmarShippingV2InspeccionTecnica(
  recordId: string,
  options: { actor: string; access?: ShippingV2AccessContext }
) {
  assertShippingV2Permission(options.access, "canUseRecepcion", "No tienes permiso para usar Recepción.");
  const id = cleanString(recordId);
  if (!id) throw new Error("Record ID de item inválido.");

  const inspeccion = await getShippingV2InspeccionTecnica(id, { access: options.access });
  if (inspeccion.item.requiereInspeccion !== true) {
    throw new Error(MENSAJE_NO_REQUIERE_INSPECCION);
  }
  if (!inspeccion.estado.completa) {
    throw new Error(inspeccion.estado.motivo);
  }

  const resumen = inspeccion.estado.fallasCriticas.length
    ? `Inspección técnica firmada con ${inspeccion.estado.fallasCriticas.length} falla(s) crítica(s).`
    : "Inspección técnica firmada sin fallas críticas.";

  const item = await updateShippingV2ReceptionChecklistItem(
    id,
    { action: "reviewed", value: true, note: resumen },
    { actualizadoPor: options.actor, desdeFirmaInspeccion: true }
  );

  return { item, estado: inspeccion.estado };
}

// ─── Intervenciones: mantenimientos y mejoras ───────────────────────────────

export async function getShippingV2IntervencionesDeItem(itemRecordId: string): Promise<ShippingV2Intervencion[]> {
  const id = cleanString(itemRecordId);
  if (!id) return [];
  try {
    // Se filtra EN AIRTABLE por el enlace al item. Leer los primeros 200 de la
    // tabla y filtrar en memoria dejaría el historial vacío en cuanto la tabla
    // creciera, sin ningún aviso.
    const records = await listRecords(SHIPPING_V2_TABLES.intervenciones, {
      maxRecords: 200,
      // Se filtra por `Item ID` (texto con el record ID), NO por el enlace:
      // ARRAYJOIN() sobre un campo de enlace devuelve los NOMBRES de los
      // registros enlazados, no sus IDs, así que buscar "rec..." ahí nunca
      // coincidía y el historial salía siempre vacío.
      filterByFormula: `{Item ID} = "${id}"`,
      sortField: "Fecha",
      sortDirection: "desc",
    });
    return records.map(mapIntervencion);
  } catch (error) {
    // Si la tabla no existe todavía en una base vieja, la pantalla no puede
    // quedar inutilizable por eso.
    console.error("No se pudieron leer las intervenciones del item:", error);
    return [];
  }
}

/**
 * Piezas que se pueden usar en una mejora (punto 3, 6-oct-2026): las mismas
 * categorías del buscador de repuestos de los técnicos, en la tienda, sin
 * problema abierto y con unidades libres. Ya no depende de "Es repuesto".
 *
 * No se usa `getShippingV2Items()`: tiene un tope de 200 ordenado por fecha y
 * dejaría fuera las piezas antiguas. Aquí se leen solo los campos necesarios.
 */
export async function getShippingV2RepuestosDisponibles(
  access?: ShippingV2AccessContext,
  equipoId = ""
) {
  assertShippingV2Permission(access, "canViewItems", "No tienes acceso a los artículos.");
  const F = SHIPPING_V2_ITEM_FIELDS;
  const categoriasOr = CATEGORIAS_REPUESTO_STOCK.map((c) => `{${F.categoria}}="${c}"`).join(",");
  const records = await listRecords(SHIPPING_V2_TABLES.items, {
    maxRecords: 5000,
    pageSize: 100,
    filterByFormula: `AND(OR(${categoriasOr}),{${F.recibido}}=1,{${F.cantidad}}>0)`,
    fields: [
      F.sku, F.nombre, F.categoria, F.recibido, F.estadoItem, F.estadoRevision, F.esUsoLocal,
      F.cantidad, F.cantidadReservada, F.reservado, F.costoProveedor, F.costoTotalUnidad,
    ],
  });

  return records
    .map((record) => {
      const f = record.fields;
      const pieza = {
        id: record.id,
        sku: firstString(f[F.sku]),
        nombre: firstString(f[F.nombre]),
        categoria: firstString(f[F.categoria]),
        recibido: firstBoolean(f[F.recibido]),
        estado: firstString(f[F.estadoItem]),
        estadoRevision: firstString(f[F.estadoRevision]),
        usoLocal: firstBoolean(f[F.esUsoLocal]),
        cantidad: firstNumber(f[F.cantidad]),
        cantidadReservada: firstNumber(f[F.cantidadReservada]),
        reservado: firstBoolean(f[F.reservado]),
      };
      const evaluacion = evaluarPiezaParaMejora(pieza, { equipoId: cleanString(equipoId) });
      return {
        id: record.id,
        sku: pieza.sku,
        nombre: pieza.nombre,
        categoria: pieza.categoria,
        stock: evaluacion.ok ? evaluacion.libres : 0,
        // Costo por unidad que se sugiere sumar al equipo: el costo total de la
        // pieza (proveedor + logística); si no está, el del proveedor.
        costo: firstNumber(f[F.costoTotalUnidad]) ?? firstNumber(f[F.costoProveedor]) ?? 0,
        ok: evaluacion.ok,
      };
    })
    .filter((repuesto) => repuesto.ok && repuesto.stock > 0)
    .map(({ ok: _ok, ...repuesto }) => repuesto)
    .sort((a, b) => a.sku.localeCompare(b.sku));
}

export type ShippingV2PanelIntervenciones = {
  itemId: string;
  sku: string;
  categoria: string;
  cantidad: number;
  puedeRegistrar: boolean;
  motivoBloqueo?: string;
  /** Quien no ve costos no recibe montos (null) y no puede cambiar el sugerido. */
  puedeVerCostos: boolean;
  /** Solo el Administrador del sistema anula (8-oct). */
  puedeAnular: boolean;
  costoMejoras: number | null;
  trabajos: { mantenimientos: string[]; mejoras: string[] };
  intervenciones: ShippingV2Intervencion[];
  repuestos: Awaited<ReturnType<typeof getShippingV2RepuestosDisponibles>>;
};

/**
 * Todo lo que necesita la pestaña "Mantenimientos y mejoras" de la ficha del
 * artículo (punto 3, 6-oct-2026: único lugar para registrarlos).
 */
export async function getShippingV2PanelIntervenciones(
  itemRecordId: string,
  access?: ShippingV2AccessContext
): Promise<ShippingV2PanelIntervenciones> {
  assertShippingV2Permission(access, "canViewItems", "No tienes acceso a este artículo.");
  const id = cleanString(itemRecordId);
  if (!id) throw new Error("Record ID de item inválido.");
  const item = await getShippingV2ItemById(id, { includeAiName: false, access });
  const evaluacion = evaluarEquipoParaIntervencion(item);
  const puedeVerCostos = canShippingV2(access, "canViewCosts");
  const [intervenciones, repuestosCrudos, equipo] = await Promise.all([
    getShippingV2IntervencionesDeItem(id),
    evaluacion.ok ? getShippingV2RepuestosDisponibles(access, id) : Promise.resolve([]),
    leerRegistroItem(id),
  ]);
  const repuestos = puedeVerCostos ? repuestosCrudos : repuestosCrudos.map((r) => ({ ...r, costo: 0 }));
  const historial = puedeVerCostos
    ? intervenciones
    : intervenciones.map((i) => ({ ...i, costoRepuesto: null, costoSumado: null, valorPiezaRetirada: null }));
  return {
    itemId: id,
    sku: item.sku,
    categoria: item.categoria ?? "",
    cantidad: normalizarUnidades(item.cantidad),
    puedeRegistrar: evaluacion.ok,
    motivoBloqueo: evaluacion.ok ? undefined : evaluacion.motivo,
    puedeVerCostos,
    puedeAnular: access?.isSiteAdmin === true,
    costoMejoras: puedeVerCostos ? firstNumber(equipo.fields[CAMPO_COSTO_MEJORAS]) ?? 0 : null,
    trabajos: getIntervencionesPorCategoria(item.categoria),
    intervenciones: historial,
    repuestos,
  };
}

export type ShippingV2IntervencionInput = {
  tipo: string;
  detalle: string;
  nota?: string;
  repuestoId?: string;
  cantidadUsada?: number;
  /** Lo que se suma al costo del equipo (punto 3). Vacío = el sugerido. */
  costoSumado?: number | null;
  /** La pieza que salió del equipo y vuelve al inventario como artículo nuevo. */
  piezaRetirada?: PiezaRetiradaInput | null;
};

/** Campo del equipo donde se acumula el costo neto de sus mejoras. */
const CAMPO_COSTO_MEJORAS = "Costo de mejoras";

/**
 * Registra un mantenimiento o una mejora.
 *
 * En una mejora se descuenta el repuesto del inventario. El orden importa:
 * primero se descuenta y después se registra, y si el registro falla se
 * devuelve la unidad. Al revés, un fallo dejaría un descuento sin respaldo
 * documental y el inventario mentiría sin que nadie pudiera rastrearlo.
 *
 * El costo del repuesto NO se suma al costo del item: decisión del dueño. Se
 * guarda aquí para poder calcularlo después si esa regla cambia.
 */
export async function registrarShippingV2Intervencion(
  itemRecordId: string,
  input: ShippingV2IntervencionInput,
  options: { actor: string; access?: ShippingV2AccessContext }
) {
  const repuestoId = cleanString(input.repuestoId);

  // Un mantenimiento no toca el inventario: no hay nada que serializar.
  if (cleanString(input.tipo) !== "Mejora" || !repuestoId) {
    return registrarIntervencionSinTurno(itemRecordId, input, options);
  }

  // Turno por repuesto. Sin esto, dos mejoras sobre el mismo repuesto leen la
  // misma cantidad y escriben el mismo número: el stock baja UNA vez aunque se
  // hayan consumido dos unidades, y el descuadre no deja rastro.
  //
  // Es la MISMA clave que usa el apartado de reservas y el montaje de
  // repuestos en órdenes, a propósito: las unidades libres dependen de lo
  // reservado, así que montar una pieza y consumirla en una mejora tampoco
  // pueden colarse a la vez sobre la misma unidad.
  //
  // Qué NO cubre, para que quede dicho: el turno vive en la memoria de UNA
  // instancia. En Vercel pueden levantarse varias, y dos empleados atendidos
  // por procesos distintos siguen pudiendo pisarse. Airtable no ofrece
  // escrituras condicionales, así que desde aquí no hay forma de cerrar esa
  // puerta del todo. Con tres personas en la tienda, el caso real —el mismo
  // empleado haciendo doble clic, o dos pestañas— queda cubierto.
  return withLock(`shipping-item:${repuestoId}`, () =>
    registrarIntervencionSinTurno(itemRecordId, input, options)
  );
}

async function registrarIntervencionSinTurno(
  itemRecordId: string,
  input: ShippingV2IntervencionInput,
  options: { actor: string; access?: ShippingV2AccessContext }
) {
  // Desde el punto 3 (6-oct) se registra en la ficha del artículo: basta con
  // poder usar Recepción o editar artículos. Un proveedor no tiene ninguno.
  if (!canShippingV2(options.access, "canUseRecepcion") && !canShippingV2(options.access, "canEditItems")) {
    throw new Error("No tienes permiso para registrar mantenimientos ni mejoras.");
  }
  const id = cleanString(itemRecordId);
  if (!id) throw new Error("Record ID de item inválido.");

  const tipo = cleanString(input.tipo);
  if (!INTERVENCION_TIPOS.has(tipo)) throw new Error("El tipo debe ser Mantenimiento o Mejora.");
  const detalle = cleanString(input.detalle);
  if (!detalle) throw new Error("Elige qué trabajo se hizo.");

  const item = await getShippingV2ItemById(id, { includeAiName: false, access: options.access });

  // El trabajo tiene que aplicar a ESTE tipo de item. El selector ya ofrece
  // solo lo válido, pero el endpoint acepta cualquier JSON de quien tenga
  // sesión: sin esto se podría guardar "Ajuste o refuerzo de bisagras" en un
  // disco NVMe, o texto libre que ensucie el catálogo de Airtable.
  const equipoOk = evaluarEquipoParaIntervencion(item);
  if (!equipoOk.ok) throw new Error(equipoOk.motivo);

  const perfilItem = getPerfilRevision(item.categoria);
  if (!intervencionAplica(perfilItem, tipo as TipoIntervencion, detalle)) {
    throw new Error(`"${detalle}" no es un trabajo válido para ${item.categoria || "este tipo de item"}.`);
  }
  const ahora = new Date().toISOString();

  let repuesto: ShippingV2Item | null = null;
  let cantidadUsada = 0;
  let piezaAgotada = false;
  let estadoPiezaAntes = "";
  let decisionCosto: DecisionCostoMejora | null = null;
  let piezaRetirada: ReturnType<typeof validarPiezaRetirada> | null = null;

  if (tipo === "Mejora") {
    const repuestoId = cleanString(input.repuestoId);
    if (!repuestoId) throw new Error("Una mejora necesita el repuesto que se usó.");
    if (repuestoId === id) throw new Error("Un item no puede consumirse a sí mismo como repuesto.");

    repuesto = await getShippingV2ItemById(repuestoId, { includeAiName: false, access: systemShippingV2Access() });
    const pedida = Number(input.cantidadUsada ?? 1);
    if (!Number.isInteger(pedida) || pedida < 1) throw new Error("La cantidad usada debe ser un número entero mayor a 0.");
    cantidadUsada = pedida;

    // El cliente ya filtra la lista, pero el endpoint es público para quien
    // tenga sesión: sin esta validación se podría bajar la cantidad de
    // cualquier artículo del inventario pasando su record ID. Misma regla que
    // el selector (mejoras.ts): categoría de repuesto, en la tienda, sin
    // problema abierto y con unidades LIBRES (lo apartado no se consume).
    const evaluacion = evaluarPiezaParaMejora(
      {
        id: repuesto.id,
        sku: repuesto.sku,
        nombre: repuesto.nombre,
        categoria: repuesto.categoria,
        recibido: repuesto.recibido,
        estado: repuesto.estado,
        estadoRevision: repuesto.estadoRevision,
        usoLocal: repuesto.usoLocal,
        cantidad: repuesto.cantidad,
        cantidadReservada: repuesto.cantidadReservada,
        reservado: repuesto.reservado,
      },
      { equipoId: id, cantidad: cantidadUsada }
    );
    if (!evaluacion.ok) throw new Error(evaluacion.motivo);

    // Costo (punto 3): se valida TODO antes de descontar, para no tener que
    // devolver unidades por un dato mal escrito. Quien no ve costos no puede
    // cambiar el sugerido.
    const sugerido = costoSugeridoMejora(repuesto.costoTotalUnidad ?? repuesto.costoProveedor, cantidadUsada);
    const puedeVerCostos = canShippingV2(options.access, "canViewCosts");
    piezaRetirada = input.piezaRetirada ? validarPiezaRetirada(input.piezaRetirada, item, ahora) : null;
    decisionCosto = decidirCostoMejora({
      cantidadEquipo: normalizarUnidades(item.cantidad),
      costoSumado: puedeVerCostos && input.costoSumado != null ? input.costoSumado : sugerido,
      valorPiezaRetirada: puedeVerCostos ? piezaRetirada?.valorTotal ?? 0 : 0,
    });
    if (piezaRetirada && !puedeVerCostos) piezaRetirada = { ...piezaRetirada, valor: 0, valorTotal: 0 };

    const tras = cambiosPiezaTrasConsumo(normalizarUnidades(repuesto.cantidad), cantidadUsada);
    piezaAgotada = tras.agotada;
    estadoPiezaAntes = repuesto.estado || "";

    await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
      method: "PATCH",
      body: JSON.stringify({
        // typecast: crea la opción "Agotado" si todavía no existe en Airtable.
        typecast: true,
        records: [{
          id: repuesto.id,
          fields: {
            [SHIPPING_V2_ITEM_FIELDS.cantidad]: tras.cantidad,
            ...(tras.agotada
              ? { [SHIPPING_V2_ITEM_FIELDS.estadoItem]: ESTADO_AGOTADO, [SHIPPING_V2_ITEM_FIELDS.disponibleVenta]: false }
              : {}),
            "Última actualización": ahora,
            "Actualizado por": options.actor,
          },
        }],
      }),
    });
  }

  const etiqueta = [tipo, item.sku || item.nombre, detalle].filter(Boolean).join(" · ");

  try {
    const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.intervenciones), {
      method: "POST",
      body: JSON.stringify({
        // Con typecast: `Detalle` es un singleSelect y las opciones por
        // categoría no se pueden dar de alta por API de otra forma. Es seguro
        // porque el valor SIEMPRE sale de la lista cerrada de
        // `intervenciones.ts`, ya validada arriba. Los demás campos del cuerpo
        // no son texto libre: `Tipo` está validado contra dos valores, los
        // enlaces llevan record IDs reales y el resto son números o fechas.
        typecast: true,
        records: [{
          fields: compactFields({
            "Intervención": etiqueta,
            Tipo: tipo,
            Item: [id],
            // Copia en texto del record ID del item. Es lo que permite filtrar
            // el historial de forma exacta desde la app y desde Airtable.
            "Item ID": id,
            "Repuesto usado": repuesto ? [repuesto.id] : undefined,
            Detalle: detalle,
            Nota: cleanString(input.nota) || undefined,
            "Cantidad usada": repuesto ? cantidadUsada : undefined,
            "Costo repuesto": repuesto ? repuesto.costoProveedor ?? undefined : undefined,
            "Costo sumado al equipo": decisionCosto ? decisionCosto.costoSumado : undefined,
            "Valor pieza retirada": decisionCosto && piezaRetirada ? decisionCosto.valorRestado : undefined,
            // Para poder restaurarla si la mejora se anula y la pieza quedó Agotado.
            "Estado previo del repuesto": repuesto ? estadoPiezaAntes || undefined : undefined,
            "Realizado por": options.actor,
            Fecha: ahora,
          }),
        }],
      }),
    });

    const creado = response.records?.[0];
    if (!creado) throw new Error("Airtable no devolvió la intervención creada.");

    // Desde aquí YA NO se devuelve el stock: la intervención existe y el
    // descuento tiene respaldo. Lo que sigue son efectos secundarios, y un
    // fallo en ellos no puede disparar el rollback: se devuelve como aviso.
    const avisos: string[] = [];
    if (decisionCosto?.aviso) avisos.push(decisionCosto.aviso);
    let piezaRetiradaSku = "";

    // Costo del equipo (punto 3): se relee y se SUMA el ajuste.
    if (decisionCosto && decisionCosto.ajuste !== 0) {
      try {
        const equipo = await leerRegistroItem(id);
        const actual = firstNumber(equipo.fields[CAMPO_COSTO_MEJORAS]) ?? 0;
        await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
          method: "PATCH",
          body: JSON.stringify({
            records: [{ id, fields: { [CAMPO_COSTO_MEJORAS]: Math.round((actual + decisionCosto.ajuste) * 100) / 100 } }],
          }),
        });
      } catch (error) {
        console.error("Mejora registrada, pero no se pudo actualizar el costo del equipo:", error);
        avisos.push(`La mejora quedó registrada, pero no se pudo actualizar el costo del equipo (ajuste ${decisionCosto.ajuste}). Corrígelo a mano.`);
        // Lo guardado en la mejora debe decir lo que de verdad se aplicó: si
        // luego se anula, no puede restar un costo que nunca se sumó.
        try {
          await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.intervenciones), {
            method: "PATCH",
            body: JSON.stringify({ records: [{ id: creado.id, fields: { "Costo sumado al equipo": 0, "Valor pieza retirada": 0 } }] }),
          });
        } catch (errorMarca) {
          console.error("CRÍTICO: la mejora dice un costo que no se aplicó. Revisar a mano:", creado.id, errorMarca);
        }
      }
    }

    // La pieza que salió vuelve al inventario como artículo nuevo, en la
    // tienda. No se enlaza como "Item padre" a propósito: eso la metería en la
    // pestaña Despiece y marcaría el equipo "en despiece". El vínculo queda en
    // la intervención ("Pieza retirada") y en su nota.
    if (piezaRetirada) {
      try {
        const itemInput = construirInputPiezaDespiece(
          {
            nombre: piezaRetirada.nombre,
            categoria: piezaRetirada.categoria,
            cantidad: piezaRetirada.cantidad,
            observaciones: piezaRetirada.nota,
            precioVenta: piezaRetirada.precioVenta,
          },
          { proveedorCompraId: item.proveedorId, tipoOperacion: item.tipoOperacion }
        );
        const pieza = await createShippingV2ItemRecord(
          {
            ...itemInput,
            // 8-oct: el valor es el costo POR UNIDAD de la pieza y se ve en
            // "Costo total unitario" y en la ganancia. No genera pago: la
            // pieza nace con "Requiere pago" apagado.
            costoProveedor: piezaRetirada.valor > 0 ? piezaRetirada.valor : null,
          } as ShippingV2ItemWriteInput,
          {
            registradoPor: options.actor,
            eventDescription: piezaRetirada.nota,
            extraFields: {
              "Es parte recuperada": true,
              [SHIPPING_V2_ITEM_FIELDS.recibido]: true,
              [SHIPPING_V2_ITEM_FIELDS.origenArticulo]: "Ya está en la tienda",
            },
          }
        );
        piezaRetiradaSku = pieza.sku;
        try {
          await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.intervenciones), {
            method: "PATCH",
            body: JSON.stringify({ records: [{ id: creado.id, fields: { "Pieza retirada": [pieza.id] } }] }),
          });
        } catch (error) {
          console.error("Pieza retirada creada pero sin enlazar a la mejora:", error);
          avisos.push(`La pieza retirada se creó como ${pieza.sku}, pero no quedó enlazada a la mejora: si anulas la mejora, elimina ${pieza.sku} a mano.`);
        }
      } catch (error) {
        console.error("Mejora registrada, pero no se pudo crear la pieza retirada:", error);
        avisos.push(`La mejora quedó registrada, pero no se pudo crear la pieza retirada "${piezaRetirada.nombre}". Regístrala a mano.`);
      }
    }

    void (async () => {
      try {
        await createShippingV2Event({
          action: "Actualizado",
          itemRecordId: id,
          itemName: item.nombre,
          registradoPor: options.actor,
          descripcion: repuesto
            ? `${tipo}: ${detalle}. Se usó ${cantidadUsada} unidad(es) de ${repuesto.sku || repuesto.nombre}.`
            : `${tipo}: ${detalle}.`,
        });
      } catch (error) {
        console.error("Intervención registrada, pero no se pudo escribir el evento:", error);
      }
      // Si el repuesto se quedó sin unidades, sus banderas tienen que reflejarlo.
      if (repuesto) {
        try {
          await recalcularDisponibilidadItem(repuesto.id, options.actor);
        } catch (error) {
          console.error("No se pudo recalcular la disponibilidad del repuesto:", error);
        }
      }
    })();

    return { intervencion: mapIntervencion(creado), repuestoDescontado: repuesto?.sku || "", piezaRetiradaSku, avisos };
  } catch (error) {
    // Devolver la unidad: sin el registro, el descuento no tiene respaldo.
    //
    // Se RELEE antes de escribir y se SUMA, en vez de restaurar el valor que se
    // leyó al principio. Entre el descuento y este rollback pudo pasar una
    // venta que bajó el stock por su cuenta; restaurar el valor viejo le
    // devolvería al inventario unidades que ya no existen.
    if (repuesto) {
      try {
        const actual = await getShippingV2ItemById(repuesto.id, {
          includeAiName: false,
          access: systemShippingV2Access(),
        });
        await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
          method: "PATCH",
          body: JSON.stringify({
            records: [{
              id: repuesto.id,
              fields: {
                [SHIPPING_V2_ITEM_FIELDS.cantidad]: normalizarUnidades(actual.cantidad) + cantidadUsada,
                // Si la mejora la había dejado "Agotado", vuelve a su etiqueta.
                ...(piezaAgotada && estadoPiezaAntes ? { [SHIPPING_V2_ITEM_FIELDS.estadoItem]: estadoPiezaAntes } : {}),
              },
            }],
          }),
        });
      } catch (errorDevolucion) {
        console.error(
          "CRÍTICO: se descontó stock y no se pudo registrar ni devolver. Revisar a mano:",
          { repuesto: repuesto.sku, cantidadUsada }, errorDevolucion
        );
      }
    }
    throw error;
  }
}

// ─── Corregir estado: solo Administrador, con motivo (punto 5, 8-oct) ──────
// Reglas en correccion-estado.ts. Es la ÚNICA forma manual de cambiar el
// "Estado Item" o el "Estado de revisión": en el día a día los pone el
// sistema. Queda en el historial con antes → después, quién y por qué.

export async function corregirEstadoShippingV2(
  itemRecordId: string,
  input: { campo: CampoCorregible; valor: string; motivo: string },
  options: { actor: string; access?: ShippingV2AccessContext }
): Promise<{ mensaje: string }> {
  const id = cleanString(itemRecordId);
  if (!id) throw new Error("Record ID de item inválido.");
  if (input.campo !== "estado" && input.campo !== "revision") throw new Error("Campo no válido.");
  return withLock(`shipping-item:${id}`, async () => {
    const item = await getShippingV2ItemById(id, { includeAiName: false, access: systemShippingV2Access() });
    const novedades = await getShippingV2NovedadesForItem(id, systemShippingV2Access());
    const valor = cleanString(input.valor);
    const motivo = cleanString(input.motivo);
    const ev = evaluarCorreccionEstado(
      {
        estado: item.estado,
        estadoRevision: item.estadoRevision,
        recibido: item.recibido,
        requiereInspeccion: item.requiereInspeccion,
        inspeccionFirmada: item.revisadoFisicamente,
        usoLocal: item.usoLocal,
        cantidad: item.cantidad,
        cantidadReservada: item.cantidadReservada,
        reservado: item.reservado,
        enPacking: Boolean(cleanString(item.packingId)),
        novedadesAbiertas: novedades.filter((n) => esNovedadBloqueante(n)).length,
        enPagoVivo: input.campo === "estado" && normalizeStatus(valor) === "cancelado" ? await itemHasActiveV2PaymentLink(item) : false,
      },
      { campo: input.campo, valor, motivo, esAdministrador: options.access?.isSiteAdmin === true }
    );
    if (!ev.ok) throw new Error(ev.motivo);

    const F = SHIPPING_V2_ITEM_FIELDS;
    const campo = input.campo === "estado" ? F.estadoItem : F.estadoRevision;
    const antes = (input.campo === "estado" ? item.estado : item.estadoRevision) || "(vacío)";
    await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
      method: "PATCH",
      body: JSON.stringify({ records: [{ id, fields: {
        [campo]: valor,
        [F.ultimaActualizacion]: new Date().toISOString(),
        [F.actualizadoPor]: options.actor,
      } }] }),
    });
    // "Se puede reservar" se recalcula con el estado nuevo (p. ej. Cancelado la apaga).
    await recalcularDisponibilidadItem(id, options.actor);

    const etiqueta = input.campo === "estado" ? "Estado Item" : "Estado de revisión";
    await createShippingV2Event({
      action: "Cambio de estado",
      itemRecordId: id,
      itemName: item.nombre,
      registradoPor: options.actor,
      descripcion: `Corrección manual de administración: "${etiqueta}" ${antes} → ${valor}.`,
      estadoAnterior: input.campo === "estado" ? item.estado : undefined,
      estadoNuevo: input.campo === "estado" ? valor : undefined,
      observacion: `Motivo: ${motivo}`,
    });
    invalidateShippingV2ItemSearchIndexCache();
    return { mensaje: `${item.sku}: ${etiqueta} ${antes} → ${valor}.` };
  });
}

// ─── Activos de la tienda: movimientos de Administrador (punto 4, 8-oct) ────
// Reglas en activos.ts. Tres acciones, solo Administrador del sistema, con
// cantidad y motivo:
//   "uso-local" → mercadería pasa a ser activo de la tienda.
//   "venta"     → un activo vuelve a ser mercadería (con inspección si su
//                 categoría la pide).
//   "baja"      → baja la cantidad de un activo; con 0 queda "Dado de baja".
// Si se mueve solo una parte, esa parte se SEPARA en un artículo nuevo (SKU
// propio) y el resto se queda donde estaba. El artículo nuevo se lleva su
// costo por unidad, incluida su parte de flete y arancel, y solo aparece en
// Pagos si la compra todavía se debía (así la suma de lo que se debe no cambia).

export type AccionActivo = "uso-local" | "venta" | "baja" | "revertir-baja";

export type ResultadoMovimientoActivo = {
  mensaje: string;
  nuevoId?: string;
  nuevoSku?: string;
};

const CAMPO_UNIDADES_EN_PACKING = "Unidades en packing";
const CAMPO_UNIDADES_DADAS_DE_BAJA = "Unidades dadas de baja";
const CAMPO_OTROS_COSTOS_REGISTRO = "Otros costos asignados registro";

async function situacionPagoDeItem(item: ShippingV2Item) {
  const ids = [...item.pagoV2ItemIds, ...item.pagoV2RegaloIds].map(cleanString).filter(Boolean);
  const pagos = ids.length ? await listRecordsByIds(SHIPPING_V2_TABLES.pagos, ids) : [];
  // Un pago que no se pudo leer cuenta como "en curso" (fail-closed).
  const estados = ids.map((pid) => {
    const r = pagos.find((x) => x.id === pid);
    return { estado: r ? firstString(r.fields[SHIPPING_V2_PAYMENT_FIELDS.estadoPago]) : "desconocido" };
  });
  return situacionPago({ requierePago: item.requierePago, esRegalo: item.esRegalo, pagos: estados });
}

/** Punto 9: situación del pago de un artículo, para la ficha. */
export async function getShippingV2SituacionPagoDeItem(item: ShippingV2Item): Promise<SituacionPago> {
  return situacionPagoDeItem(item);
}

/**
 * Punto 9: agrega a cada artículo la situación de su pago (lista de
 * Artículos). Lee solo el estado de los pagos vinculados (la tabla es chica).
 * Si no se puede leer, el artículo queda sin dato (no se inventa nada).
 */
async function adjuntarSituacionPago(items: ShippingV2Item[]): Promise<ShippingV2Item[]> {
  const ids = Array.from(new Set(items.flatMap((item) => [...item.pagoV2ItemIds, ...item.pagoV2RegaloIds]).map(cleanString).filter(Boolean)));
  let estadoPorPago = new Map<string, string>();
  if (ids.length) {
    try {
      const pagos = await listRecordsByIds(SHIPPING_V2_TABLES.pagos, ids);
      estadoPorPago = new Map(pagos.map((r) => [r.id, firstString(r.fields[SHIPPING_V2_PAYMENT_FIELDS.estadoPago])]));
    } catch (error) {
      console.warn("[Shipping V2] No se pudo leer el estado de los pagos para la lista:", error);
      return items;
    }
  }
  return items.map((item) => {
    const vinculados = [...item.pagoV2ItemIds, ...item.pagoV2RegaloIds].map(cleanString).filter(Boolean);
    return {
      ...item,
      situacionPago: situacionPago({
        requierePago: item.requierePago,
        esRegalo: item.esRegalo,
        // Un pago que no se pudo leer cuenta como "en curso" (fail-closed).
        pagos: vinculados.map((pid) => ({ estado: estadoPorPago.get(pid) ?? "desconocido" })),
      }),
    };
  });
}

/**
 * Punto 6 (9-oct): lo que hace falta saber del artículo de un pedido de
 * cliente para decidir si se puede anular y cómo (lib/operaciones/cierre.ts).
 */
export async function leerArticuloDePedido(itemRecordId: string): Promise<ArticuloDelPedido> {
  const item = await getShippingV2ItemById(cleanString(itemRecordId), { includeAiName: false, access: systemShippingV2Access() });
  const registro = await leerRegistroItem(item.id);
  const ids = [...item.pagoV2ItemIds, ...item.pagoV2RegaloIds].map(cleanString).filter(Boolean);
  const pagos = ids.length ? await listRecordsByIds(SHIPPING_V2_TABLES.pagos, ids) : [];
  return {
    sku: item.sku || item.id,
    estado: item.estado,
    recibido: item.recibido === true,
    enPacking: Boolean(cleanString(item.packingId)),
    // Un pago que no se pudo leer cuenta como vivo (fail-closed).
    pagos: ids
      .map((pid) => {
        const r = pagos.find((x) => x.id === pid);
        return {
          codigo: r ? firstString(r.fields[SHIPPING_V2_PAYMENT_FIELDS.pagoId]) || pid : pid,
          estado: r ? firstString(r.fields[SHIPPING_V2_PAYMENT_FIELDS.estadoPago]) : "desconocido",
        };
      })
      .filter((p) => normalizeStatus(p.estado) !== "anulado"),
    vendido: linkedRecordIds(registro.fields["Factura"]).length > 0 || linkedRecordIds(registro.fields["Recibo"]).length > 0,
  };
}

/**
 * Ficha del artículo (rediseño 15-oct-2026): de dónde vino y a dónde fue.
 * Junta el código de la orden de compra, el pedido de cliente, la orden de
 * reparación, el artículo del que salió (despiece) y los documentos de venta
 * (factura, recibo, reserva, nota de crédito) para enlazarlos desde la ficha.
 *
 * Solo lectura. Lo que no se pueda leer simplemente no aparece: la ficha no
 * se cae por esto.
 */
export async function getShippingV2TrazabilidadDeItem(
  item: Pick<ShippingV2Item, "id" | "ordenCompraId" | "operacionComercialId" | "itemPadreId">
): Promise<ShippingV2ItemTrazabilidad> {
  const id = cleanString(item.id);
  if (!id) throw new Error("Record ID de item inválido.");
  const registro = await leerRegistroItem(id);
  const campos = registro.fields;
  const enlazados = (campo: string) => linkedRecordIds(campos[campo]);
  const leer = (tabla: string, recordIds: string[]) => recordIds.length
    ? listRecordsByIds(tabla, recordIds).catch((error) => {
      console.warn(`No se pudo leer ${tabla} para la ficha del artículo ${id}:`, error);
      return [] as AirtableRecord[];
    })
    : Promise.resolve([] as AirtableRecord[]);
  const [ordenes, operaciones, reparaciones, padres, facturas, recibos, reservas, notas] = await Promise.all([
    leer(SHIPPING_V2_TABLES.ordenesCompra, item.ordenCompraId ? [item.ordenCompraId] : []),
    leer("Operación Comercial", item.operacionComercialId ? [item.operacionComercialId] : []),
    leer("Órdenes de Reparación", enlazados(ORDEN_STOCK_LINK_FIELD).slice(0, 1)),
    leer(SHIPPING_V2_TABLES.items, item.itemPadreId ? [item.itemPadreId] : []),
    leer("Facturas Electrónicas", enlazados("Factura")),
    leer("Recibos", enlazados("Recibo")),
    leer("Reservas", enlazados("Reservas")),
    leer("Notas de Crédito Electrónicas", enlazados("Nota de Crédito")),
  ]);

  const documento = (tipo: ShippingV2ItemDocumento["tipo"], campoNumero: string, campoFecha: string, porDefecto: string) =>
    (r: AirtableRecord): ShippingV2ItemDocumento => ({
      tipo,
      id: r.id,
      numero: firstString(r.fields[campoNumero]) || porDefecto,
      estado: firstString(r.fields["Estado"]),
      fecha: firstString(r.fields[campoFecha]) || undefined,
    });
  const orden = ordenes[0] ? mapOrdenCompraBase(ordenes[0]) : null;
  const padre = padres[0];

  return {
    ordenCompra: orden ? { id: orden.id, codigo: orden.ocId, numeroProveedor: orden.numeroProveedor, fechaCompra: orden.fechaCompra, anulada: orden.anulada } : undefined,
    operacion: operaciones[0] ? { id: operaciones[0].id, codigo: firstString(operaciones[0].fields["Código Operación"]) || operaciones[0].id } : undefined,
    ordenReparacion: reparaciones[0] ? { id: reparaciones[0].id, codigo: firstString(reparaciones[0].fields["ID"]) || reparaciones[0].id } : undefined,
    itemPadre: padre ? {
      id: padre.id,
      sku: firstString(padre.fields[getOfficialSkuField()]) || padre.id,
      nombre: firstString(padre.fields[SHIPPING_V2_ITEM_FIELDS.nombre]) || undefined,
    } : undefined,
    documentos: [
      ...facturas.map(documento("factura", "Número de Factura", "Fecha de Emisión", "Factura")),
      ...recibos.map(documento("recibo", "Número", "Fecha", "Recibo")),
      ...reservas.map(documento("reserva", "Número", "Fecha", "Reserva")),
      ...notas.map(documento("nota-credito", "Número de Nota de Crédito", "Fecha de Emisión", "Nota de crédito")),
    ],
  };
}

export async function moverActivoShippingV2(
  itemRecordId: string,
  input: { accion: AccionActivo; cantidad: number; motivo: string; precioVenta?: number | null; permitirSinRecibir?: boolean },
  options: { actor: string; access?: ShippingV2AccessContext }
): Promise<ResultadoMovimientoActivo> {
  const id = cleanString(itemRecordId);
  if (!id) throw new Error("Record ID de item inválido.");
  return withLock(`shipping-item:${id}`, () => moverActivoSinTurno(id, input, options));
}

async function moverActivoSinTurno(
  id: string,
  input: { accion: AccionActivo; cantidad: number; motivo: string; precioVenta?: number | null; permitirSinRecibir?: boolean },
  options: { actor: string; access?: ShippingV2AccessContext }
): Promise<ResultadoMovimientoActivo> {
  const esAdministrador = options.access?.isSiteAdmin === true;
  const motivo = cleanString(input.motivo);
  const cantidad = Number(input.cantidad);
  const item = await getShippingV2ItemById(id, { includeAiName: false, access: systemShippingV2Access() });
  const pago = await situacionPagoDeItem(item);
  const articulo: ArticuloParaMovimiento = {
    sku: item.sku,
    usoLocal: item.usoLocal,
    recibido: item.recibido,
    estado: item.estado,
    cantidad: item.cantidad,
    cantidadReservada: item.cantidadReservada,
    reservado: item.reservado,
    enPacking: Boolean(cleanString(item.packingId)),
    pago,
  };
  const F = SHIPPING_V2_ITEM_FIELDS;
  const ahora = new Date().toISOString();
  const total = normalizarUnidades(item.cantidad);
  const precio = typeof input.precioVenta === "number" && Number.isFinite(input.precioVenta) && input.precioVenta > 0
    ? Math.round(input.precioVenta * 100) / 100
    : null;
  const comun = { [F.ultimaActualizacion]: ahora, [F.actualizadoPor]: options.actor };
  const patch = async (recordId: string, fields: Record<string, unknown>) =>
    airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
      method: "PATCH",
      // typecast: crea la opción "Dado de baja" si todavía no existe.
      body: JSON.stringify({ typecast: true, records: [{ id: recordId, fields: { ...fields, ...comun } }] }),
    });
  const evento = (descripcion: string, estadoNuevo?: string, recordId = id, nombre = item.nombre) =>
    createShippingV2Event({
      action: "Cambio de estado",
      itemRecordId: recordId,
      itemName: nombre,
      registradoPor: options.actor,
      descripcion,
      estadoAnterior: recordId === id ? item.estado : undefined,
      estadoNuevo,
    }).catch((error) => console.error("No se pudo registrar el evento del activo:", error));

  // ── Dar de baja ──
  if (input.accion === "baja") {
    const ev = evaluarDarDeBaja(articulo, { cantidad, esAdministrador, motivo, permitirSinRecibir: input.permitirSinRecibir === true });
    if (!ev.ok) throw new Error(ev.motivo);
    const registro = await leerRegistroItem(id);
    const bajasPrevias = firstNumber(registro.fields[CAMPO_UNIDADES_DADAS_DE_BAJA]) ?? 0;
    // Punto 5: en mercadería, si lo que queda está todo apartado para un
    // cliente, su etiqueta pasa a "Reservado".
    const quedaTodoReservado = !item.usoLocal && !ev.dadoDeBaja &&
      todasReservadas({ cantidad: ev.quedan, cantidadReservada: item.cantidadReservada, reservado: item.reservado }) &&
      normalizeStatus(item.estado) === "disponible";
    await patch(id, {
      [F.cantidad]: ev.quedan,
      [CAMPO_UNIDADES_DADAS_DE_BAJA]: bajasPrevias + cantidad,
      ...(ev.dadoDeBaja ? { [F.estadoItem]: ESTADO_DADO_DE_BAJA, [F.disponibleVenta]: false } : {}),
      ...(quedaTodoReservado ? { [F.estadoItem]: "Reservado" } : {}),
    });
    // Las unidades ya se escribieron: un fallo al recalcular no debe hacer
    // creer que la baja no ocurrió (se repetiría al reintentar).
    if (!item.usoLocal) await recalcularDisponibilidadItem(id, options.actor).catch((error) => console.error("No se pudo recalcular tras la baja:", error));
    const que = item.usoLocal ? "Activo dado de baja" : "Mercadería dada de baja";
    await evento(
      `${que}: ${cantidad} de ${total} unidad(es). Motivo: ${motivo}`,
      ev.dadoDeBaja ? ESTADO_DADO_DE_BAJA : quedaTodoReservado ? "Reservado" : item.estado
    );
    invalidateShippingV2ItemSearchIndexCache();
    return {
      mensaje: ev.dadoDeBaja
        ? `${item.sku} quedó "Dado de baja" (0 unidades). Sigue en el historial.`
        : `Se dieron de baja ${cantidad} unidad(es) de ${item.sku}. Quedan ${ev.quedan}.`,
    };
  }

  // ── Revertir una baja hecha por error ──
  if (input.accion === "revertir-baja") {
    const registro = await leerRegistroItem(id);
    const bajas = firstNumber(registro.fields[CAMPO_UNIDADES_DADAS_DE_BAJA]) ?? 0;
    const evR = evaluarRevertirBaja({ usoLocal: item.usoLocal, unidadesDadasDeBaja: bajas }, { cantidad, esAdministrador, motivo });
    if (!evR.ok) throw new Error(evR.motivo);
    const estadoNuevo = item.estado && item.estado.trim().toLowerCase() === "dado de baja"
      ? item.usoLocal
        ? etiquetaComoActivo({ recibido: item.recibido, estado: item.estado, requiereInspeccion: item.requiereInspeccion, inspeccionFirmada: item.revisadoFisicamente })
        // Mercadería (punto 5): vuelve con la misma regla de llegada.
        : estadoSegunLlegada({ estado: "Recibido", recibido: true, requiereInspeccion: item.requiereInspeccion, inspeccionFirmada: item.revisadoFisicamente, usoLocal: false }) ?? "Disponible"
      // Mercadería "Reservado": las unidades que vuelven quedan libres.
      : !item.usoLocal && normalizeStatus(item.estado) === "reservado" ? "Disponible" : null;
    await patch(id, {
      [F.cantidad]: total + cantidad,
      [CAMPO_UNIDADES_DADAS_DE_BAJA]: bajas - cantidad,
      ...(estadoNuevo ? { [F.estadoItem]: estadoNuevo } : {}),
    });
    if (!item.usoLocal) await recalcularDisponibilidadItem(id, options.actor);
    await evento(`Baja revertida: vuelven ${cantidad} unidad(es). Motivo: ${motivo}`, estadoNuevo ?? item.estado);
    invalidateShippingV2ItemSearchIndexCache();
    return { mensaje: `Se devolvieron ${cantidad} unidad(es) a ${item.sku}${estadoNuevo ? ` (vuelve a "${estadoNuevo}")` : ""}.` };
  }

  const aActivo = input.accion === "uso-local";
  if (!aActivo && input.accion !== "venta") throw new Error("Acción no válida.");
  const ev = aActivo
    ? evaluarPasarAUsoLocal(articulo, { cantidad, esAdministrador, motivo })
    : evaluarPasarALaVenta(articulo, { cantidad, esAdministrador, motivo });
  if (!ev.ok) throw new Error(ev.motivo);

  // Valores de destino (los mismos para "todo" y para la parte separada).
  const venta = valoresComoMercaderia({ recibido: item.recibido, estado: item.estado, categoria: item.categoria });
  const camposDestino = (recibido: boolean, estadoActual: string | undefined): Record<string, unknown> => aActivo
    ? {
      [F.esUsoLocal]: true,
      [F.disponibleVenta]: false,
      [F.estadoItem]: etiquetaComoActivo({
        recibido,
        estado: estadoActual,
        requiereInspeccion: item.requiereInspeccion,
        inspeccionFirmada: item.revisadoFisicamente,
      }),
    }
    : {
      [F.esUsoLocal]: false,
      [F.requiereInspeccion]: venta.requiereInspeccion,
      ...(recibido
        ? {
          [F.estadoItem]: venta.estado,
          ...(venta.estadoRevision ? { [F.estadoRevision]: venta.estadoRevision } : {}),
          // Estuvo en uso: si su categoría pide inspección, se firma de nuevo.
          ...(venta.reabrirInspeccion ? { "Revisado física/técnicamente": false, "Revisado por": "", "Fecha revisión": null } : {}),
        }
        : {}),
      ...(precio ? { [F.precioVentaFinal]: precio } : {}),
    };

  const destinoTexto = aActivo ? "activo de la tienda" : "mercadería a la venta";

  // ── Todo el artículo cambia (mismo SKU) ──
  if (ev.modo === "todo") {
    const campos = camposDestino(item.recibido === true, item.estado);
    await patch(id, campos);
    // Banderas de venta según la nueva situación.
    await recalcularDisponibilidadItem(id, options.actor).catch((error) =>
      console.error("No se pudo recalcular la disponibilidad:", error)
    );
    await evento(`Pasa a ${destinoTexto} (${total} unidad(es)). Motivo: ${motivo}`, String(campos[F.estadoItem] ?? item.estado));
    invalidateShippingV2ItemSearchIndexCache();
    const avisoVenta = !aActivo
      ? venta.reabrirInspeccion
        ? " Pasa por Inspección antes de poder venderse."
        : precio || item.precioVenta ? "" : " Ponle precio de venta para que aparezca en el mostrador."
      : "";
    return { mensaje: `${item.sku} ahora es ${destinoTexto}.${avisoVenta}` };
  }

  // ── Solo una parte: se separa en un artículo nuevo ──
  const nota = `Separado de ${item.sku} (${cantidad} de ${total} unidades) como ${destinoTexto}. Motivo: ${motivo}`;
  const logisticoUnidad = item.costoLogisticoAsignado ?? 0;
  const camposNuevo = camposDestino(true, aActivo ? "Disponible" : "Uso local");
  const nuevoInput: ShippingV2ItemWriteInput = {
    nombre: item.nombre,
    descripcion: item.descripcion,
    tipoOperacion: item.tipoOperacion || "Reajuste de inventario",
    tipoItem: item.tipoItem,
    categoria: item.categoria,
    estado: String(camposNuevo[F.estadoItem] ?? ""),
    estadoRevision: aActivo ? item.estadoRevision : venta.estadoRevision ?? item.estadoRevision,
    requiereInspeccion: aActivo ? item.requiereInspeccion === true && item.revisadoFisicamente !== true : venta.requiereInspeccion,
    condicion: item.condicion,
    proveedorId: item.proveedorId,
    requierePago: requierePagoParteSeparada(pago),
    requierePacking: false,
    afectaInventario: true,
    disponibleVenta: false,
    reservado: false,
    modoLogistico: "No aplica",
    cantidad,
    unidad: item.unidad,
    costoProveedor: item.costoProveedor,
    precioVenta: aActivo ? null : precio ?? item.precioVenta ?? null,
    marca: item.marca,
    modelo: item.modelo,
    observacionesInternas: nota,
    origenArticulo: "Ya está en la tienda",
    usoLocal: aActivo,
  } as ShippingV2ItemWriteInput;

  // Primero se crea la parte nueva y DESPUÉS se descuenta del original: si la
  // creación falla, no se pierde ninguna unidad.
  const nuevo = await createShippingV2ItemRecord(nuevoInput, {
    registradoPor: options.actor,
    eventDescription: nota,
    extraFields: {
      [F.recibido]: true,
      // Su parte de flete y arancel viaja con ella (ver fórmulas de costo).
      ...(logisticoUnidad > 0
        ? { [CAMPO_UNIDADES_EN_PACKING]: cantidad, [CAMPO_OTROS_COSTOS_REGISTRO]: Math.round(logisticoUnidad * cantidad * 100) / 100 }
        : {}),
    },
  });
  try {
    // Punto 9b: si a la compra todavía le falta el respaldo, la parte separada
    // se lleva sus unidades compradas (el total a respaldar no cambia).
    const compradasOriginal = Number(item.unidadesCompradas) || 0;
    await patch(id, {
      [F.cantidad]: total - cantidad,
      ...(requierePagoParteSeparada(pago) && compradasOriginal > 0 ? { [F.unidadesCompradas]: Math.max(compradasOriginal - cantidad, 0) } : {}),
    });
  } catch (error) {
    console.error("CRÍTICO: se creó la parte separada pero no se descontó del original:", { original: item.sku, nuevo: nuevo.sku }, error);
    throw new Error(`Se creó ${nuevo.sku}, pero no se pudo descontar ${cantidad} unidad(es) de ${item.sku}. Corrige la cantidad de ${item.sku} a mano.`);
  }
  await recalcularDisponibilidadItem(id, options.actor).catch((error) => console.error("No se pudo recalcular el original:", error));
  await recalcularDisponibilidadItem(nuevo.id, options.actor).catch((error) => console.error("No se pudo recalcular la parte nueva:", error));
  await evento(`Se separaron ${cantidad} de ${total} unidad(es) como ${destinoTexto} en ${nuevo.sku}. Motivo: ${motivo}`, item.estado);
  invalidateShippingV2ItemSearchIndexCache();
  return {
    mensaje: `Se separaron ${cantidad} unidad(es) en ${nuevo.sku} como ${destinoTexto}. ${item.sku} queda con ${total - cantidad}.`,
    nuevoId: nuevo.id,
    nuevoSku: nuevo.sku,
  };
}

// ─── Anular un mantenimiento o una mejora (punto 3, 8-oct-2026) ─────────────
// Reglas en mejoras.ts (evaluarAnulacion). Solo Administrador del sistema.
// La intervención NO se borra: queda "Anulada" con quién, cuándo, por qué y
// qué se revirtió.
//
// Orden y por qué:
//  1. Se valida TODO antes de tocar nada (equipo en la tienda, pieza retirada
//     eliminable). Si algo bloquea, no cambia nada.
//  2. Se marca "Anulada" PRIMERO. Así un segundo clic (u otra pestaña) no puede
//     revertir dos veces: la marca es la llave.
//  3. Se devuelven las unidades a la pieza usada (releyendo y SUMANDO).
//  4. Se quita del costo del equipo lo que la mejora aplicó (releyendo).
//  5. Se elimina la pieza retirada (con copia en Shipping Eventos).
//  Si 3–5 fallan, la mejora ya está anulada y el paso pendiente queda escrito
//  en "Resultado de anulación" para hacerlo a mano.

export async function anularShippingV2Intervencion(
  itemRecordId: string,
  intervencionId: string,
  input: { motivo: string },
  options: { actor: string; access?: ShippingV2AccessContext }
) {
  const id = cleanString(intervencionId);
  if (!id) throw new Error("Intervención inválida.");
  return withLock(`intervencion:${id}`, () => anularIntervencionSinTurno(itemRecordId, id, input, options));
}

async function anularIntervencionSinTurno(
  itemRecordId: string,
  intervencionId: string,
  input: { motivo: string },
  options: { actor: string; access?: ShippingV2AccessContext }
) {
  const itemId = cleanString(itemRecordId);
  const motivo = cleanString(input.motivo);
  const registro = await airtableRequest<AirtableRecordResponse>(
    `${tableUrl(SHIPPING_V2_TABLES.intervenciones)}/${encodeURIComponent(intervencionId)}`
  );
  const f = registro.fields ?? {};
  // La intervención tiene que ser de ESTE artículo (el endpoint recibe ambos ids).
  if (firstString(f["Item ID"]) !== itemId && !linkedRecordIds(f.Item).includes(itemId)) {
    throw new Error("Esa intervención no pertenece a este artículo.");
  }
  const intervencion = {
    tipo: firstString(f.Tipo, "Mantenimiento"),
    anulada: firstBoolean(f["Anulada"]),
    repuestoId: (linkedRecordIds(f["Repuesto usado"])[0] ?? null) as string | null,
    cantidadUsada: firstNumber(f["Cantidad usada"]),
    costoSumado: firstNumber(f["Costo sumado al equipo"]),
    valorPiezaRetirada: firstNumber(f["Valor pieza retirada"]),
    piezaRetiradaId: (linkedRecordIds(f["Pieza retirada"])[0] ?? null) as string | null,
  };
  const esMejora = intervencion.tipo === "Mejora";

  // 1) Validar todo antes de tocar nada.
  const equipo = esMejora
    ? await getShippingV2ItemById(itemId, { includeAiName: false, access: systemShippingV2Access() })
    : null;
  let bloqueosPiezaRetirada: string[] = [];
  let skuPiezaRetirada = "";
  if (esMejora && intervencion.piezaRetiradaId) {
    try {
      const { ctx } = await contextoEliminacion(intervencion.piezaRetiradaId, { ignorarIntervencionIds: [intervencionId] });
      skuPiezaRetirada = ctx.sku;
      bloqueosPiezaRetirada = evaluarEliminacion(ctx).bloqueos;
    } catch (error) {
      // Si la pieza ya no existe (alguien la borró en Airtable), no hay nada que eliminar.
      if (!(error instanceof Error && error.message.includes("404"))) throw error;
      intervencion.piezaRetiradaId = null;
    }
  }
  const evaluacion = evaluarAnulacion(intervencion, {
    esAdministrador: options.access?.isSiteAdmin === true,
    motivo,
    equipo,
    bloqueosPiezaRetirada,
  });
  if (!evaluacion.ok) throw new Error(evaluacion.motivo);

  // 2) Marcar "Anulada" primero (es la llave contra una doble anulación).
  const ahora = new Date().toISOString();
  await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.intervenciones), {
    method: "PATCH",
    body: JSON.stringify({
      records: [{
        id: intervencionId,
        fields: { "Anulada": true, "Anulada por": options.actor, "Fecha de anulación": ahora, "Motivo de anulación": motivo },
      }],
    }),
  });

  const hecho: string[] = [];
  const pendiente: string[] = [];

  if (esMejora) {
    // 3) Devolver las unidades a la pieza usada.
    const unidades = normalizarUnidades(intervencion.cantidadUsada);
    if (intervencion.repuestoId && unidades > 0) {
      const repuestoId = intervencion.repuestoId;
      try {
        await withLock(`shipping-item:${repuestoId}`, async () => {
          const pieza = await getShippingV2ItemById(repuestoId, { includeAiName: false, access: systemShippingV2Access() });
          const estadoNuevo = estadoPiezaTrasDevolver({
            estadoActual: pieza.estado,
            estadoPrevio: firstString(f["Estado previo del repuesto"]),
            requiereInspeccion: pieza.requiereInspeccion,
            inspeccionFirmada: pieza.revisadoFisicamente,
          });
          await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
            method: "PATCH",
            body: JSON.stringify({
              typecast: true,
              records: [{
                id: repuestoId,
                fields: {
                  [SHIPPING_V2_ITEM_FIELDS.cantidad]: normalizarUnidades(pieza.cantidad) + unidades,
                  ...(estadoNuevo ? { [SHIPPING_V2_ITEM_FIELDS.estadoItem]: estadoNuevo } : {}),
                  "Última actualización": ahora,
                  "Actualizado por": options.actor,
                },
              }],
            }),
          });
          hecho.push(`Se devolvieron ${unidades} unidad(es) a ${pieza.sku || pieza.nombre}${estadoNuevo ? ` (vuelve a "${estadoNuevo}")` : ""}.`);
          await createShippingV2Event({
            action: "Actualizado",
            itemRecordId: repuestoId,
            itemName: pieza.nombre,
            registradoPor: options.actor,
            descripcion: `Mejora anulada en ${equipo?.sku || "el equipo"}: vuelven ${unidades} unidad(es). Motivo: ${motivo}`,
            estadoAnterior: pieza.estado,
            estadoNuevo: estadoNuevo ?? pieza.estado,
          }).catch((error) => console.error("No se pudo escribir el evento de la pieza:", error));
        });
        // Banderas de venta según las unidades devueltas.
        await recalcularDisponibilidadItem(repuestoId, options.actor).catch((error) =>
          console.error("No se pudo recalcular la disponibilidad de la pieza:", error)
        );
      } catch (error) {
        console.error("Anulación: no se pudieron devolver las unidades:", error);
        pendiente.push(`Devolver a mano ${unidades} unidad(es) a la pieza usada (record ${repuestoId}) y revisar su etiqueta.`);
      }
    }

    // 4) Costo del equipo: quitar lo que la mejora aplicó.
    const neto = (intervencion.costoSumado ?? 0) - (intervencion.valorPiezaRetirada ?? 0);
    if (neto !== 0) {
      try {
        const registroEquipo = await leerRegistroItem(itemId);
        const actual = firstNumber(registroEquipo.fields[CAMPO_COSTO_MEJORAS]) ?? 0;
        const nuevo = costoMejorasTrasAnular(actual, intervencion);
        await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
          method: "PATCH",
          body: JSON.stringify({ records: [{ id: itemId, fields: { [CAMPO_COSTO_MEJORAS]: nuevo } }] }),
        });
        hecho.push(`Costo de mejoras del equipo: de $${actual.toFixed(2)} a $${nuevo.toFixed(2)}.`);
      } catch (error) {
        console.error("Anulación: no se pudo corregir el costo del equipo:", error);
        pendiente.push(`Restar a mano $${neto.toFixed(2)} del "Costo de mejoras" del equipo.`);
      }
    }

    // 5) Eliminar la pieza retirada (con copia en Shipping Eventos).
    if (intervencion.piezaRetiradaId) {
      try {
        await eliminarShippingItemInterno(intervencion.piezaRetiradaId, {
          motivo: `Mejora anulada en ${equipo?.sku || "el equipo"}: la pieza retirada vuelve a no existir. ${motivo}`,
          registradoPor: options.actor,
          exigirConfirmacion: false,
        });
        hecho.push(`Se eliminó la pieza retirada ${skuPiezaRetirada || intervencion.piezaRetiradaId}.`);
      } catch (error) {
        console.error("Anulación: no se pudo eliminar la pieza retirada:", error);
        pendiente.push(`Eliminar a mano la pieza retirada ${skuPiezaRetirada || intervencion.piezaRetiradaId} (${error instanceof Error ? error.message : "error"}).`);
      }
    }
  }

  const resultado = [
    esMejora ? "Mejora anulada." : "Mantenimiento anulado (no movía inventario).",
    ...hecho,
    ...(pendiente.length ? ["PENDIENTE A MANO:", ...pendiente] : []),
  ].join("\n");
  await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.intervenciones), {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id: intervencionId, fields: { "Resultado de anulación": resultado } }] }),
  }).catch((error) => console.error("No se pudo guardar el resultado de la anulación:", error));

  await createShippingV2Event({
    action: "Actualizado",
    itemRecordId: itemId,
    itemName: equipo?.nombre || "",
    registradoPor: options.actor,
    descripcion: `${intervencion.tipo} anulado(a) por Administrador. Motivo: ${motivo}. ${hecho.join(" ")}`,
  }).catch((error) => console.error("No se pudo escribir el evento del equipo:", error));

  invalidateShippingV2ItemSearchIndexCache();
  return { resultado, pendiente };
}

// ─── Resumen de pendientes para la barra de pestañas (punto 2) ──────────────
// Consultas livianas (solo los campos necesarios). A un usuario proveedor no
// se le muestran conteos: verían cifras de artículos que no son suyos.
/**
 * Fórmula de Airtable para "artículo suelto en camino": viene de afuera, no
 * llegó, no va en una caja y tiene unidades. Misma regla que
 * esSueltoPorLlegar() en item-origen.ts.
 */
function formulaSueltosEnCamino() {
  const F = SHIPPING_V2_ITEM_FIELDS;
  return (
    `AND(NOT({${F.recibido}}),` +
    `OR({${F.origenArticulo}}='Proveedor extranjero',{${F.origenArticulo}}='Proveedor local'),` +
    `LEN(ARRAYJOIN({Shipping Packings}))=0,` +
    `{${F.cantidad}}>0,` +
    `NOT(OR({${F.estadoItem}}='Vendido',{${F.estadoItem}}='Cancelado',{${F.estadoItem}}='Archivado',{${F.estadoItem}}='Usado en reparación',{${F.estadoItem}}='Agotado',{${F.estadoItem}}='Dado de baja')))`
  );
}

/** Pestaña Logística y Recepción → Por llegar: artículos que viajan solos. */
export async function getShippingV2ArticulosSueltosEnCamino(access?: ShippingV2AccessContext) {
  const [records, proveedores] = await Promise.all([
    listRecords(SHIPPING_V2_TABLES.items, { filterByFormula: formulaSueltosEnCamino(), sortField: SHIPPING_V2_ITEM_FIELDS.fechaRegistro, sortDirection: "desc" }),
    getShippingV2Proveedores(),
  ]);
  const labelsById = createShippingV2ProveedorLabelMap(proveedores);
  return records
    .map((record) => mapItem(record, { includeAiName: false }))
    .map((item) => applyItemProviderLabels(item, labelsById))
    .filter((item) => canAccessItem(item, access))
    .map((item) => sanitizeShippingV2ItemForAccess(item, access));
}

export async function getShippingV2ResumenPestanas(access?: ShippingV2AccessContext): Promise<ResumenPestanas | null> {
  if (access?.providerId) return null;
  const F = SHIPPING_V2_ITEM_FIELDS;
  const [sueltos, packings, novedades] = await Promise.all([
    listRecords(SHIPPING_V2_TABLES.items, {
      filterByFormula: formulaSueltosEnCamino(),
      fields: [F.sku, F.trackingHaciaIntermediario, F.trackingDesdeIntermediario, F.trackingDirecto],
    }),
    listRecords(SHIPPING_V2_TABLES.packings, { fields: [SHIPPING_V2_PACKING_FIELDS.estado] }),
    listRecords(SHIPPING_V2_TABLES.novedades, { fields: ["Estado Novedad"] }).catch(() => [] as AirtableRecord[]),
  ]);
  const estadoPacking = (r: AirtableRecord) => normalizeStatus(firstString(r.fields[SHIPPING_V2_PACKING_FIELDS.estado]));
  // "Por llegar" = cajas ya despachadas (en tránsito) + artículos sueltos.
  const cajasEnCamino = packings.filter((r) => estadoPacking(r) === "en transito").length;
  const sinRastreo = sueltos.filter((r) =>
    ![F.trackingHaciaIntermediario, F.trackingDesdeIntermediario, F.trackingDirecto].some((campo) => firstString(r.fields[campo]).trim())
  ).length;
  return {
    porLlegar: sueltos.length + cajasEnCamino,
    sinRastreo,
    cajasAbiertas: packings.filter((r) => estadoPacking(r) === "en proceso").length,
    novedadesAbiertas: novedades.filter((r) => isNovedadAbierta(firstString(r.fields["Estado Novedad"], "Abierta"))).length,
    // Punto 10d-4: anuncios de cosas que ya no están a la venta.
    anunciosPorRetirar: await getShippingV2AnunciosPendientes().then((a) => a.porRetirar.length).catch(() => 0),
    asuntosRevision: await contarAsuntosRevisionAbiertos().catch(() => 0),
  };
}

// ─── Llegada de un artículo suelto (auditoría Shipping V2, punto 2) ─────────
// Un solo lugar (pestaña Logística) para lo logístico de un artículo que viaja
// FUERA de una caja: rastreos con su transportista, casillero, costos y su
// origen. Si el artículo va en una caja, manda la caja: esto se rechaza.

export type ShippingV2LlegadaInput = {
  origenArticulo?: string;
  proveedorLogisticoId?: string;
  trackingHaciaIntermediario?: string;
  transportistaOrigenId?: string;
  trackingDesdeIntermediario?: string;
  transportistaEcuadorId?: string;
  trackingDirecto?: string;
  /** Costos TOTALES del envío del artículo (no por unidad). null = borrar. */
  flete?: number | null;
  arancel?: number | null;
  otrosCostos?: number | null;
};

function tieneCampo(input: object, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function linkOrEmpty(value: string | undefined) {
  const id = cleanString(value);
  return id ? [id] : [];
}

export async function actualizarLlegadaShippingV2Item(
  recordId: string,
  input: ShippingV2LlegadaInput,
  options: { actualizadoPor: string; access?: ShippingV2AccessContext }
) {
  assertShippingV2GeneratedSchema();
  assertShippingV2Permission(options.access, "canEditItems", "No tienes permiso para editar artículos.");
  const id = cleanString(recordId);
  if (!id) throw new Error("Record ID de item inválido.");
  const item = await getShippingV2ItemById(id, { includeAiName: false, access: options.access, sanitizeForAccess: false });
  if (item.packingId) {
    throw new Error("Este artículo viaja en una caja: sus rastreos y costos los gobierna la caja.");
  }
  if (item.recibido === true && tieneCampo(input, "origenArticulo")) {
    throw new Error("El artículo ya llegó: su origen ya no se puede cambiar.");
  }

  const F = SHIPPING_V2_ITEM_FIELDS;
  const fields: Record<string, unknown> = {};
  const origen = tieneCampo(input, "origenArticulo")
    ? normalizarOrigen(input.origenArticulo)
    : normalizarOrigen(item.origenArticulo);
  if (tieneCampo(input, "origenArticulo")) {
    if (!origen) throw new Error("Origen inválido.");
    if (origen === ORIGEN_TIENDA) {
      throw new Error("Para dar por llegado un artículo, márcalo “Recibido” en Recepción.");
    }
    if (!tipoOperacionPermitido(origen, item.tipoOperacion)) {
      throw new Error(`"${item.tipoOperacion}" no aplica a un artículo con origen "${origen}".`);
    }
    fields[F.origenArticulo] = origen;
  }
  const extranjero = origen === "Proveedor extranjero";
  const local = origen === "Proveedor local";

  if (tieneCampo(input, "proveedorLogisticoId")) {
    if (!extranjero) throw new Error("El casillero solo aplica a artículos de proveedor extranjero.");
    await validateItemProviderRules({ proveedorLogisticoId: input.proveedorLogisticoId });
    fields[F.proveedorLogistico] = linkOrEmpty(input.proveedorLogisticoId);
  }
  if (tieneCampo(input, "trackingHaciaIntermediario") || tieneCampo(input, "transportistaOrigenId") || tieneCampo(input, "trackingDesdeIntermediario")) {
    if (!extranjero) throw new Error("Los rastreos de origen y de Ecuador son para artículos de proveedor extranjero.");
  }
  if (tieneCampo(input, "trackingDirecto") && !local) {
    throw new Error("El rastreo local es para artículos de proveedor local.");
  }
  if (tieneCampo(input, "trackingHaciaIntermediario")) fields[F.trackingHaciaIntermediario] = cleanString(input.trackingHaciaIntermediario);
  if (tieneCampo(input, "transportistaOrigenId")) fields[F.transportistaOrigen] = linkOrEmpty(input.transportistaOrigenId);
  if (tieneCampo(input, "trackingDesdeIntermediario")) fields[F.trackingDesdeIntermediario] = cleanString(input.trackingDesdeIntermediario);
  if (tieneCampo(input, "transportistaEcuadorId")) fields[F.transportistaEcuador] = linkOrEmpty(input.transportistaEcuadorId);
  if (tieneCampo(input, "trackingDirecto")) fields[F.trackingDirecto] = cleanString(input.trackingDirecto);

  // Costos del envío suelto. Las fórmulas de Airtable ("Costo flete
  // asignado"…) dividen estos totales por "Unidades en packing" cuando es > 0:
  // es el mismo camino que usa el reparto de una caja (packing-reparto.ts).
  const tocaCostos = ["flete", "arancel", "otrosCostos"].some((k) => tieneCampo(input, k));
  if (tocaCostos) {
    for (const [key, label] of [["flete", "Flete"], ["arancel", "Arancel"], ["otrosCostos", "Otros costos"]] as const) {
      if (tieneCampo(input, key)) validateOptionalMoney(input[key] ?? null, label);
    }
    if (tieneCampo(input, "flete")) fields[F.fleteAsignadoRegistro] = input.flete ?? null;
    if (tieneCampo(input, "arancel")) fields[F.arancelAsignadoRegistro] = input.arancel ?? null;
    if (tieneCampo(input, "otrosCostos")) fields[F.otrosCostosAsignadosRegistro] = input.otrosCostos ?? null;
    // Punto 9b: se reparte entre lo comprado (no cambia al vender).
    fields[F.unidadesEnPacking] = Number(item.unidadesCompradas) > 0 ? Number(item.unidadesCompradas) : item.cantidad && item.cantidad > 0 ? item.cantidad : 1;
  }

  // Un número de rastreo ya afirma el despacho: pasa solo a "En tránsito".
  const rastreoNuevo = [input.trackingHaciaIntermediario, input.trackingDesdeIntermediario, input.trackingDirecto]
    .some((t) => Boolean(cleanString(t)));
  const estadoNuevo = rastreoNuevo ? estadoAlPonerRastreo(item) : null;
  if (estadoNuevo) fields[F.estadoItem] = estadoNuevo;

  if (!Object.keys(fields).length) return item;
  fields[F.ultimaActualizacion] = new Date().toISOString();
  fields[F.actualizadoPor] = options.actualizadoPor;

  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id, fields }], typecast: true }),
  });
  const updated = response.records?.[0];
  if (!updated) throw new Error("Airtable no devolvió el item actualizado.");
  const actualizado = mapItem(updated);
  await createShippingV2Event({
    action: estadoNuevo ? "Cambio de estado" : "Actualizado",
    itemRecordId: id,
    itemName: actualizado.nombre,
    registradoPor: options.actualizadoPor,
    descripcion: `Logística del artículo actualizada (${Object.keys(fields).filter((k) => k !== F.ultimaActualizacion && k !== F.actualizadoPor).join(", ")}).`,
    ...(estadoNuevo ? { estadoAnterior: item.estado, estadoNuevo } : {}),
  });
  invalidateShippingV2ItemSearchIndexCache();
  return actualizado;
}

// ─── Soltar el artículo de un repuesto bajo pedido ───────────────────────────
// Reversa del pedido que nació desde el presupuesto de una orden (ver
// lib/tecnicos/presupuesto/cargar.ts → revertirLinea). Mientras el artículo
// esté vinculado a la Operación Comercial, la cuenta unificada se lo cobra al
// cliente (itemsPedido); por eso la reversa SIEMPRE suelta ese vínculo.
//
//   "cancelar" → el proveedor no lo tenía o el cliente desistió antes de que
//                llegue: el artículo queda Cancelado (sale de Pagos pendientes
//                y de Recepción).
//   "liberar"  → ya llegó y el cliente desistió: el artículo sigue siendo de
//                la tienda, sin reserva; Recepción decide si se vende.
//
// La guarda de pagos (no se cancela algo ya pagado o incluido en un pago)
// vive en reversasDisponibles() y se verifica antes de llamar aquí.
export async function soltarArticuloDePedido(
  itemId: string,
  opts: { modo: "cancelar" | "liberar"; motivo: string; registradoPor: string; descripcion?: string }
) {
  assertShippingV2GeneratedSchema();
  const id = cleanString(itemId);
  if (!id) throw new Error("Record ID de item inválido.");
  const existing = await airtableRequest<AirtableRecordResponse>(`${tableUrl(SHIPPING_V2_TABLES.items)}/${encodeURIComponent(id)}`);
  const estadoAnterior = firstString(existing.fields[SHIPPING_V2_ITEM_FIELDS.estadoItem]);

  // Punto 6 (9-oct): se sueltan SOLO las unidades del cliente de este pedido
  // (la cantidad de su opción). Antes se ponía "Cantidad Reservada" en 0 y se
  // soltaban también las de otras reservas u órdenes sobre las unidades de
  // stock del mismo artículo.
  const unidadesItem = {
    cantidad: firstNumber(existing.fields[SHIPPING_V2_ITEM_FIELDS.cantidad]) ?? 0,
    cantidadReservada: firstNumber(existing.fields[SHIPPING_V2_ITEM_FIELDS.cantidadReservada]) ?? 0,
    reservado: firstBoolean(existing.fields[SHIPPING_V2_ITEM_FIELDS.reservado]),
  };
  const apartadas = unidadesReservadas(unidadesItem);
  const opcionId = linkedRecordIds(existing.fields[SHIPPING_V2_ITEM_SOURCE_FIELDS.opcionOrigen])[0];
  let delCliente = apartadas;
  if (opcionId) {
    const opcion = await airtableRequest<AirtableRecordResponse>(`${tableUrl("Opciones")}/${encodeURIComponent(opcionId)}`).catch(() => null);
    if (opcion) delCliente = Math.min(apartadas, cantidadDeOpcion(opcion.fields["Cantidad"]));
  }
  const liberacion = liberarUnidades(unidadesItem, delCliente);
  if (opts.modo === "cancelar" && liberacion.cantidadReservada > 0) {
    throw new Error(`Hay ${liberacion.cantidadReservada} unidad(es) de este artículo apartadas para otros clientes: no se puede cancelar la compra. Usa "Queda como stock".`);
  }

  const fields: Record<string, unknown> = {
    [SHIPPING_V2_ITEM_SOURCE_FIELDS.operacionComercial]: [],
    [SHIPPING_V2_ITEM_FIELDS.reservado]: liberacion.reservado,
    [SHIPPING_V2_ITEM_FIELDS.cantidadReservada]: liberacion.cantidadReservada,
    [SHIPPING_V2_ITEM_FIELDS.ultimaActualizacion]: new Date().toISOString(),
    [SHIPPING_V2_ITEM_FIELDS.actualizadoPor]: opts.registradoPor,
  };
  if (opts.modo === "cancelar") {
    fields[SHIPPING_V2_ITEM_FIELDS.estadoItem] = "Cancelado";
    fields[SHIPPING_V2_ITEM_FIELDS.disponibleVenta] = false;
  } else {
    // "Liberar": el artículo vuelve a ser stock de la tienda, reservable como
    // cualquier otro (C-8 de la auditoría). Antes quedaba con "Disponible para
    // venta" apagada y sin camino para volver a ofrecerse. Si ya llegó, su
    // etiqueta sale de la misma regla que en Recepción.
    const estadoActual = firstString(existing.fields[SHIPPING_V2_ITEM_FIELDS.estadoItem]);
    const recibido = existing.fields[SHIPPING_V2_ITEM_FIELDS.recibido] === true;
    const estadoNuevo = estadoSegunLlegada({
      estado: estadoActual,
      recibido,
      requiereInspeccion: existing.fields[SHIPPING_V2_ITEM_FIELDS.requiereInspeccion] === true,
      inspeccionFirmada: existing.fields["Revisado física/técnicamente"] === true,
      usoLocal: existing.fields[SHIPPING_V2_ITEM_FIELDS.esUsoLocal] === true,
      todasReservadas: liberacion.reservado,
    });
    if (estadoNuevo) fields[SHIPPING_V2_ITEM_FIELDS.estadoItem] = estadoNuevo;
    fields[SHIPPING_V2_ITEM_FIELDS.disponibleVenta] = calcularDisponibleVenta({
      estado: estadoNuevo ?? estadoActual,
      estadoRevision: firstString(existing.fields[SHIPPING_V2_ITEM_FIELDS.estadoRevision]),
      usoLocal: existing.fields[SHIPPING_V2_ITEM_FIELDS.esUsoLocal] === true,
      unidadesLibres: unidadesLibres({ ...unidadesItem, cantidadReservada: liberacion.cantidadReservada, reservado: liberacion.reservado }),
    });
  }

  const response = await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id, fields }] }),
  });
  const updated = response.records?.[0];
  if (!updated) throw new Error("Airtable no devolvió el item actualizado.");
  await createShippingV2Event({
    action: opts.modo === "cancelar" ? "Cambio de estado" : "Actualizado",
    itemRecordId: id,
    itemName: firstString(updated.fields[SHIPPING_V2_ITEM_FIELDS.nombre]),
    registradoPor: opts.registradoPor,
    descripcion: opts.descripcion ? `${opts.descripcion} ${opts.motivo}` : opts.modo === "cancelar"
      ? `Pedido cancelado desde el presupuesto de la orden. ${opts.motivo}`
      : `Liberado a inventario: el cliente desistió después de que llegó. ${opts.motivo}`,
    estadoAnterior,
    estadoNuevo: opts.modo === "cancelar" ? "Cancelado" : firstString(fields[SHIPPING_V2_ITEM_FIELDS.estadoItem]) || estadoAnterior,
  });
  invalidateShippingV2ItemSearchIndexCache();
}

// ─── Eliminar item (solo Administrador) ──────────────────────────────────────
// Reglas en lib/shipping-v2/eliminar-item.ts. Se lee el item por ID de campo
// (returnFieldsByFieldId) para que un campo renombrado no deje ciega la
// verificación. Antes de borrar se registra un evento con la copia completa
// de los datos; si ese evento no se puede escribir, NO se borra.

const TABLA_PRESUPUESTO_ORDEN = "Presupuesto por Orden";
const SNAPSHOT_MAX = 90_000;

function idsDeCampo(fields: Record<string, unknown>, fieldId: string): string[] {
  const v = fields[fieldId];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

async function leerItemPorIdDeCampo(itemId: string) {
  const url = new URL(`${tableUrl(SHIPPING_V2_TABLES.items)}/${encodeURIComponent(itemId)}`);
  url.searchParams.set("returnFieldsByFieldId", "true");
  return airtableRequest<AirtableRecordResponse>(url.toString());
}

async function contextoEliminacion(
  itemId: string,
  opciones: { ignorarIntervencionIds?: string[] } = {}
): Promise<{ ctx: ContextoEliminacion; fields: Record<string, unknown> }> {
  const record = await leerItemPorIdDeCampo(itemId);
  const fields = record.fields ?? {};
  const C = CAMPOS_ITEM;

  const pagoIds = [...idsDeCampo(fields, C.pagos), ...idsDeCampo(fields, C.pagosRegalo)];
  const presupuestoIds = idsDeCampo(fields, C.presupuesto);
  const [pagos, lineas] = await Promise.all([
    pagoIds.length ? listRecordsByIds(SHIPPING_V2_TABLES.pagos, pagoIds) : Promise.resolve([] as AirtableRecord[]),
    presupuestoIds.length ? listRecordsByIds(TABLA_PRESUPUESTO_ORDEN, presupuestoIds) : Promise.resolve([] as AirtableRecord[]),
  ]);
  // Si un vínculo no se pudo leer completo, se asume lo peor (activo).
  const pagosCtx = pagoIds.map((id) => {
    const r = pagos.find((x) => x.id === id);
    return { codigo: firstString(r?.fields["Pago ID"], id), estado: r ? firstString(r.fields["Estado Pago"]) : "desconocido" };
  });
  const presupuestoCtx = presupuestoIds.map((id) => {
    const r = lineas.find((x) => x.id === id);
    return { descripcion: firstString(r?.fields["Descripción"]), estado: r ? firstString(r.fields["Estado"]) : "desconocido" };
  });

  const conteo: Record<string, number> = {};
  for (const id of Object.values(C)) {
    const v = fields[id];
    if (Array.isArray(v) && v.length > 0) conteo[id] = v.length;
  }
  const fotos = (conteo[C.fotos] ?? 0) + (conteo[C.evidencias] ?? 0);

  // Mantenimientos y mejoras: los ANULADOS ya no bloquean (punto 3, 8-oct).
  // Si un vínculo no se pudo leer, cuenta como activo (fail-closed).
  const camposIntervencion = [C.intervenciones1, C.intervenciones2, C.intervencionesPiezaRetirada];
  const idsIntervencion = [...new Set(camposIntervencion.flatMap((campo) => idsDeCampo(fields, campo)))];
  let intervencionesAnuladas = 0;
  if (idsIntervencion.length) {
    const registros = await listRecordsByIds(SHIPPING_V2_TABLES.intervenciones, idsIntervencion);
    const ignorar = new Set(opciones.ignorarIntervencionIds ?? []);
    const anuladas = new Set(registros.filter((r) => firstBoolean(r.fields["Anulada"]) === true).map((r) => r.id));
    for (const campo of camposIntervencion) {
      const ids = idsDeCampo(fields, campo);
      if (!ids.length) continue;
      const activas = ids.filter((rid) => !anuladas.has(rid) && !ignorar.has(rid)).length;
      if (activas > 0) conteo[campo] = activas;
      else delete conteo[campo];
    }
    intervencionesAnuladas = idsIntervencion.filter((rid) => anuladas.has(rid)).length;
  }

  return {
    fields,
    ctx: {
      intervencionesAnuladas,
      sku: firstString(fields[C.sku]).trim(),
      nombre: firstString(fields[C.nombre]).trim(),
      estado: firstString(fields[C.estado]).trim(),
      pagos: pagosCtx,
      presupuesto: presupuestoCtx,
      conteo,
      vinculosDesconocidos: detectarVinculosDesconocidos(fields),
      fotos,
    },
  };
}

export async function evaluarEliminacionShippingItem(itemId: string): Promise<EvaluacionEliminacion & { sku: string; nombre: string }> {
  assertShippingV2GeneratedSchema();
  const id = cleanString(itemId);
  if (!id) throw new Error("Record ID de item inválido.");
  const { ctx } = await contextoEliminacion(id);
  return { ...evaluarEliminacion(ctx), sku: ctx.sku, nombre: ctx.nombre };
}

export class EliminacionBloqueadaError extends Error {
  constructor(public evaluacion: EvaluacionEliminacion) {
    super(evaluacion.bloqueos[0] ?? "No se puede eliminar este item.");
  }
}

export async function eliminarShippingItem(itemId: string, opts: { confirmacion: unknown; motivo: string; registradoPor: string }) {
  return eliminarShippingItemInterno(itemId, { ...opts, exigirConfirmacion: true });
}

/**
 * Misma eliminación, pero sin pedir que se escriba el SKU: la usa la anulación
 * de una mejora para quitar la pieza retirada (el Administrador ya confirmó al
 * anular). Las MISMAS reglas de bloqueo aplican.
 */
async function eliminarShippingItemInterno(
  itemId: string,
  opts: { confirmacion?: unknown; motivo: string; registradoPor: string; exigirConfirmacion: boolean }
) {
  assertShippingV2GeneratedSchema();
  const id = cleanString(itemId);
  if (!id) throw new Error("Record ID de item inválido.");
  const motivo = cleanString(opts.motivo);
  if (motivo.length < 5) throw new Error("Escribe el motivo de la eliminación (mínimo 5 caracteres).");

  // Se vuelve a evaluar aquí: entre la vista previa y la confirmación alguien
  // pudo agregarlo a un pago o a un packing.
  const { ctx, fields } = await contextoEliminacion(id);
  const evaluacion = evaluarEliminacion(ctx);
  if (!evaluacion.permitido) throw new EliminacionBloqueadaError(evaluacion);
  if (opts.exigirConfirmacion && !confirmacionValida(evaluacion.confirmacion, opts.confirmacion)) {
    throw new Error(`Para confirmar escribe exactamente: ${evaluacion.confirmacion}`);
  }

  const copia = JSON.stringify({ recordId: id, eliminadoEn: new Date().toISOString(), campos: fields });
  // 1) Evento de auditoría (obligatorio). Sin enlace al item: el item va a desaparecer.
  await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.eventos), {
    method: "POST",
    body: JSON.stringify({
      records: [{
        fields: {
          "Tipo de entidad": "Shipping Item",
          "Acción": "Corrección administrativa",
          "Estado anterior": ctx.estado || undefined,
          "Estado nuevo": "Eliminado",
          "Descripción del evento": `Item eliminado por administrador: ${ctx.sku || "(sin SKU)"} — ${ctx.nombre || "(sin nombre)"}. Record ${id}.`,
          "Observación": motivo,
          "Registrado por": opts.registradoPor,
          "Fecha del evento": new Date().toISOString(),
          "Datos relevantes": copia.length > SNAPSHOT_MAX ? `${copia.slice(0, SNAPSHOT_MAX)}…(recortado)` : copia,
        },
      }],
      typecast: false,
    }),
  });

  // 2) Borrado.
  await airtableMutation(`${tableUrl(SHIPPING_V2_TABLES.items)}?records[]=${encodeURIComponent(id)}`, { method: "DELETE" });
  invalidateShippingV2ItemSearchIndexCache();
  return { sku: ctx.sku, nombre: ctx.nombre, avisos: evaluacion.avisos };
}

// ─── Punto 10b-4b: copiar entre unidades del mismo producto ──────────────────

export type ResultadoCopiaFicha = {
  copiadas: string[];
  omitidas: Array<{ unidad: string; motivo: string }>;
};

/**
 * "¿Usar estos datos técnicos en otras unidades?": escribe en cada destino los
 * datos del producto que tiene la ficha de `origenId` (ver copiar-unidad.ts).
 * El usuario elige los destinos; lo propio de cada unidad no se toca.
 */
export async function copiarFichaTecnicaAUnidades(
  origenId: string,
  destinoIds: string[],
  options: { actor: string; access?: ShippingV2AccessContext }
): Promise<ResultadoCopiaFicha> {
  assertShippingV2Permission(options.access, "canUseRecepcion", "No tienes permiso para usar Recepción.");
  const origenLimpio = cleanString(origenId);
  const destinos = Array.from(new Set(destinoIds.map(cleanString).filter((id) => id && id !== origenLimpio)));
  if (!origenLimpio || !destinos.length) throw new Error("Elige al menos una unidad.");
  if (destinos.length > 50) throw new Error("Máximo 50 unidades por vez.");

  const registros = await listRecordsByIds(SHIPPING_V2_TABLES.items, [origenLimpio, ...destinos]);
  const porId = new Map(registros.map((r) => [r.id, r]));
  const origen = porId.get(origenLimpio);
  if (!origen || !canAccessItemRecord(origen, options.access)) throw new Error("No se encontró la unidad de origen.");
  const F = SHIPPING_V2_ITEM_FIELDS;
  const skuOrigen = firstString(origen.fields[getOfficialSkuField()]);
  const nombreOrigen = nombreUnidad(skuOrigen, firstString(origen.fields[F.numeroSerie]));
  const ahora = new Date().toISOString();

  const resultado: ResultadoCopiaFicha = { copiadas: [], omitidas: [] };
  const escrituras: Array<{ id: string; fields: Record<string, unknown>; nombre: string }> = [];
  for (const id of destinos) {
    const destino = porId.get(id);
    if (!destino || !canAccessItemRecord(destino, options.access)) {
      resultado.omitidas.push({ unidad: id, motivo: "No se encontró." });
      continue;
    }
    const nombre = nombreUnidad(firstString(destino.fields[getOfficialSkuField()]), firstString(destino.fields[F.numeroSerie]));
    const motivo = evaluarCopiaFicha(
      { id: origen.id, sku: skuOrigen },
      { id, sku: firstString(destino.fields[getOfficialSkuField()]), estado: firstString(destino.fields[F.estadoItem]) }
    );
    if (motivo) {
      resultado.omitidas.push({ unidad: nombre, motivo });
      continue;
    }
    escrituras.push({
      id,
      nombre,
      fields: camposFichaCopiada(
        origen.fields,
        { especificaciones: destino.fields[CAMPO_ESPECIFICACIONES], fichaGenerada: firstBoolean(destino.fields[F.fichaTecnicaGenerada]) },
        { actor: options.actor, ahora }
      ),
    });
  }

  for (let i = 0; i < escrituras.length; i += 10) {
    const lote = escrituras.slice(i, i + 10);
    await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
      method: "PATCH",
      body: JSON.stringify({ records: lote.map((e) => ({ id: e.id, fields: e.fields })) }),
    });
    for (const e of lote) {
      resultado.copiadas.push(e.nombre);
      await createShippingV2Event({
        action: "Actualizado",
        itemRecordId: e.id,
        itemName: e.nombre,
        registradoPor: options.actor,
        descripcion: `Datos técnicos copiados de ${nombreOrigen} (ficha de mostrador).`,
      });
    }
  }
  if (escrituras.length) invalidateShippingV2ItemSearchIndexCache();
  return resultado;
}

/**
 * "⋯ Copiar de otra unidad" en la inspección: arma los cambios (equipamiento
 * declarado y puntos Conforme / No aplica de la otra unidad) para guardarlos
 * por el camino normal de la inspección, que valida que esta unidad esté
 * recibida y sin firmar.
 */
export async function cambiosParaCopiarInspeccion(
  destinoId: string,
  origenId: string,
  options: { access?: ShippingV2AccessContext }
): Promise<{ cambios: ShippingV2InspeccionCambios; origenNombre: string }> {
  const [destino, origen] = await Promise.all([
    getShippingV2ItemById(cleanString(destinoId), { includeAiName: false, access: options.access }),
    getShippingV2ItemById(cleanString(origenId), { includeAiName: false, access: options.access }),
  ]);
  if (destino.id === origen.id) throw new Error("Elige otra unidad.");
  if (normalizeSku(destino.sku) !== normalizeSku(origen.sku)) throw new Error("Esa unidad es de otro producto (otro SKU).");
  const origenNombre = nombreUnidad(origen.sku, origen.numeroSerie);
  const puntos = resultadosParaCopiar(parsearSnapshot(origen.revisionTecnicaDetalle, origen.categoria));
  if (!puntos.length) throw new Error(`${origenNombre} no tiene puntos conformes para copiar.`);
  return {
    origenNombre,
    cambios: {
      equipamiento: {
        conectividadIds: origen.technicalSheet.connectivityV2Ids,
        puertosIds: origen.technicalSheet.portV2Ids,
        extrasIds: origen.technicalSheet.extraFeatureV2Ids,
      },
      puntos,
    },
  };
}

/**
 * Punto 10b-5: un equipo sin serie legible recibe la siguiente serie interna
 * (SG00000001…). Se calcula por turno para que dos personas no saquen la misma,
 * y se guarda por el camino normal del campo (que vuelve a comprobar que no se
 * repita y deja el evento).
 */
export async function asignarSerieInternaShippingV2(
  recordId: string,
  options: { actualizadoPor: string; esAdmin?: boolean; access?: ShippingV2AccessContext; camposNoEditables?: readonly string[] }
) {
  const F = SHIPPING_V2_ITEM_FIELDS;
  return withLock("shipping-serie-interna", async () => {
    const actual = await getShippingV2ItemById(cleanString(recordId), { includeAiName: false, access: options.access });
    if (normalizarSerie(actual.numeroSerie)) throw new Error(`Esta unidad ya tiene serie (${normalizarSerie(actual.numeroSerie)}).`);
    const ultimas = await listRecords(SHIPPING_V2_TABLES.items, {
      maxRecords: 1,
      fields: [F.numeroSerie],
      filterByFormula: `REGEX_MATCH({${F.numeroSerie}}&"","^SG[0-9]{8}$")`,
      sortField: F.numeroSerie,
      sortDirection: "desc",
    });
    const serie = siguienteSerieInterna(ultimas.map((r) => firstString(r.fields[F.numeroSerie])));
    return updateShippingV2ItemField(actual.id, {
      field: F.numeroSerie,
      value: serie,
      eventDescription: `Serie interna ${serie} asignada (el equipo no tiene serie legible).`,
    }, options);
  });
}

// ─── Punto 10d: gestor de publicaciones ──────────────────────────────────────

const TABLA_PUBLICACIONES = "Shipping Publicaciones";
const TABLA_PLANTILLAS_PUBLICACION = "Shipping Plantillas de publicación";
const TABLA_DATOS_TIENDA = "Shipping Datos de la tienda";

function canalValido(valor: unknown): CanalPublicacion | null {
  const t = firstString(valor);
  return (CANALES_PUBLICACION as readonly string[]).includes(t) ? (t as CanalPublicacion) : null;
}

export async function getShippingV2DatosTienda(): Promise<DatosTienda> {
  const registros = await listRecords(TABLA_DATOS_TIENDA, { maxRecords: 1 });
  const f = registros[0]?.fields ?? {};
  return {
    id: registros[0]?.id,
    direccion: firstString(f["Dirección"]),
    horarioSemana: firstString(f["Horario lunes a viernes"]),
    horarioSabado: firstString(f["Horario sábados"]),
    whatsapp: firstString(f["WhatsApp"]),
    telefonoFijo: firstString(f["Teléfono fijo"]),
    web: firstString(f["Página web"]),
    metodosPago: firstString(f["Métodos de pago"]),
    garantiaCorta: firstString(f["Garantía corta"]),
    garantiaLarga: firstString(f["Garantía larga"]),
    hashtagsFijos: firstString(f["Hashtags fijos"]),
    version: firstNumber(f["Versión"]) ?? 1,
    editadoPor: firstString(f["Editado por"]) || undefined,
    fechaEdicion: firstString(f["Fecha edición"]) || undefined,
  };
}

export async function getShippingV2PlantillasPublicacion(): Promise<PlantillaPublicacion[]> {
  const registros = await listRecords(TABLA_PLANTILLAS_PUBLICACION, { maxRecords: 500 });
  return registros
    .map((r): PlantillaPublicacion | null => {
      const canal = canalValido(r.fields["Canal"]);
      if (!canal) return null;
      return {
        id: r.id,
        nombre: firstString(r.fields["Nombre"]),
        categoria: firstString(r.fields["Categoría"]),
        canal,
        titulo: firstString(r.fields["Título"]),
        descripcion: firstString(r.fields["Descripción"]),
        activa: firstBoolean(r.fields["Activa"]) === true,
        editadaPor: firstString(r.fields["Editada por"]) || undefined,
        fechaEdicion: firstString(r.fields["Fecha edición"]) || undefined,
      };
    })
    .filter((p): p is PlantillaPublicacion => p !== null);
}

function mapPublicacion(r: AirtableRecord): Publicacion | null {
  const f = r.fields;
  const canal = canalValido(f["Canal"]);
  if (!canal) return null;
  const estado = firstString(f["Estado"], "Borrador");
  return {
    id: r.id,
    sku: firstString(f["SKU"]),
    canal,
    alcance: firstString(f["Alcance"]) === "Unidad" ? "Unidad" : "Producto",
    unidadId: linkedRecordIds(f["Unidad"])[0],
    plantillaId: linkedRecordIds(f["Plantilla"])[0],
    titulo: firstString(f["Título"]),
    presentacion: firstString(f["Presentación"]),
    descripcion: firstString(f["Descripción"]),
    precio: firstNumber(f["Precio publicado"]),
    enlace: firstString(f["Enlace"]),
    estado: (["Borrador", "Publicado", "Por retirar", "Retirado"].includes(estado) ? estado : "Borrador") as EstadoPublicacion,
    publicadoPor: firstString(f["Publicado por"]) || undefined,
    fechaPublicado: firstString(f["Fecha publicado"]) || undefined,
    versionTienda: firstNumber(f["Versión datos de la tienda"]),
    retiradoPor: firstString(f["Retirado por"]) || undefined,
    fechaRetirado: firstString(f["Fecha retirado"]) || undefined,
  };
}

export async function getShippingV2PublicacionesDeSku(skuValue: string): Promise<Publicacion[]> {
  const sku = normalizeSku(cleanString(skuValue));
  if (!sku) return [];
  const registros = await listRecords(TABLA_PUBLICACIONES, {
    maxRecords: 200,
    filterByFormula: `LOWER({SKU}) = LOWER('${escapeFormulaString(sku)}')`,
  });
  return registros.map(mapPublicacion).filter((p): p is Publicacion => p !== null);
}

/** Todos los registros (unidades o lotes) de un SKU, completos. */
export async function getShippingV2ItemsDelSku(skuValue: string, access?: ShippingV2AccessContext): Promise<ShippingV2Item[]> {
  const sku = normalizeSku(cleanString(skuValue));
  if (!sku) return [];
  const registros = await listRecords(SHIPPING_V2_TABLES.items, {
    maxRecords: 100,
    filterByFormula: `LOWER({${getOfficialSkuField()}}) = LOWER('${escapeFormulaString(sku)}')`,
  });
  return registros.filter((r) => canAccessItemRecord(r, access)).map((r) => mapItem(r, { access }));
}

export type ShippingV2GestorPublicaciones = GestorPublicacionesDatos;

export async function getShippingV2GestorPublicaciones(skuValue: string, access?: ShippingV2AccessContext): Promise<ShippingV2GestorPublicaciones> {
  const [items, tienda, plantillas, publicaciones] = await Promise.all([
    getShippingV2ItemsDelSku(skuValue, access),
    getShippingV2DatosTienda(),
    getShippingV2PlantillasPublicacion(),
    getShippingV2PublicacionesDeSku(skuValue),
  ]);
  if (!items.length) throw new Error("No se encontró el producto.");
  const unidades = items.map((item) => datosUnidadDeItem(item, especificacionesDeItem(item).resumen));
  const principal = items.find((i) => unidadViva(i)) ?? items[0];
  return { sku: principal.sku, nombre: principal.nombre, categoria: principal.categoria ?? "", tienda, plantillas, publicaciones, unidades, iaDisponible: iaAnunciosDisponible() };
}

export type GuardarPublicacionInput = {
  sku: string;
  canal: CanalPublicacion;
  alcance: AlcancePublicacion;
  unidadId?: string;
  plantillaId?: string;
  titulo: string;
  presentacion: string;
  descripcion: string;
  precio: number | null;
  enlace: string;
  /** guardar = borrador; publicar = marca publicado (y la casilla de Recepción); retirar = ya no está publicado. */
  accion: "guardar" | "publicar" | "retirar";
};

/**
 * Guarda el anuncio de un canal (uno por SKU + canal + alcance + unidad). Al
 * publicar o retirar, marca o desmarca la casilla de Recepción de ese canal en
 * las unidades que el anuncio cubre y que ya están en la tienda (las que vienen
 * en camino se marcan al llegar, desde el gestor).
 */
export async function guardarPublicacionShippingV2(
  input: GuardarPublicacionInput,
  options: { actor: string; access?: ShippingV2AccessContext }
): Promise<{ publicacion: Publicacion; itemsActualizados: ShippingV2Item[] }> {
  const sku = normalizeSku(cleanString(input.sku));
  if (!sku) throw new Error("Falta el SKU.");
  if (!canalValido(input.canal)) throw new Error("Canal no válido.");
  if (input.alcance === "Unidad" && !cleanString(input.unidadId)) throw new Error("Elige la unidad del anuncio aparte.");
  const titulo = cleanString(input.titulo);
  if (input.accion === "publicar" && !titulo) throw new Error("Escribe el título.");
  if (titulo.length > TITULO_MAX[input.canal]) throw new Error(`El título pasa de ${TITULO_MAX[input.canal]} caracteres.`);
  const enlace = cleanString(input.enlace);
  if (enlace && !/^https?:\/\//i.test(enlace)) throw new Error("El enlace debe empezar con https://");

  return withLock(`publicacion:${sku}:${input.canal}`, async () => {
    const [publicaciones, items, tienda] = await Promise.all([
      getShippingV2PublicacionesDeSku(sku),
      getShippingV2ItemsDelSku(sku, options.access),
      getShippingV2DatosTienda(),
    ]);
    if (!items.length) throw new Error("No se encontró el producto.");
    const unidadId = input.alcance === "Unidad" ? cleanString(input.unidadId) : undefined;
    if (unidadId && !items.some((i) => i.id === unidadId)) throw new Error("Esa unidad no es de este producto.");
    const actual = publicaciones.find((p) => p.canal === input.canal && p.alcance === input.alcance && (p.unidadId ?? "") === (unidadId ?? ""));
    const ahora = new Date().toISOString();
    const serie = unidadId ? items.find((i) => i.id === unidadId)?.numeroSerie : undefined;
    const fields: Record<string, unknown> = {
      "Publicación": nombrePublicacion(sku, input.canal, input.alcance, serie),
      SKU: sku,
      Canal: input.canal,
      Alcance: input.alcance,
      Unidad: unidadId ? [unidadId] : [],
      Plantilla: cleanString(input.plantillaId) ? [cleanString(input.plantillaId)] : [],
      "Título": titulo,
      "Presentación": cleanString(input.presentacion),
      "Descripción": String(input.descripcion ?? "").trim(),
      "Precio publicado": typeof input.precio === "number" && Number.isFinite(input.precio) ? input.precio : null,
      Enlace: enlace || null,
      "Actualizado por": options.actor,
      "Última actualización": ahora,
    };
    if (input.accion === "publicar") {
      fields.Estado = "Publicado";
      // Volver a "publicar" uno ya publicado solo actualiza (no cambia quién ni cuándo).
      if (actual?.estado !== "Publicado") {
        fields["Publicado por"] = options.actor;
        fields["Fecha publicado"] = ahora;
      }
      fields["Versión datos de la tienda"] = tienda.version;
    } else if (input.accion === "retirar") {
      fields.Estado = "Retirado";
      fields["Retirado por"] = options.actor;
      fields["Fecha retirado"] = ahora;
    } else if (!actual) {
      fields.Estado = "Borrador";
    }

    const respuesta = await airtableMutation<AirtableMutationResponse>(tableUrl(TABLA_PUBLICACIONES), {
      method: actual ? "PATCH" : "POST",
      body: JSON.stringify({ records: [actual ? { id: actual.id, fields } : { fields }] }),
    });
    const guardada = respuesta.records?.[0] ? mapPublicacion(respuesta.records[0]) : null;
    if (!guardada) throw new Error("Airtable no devolvió el anuncio guardado.");

    // La casilla de Recepción del canal en las unidades que cubre (ya recibidas).
    // Una unidad cuyo anuncio aparte se retira sigue publicada si el anuncio
    // del producto en ese canal está publicado (vuelve a quedar dentro de él).
    const itemsActualizados: ShippingV2Item[] = [];
    if (input.accion !== "guardar") {
      const todas = items.map((i) => datosUnidadDeItem(i));
      const conGuardada = publicaciones.filter((p) => p.id !== guardada.id).concat(guardada);
      const cubiertas = unidadesCubiertas(todas, conGuardada, input.canal, input.alcance, unidadId);
      const productoPublicado = conGuardada.some((p) => p.canal === input.canal && p.alcance === "Producto" && p.estado === "Publicado");
      const valor = input.accion === "publicar" || (input.alcance === "Unidad" && productoPublicado);
      const campo = ACCION_CHECKLIST_CANAL[input.canal];
      for (const u of cubiertas) {
        const item = items.find((i) => i.id === u.id);
        if (!item || item.recibido !== true) continue;
        const yaMarcado = input.canal === "Marketplace" ? item.marketplacePublicado === true
          : input.canal === "Grupos Facebook" ? item.gruposFacebookPublicado === true
          : input.canal === "Mercado Libre" ? item.mercadoLibrePublicado === true
          : item.shopifyPublicado === true;
        if (yaMarcado === valor) continue;
        try {
          itemsActualizados.push(await updateShippingV2ReceptionChecklistItem(u.id, { action: campo, value: valor }, { actualizadoPor: options.actor }));
        } catch (error) {
          console.warn("No se pudo marcar la casilla del canal en la unidad:", u.id, error);
        }
      }
    }
    return { publicacion: guardada, itemsActualizados };
  });
}

// ─── Punto 10d-2: editor de plantillas y datos fijos de la tienda ────────────

/** Categorías que puede tener una plantilla: las de los artículos + "Otros" (respaldo). */
export function categoriasDePlantilla(): string[] {
  return [...SHIPPING_V2_ITEM_SELECT_OPTIONS.categoria, "Otros"];
}

export type GuardarPlantillaInput = {
  id?: string;
  nombre: string;
  categoria: string;
  canal: CanalPublicacion;
  titulo: string;
  descripcion: string;
  activa: boolean;
};

export async function guardarPlantillaPublicacionShippingV2(
  input: GuardarPlantillaInput,
  options: { actor: string }
): Promise<PlantillaPublicacion> {
  const categoria = cleanString(input.categoria);
  if (!categoriasDePlantilla().includes(categoria)) throw new Error("Categoría no válida.");
  if (!canalValido(input.canal)) throw new Error("Canal no válido.");
  const titulo = cleanString(input.titulo);
  const descripcion = String(input.descripcion ?? "").replace(/\r\n/g, "\n").trim();
  if (!titulo) throw new Error("Escribe el título de la plantilla.");
  if (!descripcion) throw new Error("Escribe la descripción de la plantilla.");
  const nombre = cleanString(input.nombre) || `${categoria} · ${input.canal}`;
  const id = cleanString(input.id);
  const fields: Record<string, unknown> = {
    Nombre: nombre,
    "Categoría": categoria,
    Canal: input.canal,
    "Título": titulo,
    "Descripción": descripcion,
    Activa: input.activa === true,
    "Editada por": options.actor,
    "Fecha edición": new Date().toISOString(),
  };
  const respuesta = await airtableMutation<AirtableMutationResponse>(tableUrl(TABLA_PLANTILLAS_PUBLICACION), {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify({ records: [id ? { id, fields } : { fields }] }),
  });
  const r = respuesta.records?.[0];
  if (!r) throw new Error("Airtable no devolvió la plantilla guardada.");
  return {
    id: r.id,
    nombre,
    categoria,
    canal: input.canal,
    titulo,
    descripcion,
    activa: input.activa === true,
    editadaPor: options.actor,
    fechaEdicion: firstString(r.fields["Fecha edición"]) || undefined,
  };
}

const CAMPOS_TIENDA: Array<[keyof Omit<DatosTienda, "id" | "version" | "editadoPor" | "fechaEdicion">, string]> = [
  ["direccion", "Dirección"],
  ["horarioSemana", "Horario lunes a viernes"],
  ["horarioSabado", "Horario sábados"],
  ["whatsapp", "WhatsApp"],
  ["telefonoFijo", "Teléfono fijo"],
  ["web", "Página web"],
  ["metodosPago", "Métodos de pago"],
  ["garantiaCorta", "Garantía corta"],
  ["garantiaLarga", "Garantía larga"],
  ["hashtagsFijos", "Hashtags fijos"],
];

/** Guarda los datos fijos de la tienda. Si algo cambió, sube la versión (los anuncios publicados antes quedan "por actualizar"). */
export async function guardarShippingV2DatosTienda(
  input: Partial<DatosTienda>,
  options: { actor: string }
): Promise<DatosTienda> {
  return withLock("datos-tienda", async () => {
    const actual = await getShippingV2DatosTienda();
    const fields: Record<string, unknown> = {};
    for (const [clave, campo] of CAMPOS_TIENDA) {
      if (input[clave] === undefined) continue;
      const valor = String(input[clave] ?? "").replace(/\r\n/g, "\n").trim();
      if (valor !== actual[clave]) fields[campo] = valor;
    }
    if (!Object.keys(fields).length) return actual;
    const version = actual.version + 1;
    Object.assign(fields, { "Versión": version, "Editado por": options.actor, "Fecha edición": new Date().toISOString() });
    await airtableMutation<AirtableMutationResponse>(tableUrl(TABLA_DATOS_TIENDA), {
      method: actual.id ? "PATCH" : "POST",
      body: JSON.stringify({ records: [actual.id ? { id: actual.id, fields } : { fields: { Nombre: "SUPER GEEK", ...fields } }] }),
    });
    return getShippingV2DatosTienda();
  });
}

/** Anuncios publicados con datos de la tienda de una versión anterior (no cambian solos). */
export async function contarPublicacionesDesactualizadasShippingV2(version: number): Promise<number> {
  const registros = await listRecords(TABLA_PUBLICACIONES, {
    fields: ["Estado"],
    filterByFormula: `AND({Estado} = 'Publicado', {Versión datos de la tienda} < ${Math.max(0, Math.floor(version))})`,
  });
  return registros.length;
}

// ─── Punto 10d-4: anuncios por retirar / por actualizar ──────────────────────

export type ShippingV2AnunciosPendientes = {
  porRetirar: AnuncioPendiente[];
  porActualizar: AnuncioPendiente[];
  retirados: Publicacion[];
};

/** Revisa todos los anuncios publicados contra el inventario y los datos de la tienda. */
export async function getShippingV2AnunciosPendientes(opciones: { conRetirados?: boolean } = {}): Promise<ShippingV2AnunciosPendientes> {
  const F = SHIPPING_V2_ITEM_FIELDS;
  const [publicados, tienda, retirados] = await Promise.all([
    listRecords(TABLA_PUBLICACIONES, { filterByFormula: "OR({Estado} = 'Publicado', {Estado} = 'Por retirar')" }),
    getShippingV2DatosTienda(),
    opciones.conRetirados
      ? listRecords(TABLA_PUBLICACIONES, { filterByFormula: "{Estado} = 'Retirado'", sortField: "Fecha retirado", sortDirection: "desc", maxRecords: 30 })
      : Promise.resolve([] as AirtableRecord[]),
  ]);
  const publicaciones = publicados.map(mapPublicacion).filter((p): p is Publicacion => p !== null);
  const skus = Array.from(new Set(publicaciones.map((p) => p.sku.toUpperCase()).filter(Boolean)));
  const unidades: UnidadParaRevisar[] = [];
  for (let i = 0; i < skus.length; i += 20) {
    const grupo = skus.slice(i, i + 20);
    const formula = `OR(${grupo.map((s) => `UPPER({${F.sku}}) = '${escapeFormulaString(s)}'`).join(", ")})`;
    const registros = await listRecords(SHIPPING_V2_TABLES.items, { filterByFormula: formula, fields: [F.sku, F.estadoItem, F.precioVentaFinal, F.numeroSerie] });
    for (const r of registros) {
      unidades.push({
        id: r.id,
        sku: firstString(r.fields[F.sku]),
        estado: firstString(r.fields[F.estadoItem], "Registrado"),
        precio: firstNumber(r.fields[F.precioVentaFinal]),
        numeroSerie: firstString(r.fields[F.numeroSerie]) || undefined,
      });
    }
  }
  const { porRetirar, porActualizar } = revisarAnuncios(publicaciones, unidades, tienda.version);
  return {
    porRetirar,
    porActualizar,
    retirados: retirados.map(mapPublicacion).filter((p): p is Publicacion => p !== null),
  };
}

/** "Retirado": el empleado ya lo quitó del canal. */
export async function retirarPublicacionShippingV2(id: string, options: { actor: string }): Promise<Publicacion> {
  const recordId = cleanString(id);
  if (!recordId) throw new Error("Falta el anuncio.");
  const ahora = new Date().toISOString();
  const respuesta = await airtableMutation<AirtableMutationResponse>(tableUrl(TABLA_PUBLICACIONES), {
    method: "PATCH",
    body: JSON.stringify({
      records: [{ id: recordId, fields: { Estado: "Retirado", "Retirado por": options.actor, "Fecha retirado": ahora, "Actualizado por": options.actor, "Última actualización": ahora } }],
    }),
  });
  const r = respuesta.records?.[0];
  const publicacion = r ? mapPublicacion(r) : null;
  if (!publicacion) throw new Error("Airtable no devolvió el anuncio.");
  return publicacion;
}

// ─── Punto 10c-1: revisión de inventario ─────────────────────────────────────

const TABLA_REVISION = "Shipping Revisión de inventario";

export type ShippingV2AsuntoRevision = {
  id: string;
  clave: string;
  tipo: TipoAsunto;
  estado: EstadoAsunto;
  sku: string;
  itemIds: string[];
  asunto: string;
  detalle: string;
  sugerencia: string;
  motivo: string;
  resueltoPor: string;
  fechaResuelto: string;
  detectado: string;
  ultimaRevision: string;
  /** Punto 10c-4: lo que anotó quien contó desde Revisión. */
  contado: number | null;
  contadoPor: string;
  fechaConteo: string;
};

function mapAsuntoRevision(r: AirtableRecord): ShippingV2AsuntoRevision {
  const f = r.fields;
  const tipo = firstString(f["Tipo"]);
  const estado = firstString(f["Estado"], "Abierto");
  return {
    id: r.id,
    clave: firstString(f["Clave"]),
    tipo: ((TIPOS_ASUNTO as readonly string[]).includes(tipo) ? tipo : "Unidades no cuadran") as TipoAsunto,
    estado: (estado === "Resuelto" || estado === "Está bien" ? estado : "Abierto") as EstadoAsunto,
    sku: firstString(f["SKU"]),
    itemIds: linkedRecordIds(f["Artículo"]),
    asunto: firstString(f["Asunto"]),
    detalle: firstString(f["Detalle"]),
    sugerencia: firstString(f["Sugerencia"]),
    motivo: firstString(f["Motivo"]),
    resueltoPor: firstString(f["Resuelto por"]),
    fechaResuelto: firstString(f["Fecha resuelto"]),
    detectado: firstString(f["Detectado"]),
    ultimaRevision: firstString(f["Última revisión"]),
    contado: firstNumber(f["Contado"]),
    contadoPor: firstString(f["Contado por"]),
    fechaConteo: firstString(f["Fecha conteo"]),
  };
}

export async function getShippingV2AsuntosRevision(opciones: { conResueltos?: boolean } = {}): Promise<ShippingV2AsuntoRevision[]> {
  const registros = await listRecords(TABLA_REVISION, {
    filterByFormula: opciones.conResueltos ? "" : "{Estado} = 'Abierto'",
    sortField: "Detectado",
    sortDirection: "desc",
    ...(opciones.conResueltos ? { maxRecords: 600 } : {}),
  });
  return registros.map(mapAsuntoRevision);
}

export async function contarAsuntosRevisionAbiertos(): Promise<number> {
  const registros = await listRecords(TABLA_REVISION, { filterByFormula: "{Estado} = 'Abierto'", fields: ["Estado"] });
  return registros.length;
}

function lineasJson(valor: unknown): Record<string, unknown> {
  try {
    const obj = JSON.parse(firstString(valor) || "{}");
    return obj && typeof obj === "object" && !Array.isArray(obj) ? (obj as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function lineasDeItems(lista: unknown, soloDevolucion = false): LineaVenta[] {
  if (!Array.isArray(lista)) return [];
  return lista
    .map((l) => (l && typeof l === "object" ? (l as Record<string, unknown>) : {}))
    .filter((l) => typeof l.shippingItemId === "string" && (l.tipo === undefined || l.tipo === "producto"))
    .filter((l) => !soloDevolucion || l.devolucionFisica === true)
    .map((l) => ({ itemId: String(l.shippingItemId), cantidad: Number(l.cantidad) || 0 }));
}

/** Lee de Airtable todo lo que necesita la revisión. */
async function leerDatosRevision(): Promise<DatosRevision> {
  const F = SHIPPING_V2_ITEM_FIELDS;
  const PAGOS_ITEM = "Shipping Pagos (Items relacionados)";
  const PAGOS_REGALO = "Shipping Pagos (Regalos incluidos)";
  const [items, facturas, recibos, notas, reservas, novedades, cajas] = await Promise.all([
    listRecords(SHIPPING_V2_TABLES.items, {
      fields: [F.sku, F.nombre, F.categoria, F.estadoItem, F.cantidad, F.unidadesCompradas, F.recibido, F.precioVentaFinal, F.tipoOperacion, F.origenArticulo, F.fechaRegistro, F.requierePago, F.esRegalo, PAGOS_ITEM, PAGOS_REGALO,
        CAMPO_UNIDADES_DADAS_DE_BAJA, CAMPO_VENDIDAS_FUERA, CAMPO_SALIDAS_INTERNAS, CAMPO_VENTAS_OTRO],
    }),
    listRecords("Facturas Electrónicas", {
      filterByFormula: "{Estado} = 'AUTORIZADO'",
      fields: ["Número de Factura", "Ambiente", "Estado Anulación", "Sincronización Inventario", "Error Sincronización", "Líneas JSON", "Shipping Items"],
    }),
    listRecords("Recibos", { fields: ["Número", "Estado", "Sincronización Inventario", "Error Inventario", "Líneas JSON", "Shipping Items"] }),
    listRecords("Notas de Crédito Electrónicas", {
      filterByFormula: "{Estado} = 'AUTORIZADO'",
      fields: ["Número de Nota de Crédito", "Ambiente", "Reverso Inventario", "Error Reverso", "Líneas JSON", "Shipping Items"],
    }),
    listRecords("Reservas", { filterByFormula: "{Estado} = 'Activa'", fields: ["Número", "Fecha Límite", "Shipping Item"] }),
    listRecords(SHIPPING_V2_TABLES.novedades, { fields: ["Novedad ID", "Tipo de novedad", "Estado Novedad", "Item relacionado", "Última actualización", "Fecha de registro"] }),
    listRecords(SHIPPING_V2_TABLES.packings, {
      filterByFormula: `{${SHIPPING_V2_PACKING_FIELDS.estado}} = 'Cerrado final'`,
      fields: [SHIPPING_V2_PACKING_FIELDS.packingId, "Items incluidos"],
    }),
  ]);

  const datos: DatosRevision = { items: [], ventas: [], devoluciones: [], reservasActivas: [], novedadesAbiertas: [], cajasCerradas: [], documentosConError: [] };
  for (const r of items) {
    const f = r.fields;
    const compradas = firstNumber(f[F.unidadesCompradas]);
    datos.items.push({
      id: r.id,
      sku: firstString(f[F.sku]),
      nombre: firstString(f[F.nombre]),
      categoria: firstString(f[F.categoria]),
      estado: firstString(f[F.estadoItem]),
      cantidad: firstNumber(f[F.cantidad]) ?? 0,
      compradas,
      recibido: firstBoolean(f[F.recibido]) === true,
      precio: firstNumber(f[F.precioVentaFinal]),
      tipoOperacion: firstString(f[F.tipoOperacion]),
      origen: firstString(f[F.origenArticulo]),
      fechaRegistro: firstString(f[F.fechaRegistro]) || r.createdTime || "",
      requierePago: firstBoolean(f[F.requierePago]) === true,
      esRegalo: firstBoolean(f[F.esRegalo]) === true,
      tienePago: linkedRecordIds(f[PAGOS_ITEM]).length + linkedRecordIds(f[PAGOS_REGALO]).length > 0,
      bajas: firstNumber(f[CAMPO_UNIDADES_DADAS_DE_BAJA]) ?? 0,
      vendidasFuera: firstNumber(f[CAMPO_VENDIDAS_FUERA]) ?? 0,
      salidasInternas: firstNumber(f[CAMPO_SALIDAS_INTERNAS]) ?? 0,
      ventasOtro: firstNumber(f[CAMPO_VENTAS_OTRO]) ?? 0,
    });
  }
  for (const r of facturas) {
    const f = r.fields;
    if (normalizeStatus(firstString(f["Ambiente"])) !== "produccion") continue;
    if (normalizeStatus(firstString(f["Estado Anulación"])) === "anulada") continue;
    datos.ventas.push(...lineasDeItems(lineasJson(f["Líneas JSON"]).detalles));
    if (firstString(f["Sincronización Inventario"]) === "ERROR") {
      datos.documentosConError.push({ tipo: "Factura", numero: firstString(f["Número de Factura"]), itemIds: linkedRecordIds(f["Shipping Items"]), error: firstString(f["Error Sincronización"]) });
    }
  }
  for (const r of recibos) {
    const f = r.fields;
    if (firstString(f["Estado"]) !== "Vigente") continue;
    datos.ventas.push(...lineasDeItems(lineasJson(f["Líneas JSON"]).lineas));
    if (firstString(f["Sincronización Inventario"]) === "ERROR") {
      datos.documentosConError.push({ tipo: "Recibo", numero: firstString(f["Número"]), itemIds: linkedRecordIds(f["Shipping Items"]), error: firstString(f["Error Inventario"]) });
    }
  }
  for (const r of notas) {
    const f = r.fields;
    if (normalizeStatus(firstString(f["Ambiente"])) === "pruebas") continue;
    const reverso = firstString(f["Reverso Inventario"]);
    if (reverso === "OK") datos.devoluciones.push(...lineasDeItems(lineasJson(f["Líneas JSON"]).detalles, true));
    if (reverso === "ERROR") {
      datos.documentosConError.push({ tipo: "Nota de crédito", numero: firstString(f["Número de Nota de Crédito"]), itemIds: linkedRecordIds(f["Shipping Items"]), error: firstString(f["Error Reverso"]) });
    }
  }
  for (const r of reservas) {
    datos.reservasActivas.push({ id: r.id, numero: firstString(r.fields["Número"]), fechaLimite: firstString(r.fields["Fecha Límite"]), itemId: linkedRecordIds(r.fields["Shipping Item"])[0] });
  }
  for (const r of novedades) {
    if (!isNovedadAbierta(firstString(r.fields["Estado Novedad"], "Abierta"))) continue;
    datos.novedadesAbiertas.push({
      id: r.id,
      codigo: firstString(r.fields["Novedad ID"]) || r.id,
      tipo: firstString(r.fields["Tipo de novedad"]),
      itemId: linkedRecordIds(r.fields["Item relacionado"])[0],
      ultimaActualizacion: firstString(r.fields["Última actualización"]) || firstString(r.fields["Fecha de registro"]) || r.createdTime || "",
    });
  }
  for (const r of cajas) {
    datos.cajasCerradas.push({ id: r.id, codigo: firstString(r.fields[SHIPPING_V2_PACKING_FIELDS.packingId]) || r.id, itemIds: linkedRecordIds(r.fields["Items incluidos"]) });
  }
  return datos;
}

function camposAsunto(a: AsuntoDetectado, ahora: string) {
  return {
    Asunto: a.sku ? `${a.sku} · ${a.asunto}` : a.asunto,
    Clave: a.clave,
    Tipo: a.tipo,
    SKU: a.sku,
    "Artículo": a.itemIds.filter((id) => id.startsWith("rec")).slice(0, 50),
    Detalle: a.detalle,
    Sugerencia: a.sugerencia,
    "Última revisión": ahora,
  };
}

async function mutarRevision(method: "POST" | "PATCH", records: Array<{ id?: string; fields: Record<string, unknown> }>) {
  for (let i = 0; i < records.length; i += 10) {
    await airtableMutation<AirtableMutationResponse>(tableUrl(TABLA_REVISION), { method, body: JSON.stringify({ records: records.slice(i, i + 10), typecast: false }) });
  }
}

/** "Revisar ahora" y el proceso de cada mañana. */
export async function revisarInventarioShippingV2(options: { actor: string }) {
  return withLock("revision-inventario", async () => {
    const [datos, registros] = await Promise.all([
      leerDatosRevision(),
      listRecords(TABLA_REVISION, { fields: ["Clave", "Estado", "Asunto", "Detalle", "Tipo"] }),
    ]);
    const guardados = registros.map(mapAsuntoRevision);
    const detectados = detectarAsuntos(datos, new Date());
    const plan = planSincronizacion(guardados, detectados);
    const ahora = new Date().toISOString();
    await mutarRevision("POST", plan.crear.map((a) => ({ fields: { ...camposAsunto(a, ahora), Estado: "Abierto", Detectado: ahora } })));
    await mutarRevision("PATCH", plan.renovar.map(({ id, asunto }) => ({ id, fields: camposAsunto(asunto, ahora) })));
    await mutarRevision("PATCH", plan.cerrar.map((id) => ({
      id,
      fields: { Estado: "Resuelto", "Resuelto por": `Sistema (${options.actor})`, "Fecha resuelto": ahora, Motivo: "Ya no aparece en la revisión." },
    })));
    return { nuevos: plan.crear.length, siguen: plan.renovar.length, resueltos: plan.cerrar.length, revisado: ahora };
  });
}

/** "Está bien" (con motivo) o "Resuelto" a mano. Volver a "Abierto" deshace. */
export async function resolverAsuntoRevisionShippingV2(
  id: string,
  input: { estado: EstadoAsunto; motivo: string },
  options: { actor: string }
): Promise<ShippingV2AsuntoRevision> {
  const recordId = cleanString(id);
  if (!recordId) throw new Error("Falta el asunto.");
  const motivo = cleanString(input.motivo);
  if (input.estado === "Está bien" && !motivo) throw new Error("Escribe el motivo.");
  const ahora = new Date().toISOString();
  const fields: Record<string, unknown> = input.estado === "Abierto"
    ? { Estado: "Abierto", "Resuelto por": "", "Fecha resuelto": null, Motivo: "" }
    : { Estado: input.estado, "Resuelto por": options.actor, "Fecha resuelto": ahora, Motivo: motivo };
  const respuesta = await airtableMutation<AirtableMutationResponse>(tableUrl(TABLA_REVISION), {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id: recordId, fields }] }),
  });
  const r = respuesta.records?.[0];
  if (!r) throw new Error("Airtable no devolvió el asunto.");
  return mapAsuntoRevision(r);
}

/**
 * Punto 10c-1 (mejora del dueño, 18-oct): después de corregir un artículo
 * desde Control, vuelve a revisar SOLO sus asuntos (y los que se pidan por id)
 * con los datos actuales: cierra los que ya no aparecen, renueva el texto de
 * los que siguen y crea los nuevos de ese artículo. Devuelve todos los
 * asuntos abiertos, para que la pantalla se ponga al día.
 */
export async function verificarAsuntosRevisionShippingV2(
  input: { itemIds: string[]; asuntoIds: string[] },
  options: { actor: string }
): Promise<{ abiertos: ShippingV2AsuntoRevision[]; resueltos: string[] }> {
  const itemIds = new Set(input.itemIds.map(cleanString).filter((id) => id.startsWith("rec")));
  const asuntoIds = new Set(input.asuntoIds.map(cleanString).filter((id) => id.startsWith("rec")));
  if (!itemIds.size && !asuntoIds.size) throw new Error("Nada que verificar.");
  const resueltos = await withLock("revision-inventario", async () => {
    const [datos, registros] = await Promise.all([leerDatosRevision(), listRecords(TABLA_REVISION)]);
    const guardados = registros.map(mapAsuntoRevision);
    const toca = (ids: string[]) => ids.some((id) => itemIds.has(id));
    const claves = new Set(guardados.filter((g) => asuntoIds.has(g.id) || (g.estado === "Abierto" && toca(g.itemIds))).map((g) => g.clave));
    const detectados = detectarAsuntos(datos, new Date()).filter((d) => claves.has(d.clave) || toca(d.itemIds));
    detectados.forEach((d) => claves.add(d.clave));
    const plan = planSincronizacion(guardados.filter((g) => claves.has(g.clave)), detectados);
    const ahora = new Date().toISOString();
    await mutarRevision("POST", plan.crear.map((a) => ({ fields: { ...camposAsunto(a, ahora), Estado: "Abierto", Detectado: ahora } })));
    await mutarRevision("PATCH", plan.renovar.map(({ id, asunto }) => ({ id, fields: camposAsunto(asunto, ahora) })));
    await mutarRevision("PATCH", plan.cerrar.map((id) => ({
      id,
      fields: { Estado: "Resuelto", "Resuelto por": options.actor, "Fecha resuelto": ahora, Motivo: "Corregido · verificado por el sistema al guardar." },
    })));
    return plan.cerrar;
  });
  return { abiertos: await getShippingV2AsuntosRevision(), resueltos };
}

// ─── Punto 10c-2: conteo físico ──────────────────────────────────────────────

const TABLA_CONTEOS = "Shipping Conteos";
const TABLA_CONTEO_LINEAS = "Shipping Conteo líneas";

export type EstadoConteo = "Contando" | "Terminado" | "Aplicado" | "Cancelado";

export type ShippingV2Conteo = {
  id: string;
  nombre: string;
  categorias: string[];
  incluyeActivos: boolean;
  estado: EstadoConteo;
  recontar: string[];
  creadoPor: string;
  inicio: string;
  terminadoPor: string;
  fin: string;
  aplicadoPor: string;
  fechaAplicado: string;
  resumen: string;
  foto: FotoConteo | null;
};

function lineasTexto(valor: unknown) {
  return firstString(valor).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function mapConteo(r: AirtableRecord): ShippingV2Conteo {
  const f = r.fields;
  const estado = firstString(f["Estado"], "Contando");
  let foto: FotoConteo | null = null;
  try {
    const crudo = firstString(f["Foto inicial"]);
    if (crudo) foto = JSON.parse(crudo) as FotoConteo;
  } catch {
    foto = null;
  }
  return {
    id: r.id,
    nombre: firstString(f["Conteo"]),
    categorias: lineasTexto(f["Categorías"]),
    incluyeActivos: firstBoolean(f["Incluye activos"]) === true,
    estado: (["Contando", "Terminado", "Aplicado", "Cancelado"].includes(estado) ? estado : "Contando") as EstadoConteo,
    recontar: lineasTexto(f["Recontar"]),
    creadoPor: firstString(f["Creado por"]),
    inicio: firstString(f["Inicio"]) || r.createdTime || "",
    terminadoPor: firstString(f["Terminado por"]),
    fin: firstString(f["Fin"]),
    aplicadoPor: firstString(f["Aplicado por"]),
    fechaAplicado: firstString(f["Fecha aplicado"]),
    resumen: firstString(f["Resumen"]),
    foto,
  };
}

function mapLineaConteo(r: AirtableRecord): LineaConteo {
  const f = r.fields;
  const tipo = firstString(f["Tipo"], "Unidad");
  return {
    id: r.id,
    codigo: firstString(f["Código leído"]),
    itemId: linkedRecordIds(f["Artículo"])[0],
    sku: firstString(f["SKU"]),
    serie: firstString(f["Serie"]),
    cantidad: firstNumber(f["Cantidad"]) ?? 1,
    tipo: (["Unidad", "Sin identificar", "Lote", "Sin registro"].includes(tipo) ? tipo : "Unidad") as LineaConteo["tipo"],
    contadoPor: firstString(f["Contado por"]),
    fecha: firstString(f["Fecha"]) || r.createdTime || "",
    anulada: firstBoolean(f["Anulada"]) === true,
  };
}

/** Todos los artículos, con lo justo para contar (el lector reconoce también lo vendido). */
export async function getShippingV2ItemsParaConteo(): Promise<ItemConteo[]> {
  const F = SHIPPING_V2_ITEM_FIELDS;
  const registros = await listRecords(SHIPPING_V2_TABLES.items, {
    fields: [F.sku, F.nombre, F.categoria, F.estadoItem, F.cantidad, F.recibido, F.esUsoLocal, F.seguimiento, F.numeroSerie, F.costoTotalUnidad, F.costoProveedor, F.ultimaActualizacion, CAMPO_SKUS_ANTERIORES],
  });
  return registros
    .map((r) => {
      const f = r.fields;
      return {
        id: r.id,
        sku: firstString(f[F.sku]),
        nombre: firstString(f[F.nombre]),
        categoria: firstString(f[F.categoria]),
        estado: firstString(f[F.estadoItem]),
        cantidad: firstNumber(f[F.cantidad]) ?? 0,
        recibido: firstBoolean(f[F.recibido]) === true,
        usoLocal: firstBoolean(f[F.esUsoLocal]) === true,
        seguimiento: firstString(f[F.seguimiento]),
        numeroSerie: firstString(f[F.numeroSerie]),
        costoUnidad: firstNumber(f[F.costoTotalUnidad]) ?? firstNumber(f[F.costoProveedor]),
        ultimaActualizacion: firstString(f[F.ultimaActualizacion]) || r.createdTime || "",
        skusAnteriores: lineasTexto(f[CAMPO_SKUS_ANTERIORES]),
      } satisfies ItemConteo;
    })
    .filter((i) => i.sku);
}

export async function getShippingV2Conteos(): Promise<ShippingV2Conteo[]> {
  const registros = await listRecords(TABLA_CONTEOS, {
    fields: ["Conteo", "Categorías", "Incluye activos", "Estado", "Recontar", "Creado por", "Inicio", "Terminado por", "Fin", "Aplicado por", "Fecha aplicado"],
    sortField: "Inicio",
    sortDirection: "desc",
    maxRecords: 40,
  });
  return registros.map(mapConteo);
}

async function leerConteo(id: string): Promise<ShippingV2Conteo> {
  const recordId = cleanString(id);
  if (!recordId.startsWith("rec")) throw new Error("Conteo no válido.");
  const [r] = await listRecordsByIds(TABLA_CONTEOS, [recordId]);
  if (!r) throw new Error("No se encontró el conteo.");
  return mapConteo(r);
}

export async function getShippingV2LineasConteo(conteoId: string): Promise<LineaConteo[]> {
  const registros = await listRecords(TABLA_CONTEO_LINEAS, {
    filterByFormula: `{Conteo ID} = '${escapeFormulaString(cleanString(conteoId))}'`,
    sortField: "Fecha",
    sortDirection: "desc",
  });
  return registros.map(mapLineaConteo);
}

export async function getShippingV2Conteo(id: string) {
  const conteo = await leerConteo(id);
  const lineas = await getShippingV2LineasConteo(conteo.id);
  return { conteo, lineas };
}

export async function crearConteoShippingV2(
  input: { nombre: string; categorias: string[]; incluyeActivos: boolean },
  options: { actor: string }
): Promise<ShippingV2Conteo> {
  const categorias = Array.from(new Set(input.categorias.map(cleanString).filter(Boolean)));
  const alcance: AlcanceConteo = { categorias, incluyeActivos: input.incluyeActivos === true };
  const items = await getShippingV2ItemsParaConteo();
  const foto = fotoInicial(items, alcance);
  if (!Object.keys(foto).length) throw new Error("No hay nada en la tienda con esas categorías.");
  const ahora = new Date().toISOString();
  const nombre = cleanString(input.nombre) || `${categorias.length ? categorias.join(", ") : "Todo"} · ${ahora.slice(0, 10)}`;
  const respuesta = await airtableMutation<AirtableMutationResponse>(tableUrl(TABLA_CONTEOS), {
    method: "POST",
    body: JSON.stringify({
      records: [{
        fields: {
          Conteo: nombre,
          "Categorías": categorias.join("\n"),
          "Incluye activos": alcance.incluyeActivos,
          Estado: "Contando",
          "Creado por": options.actor,
          Inicio: ahora,
          "Foto inicial": JSON.stringify(foto),
        },
      }],
    }),
  });
  const r = respuesta.records?.[0];
  if (!r) throw new Error("Airtable no devolvió el conteo.");
  return mapConteo(r);
}

export type LecturaNueva = { codigo: string; itemId?: string; sku: string; serie?: string; cantidad: number; tipo: LineaConteo["tipo"] };

/** Una lectura (escaneo o ingreso manual). Devuelve todas las lecturas del conteo (otros pueden estar contando a la vez). */
export async function agregarLecturaConteoShippingV2(conteoId: string, lectura: LecturaNueva, options: { actor: string }): Promise<LineaConteo[]> {
  const conteo = await leerConteo(conteoId);
  if (conteo.estado !== "Contando") throw new Error("Este conteo ya terminó.");
  const cantidad = Math.trunc(Number(lectura.cantidad));
  // 0 = "lo conté y no hay" (10c-4): solo para un lote o un conteo sin identificar.
  const ceroValido = cantidad === 0 && (lectura.tipo === "Lote" || lectura.tipo === "Sin identificar");
  if (!Number.isFinite(cantidad) || (cantidad === 0 && !ceroValido) || Math.abs(cantidad) > 999) throw new Error("Cantidad no válida.");
  if (lectura.tipo !== "Lote" && cantidad < 0) throw new Error("Cantidad no válida.");
  const itemId = cleanString(lectura.itemId);
  await airtableMutation<AirtableMutationResponse>(tableUrl(TABLA_CONTEO_LINEAS), {
    method: "POST",
    body: JSON.stringify({
      records: [{
        fields: {
          "Código leído": cleanString(lectura.codigo).slice(0, 120) || cleanString(lectura.sku),
          Conteo: [conteo.id],
          "Conteo ID": conteo.id,
          "Artículo": itemId.startsWith("rec") ? [itemId] : [],
          SKU: cleanString(lectura.sku).toUpperCase(),
          Serie: cleanString(lectura.serie),
          Cantidad: cantidad,
          Tipo: lectura.tipo,
          "Contado por": options.actor,
          Fecha: new Date().toISOString(),
        },
      }],
    }),
  });
  return getShippingV2LineasConteo(conteo.id);
}

export async function anularLecturaConteoShippingV2(conteoId: string, lineaId: string): Promise<LineaConteo[]> {
  const conteo = await leerConteo(conteoId);
  if (conteo.estado !== "Contando") throw new Error("Este conteo ya terminó.");
  const id = cleanString(lineaId);
  if (!id.startsWith("rec")) throw new Error("Lectura no válida.");
  await airtableMutation<AirtableMutationResponse>(tableUrl(TABLA_CONTEO_LINEAS), {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id, fields: { Anulada: true } }] }),
  });
  return getShippingV2LineasConteo(conteo.id);
}

/** Terminar, mandar a recontar (vuelve a "Contando" sin lo de esos SKU) o cancelar. */
export async function cambiarEstadoConteoShippingV2(
  conteoId: string,
  input: { accion: "terminar" | "recontar" | "cancelar"; skus?: string[] },
  options: { actor: string; esAdministrador: boolean }
): Promise<ShippingV2Conteo> {
  return withLock(`conteo:${cleanString(conteoId)}`, async () => {
    const conteo = await leerConteo(conteoId);
    if (conteo.estado === "Aplicado" || conteo.estado === "Cancelado") throw new Error("Este conteo ya está cerrado.");
    const ahora = new Date().toISOString();
    let fields: Record<string, unknown>;
    if (input.accion === "terminar") {
      if (conteo.estado !== "Contando") throw new Error("Este conteo ya terminó.");
      fields = { Estado: "Terminado", "Terminado por": options.actor, Fin: ahora };
    } else if (input.accion === "cancelar") {
      if (!options.esAdministrador && conteo.creadoPor !== options.actor) throw new Error("Solo quien lo empezó o el Administrador lo cancela.");
      fields = { Estado: "Cancelado", "Terminado por": options.actor, Fin: ahora };
    } else {
      const skus = Array.from(new Set((input.skus ?? []).map((s) => cleanString(s).toUpperCase()).filter(Boolean)));
      if (!skus.length) throw new Error("Elige qué recontar.");
      const lineas = await getShippingV2LineasConteo(conteo.id);
      const anular = lineas.filter((l) => !l.anulada && skus.includes((l.sku || "").toUpperCase()));
      for (let i = 0; i < anular.length; i += 10) {
        await airtableMutation<AirtableMutationResponse>(tableUrl(TABLA_CONTEO_LINEAS), {
          method: "PATCH",
          body: JSON.stringify({ records: anular.slice(i, i + 10).map((l) => ({ id: l.id, fields: { Anulada: true } })) }),
        });
      }
      fields = { Estado: "Contando", Recontar: skus.join("\n"), "Terminado por": "", Fin: null };
    }
    const respuesta = await airtableMutation<AirtableMutationResponse>(tableUrl(TABLA_CONTEOS), {
      method: "PATCH",
      body: JSON.stringify({ records: [{ id: conteo.id, fields }] }),
    });
    const r = respuesta.records?.[0];
    if (!r) throw new Error("Airtable no devolvió el conteo.");
    return mapConteo(r);
  });
}

/** La comparación del conteo terminado (mientras se cuenta, la pantalla compara sola). */
export async function revisarConteoShippingV2(conteoId: string) {
  const { conteo, lineas } = await getShippingV2Conteo(conteoId);
  if (conteo.estado === "Contando") throw new Error("El conteo sigue abierto.");
  const items = await getShippingV2ItemsParaConteo();
  const resultado = compararConteo({
    items,
    lineas,
    alcance: { categorias: conteo.categorias, incluyeActivos: conteo.incluyeActivos },
    inicio: conteo.inicio,
    foto: conteo.foto,
  });
  return { conteo, lineas, resultado };
}

// 10c-2b: aplicar los ajustes del conteo (solo Administrador).

export type ResultadoAjusteConteo = { sku: string; lado: "falta" | "sobra"; accion: AccionAjuste; ok: boolean; texto: string; valor: number };

function dineroResumen(v: number) {
  return `${v < 0 ? "−" : v > 0 ? "+" : ""}$${Math.abs(v).toFixed(2).replace(".", ",")}`;
}

/**
 * Aplica lo que eligió el Administrador para cada diferencia. Usa las mismas
 * acciones de la ficha (dar de baja / revertir una baja), así que cada cambio
 * queda en el historial del artículo con su motivo y se puede revertir.
 * Se compara de nuevo antes de aplicar: lo que cambió desde que se terminó el
 * conteo no se toca (y nada se aplica dos veces). Si todo salió bien, el
 * conteo queda "Aplicado"; si algo falló, sigue "Terminado" para reintentar.
 */
export async function aplicarConteoShippingV2(
  conteoId: string,
  decisiones: DecisionAjuste[],
  options: { actor: string; access: ShippingV2AccessContext }
): Promise<{ conteo: ShippingV2Conteo; resultados: ResultadoAjusteConteo[] }> {
  if (options.access.isSiteAdmin !== true) throw new Error("Solo el Administrador aplica los ajustes.");
  if (!decisiones.length) throw new Error("Elige qué hacer con al menos una diferencia.");
  return withLock(`conteo:${cleanString(conteoId)}`, async () => {
    const { conteo, resultado } = await revisarConteoShippingV2(conteoId);
    if (conteo.estado !== "Terminado") throw new Error(conteo.estado === "Aplicado" ? "Este conteo ya se aplicó." : "Primero hay que terminar el conteo.");
    const resultados: ResultadoAjusteConteo[] = [];
    for (const p of planAjustes(resultado, decisiones)) {
      const r = { sku: p.sku, lado: p.lado, accion: p.accion };
      if (p.error) {
        resultados.push({ ...r, ok: false, texto: p.error, valor: 0 });
        continue;
      }
      const motivo = `Conteo "${conteo.nombre}": ${MOTIVO_AJUSTE[p.accion].toLowerCase()}`;
      const total = p.operaciones.reduce((s, o) => s + o.cantidad, 0);
      let hechas = 0;
      try {
        for (const op of p.operaciones) {
          if (op.accion === "baja") {
            await moverActivoShippingV2(op.itemId, { accion: "baja", cantidad: op.cantidad, motivo }, options);
            hechas += op.cantidad;
            continue;
          }
          if (op.accion === "sumar") {
            await sumarEncontradasShippingV2(op.itemId, op.cantidad, motivo, options);
            hechas += op.cantidad;
            continue;
          }
          let resta = op.cantidad;
          for (const id of [op.itemId, ...(op.alternativas ?? [])]) {
            if (resta <= 0) break;
            const registro = await leerRegistroItem(id);
            const n = Math.min(resta, firstNumber(registro.fields[CAMPO_UNIDADES_DADAS_DE_BAJA]) ?? 0);
            if (n < 1) continue;
            await moverActivoShippingV2(id, { accion: "revertir-baja", cantidad: n, motivo }, options);
            resta -= n;
            hechas += n;
          }
          if (resta > 0) throw new Error("No hay más bajas que revertir: lo demás regístralo con + Registrar compra.");
        }
        resultados.push({ ...r, ok: true, texto: p.texto, valor: p.valor });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "No se pudo aplicar.";
        resultados.push({ ...r, ok: false, texto: hechas ? `Se aplicaron ${hechas} de ${total}. ${msg}` : msg, valor: 0 });
      }
    }

    const hechos = resultados.filter((x) => x.ok);
    const errores = resultados.length - hechos.length;
    if (!hechos.length) return { conteo, resultados };
    const ahora = new Date().toISOString();
    const lineasResumen = hechos.map((x) => `${x.sku} · ${MOTIVO_AJUSTE[x.accion]}${x.valor ? ` · ${dineroResumen(x.valor)}` : ""}`);
    const valor = hechos.reduce((s, x) => s + x.valor, 0);
    const cabecera = `${hechos.length} ajuste${hechos.length > 1 ? "s" : ""} · ${dineroResumen(valor)} · ${options.actor}${errores ? ` · ${errores} sin aplicar` : ""}`;
    const resumen = [conteo.resumen, cabecera, ...lineasResumen].filter(Boolean).join("\n");
    const respuesta = await airtableMutation<AirtableMutationResponse>(tableUrl(TABLA_CONTEOS), {
      method: "PATCH",
      body: JSON.stringify({
        records: [{
          id: conteo.id,
          fields: { Resumen: resumen, ...(errores ? {} : { Estado: "Aplicado", "Aplicado por": options.actor, "Fecha aplicado": ahora }) },
        }],
      }),
    });
    const actualizado = respuesta.records?.[0];
    return { conteo: actualizado ? mapConteo(actualizado) : conteo, resultados };
  });
}

/** Cuánto hay en la tienda por categoría (para elegir qué contar). */
export async function getShippingV2ResumenParaConteo() {
  const items = await getShippingV2ItemsParaConteo();
  const porCategoria = new Map<string, number>();
  let activos = 0;
  for (const i of items) {
    if (!entraEnConteo(i, { categorias: [], incluyeActivos: true })) continue;
    if (i.usoLocal) { activos++; continue; }
    const c = i.categoria || "Sin categoría";
    porCategoria.set(c, (porCategoria.get(c) ?? 0) + (esUnidad(i) ? 1 : i.cantidad));
  }
  return { categorias: Array.from(porCategoria.entries()).sort((a, b) => b[1] - a[1]).map(([nombre, cantidad]) => ({ nombre, cantidad })), activos };
}


// ─── Fusionar SKU y cambios de código (punto 10c-3, 21-oct-2026) ────────────
// Reglas en fusion.ts. Cada registro de los productos absorbidos pasa al SKU
// principal con sus propios costos, compra, caja y documentos (todo se enlaza
// al registro, no al texto del SKU). El código viejo queda en "SKUs
// anteriores": el buscador, el conteo y la facturación lo siguen
// reconociendo hasta que se reimprima la etiqueta. Cada SKU absorbido deja un
// registro en "Shipping Cambios de código".

const CAMPO_SKUS_ANTERIORES = "SKUs anteriores";
const TABLA_CAMBIOS_CODIGO = "Shipping Cambios de código";

export type ShippingV2CambioCodigo = {
  id: string;
  antes: string;
  ahora: string;
  motivo: string;
  detalle: string;
  itemIds: string[];
  registros: number;
  enTienda: number;
  anuncios: number;
  etiquetaReimpresa: boolean;
  anunciosCorregidos: boolean;
  hechoPor: string;
  fecha: string;
  marcadoPor: string;
  /** Lo que está HOY en la tienda con este código (una etiqueta por registro; un lote se imprime N veces). */
  porEtiquetar: Array<{ id: string; serie: string; cantidad: number }>;
};

function mapCambioCodigo(r: AirtableRecord): ShippingV2CambioCodigo {
  const f = r.fields;
  return {
    id: r.id,
    antes: firstString(f["Antes"]),
    ahora: firstString(f["Ahora"]),
    motivo: firstString(f["Motivo"]),
    detalle: firstString(f["Detalle"]),
    itemIds: linkedRecordIds(f["Artículos"]),
    registros: firstNumber(f["Registros"]) ?? 0,
    enTienda: firstNumber(f["En tienda"]) ?? 0,
    anuncios: firstNumber(f["Anuncios"]) ?? 0,
    etiquetaReimpresa: firstBoolean(f["Etiqueta reimpresa"]) === true,
    anunciosCorregidos: firstBoolean(f["Anuncios corregidos"]) === true,
    hechoPor: firstString(f["Hecho por"]),
    fecha: firstString(f["Fecha"]) || r.createdTime || "",
    marcadoPor: firstString(f["Marcado por"]),
    porEtiquetar: [],
  };
}

/** ¿Le falta algo? Etiqueta por reimprimir (si hay en tienda) o anuncios por corregir. */
export function cambioCodigoPendiente(c: Pick<ShippingV2CambioCodigo, "enTienda" | "etiquetaReimpresa" | "anuncios" | "anunciosCorregidos">) {
  return (c.enTienda > 0 && !c.etiquetaReimpresa) || (c.anuncios > 0 && !c.anunciosCorregidos);
}

export async function getShippingV2CambiosCodigo(): Promise<ShippingV2CambioCodigo[]> {
  const registros = await listRecords(TABLA_CAMBIOS_CODIGO, { sortField: "Fecha", sortDirection: "desc" });
  const cambios = registros.map(mapCambioCodigo);
  // Para "Imprimir etiqueta": qué registros de cada cambio siguen en la tienda.
  const ids = Array.from(new Set(cambios.flatMap((c) => c.itemIds)));
  if (!ids.length) return cambios;
  const F = SHIPPING_V2_ITEM_FIELDS;
  const items = new Map<string, AirtableRecord>();
  for (let i = 0; i < ids.length; i += 50) {
    try {
      for (const r of await listRecordsByIds(SHIPPING_V2_TABLES.items, ids.slice(i, i + 50))) items.set(r.id, r);
    } catch (error) {
      console.warn("No se pudieron leer los artículos de los cambios de código:", error);
    }
  }
  return cambios.map((c) => ({
    ...c,
    porEtiquetar: c.itemIds.flatMap((id) => {
      const r = items.get(id);
      if (!r) return [];
      const f = r.fields;
      const enTienda = registroEnTienda({ recibido: firstBoolean(f[F.recibido]) === true, cantidad: firstNumber(f[F.cantidad]) ?? 0, estado: firstString(f[F.estadoItem]) });
      return enTienda ? [{ id, serie: firstString(f[F.numeroSerie]), cantidad: firstNumber(f[F.cantidad]) ?? 1 }] : [];
    }),
  }));
}

export async function contarCambiosCodigoPendientes(): Promise<number> {
  return (await getShippingV2CambiosCodigo()).filter(cambioCodigoPendiente).length;
}

export async function marcarCambioCodigoShippingV2(
  id: string,
  input: { etiquetaReimpresa?: boolean; anunciosCorregidos?: boolean },
  options: { actor: string }
): Promise<ShippingV2CambioCodigo> {
  const recordId = cleanString(id);
  if (!recordId.startsWith("rec")) throw new Error("Cambio no válido.");
  const fields: Record<string, unknown> = { "Marcado por": options.actor };
  if (typeof input.etiquetaReimpresa === "boolean") fields["Etiqueta reimpresa"] = input.etiquetaReimpresa;
  if (typeof input.anunciosCorregidos === "boolean") fields["Anuncios corregidos"] = input.anunciosCorregidos;
  const respuesta = await airtableMutation<AirtableMutationResponse>(tableUrl(TABLA_CAMBIOS_CODIGO), {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id: recordId, fields }] }),
  });
  const r = respuesta.records?.[0];
  if (!r) throw new Error("Airtable no devolvió el cambio.");
  return mapCambioCodigo(r);
}

function formulaSkus(campo: string, skus: string[]) {
  return `OR(${skus.map((s) => `UPPER({${campo}}) = '${escapeFormulaString(s)}'`).join(",")})`;
}

async function leerRegistrosFusion(skus: string[]): Promise<RegistroFusion[]> {
  const F = SHIPPING_V2_ITEM_FIELDS;
  const registros = await listRecords(SHIPPING_V2_TABLES.items, {
    filterByFormula: formulaSkus(F.sku, skus),
    fields: [F.sku, F.nombre, F.categoria, F.estadoItem, F.cantidad, F.recibido, F.esUsoLocal, F.seguimiento, F.condicion, F.numeroSerie,
      F.precioVentaFinal, F.costoTotalUnidad, F.costoProveedor, F.ultimaActualizacion, "Factura", "Recibo", CAMPO_SKUS_ANTERIORES],
  });
  return registros.map((r) => {
    const f = r.fields;
    return {
      id: r.id,
      sku: normalSku(firstString(f[F.sku])),
      nombre: firstString(f[F.nombre]),
      categoria: firstString(f[F.categoria]),
      estado: firstString(f[F.estadoItem]),
      cantidad: firstNumber(f[F.cantidad]) ?? 0,
      recibido: firstBoolean(f[F.recibido]) === true,
      usoLocal: firstBoolean(f[F.esUsoLocal]) === true,
      seguimiento: firstString(f[F.seguimiento]),
      condicion: firstString(f[F.condicion]),
      numeroSerie: firstString(f[F.numeroSerie]),
      precio: firstNumber(f[F.precioVentaFinal]),
      costoUnidad: firstNumber(f[F.costoTotalUnidad]) ?? firstNumber(f[F.costoProveedor]),
      documentos: linkedRecordIds(f["Factura"]).length + linkedRecordIds(f["Recibo"]).length,
      skusAnteriores: lineasTexto(f[CAMPO_SKUS_ANTERIORES]),
      ultimaActualizacion: firstString(f[F.ultimaActualizacion]) || r.createdTime || "",
    };
  });
}

async function contarAnunciosPorSku(skus: string[]): Promise<Map<string, AirtableRecord[]>> {
  const registros = await listRecords(TABLA_PUBLICACIONES, { filterByFormula: formulaSkus("SKU", skus), fields: ["SKU", "Estado"] });
  const mapa = new Map<string, AirtableRecord[]>();
  for (const r of registros) {
    if (normalizeStatus(firstString(r.fields["Estado"])) === "retirado") continue;
    const sku = normalSku(firstString(r.fields["SKU"]));
    mapa.set(sku, [...(mapa.get(sku) ?? []), r]);
  }
  return mapa;
}

function skusValidos(skus: string[]) {
  const lista = Array.from(new Set(skus.map(normalSku).filter((s) => /^[A-Z0-9][A-Z0-9-]{2,40}$/.test(s))));
  if (lista.length > 10) throw new Error("Máximo 10 productos por fusión.");
  return lista;
}

export type VistaFusion = {
  productos: Array<Omit<ProductoFusion, "registros"> & { registros: number; anuncios: number; estados: string[] }>;
  noEncontrados: string[];
  principal: string;
  plan: { ok: true; registros: number; etiquetas: number; avisos: string[] } | { ok: false; motivo: string } | null;
};

/** Lo que se va a fusionar, para mostrarlo antes de confirmar. */
export async function getShippingV2Fusion(skusEntrada: string[], principalEntrada?: string): Promise<VistaFusion> {
  const skus = skusValidos(skusEntrada);
  if (!skus.length) return { productos: [], noEncontrados: [], principal: "", plan: null };
  const [registros, anuncios] = await Promise.all([leerRegistrosFusion(skus), contarAnunciosPorSku(skus)]);
  const productos = agruparProductos(registros);
  const encontrados = new Set(productos.map((p) => p.sku));
  const principal = principalEntrada && encontrados.has(normalSku(principalEntrada)) ? normalSku(principalEntrada) : sugerirPrincipal(productos);
  const plan = productos.length >= 2 ? planFusion(productos, principal) : null;
  return {
    productos: productos.map((p) => ({
      ...p,
      registros: p.registros.length,
      anuncios: anuncios.get(p.sku)?.length ?? 0,
      estados: Array.from(new Set(p.registros.map((r) => r.estado).filter(Boolean))),
    })),
    noEncontrados: skus.filter((s) => !encontrados.has(s)),
    principal,
    plan: plan ? (plan.ok ? { ok: true, registros: plan.cambios.length, etiquetas: plan.etiquetas, avisos: plan.avisos } : plan) : null,
  };
}

export type ResultadoFusion = { principal: string; movidos: number; etiquetas: number; anuncios: number; cambios: ShippingV2CambioCodigo[] };

/** Fusiona (solo Administrador). Se hace SKU por SKU: si algo falla, lo ya hecho queda completo y se puede volver a intentar. */
export async function fusionarSkuShippingV2(
  input: { skus: string[]; principal: string },
  options: { actor: string; access: ShippingV2AccessContext }
): Promise<ResultadoFusion> {
  if (options.access.isSiteAdmin !== true) throw new Error("Solo el Administrador fusiona SKU.");
  const skus = skusValidos(input.skus);
  return withLock("fusion-sku", async () => {
    const productos = agruparProductos(await leerRegistrosFusion(skus));
    const faltan = skus.filter((s) => !productos.some((p) => p.sku === s));
    if (faltan.length) throw new Error(`No se encontró ${faltan.join(", ")}.`);
    const plan = planFusion(productos, input.principal);
    if (!plan.ok) throw new Error(plan.motivo);
    const F = SHIPPING_V2_ITEM_FIELDS;
    const anuncios = await contarAnunciosPorSku(plan.absorbidos.map((p) => p.sku));
    const resultado: ResultadoFusion = { principal: plan.principal.sku, movidos: 0, etiquetas: 0, anuncios: 0, cambios: [] };
    const ahora = new Date().toISOString();

    for (const absorbido of plan.absorbidos) {
      const cambios = plan.cambios.filter((c) => c.skuAntes === absorbido.sku);
      // 1. Los registros pasan al SKU principal (de 10 en 10).
      for (let i = 0; i < cambios.length; i += 10) {
        await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
          method: "PATCH",
          body: JSON.stringify({
            typecast: true,
            records: cambios.slice(i, i + 10).map((c) => ({
              id: c.id,
              fields: compactFields({
                [F.sku]: c.campos.sku,
                [CAMPO_SKUS_ANTERIORES]: c.campos.skusAnteriores.join("\n"),
                [F.categoria]: c.campos.categoria,
                [F.nombre]: c.campos.nombre,
                [F.precioVentaFinal]: c.campos.precio,
                [F.seguimiento]: c.campos.seguimiento,
                [F.ultimaActualizacion]: ahora,
                [F.actualizadoPor]: options.actor,
              }),
            })),
          }),
        });
      }
      // 2. Historial de cada registro.
      for (const c of cambios) {
        const registro = absorbido.registros.find((r) => r.id === c.id);
        await createShippingV2Event({
          action: "Actualizado",
          itemRecordId: c.id,
          itemName: registro?.nombre,
          registradoPor: options.actor,
          descripcion: `Fusión de SKU: ${absorbido.sku} → ${plan.principal.sku}. ${c.enTienda ? "Toma nombre, categoría y precio del principal; conserva su costo, compra y caja." : "Ya no estaba en la tienda: solo cambia el código (su venta y documentos no cambian)."}`,
          estadoAnterior: absorbido.sku,
          estadoNuevo: plan.principal.sku,
        }).catch((error) => console.error("No se pudo registrar el evento de la fusión:", error));
      }
      // 3. Los anuncios del SKU viejo pasan al principal (hay que corregir el texto en cada canal).
      const anunciosSku = anuncios.get(absorbido.sku) ?? [];
      for (let i = 0; i < anunciosSku.length; i += 10) {
        await airtableMutation<AirtableMutationResponse>(tableUrl(TABLA_PUBLICACIONES), {
          method: "PATCH",
          body: JSON.stringify({ records: anunciosSku.slice(i, i + 10).map((r) => ({ id: r.id, fields: { SKU: plan.principal.sku } })) }),
        });
      }
      // 4. El reporte "Cambios de código".
      const enTienda = cambios.filter((c) => c.enTienda).length;
      const respuesta = await airtableMutation<AirtableMutationResponse>(tableUrl(TABLA_CAMBIOS_CODIGO), {
        method: "POST",
        body: JSON.stringify({
          typecast: true,
          records: [{
            fields: {
              Cambio: `${absorbido.sku} → ${plan.principal.sku}`,
              Antes: absorbido.sku,
              Ahora: plan.principal.sku,
              Motivo: "Fusión",
              Detalle: `${absorbido.nombre} → ${plan.principal.nombre}. ${cambios.length} registro(s)${enTienda ? `, ${enTienda} en la tienda` : ", ninguno en la tienda"}.`,
              "Artículos": cambios.map((c) => c.id),
              Registros: cambios.length,
              "En tienda": enTienda,
              Anuncios: anunciosSku.length,
              "Hecho por": options.actor,
              Fecha: ahora,
            },
          }],
        }),
      });
      const creado = respuesta.records?.[0];
      if (creado) resultado.cambios.push(mapCambioCodigo(creado));
      resultado.movidos += cambios.length;
      resultado.etiquetas += enTienda;
      resultado.anuncios += anunciosSku.length;
    }
    invalidateShippingV2ItemSearchIndexCache();
    // Los "Posible duplicado" de estos artículos se revisan de nuevo.
    await verificarAsuntosRevisionShippingV2(
      { itemIds: productos.flatMap((p) => p.registros.map((r) => r.id)), asuntoIds: [] },
      { actor: options.actor }
    ).catch((error) => console.error("No se pudo verificar la revisión tras la fusión:", error));
    return resultado;
  });
}


// ─── Cuadrar unidades desde Revisión (punto 10c-4, 22-oct-2026) ─────────────
// Reglas en cuadre.ts. El Staff anota cuántas hay en la tienda; el
// Administrador aplica: corrige el stock y explica la diferencia con una
// causa fija (cada una escribe su campo), siempre con motivo. Todo queda en
// el historial del artículo.

const CAMPO_VENDIDAS_FUERA = "Vendidas fuera del sistema";
const CAMPO_SALIDAS_INTERNAS = "Salidas internas";
const CAMPO_VENTAS_OTRO = "Ventas de otro artículo";

/** El Staff (o quien sea) anota lo contado en el asunto; no cambia el stock. */
export async function anotarConteoAsuntoShippingV2(asuntoId: string, n: number, options: { actor: string }): Promise<ShippingV2AsuntoRevision> {
  const id = cleanString(asuntoId);
  if (!id.startsWith("rec")) throw new Error("Asunto no válido.");
  const cantidad = Number(n);
  if (!Number.isInteger(cantidad) || cantidad < 0 || cantidad > 9999) throw new Error("Escribe cuántas hay (un número entero).");
  const respuesta = await airtableMutation<AirtableMutationResponse>(tableUrl(TABLA_REVISION), {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id, fields: { Contado: cantidad, "Contado por": options.actor, "Fecha conteo": new Date().toISOString() } }] }),
  });
  const r = respuesta.records?.[0];
  if (!r) throw new Error("Airtable no devolvió el asunto.");
  return mapAsuntoRevision(r);
}

export type CuadreItem = {
  datos: DatosCuadre;
  estado: string;
  sku: string;
  nombre: string;
};

async function leerCuadreItem(itemId: string): Promise<CuadreItem & { usoLocal: boolean; requiereInspeccion: boolean; inspeccionFirmada: boolean }> {
  const id = cleanString(itemId);
  if (!id.startsWith("rec")) throw new Error("Artículo no válido.");
  const [revision, item] = await Promise.all([leerDatosRevision(), getShippingV2ItemById(id, { includeAiName: false, access: systemShippingV2Access() })]);
  const r = revision.items.find((x) => x.id === id);
  if (!r) throw new Error("No se encontró el artículo.");
  const suma = (lineas: Array<{ itemId: string; cantidad: number }>) => lineas.filter((l) => l.itemId === id).reduce((s, l) => s + l.cantidad, 0);
  return {
    datos: {
      compradas: r.compradas,
      tienda: r.cantidad,
      reservadas: Number(item.cantidadReservada) || 0,
      vendidas: suma(revision.ventas) - suma(revision.devoluciones),
      bajas: r.bajas ?? 0,
      fuera: r.vendidasFuera ?? 0,
      salidas: r.salidasInternas ?? 0,
      otro: r.ventasOtro ?? 0,
      unidad: seguimientoDe({ seguimiento: item.seguimiento, categoria: item.categoria }) === "Unidad",
    },
    estado: r.estado,
    sku: r.sku,
    nombre: r.nombre,
    usoLocal: item.usoLocal === true,
    requiereInspeccion: item.requiereInspeccion === true,
    inspeccionFirmada: item.revisadoFisicamente === true,
  };
}

/** Para el panel "Cuadrar": los números actuales del registro. */
export async function getShippingV2CuadreItem(itemId: string): Promise<CuadreItem> {
  const { datos, estado, sku, nombre } = await leerCuadreItem(itemId);
  return { datos, estado, sku, nombre };
}

/** Aplica el cuadre (solo Administrador) y vuelve a revisar los asuntos del artículo. */
export async function cuadrarUnidadesShippingV2(
  input: { itemId: string; asuntoId?: string; n: number; causa?: CausaCuadre | ""; motivo: string },
  options: { actor: string; access: ShippingV2AccessContext }
): Promise<{ texto: string; abiertos: ShippingV2AsuntoRevision[]; resueltos: string[] }> {
  if (options.access.isSiteAdmin !== true) throw new Error("Solo el Administrador cuadra el inventario.");
  const motivo = cleanString(input.motivo);
  if (motivo.length < 5) throw new Error("Escribe el motivo (mínimo 5 caracteres).");
  const id = cleanString(input.itemId);
  const texto = await withLock(`shipping-item:${id}`, async () => {
    const c = await leerCuadreItem(id);
    if (normalizeStatus(c.estado) === "perdido en tienda") throw new Error("Tiene una novedad de pérdida abierta: resuélvela en Novedades.");
    const plan = planCuadre(c.datos, { n: input.n, causa: input.causa });
    if (!plan.ok) throw new Error(plan.motivo);
    const estadoNuevo = estadoTrasCuadre({
      estado: c.estado,
      n: plan.cambios.cantidad ?? c.datos.tienda,
      causa: plan.causa,
      usoLocal: c.usoLocal,
      requiereInspeccion: c.requiereInspeccion,
      inspeccionFirmada: c.inspeccionFirmada,
    });
    const F = SHIPPING_V2_ITEM_FIELDS;
    const ch = plan.cambios;
    await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
      method: "PATCH",
      body: JSON.stringify({
        typecast: true,
        records: [{
          id,
          fields: compactFields({
            [F.cantidad]: ch.cantidad,
            [F.unidadesCompradas]: ch.compradas,
            [CAMPO_UNIDADES_DADAS_DE_BAJA]: ch.bajas,
            [CAMPO_VENDIDAS_FUERA]: ch.fuera,
            [CAMPO_SALIDAS_INTERNAS]: ch.salidas,
            [CAMPO_VENTAS_OTRO]: ch.otro,
            [F.estadoItem]: estadoNuevo ?? undefined,
            [F.ultimaActualizacion]: new Date().toISOString(),
            [F.actualizadoPor]: options.actor,
          }),
        }],
      }),
    });
    if (!c.usoLocal) await recalcularDisponibilidadItem(id, options.actor).catch((error) => console.error("No se pudo recalcular tras cuadrar:", error));
    invalidateShippingV2ItemSearchIndexCache();
    const descripcion = `Cuadre de unidades (Control → Revisión): ${plan.texto} Motivo: ${motivo}`;
    await createShippingV2Event({
      action: estadoNuevo ? "Cambio de estado" : "Actualizado",
      itemRecordId: id,
      itemName: c.nombre,
      registradoPor: options.actor,
      descripcion,
      estadoAnterior: estadoNuevo ? c.estado : undefined,
      estadoNuevo: estadoNuevo ?? undefined,
    }).catch((error) => console.error("No se pudo registrar el evento del cuadre:", error));
    return `${plan.causa ? TEXTO_CAUSA[plan.causa] : "Conteo"} · ${motivo}`;
  });
  const asuntoId = cleanString(input.asuntoId);
  const verificacion = await verificarAsuntosRevisionShippingV2({ itemIds: [id], asuntoIds: asuntoId ? [asuntoId] : [] }, { actor: options.actor });
  // El asunto cerrado guarda la explicación del Administrador.
  if (asuntoId && verificacion.resueltos.includes(asuntoId)) {
    await airtableMutation<AirtableMutationResponse>(tableUrl(TABLA_REVISION), {
      method: "PATCH",
      body: JSON.stringify({ records: [{ id: asuntoId, fields: { Motivo: texto } }] }),
    }).catch((error) => console.error("No se pudo guardar el motivo del cuadre:", error));
  }
  return { texto, ...verificacion };
}

/** 10c-4: lo encontrado en un conteo vuelve al stock (sin tocar "Unidades compradas"). */
async function sumarEncontradasShippingV2(itemId: string, cantidad: number, motivo: string, options: { actor: string }) {
  const id = cleanString(itemId);
  return withLock(`shipping-item:${id}`, async () => {
    const item = await getShippingV2ItemById(id, { includeAiName: false, access: systemShippingV2Access() });
    if (normalizeStatus(item.estado) === "perdido en tienda") throw new Error(`${item.sku}: tiene una novedad de pérdida abierta; resuélvela en Novedades.`);
    const actual = Math.max(0, Number(item.cantidad) || 0);
    const nueva = actual + cantidad;
    if (seguimientoDe({ seguimiento: item.seguimiento, categoria: item.categoria }) === "Unidad" && nueva > 1) {
      throw new Error(`${item.sku} es un equipo y ya figura en la tienda: si es otro, regístralo como compra.`);
    }
    const estadoNuevo = estadoTrasCuadre({
      estado: item.estado,
      n: nueva,
      usoLocal: item.usoLocal === true,
      requiereInspeccion: item.requiereInspeccion === true,
      inspeccionFirmada: item.revisadoFisicamente === true,
    });
    const F = SHIPPING_V2_ITEM_FIELDS;
    await airtableMutation<AirtableMutationResponse>(tableUrl(SHIPPING_V2_TABLES.items), {
      method: "PATCH",
      body: JSON.stringify({
        typecast: true,
        records: [{ id, fields: compactFields({ [F.cantidad]: nueva, [F.estadoItem]: estadoNuevo ?? undefined, [F.ultimaActualizacion]: new Date().toISOString(), [F.actualizadoPor]: options.actor }) }],
      }),
    });
    if (!item.usoLocal) await recalcularDisponibilidadItem(id, options.actor).catch((error) => console.error("No se pudo recalcular tras sumar:", error));
    invalidateShippingV2ItemSearchIndexCache();
    await createShippingV2Event({
      action: estadoNuevo ? "Cambio de estado" : "Actualizado",
      itemRecordId: id,
      itemName: item.nombre,
      registradoPor: options.actor,
      descripcion: `Encontradas en conteo: ${cantidad} (en tienda ${actual} → ${nueva}). Motivo: ${motivo}`,
      estadoAnterior: estadoNuevo ? item.estado : undefined,
      estadoNuevo: estadoNuevo ?? undefined,
    }).catch((error) => console.error("No se pudo registrar el evento:", error));
  });
}
