import type { ShippingV2Item, ShippingV2TechnicalOption, ShippingV2TechnicalSheet, ShippingV2TechnicalSheetInput } from "@/types/shipping-v2";

export interface FichaVentaData {
  marca: string;
  modelo: string;
  precio: number | null;
  sistemaOperativo: string | null;
  pantalla: string | null;
  cpuLinea1: string | null;
  cpuLinea2: string | null;
  gpu: string | null;
  gpuIntegrada: string | null;
  almacenamiento: string | null;
  ram: string | null;
  conectividadYPuertos: string | null;
  bateriaEstado: string | null;
  sku: string;
}

export type FichaVentaTechnicalOptionSets = {
  connectivity: Array<Pick<ShippingV2TechnicalOption, "id" | "name">>;
  ports: Array<Pick<ShippingV2TechnicalOption, "id" | "name">>;
  extraFeatures: Array<Pick<ShippingV2TechnicalOption, "id" | "name">>;
};

type FichaVentaSheetSource = Partial<
  Omit<ShippingV2TechnicalSheet, "bateriaSalud"> &
  Omit<ShippingV2TechnicalSheetInput, "bateriaSalud">
> & {
  bateriaSalud?: number | string | null;
};

function clean(value?: string | number | null) {
  return String(value ?? "").trim();
}

function hasValue(value?: string | number | null) {
  const text = clean(value);
  return Boolean(text && text !== "-" && text.toLowerCase() !== "no aplica");
}

function joinParts(parts: Array<string | number | null | undefined>, separator = " ") {
  return parts.map(clean).filter(hasValue).join(separator);
}

function namesFromIds(ids: unknown, options: unknown) {
  if (!Array.isArray(ids) || !Array.isArray(options)) return [];
  return ids
    .map((id) => (options as Array<Pick<ShippingV2TechnicalOption, "id" | "name">>).find((option) => option.id === id)?.name)
    .filter((name): name is string => Boolean(name));
}

function safe<T>(compute: () => T, fallback: T): T {
  try {
    return compute();
  } catch {
    return fallback;
  }
}

function stripGhz(value: string) {
  return value.replace(/\s*ghz\s*$/i, "").trim();
}

function screenLine(sheet: FichaVentaSheetSource) {
  const line = joinParts([sheet.pantallaTamano, sheet.pantallaResolucion]);
  return hasValue(line) ? line : null;
}

function cpuModelLine(sheet: FichaVentaSheetSource) {
  const line = joinParts([sheet.cpuMarca, sheet.cpuModelo]);
  return hasValue(line) ? line : null;
}

function cpuFrequencyLine(sheet: FichaVentaSheetSource) {
  const base = clean(sheet.cpuFrecuenciaBase);
  const turbo = clean(sheet.cpuFrecuenciaTurbo);
  if (!hasValue(base) && !hasValue(turbo)) return null;
  if (hasValue(base) && hasValue(turbo)) return `${stripGhz(base)}-${stripGhz(turbo)}GHz CPU`;
  return `${stripGhz(hasValue(base) ? base : turbo)}GHz CPU`;
}

function storageLine(sheet: FichaVentaSheetSource) {
  const line = joinParts([sheet.almacenamientoPrincipal, sheet.almacenamientoTipo]);
  return hasValue(line) ? line : null;
}

function ramLine(sheet: FichaVentaSheetSource) {
  const capacidad = clean(sheet.ramCapacidad);
  const tipo = clean(sheet.ramTipo);
  if (!hasValue(capacidad) && !hasValue(tipo)) return null;
  return [capacidad, "RAM", tipo].filter((part, index) => index === 1 || hasValue(part)).join(" ");
}

function connectivityLine(sheet: FichaVentaSheetSource, technicalOptions: FichaVentaTechnicalOptionSets) {
  const all = [
    ...namesFromIds(sheet.connectivityV2Ids, technicalOptions.connectivity),
    ...namesFromIds(sheet.portV2Ids, technicalOptions.ports),
    ...namesFromIds(sheet.extraFeatureV2Ids, technicalOptions.extraFeatures),
  ].filter(hasValue);
  return all.length ? all.join(", ") : null;
}

export function buildFichaVentaData(
  item: ShippingV2Item,
  technicalOptions: FichaVentaTechnicalOptionSets,
  options: { sheet?: FichaVentaSheetSource } = {}
): FichaVentaData {
  const sheet = options.sheet ?? item.technicalSheet;

  return {
    marca: safe(() => clean(sheet.marcaFicha) || clean(item.marca) || "Equipo", "Equipo"),
    modelo: safe(() => clean(sheet.modeloFicha) || clean(item.modelo) || clean(item.nombre), ""),
    precio: safe(() => item.precioVenta ?? item.precioVentaSugerido ?? null, null),
    sistemaOperativo: safe(() => {
      const os = clean(sheet.sistemaOperativo);
      return hasValue(os) ? os.toLocaleUpperCase("es") : null;
    }, null),
    pantalla: safe(() => screenLine(sheet), null),
    cpuLinea1: safe(() => cpuModelLine(sheet), null),
    cpuLinea2: safe(() => cpuFrequencyLine(sheet), null),
    gpu: safe(() => {
      const gpu = clean(sheet.gpu);
      return hasValue(gpu) ? gpu : null;
    }, null),
    gpuIntegrada: safe(() => {
      const gpuIntegrada = clean(sheet.gpuIntegrada);
      return hasValue(gpuIntegrada) ? gpuIntegrada : null;
    }, null),
    almacenamiento: safe(() => storageLine(sheet), null),
    ram: safe(() => ramLine(sheet), null),
    conectividadYPuertos: safe(() => connectivityLine(sheet, technicalOptions), null),
    bateriaEstado: safe(() => {
      const estado = clean(sheet.bateriaEstado);
      return hasValue(estado) ? estado : null;
    }, null),
    sku: safe(() => clean(item.sku), ""),
  };
}
