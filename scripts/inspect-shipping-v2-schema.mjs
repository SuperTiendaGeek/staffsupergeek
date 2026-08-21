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
  // OJO: la TABLA se renombró a "Movimientos Financieros" durante la Fase 20.
  // El CAMPO de enlace dentro de Shipping Pagos sigue llamándose "Shipping
  // Finanzas Movimientos" (ver PAYMENT_FIELD_KEYS.movimientosFinanzas y
  // EXPECTED_PAYMENT_FIELDS) — renombrar aquel rompería el puente
  // pagos→finanzas. Son dos nombres distintos que se parecen; no unificar.
  finanzasMovimientos: "Movimientos Financieros",
  packings: "Shipping Packings",
  recepciones: "Shipping Recepciones",
  novedades: "Shipping Novedades",
  migraciones: "Shipping Migraciones",
  eventos: "Shipping Eventos",
  cpuCatalog: "Catálogo CPUs",
  computerCatalog: "Catálogo Computadores",
  connectivityCatalog: "Catálogo Conectividad",
  portsCatalog: "Catálogo Puertos",
  extraFeaturesCatalog: "Catálogo Características Extras",
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
  "Recibido",
  "Disponible para venta",
  "Costo proveedor",
  "Flete Packing",
  "Arancel Packing",
  "Otros costos Packing",
  "Regla distribución Packing",
  "Total costo proveedor Packing",
  "Cantidad items Packing",
  "Costo flete asignado",
  "Costo arancel asignado",
  "Otros costos asignados",
  "Costo logístico asignado",
  "Costo total unidad",
  "Precio venta sugerido",
  "SKU proveedor",
  "Modelo",
  "Marca",
  "Número de serie",
  "Condición",
  "Ubicación actual",
  "Tracking directo",
  "Observaciones internas",
  "Observación para venta",
  "Marca ficha",
  "Modelo ficha",
  "Sistema operativo",
  "Pantalla tamaño",
  "Pantalla resolución",
  "CPU marca",
  "CPU modelo",
  "CPU frecuencia base",
  "CPU frecuencia turbo",
  "RAM capacidad",
  "RAM tipo",
  "Almacenamiento principal",
  "Almacenamiento tipo",
  "GPU",
  "Batería salud %",
  "Batería estado",
  "Conectividad V2",
  "Puertos V2",
  "Características extras V2",
  "Observación ficha técnica",
  "Ficha técnica generada",
  "Ficha técnica revisada",
  "Ficha técnica revisada por",
  "Fecha ficha técnica revisada",
  "Fecha ficha técnica generada",
  "Ficha técnica generada por",
];

const EXPECTED_PROVIDER_FIELDS = [
  "Proveedor ID",
  "Nombre proveedor",
  "Estado proveedor",
  "Tipo de proveedor",
  "País / zona logística",
  "URL rastreo",
  "Plantilla URL rastreo",
  "Permite rastreo web",
  "Notas de rastreo",
];

const EXPECTED_PAYMENT_FIELDS = [
  "Pago ID",
  "Estado Pago",
  "Proveedor",
  "Items relacionados",
  "Total a pagar",
  "Regalos incluidos",
  "Fecha de creación",
  "Fecha de vencimiento sugerida",
  "Fecha real de pago",
  "Método de pago",
  "Cuenta origen",
  "Transacción ID",
  "Comprobante",
  "Observación",
  "Registrado por",
  "Estado de integración con Finanzas",
  "Shipping Finanzas Movimientos",
];

const EXPECTED_FINANCE_FIELDS = [
  "Movimiento Shipping ID",
  "Origen",
  "Tipo de movimiento",
  "Estado de integración",
  "Pago Shipping relacionado",
  "Proveedor",
  "Monto",
  "Fecha del movimiento",
  "Método",
  "Cuenta origen",
  "Transacción ID",
  "Comprobante",
  "Observación",
  "Registrado por",
  "Fecha de creación",
];

const EXPECTED_PACKING_FIELDS = [
  "Packing ID",
  "Nombre Packing",
  "Tipo de packing",
  "Estado Packing",
  "Proveedor responsable",
  "Items incluidos",
  "Costo Total Items Proveedor",
  "Cantidad Items Packing",
  "Tracking USA",
  "Transportista USA",
  "Proveedor logístico EC",
  "Tracking EC",
  "Transportista EC",
  "Peso",
  "Flete",
  "Arancel",
  "Otros costos",
  "Regla de distribución de costos",
  "Observación de costos",
  "Observaciones",
  "Fecha de creación",
  "Fecha de cierre",
  "Fecha de envío",
  "Fecha de recepción",
  "Cerrado por",
  "Creado por",
];

const EXPECTED_CPU_CATALOG_FIELDS = [
  "CPU modelo",
  "CPU marca",
  "Frecuencia base",
  "Frecuencia turbo",
  "Frecuencia original",
  "RAM tipo sugerida",
  "GPU integrada",
  "Fuente nombre",
  "Fuente",
  "Verificado",
  "Veces usado",
  "Última revisión",
  "Observaciones",
];

const EXPECTED_COMPUTER_CATALOG_FIELDS = [
  "Modelo computador",
  "Marca",
  "Pantalla tamaño sugerida",
  "Pantalla resolución sugerida",
  "Sistema operativo sugerido",
  "Conectividad sugerida V2",
  "Puertos sugeridos V2",
  "Características extras sugeridas V2",
  "Batería aplica",
  "GPU sugerida",
  "Fuente nombre",
  "Fuente",
  "Verificado",
  "Veces usado",
  "Última revisión",
  "Observaciones",
];

const EXPECTED_TECHNICAL_MASTER_FIELDS = [
  "Nombre",
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
  recibido: "Recibido",
  disponibleVenta: "Disponible para venta",
  reservado: "Reservado",
  costoProveedor: "Costo proveedor",
  fletePacking: "Flete Packing",
  arancelPacking: "Arancel Packing",
  otrosCostosPacking: "Otros costos Packing",
  reglaDistribucionPacking: "Regla distribución Packing",
  totalCostoProveedorPacking: "Total costo proveedor Packing",
  cantidadItemsPacking: "Cantidad items Packing",
  costoFleteAsignado: "Costo flete asignado",
  costoArancelAsignado: "Costo arancel asignado",
  otrosCostosAsignados: "Otros costos asignados",
  costoLogisticoAsignado: "Costo logístico asignado",
  costoTotalUnidad: "Costo total unidad",
  precioVentaFinal: "Precio venta final",
  precioVentaSugerido: "Precio venta sugerido",
  cantidad: "Cantidad",
  // F-42 — unidades comprometidas (reserva de cliente u orden) aún no
  // vendidas. Libres = Cantidad - Cantidad Reservada. Ver lib/shipping-v2/unidades.ts.
  cantidadReservada: "Cantidad Reservada",
  unidad: "Unidad",
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
  marcaFicha: "Marca ficha",
  modeloFicha: "Modelo ficha",
  sistemaOperativo: "Sistema operativo",
  pantallaTamano: "Pantalla tamaño",
  pantallaResolucion: "Pantalla resolución",
  cpuMarca: "CPU marca",
  cpuModelo: "CPU modelo",
  cpuFrecuenciaBase: "CPU frecuencia base",
  cpuFrecuenciaTurbo: "CPU frecuencia turbo",
  ramCapacidad: "RAM capacidad",
  ramTipo: "RAM tipo",
  almacenamientoPrincipal: "Almacenamiento principal",
  almacenamientoTipo: "Almacenamiento tipo",
  gpu: "GPU",
  bateriaSalud: "Batería salud %",
  bateriaEstado: "Batería estado",
  conectividadV2: "Conectividad V2",
  puertosV2: "Puertos V2",
  caracteristicasExtrasV2: "Características extras V2",
  observacionFichaTecnica: "Observación ficha técnica",
  fichaTecnicaGenerada: "Ficha técnica generada",
  fichaTecnicaRevisada: "Ficha técnica revisada",
  fichaTecnicaRevisadaPor: "Ficha técnica revisada por",
  fechaFichaTecnicaRevisada: "Fecha ficha técnica revisada",
  fechaFichaTecnicaGenerada: "Fecha ficha técnica generada",
  fichaTecnicaGeneradaPor: "Ficha técnica generada por",
  metodoAsignacionSku: "Método de asignación SKU",
  fechaRegistro: "Fecha de registro",
  registradoPor: "Registrado por",
  ultimaActualizacion: "Última actualización",
  actualizadoPor: "Actualizado por",
  esRegalo: "Es regalo",
  esParteRecuperada: "Es parte recuperada",
  esRepuesto: "Es repuesto",
  esUsoLocal: "Es uso local",
};

const PROVIDER_FIELD_KEYS = {
  proveedorId: "Proveedor ID",
  nombre: "Nombre proveedor",
  estado: "Estado proveedor",
  tipoProveedor: "Tipo de proveedor",
  puedeArmarPackings: "Puede armar packings",
  puedeRecibirEncargosTerceros: "Puede recibir encargos de terceros",
  permiteTriangulacion: "Permite triangulación",
  contacto: "Contacto",
  email: "Email",
  telefono: "Teléfono",
  pais: "País",
  paisZonaLogistica: "País / zona logística",
  urlRastreo: "URL rastreo",
  plantillaUrlRastreo: "Plantilla URL rastreo",
  permiteRastreoWeb: "Permite rastreo web",
  notasRastreo: "Notas de rastreo",
};

const PAYMENT_FIELD_KEYS = {
  pagoId: "Pago ID",
  estadoPago: "Estado Pago",
  proveedor: "Proveedor",
  itemsRelacionados: "Items relacionados",
  totalAPagar: "Total a pagar",
  totalPagado: "Total pagado",
  saldoPendiente: "Saldo pendiente",
  regalosIncluidos: "Regalos incluidos",
  fechaCreacion: "Fecha de creación",
  fechaVencimientoSugerida: "Fecha de vencimiento sugerida",
  fechaPagoReal: "Fecha real de pago",
  metodoPago: "Método de pago",
  cuentaOrigen: "Cuenta origen",
  transaccionId: "Transacción ID",
  comprobante: "Comprobante",
  facturaProveedor: "Factura proveedor",
  observacion: "Observación",
  registradoPor: "Registrado por",
  pagadoPor: "Pagado por",
  fechaAnulacion: "Fecha de anulación",
  motivoAnulacion: "Motivo de anulación",
  estadoIntegracionFinanzas: "Estado de integración con Finanzas",
  movimientosFinanzas: "Shipping Finanzas Movimientos",
};

const FINANCE_FIELD_KEYS = {
  movimientoShippingId: "Movimiento Shipping ID",
  origen: "Origen",
  tipoMovimiento: "Tipo de movimiento",
  estadoIntegracion: "Estado de integración",
  pagoShippingRelacionado: "Pago Shipping relacionado",
  proveedor: "Proveedor",
  monto: "Monto",
  fechaMovimiento: "Fecha del movimiento",
  metodo: "Método",
  cuentaOrigen: "Cuenta origen",
  transaccionId: "Transacción ID",
  comprobante: "Comprobante",
  movimientoFinanzasIdFuturo: "Movimiento Finanzas ID futuro",
  errorSincronizacion: "Error de sincronización",
  fechaSincronizacion: "Fecha de sincronización",
  observacion: "Observación",
  registradoPor: "Registrado por",
  fechaCreacion: "Fecha de creación",
  fechaAnulacion: "Fecha de anulación",
  motivoAnulacion: "Motivo de anulación",
};

const PACKING_FIELD_KEYS = {
  packingId: "Packing ID",
  nombre: "Nombre Packing",
  tipo: "Tipo de packing",
  estado: "Estado Packing",
  proveedorResponsable: "Proveedor responsable",
  proveedorLogisticoEc: "Proveedor logístico EC",
  itemsIncluidos: "Items incluidos",
  costoTotalItemsProveedor: "Costo Total Items Proveedor",
  cantidadItemsPacking: "Cantidad Items Packing",
  trackingUsa: "Tracking USA",
  transportistaUsa: "Transportista USA",
  trackingEc: "Tracking EC",
  transportistaEc: "Transportista EC",
  peso: "Peso",
  flete: "Flete",
  arancel: "Arancel",
  otrosCostos: "Otros costos",
  reglaDistribucionCostos: "Regla de distribución de costos",
  observacionCostos: "Observación de costos",
  observaciones: "Observaciones",
  fechaCreacion: "Fecha de creación",
  fechaCierre: "Fecha de cierre",
  fechaEnvio: "Fecha de envío",
  fechaRecepcion: "Fecha de recepción",
  cerradoPor: "Cerrado por",
  creadoPor: "Creado por",
};

const CPU_CATALOG_FIELD_KEYS = {
  cpuModel: "CPU modelo",
  cpuBrand: "CPU marca",
  baseFrequency: "Frecuencia base",
  turboFrequency: "Frecuencia turbo",
  originalFrequency: "Frecuencia original",
  suggestedRamType: "RAM tipo sugerida",
  integratedGpu: "GPU integrada",
  sourceName: "Fuente nombre",
  sourceUrl: "Fuente",
  verified: "Verificado",
  usageCount: "Veces usado",
  lastReviewedAt: "Última revisión",
  notes: "Observaciones",
};

const COMPUTER_CATALOG_FIELD_KEYS = {
  computerModel: "Modelo computador",
  brand: "Marca",
  suggestedScreenSize: "Pantalla tamaño sugerida",
  suggestedScreenResolution: "Pantalla resolución sugerida",
  suggestedOperatingSystem: "Sistema operativo sugerido",
  suggestedConnectivityV2: "Conectividad sugerida V2",
  suggestedPortsV2: "Puertos sugeridos V2",
  suggestedExtraFeaturesV2: "Características extras sugeridas V2",
  batteryApplies: "Batería aplica",
  suggestedGpu: "GPU sugerida",
  sourceName: "Fuente nombre",
  sourceUrl: "Fuente",
  verified: "Verificado",
  usageCount: "Veces usado",
  lastReviewedAt: "Última revisión",
  notes: "Observaciones",
};

const TECHNICAL_MASTER_FIELD_KEYS = {
  name: "Nombre",
  aliases: "Alias",
  active: "Activo",
  order: "Orden",
  description: "Descripción",
  createdFromPortal: "Creado desde Portal",
  createdAt: "Fecha creación",
  createdBy: "Creado por",
  notes: "Observaciones",
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
  const allFound = Object.keys(table.fields);
  const found = expectedFields.filter((field) => table.fields[field]);
  const missing = expectedFields.filter((field) => !table.fields[field]);
  if (!missing.length) return { ok: true, found, missing: [], similar: {} };
  const similar = Object.fromEntries(missing.map((field) => [field, findSimilarFields(field, allFound)]));
  return { ok: false, found, missing, similar };
}

function tsString(value) {
  return JSON.stringify(value, null, 2);
}

function generatedTs(schema, validation) {
  const itemsFields = schema.tables[TABLES.items].fields;
  const providerFields = schema.tables[TABLES.proveedores].fields;
  const paymentFields = schema.tables[TABLES.pagos].fields;
  const financeFields = schema.tables[TABLES.finanzasMovimientos].fields;
  const packingFields = schema.tables[TABLES.packings].fields;
  const cpuCatalogFields = schema.tables[TABLES.cpuCatalog].fields;
  const computerCatalogFields = schema.tables[TABLES.computerCatalog].fields;
  const connectivityCatalogFields = schema.tables[TABLES.connectivityCatalog].fields;
  const portsCatalogFields = schema.tables[TABLES.portsCatalog].fields;
  const extraFeaturesCatalogFields = schema.tables[TABLES.extraFeaturesCatalog].fields;
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
  const providerConstants = Object.fromEntries(
    Object.entries(PROVIDER_FIELD_KEYS).filter(([, fieldName]) => Boolean(providerFields[fieldName]))
  );
  const providerSelectOptions = Object.fromEntries(
    Object.entries(providerConstants)
      .map(([key, fieldName]) => [key, providerFields[fieldName]])
      .filter(([, field]) => field.type === "singleSelect" || field.type === "multipleSelects")
      .map(([key, field]) => [key, field.options ?? []])
  );
  const packingConstants = Object.fromEntries(
    Object.entries(PACKING_FIELD_KEYS).filter(([, fieldName]) => Boolean(packingFields[fieldName]))
  );
  const paymentConstants = Object.fromEntries(
    Object.entries(PAYMENT_FIELD_KEYS).filter(([, fieldName]) => Boolean(paymentFields[fieldName]))
  );
  const paymentSelectOptions = Object.fromEntries(
    Object.entries(paymentConstants)
      .map(([key, fieldName]) => [key, paymentFields[fieldName]])
      .filter(([, field]) => field.type === "singleSelect" || field.type === "multipleSelects")
      .map(([key, field]) => [key, field.options ?? []])
  );
  const financeConstants = Object.fromEntries(
    Object.entries(FINANCE_FIELD_KEYS).filter(([, fieldName]) => Boolean(financeFields[fieldName]))
  );
  const financeSelectOptions = Object.fromEntries(
    Object.entries(financeConstants)
      .map(([key, fieldName]) => [key, financeFields[fieldName]])
      .filter(([, field]) => field.type === "singleSelect" || field.type === "multipleSelects")
      .map(([key, field]) => [key, field.options ?? []])
  );
  const packingSelectOptions = Object.fromEntries(
    Object.entries(packingConstants)
      .map(([key, fieldName]) => [key, packingFields[fieldName]])
      .filter(([, field]) => field.type === "singleSelect" || field.type === "multipleSelects")
      .map(([key, field]) => [key, field.options ?? []])
  );
  const cpuCatalogConstants = Object.fromEntries(
    Object.entries(CPU_CATALOG_FIELD_KEYS).filter(([, fieldName]) => Boolean(cpuCatalogFields[fieldName]))
  );
  const cpuCatalogSelectOptions = Object.fromEntries(
    Object.entries(cpuCatalogConstants)
      .map(([key, fieldName]) => [key, cpuCatalogFields[fieldName]])
      .filter(([, field]) => field.type === "singleSelect" || field.type === "multipleSelects")
      .map(([key, field]) => [key, field.options ?? []])
  );
  const computerCatalogConstants = Object.fromEntries(
    Object.entries(COMPUTER_CATALOG_FIELD_KEYS).filter(([, fieldName]) => Boolean(computerCatalogFields[fieldName]))
  );
  const computerCatalogSelectOptions = Object.fromEntries(
    Object.entries(computerCatalogConstants)
      .map(([key, fieldName]) => [key, computerCatalogFields[fieldName]])
      .filter(([, field]) => field.type === "singleSelect" || field.type === "multipleSelects")
      .map(([key, field]) => [key, field.options ?? []])
  );
  const connectivityCatalogConstants = Object.fromEntries(
    Object.entries(TECHNICAL_MASTER_FIELD_KEYS).filter(([, fieldName]) => Boolean(connectivityCatalogFields[fieldName]))
  );
  const portsCatalogConstants = Object.fromEntries(
    Object.entries(TECHNICAL_MASTER_FIELD_KEYS).filter(([, fieldName]) => Boolean(portsCatalogFields[fieldName]))
  );
  const extraFeaturesCatalogConstants = Object.fromEntries(
    Object.entries(TECHNICAL_MASTER_FIELD_KEYS).filter(([, fieldName]) => Boolean(extraFeaturesCatalogFields[fieldName]))
  );

  return `/* eslint-disable */\n// This file is generated by scripts/inspect-shipping-v2-schema.mjs.\n// Do not edit by hand. Run: npm run shipping-v2:schema\n\nexport const SHIPPING_V2_SCHEMA_GENERATED_AT = ${JSON.stringify(schema.generatedAt)};\n\nexport const SHIPPING_V2_TABLES = ${tsString(TABLES)} as const;\n\nexport const SHIPPING_V2_ITEM_FIELDS = ${tsString(itemConstants)} as const;\n\nexport const SHIPPING_V2_ITEM_SELECT_OPTIONS = ${tsString(itemSelectOptions)} as const;\n\nexport const SHIPPING_V2_PROVIDER_FIELDS = ${tsString(providerConstants)} as const;\n\nexport const SHIPPING_V2_PROVIDER_SELECT_OPTIONS = ${tsString(providerSelectOptions)} as const;\n\nexport const SHIPPING_V2_PAYMENT_FIELDS = ${tsString(paymentConstants)} as const;\n\nexport const SHIPPING_V2_PAYMENT_SELECT_OPTIONS = ${tsString(paymentSelectOptions)} as const;\n\nexport const SHIPPING_V2_FINANCE_FIELDS = ${tsString(financeConstants)} as const;\n\nexport const SHIPPING_V2_FINANCE_SELECT_OPTIONS = ${tsString(financeSelectOptions)} as const;\n\nexport const SHIPPING_V2_PACKING_FIELDS = ${tsString(packingConstants)} as const;\n\nexport const SHIPPING_V2_PACKING_SELECT_OPTIONS = ${tsString(packingSelectOptions)} as const;\n\nexport const SHIPPING_V2_CPU_CATALOG_FIELDS = ${tsString(cpuCatalogConstants)} as const;\n\nexport const SHIPPING_V2_CPU_CATALOG_SELECT_OPTIONS = ${tsString(cpuCatalogSelectOptions)} as const;\n\nexport const SHIPPING_V2_COMPUTER_CATALOG_FIELDS = ${tsString(computerCatalogConstants)} as const;\n\nexport const SHIPPING_V2_COMPUTER_CATALOG_SELECT_OPTIONS = ${tsString(computerCatalogSelectOptions)} as const;\n\nexport const SHIPPING_V2_CONNECTIVITY_CATALOG_FIELDS = ${tsString(connectivityCatalogConstants)} as const;\n\nexport const SHIPPING_V2_PORTS_CATALOG_FIELDS = ${tsString(portsCatalogConstants)} as const;\n\nexport const SHIPPING_V2_EXTRA_FEATURES_CATALOG_FIELDS = ${tsString(extraFeaturesCatalogConstants)} as const;\n\nexport const SHIPPING_V2_EXPECTED_ITEM_FIELDS_VALIDATION = ${tsString(validation.items)} as const;\n\nexport const SHIPPING_V2_EXPECTED_PROVIDER_FIELDS_VALIDATION = ${tsString(validation.proveedores)} as const;\n\nexport const SHIPPING_V2_EXPECTED_PAYMENT_FIELDS_VALIDATION = ${tsString(validation.pagos)} as const;\n\nexport const SHIPPING_V2_EXPECTED_FINANCE_FIELDS_VALIDATION = ${tsString(validation.finanzas)} as const;\n\nexport const SHIPPING_V2_EXPECTED_PACKING_FIELDS_VALIDATION = ${tsString(validation.packings)} as const;\n\nexport const SHIPPING_V2_EXPECTED_CPU_CATALOG_FIELDS_VALIDATION = ${tsString(validation.cpuCatalog)} as const;\n\nexport const SHIPPING_V2_EXPECTED_COMPUTER_CATALOG_FIELDS_VALIDATION = ${tsString(validation.computerCatalog)} as const;\n\nexport const SHIPPING_V2_EXPECTED_CONNECTIVITY_CATALOG_FIELDS_VALIDATION = ${tsString(validation.connectivityCatalog)} as const;\n\nexport const SHIPPING_V2_EXPECTED_PORTS_CATALOG_FIELDS_VALIDATION = ${tsString(validation.portsCatalog)} as const;\n\nexport const SHIPPING_V2_EXPECTED_EXTRA_FEATURES_CATALOG_FIELDS_VALIDATION = ${tsString(validation.extraFeaturesCatalog)} as const;\n\nexport function assertShippingV2GeneratedSchema() {\n  if (!SHIPPING_V2_EXPECTED_ITEM_FIELDS_VALIDATION.ok) {\n    throw new Error(\`Schema Shipping V2 desactualizado o incompleto. Ejecuta npm run shipping-v2:schema. Campos faltantes: \${SHIPPING_V2_EXPECTED_ITEM_FIELDS_VALIDATION.missing.join(", ")}\`);\n  }\n  if (!SHIPPING_V2_EXPECTED_PROVIDER_FIELDS_VALIDATION.ok) {\n    throw new Error(\`Schema Shipping V2 Proveedores desactualizado o incompleto. Ejecuta npm run shipping-v2:schema. Campos faltantes: \${SHIPPING_V2_EXPECTED_PROVIDER_FIELDS_VALIDATION.missing.join(", ")}\`);\n  }\n  if (!SHIPPING_V2_EXPECTED_PAYMENT_FIELDS_VALIDATION.ok) {\n    throw new Error(\`Schema Shipping V2 Pagos desactualizado o incompleto. Ejecuta npm run shipping-v2:schema. Campos faltantes: \${SHIPPING_V2_EXPECTED_PAYMENT_FIELDS_VALIDATION.missing.join(", ")}\`);\n  }\n  if (!SHIPPING_V2_EXPECTED_FINANCE_FIELDS_VALIDATION.ok) {\n    throw new Error(\`Schema Shipping V2 Finanzas desactualizado o incompleto. Ejecuta npm run shipping-v2:schema. Campos faltantes: \${SHIPPING_V2_EXPECTED_FINANCE_FIELDS_VALIDATION.missing.join(", ")}\`);\n  }\n  if (!SHIPPING_V2_EXPECTED_PACKING_FIELDS_VALIDATION.ok) {\n    throw new Error(\`Schema Shipping V2 Packings desactualizado o incompleto. Ejecuta npm run shipping-v2:schema. Campos faltantes: \${SHIPPING_V2_EXPECTED_PACKING_FIELDS_VALIDATION.missing.join(", ")}\`);\n  }\n  if (!SHIPPING_V2_EXPECTED_CPU_CATALOG_FIELDS_VALIDATION.ok) {\n    throw new Error(\`Schema Catálogo CPUs desactualizado o incompleto. Ejecuta npm run shipping-v2:schema. Campos faltantes: \${SHIPPING_V2_EXPECTED_CPU_CATALOG_FIELDS_VALIDATION.missing.join(", ")}\`);\n  }\n  if (!SHIPPING_V2_EXPECTED_COMPUTER_CATALOG_FIELDS_VALIDATION.ok) {\n    throw new Error(\`Schema Catálogo Computadores desactualizado o incompleto. Ejecuta npm run shipping-v2:schema. Campos faltantes: \${SHIPPING_V2_EXPECTED_COMPUTER_CATALOG_FIELDS_VALIDATION.missing.join(", ")}\`);\n  }\n  if (!SHIPPING_V2_EXPECTED_CONNECTIVITY_CATALOG_FIELDS_VALIDATION.ok) {\n    throw new Error(\`Schema Catálogo Conectividad desactualizado o incompleto. Ejecuta npm run shipping-v2:schema. Campos faltantes: \${SHIPPING_V2_EXPECTED_CONNECTIVITY_CATALOG_FIELDS_VALIDATION.missing.join(", ")}\`);\n  }\n  if (!SHIPPING_V2_EXPECTED_PORTS_CATALOG_FIELDS_VALIDATION.ok) {\n    throw new Error(\`Schema Catálogo Puertos desactualizado o incompleto. Ejecuta npm run shipping-v2:schema. Campos faltantes: \${SHIPPING_V2_EXPECTED_PORTS_CATALOG_FIELDS_VALIDATION.missing.join(", ")}\`);\n  }\n  if (!SHIPPING_V2_EXPECTED_EXTRA_FEATURES_CATALOG_FIELDS_VALIDATION.ok) {\n    throw new Error(\`Schema Catálogo Características Extras desactualizado o incompleto. Ejecuta npm run shipping-v2:schema. Campos faltantes: \${SHIPPING_V2_EXPECTED_EXTRA_FEATURES_CATALOG_FIELDS_VALIDATION.missing.join(", ")}\`);\n  }\n}\n`;
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
    proveedores: validateExpectedFields(schema.tables[TABLES.proveedores], EXPECTED_PROVIDER_FIELDS),
    pagos: validateExpectedFields(schema.tables[TABLES.pagos], EXPECTED_PAYMENT_FIELDS),
    finanzas: validateExpectedFields(schema.tables[TABLES.finanzasMovimientos], EXPECTED_FINANCE_FIELDS),
    packings: validateExpectedFields(schema.tables[TABLES.packings], EXPECTED_PACKING_FIELDS),
    cpuCatalog: validateExpectedFields(schema.tables[TABLES.cpuCatalog], EXPECTED_CPU_CATALOG_FIELDS),
    computerCatalog: validateExpectedFields(schema.tables[TABLES.computerCatalog], EXPECTED_COMPUTER_CATALOG_FIELDS),
    connectivityCatalog: validateExpectedFields(schema.tables[TABLES.connectivityCatalog], EXPECTED_TECHNICAL_MASTER_FIELDS),
    portsCatalog: validateExpectedFields(schema.tables[TABLES.portsCatalog], EXPECTED_TECHNICAL_MASTER_FIELDS),
    extraFeaturesCatalog: validateExpectedFields(schema.tables[TABLES.extraFeaturesCatalog], EXPECTED_TECHNICAL_MASTER_FIELDS),
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
  console.log("Campos reales detectados en Shipping Proveedores:");
  for (const field of validation.proveedores.found) console.log(`- ${field}`);
  console.log("Campos reales detectados en Shipping Pagos:");
  for (const field of validation.pagos.found) console.log(`- ${field}`);
  console.log("Campos reales detectados en Movimientos Financieros:");
  for (const field of validation.finanzas.found) console.log(`- ${field}`);
  console.log("Campos reales detectados en Shipping Packings:");
  for (const field of validation.packings.found) console.log(`- ${field}`);
  console.log("Campos reales detectados en Catálogo CPUs:");
  for (const field of validation.cpuCatalog.found) console.log(`- ${field}`);
  console.log("Campos reales detectados en Catálogo Computadores:");
  for (const field of validation.computerCatalog.found) console.log(`- ${field}`);
  console.log("Campos reales detectados en Catálogo Conectividad:");
  for (const field of validation.connectivityCatalog.found) console.log(`- ${field}`);
  console.log("Campos reales detectados en Catálogo Puertos:");
  for (const field of validation.portsCatalog.found) console.log(`- ${field}`);
  console.log("Campos reales detectados en Catálogo Características Extras:");
  for (const field of validation.extraFeaturesCatalog.found) console.log(`- ${field}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
