import { SHIPPING_V2_ITEM_SELECT_OPTIONS } from "@/lib/shipping-v2/schema.generated";
import type { ShippingV2Item, ShippingV2TechnicalSheetInput } from "@/types/shipping-v2";

const DESKTOP_CATEGORIES = new Set(["desktop", "mini pc", "torre", "tower"]);
const SCREEN_BATTERY_CATEGORIES = new Set(["laptop", "all in one"]);

function normalize(value?: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function firstOption(options: readonly string[], value: string) {
  return options.includes(value) ? value : "";
}

function firstMatch(source: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) return match[1].replace(/\s+/g, " ").trim();
  }
  return "";
}

function inferBrand(name: string) {
  const brands = ["Lenovo", "Dell", "HP", "Apple", "Acer", "Asus", "Microsoft", "Samsung", "Toshiba", "MSI"];
  const normalizedName = normalize(name);
  return brands.find((brand) => normalizedName.includes(normalize(brand))) || "";
}

function inferCpuBrand(cpuModel: string, name: string) {
  const text = normalize(`${cpuModel} ${name}`);
  if (/(ryzen|athlon|threadripper)/.test(text)) return "AMD";
  if (/(core|celeron|pentium|xeon|intel)/.test(text)) return "Intel";
  if (/\bm[1-4]\b/.test(text)) return "Apple";
  if (/snapdragon/.test(text)) return "Qualcomm";
  return "";
}

function inferCpuModel(name: string) {
  return firstMatch(name, [
    /\b((?:intel\s+)?core\s+i[3579][-\s]?\d{3,5}[a-z]{0,3})\b/i,
    /\b((?:intel\s+)?core\s+i[3579])\b/i,
    /\b((?:amd\s+)?ryzen\s+[3579](?:\s+pro)?[-\s]?\d{0,5}[a-z]{0,3})\b/i,
    /\b((?:apple\s+)?m[1-4](?:\s+(?:pro|max|ultra))?)\b/i,
    /\b((?:intel\s+)?(?:celeron|pentium|xeon)[-\s]?[a-z0-9]{0,8})\b/i,
  ]);
}

function inferGpu(name: string) {
  return firstMatch(name, [
    /\b((?:nvidia\s+)?(?:rtx|gtx)\s?\d{3,4}(?:\s?ti)?)\b/i,
    /\b((?:geforce\s+)?(?:rtx|gtx)\s?\d{3,4}(?:\s?ti)?)\b/i,
    /\b((?:amd\s+)?radeon\s+[a-z0-9\s-]{2,18})\b/i,
    /\b(iris\s+xe)\b/i,
    /\b(intel\s+uhd(?:\s+graphics)?)\b/i,
  ]);
}

function inferRam(name: string) {
  const match = name.match(/\b(2|4|6|8|12|16|24|32|64|128)\s?gb\b/i);
  if (!match) return "";
  return firstOption(SHIPPING_V2_ITEM_SELECT_OPTIONS.ramCapacidad, `${match[1]}GB`);
}

function inferStorage(name: string) {
  const match = name.match(/\b((?:128|180|240|250|256|480|500|512)\s?gb|(?:1|2|4)\s?tb)\b/i);
  if (!match) return "";
  return match[1].toUpperCase().replace(/\s+/g, "");
}

function inferStorageType(name: string) {
  const text = normalize(name);
  if (/\bnvme\b/.test(text)) return "NVMe SSD";
  if (/\bm\.?2\b/.test(text) && /\bssd\b/.test(text)) return "M.2 SSD";
  if (/\bssd\b/.test(text)) return "SSD";
  if (/\bhdd\b/.test(text)) return "HDD";
  if (/\bemmc\b/.test(text)) return "eMMC";
  return "";
}

function inferModel(name: string, brand: string) {
  let model = name.replace(new RegExp(`\\b${brand}\\b`, "i"), "").trim();
  model = model.replace(/\b(core\s+i[3579]|ryzen\s+[3579]|m[1-4]|intel|amd|ram|ssd|hdd|nvme)\b.*$/i, "").trim();
  return model.length >= 2 ? model : "";
}

export function isFichaGenerada(item: Pick<ShippingV2Item, "technicalSheet">) {
  return item.technicalSheet.fichaTecnicaGenerada === true;
}

export function shippingV2CategoryHasBattery(category?: string) {
  return SCREEN_BATTERY_CATEGORIES.has(normalize(category));
}

export function shippingV2CategoryDoesNotUseScreenOrBattery(category?: string) {
  const normalized = normalize(category);
  return DESKTOP_CATEGORIES.has(normalized) || normalized.includes("desktop") || normalized.includes("torre");
}

export function calculateShippingV2BatteryState(category: string | undefined, batteryHealth: number | null | undefined) {
  if (!shippingV2CategoryHasBattery(category)) return "No aplica";
  if (batteryHealth === null || batteryHealth === undefined || !Number.isFinite(batteryHealth)) return "";
  if (batteryHealth >= 95) return "Excelente";
  if (batteryHealth >= 85) return "Muy buena";
  if (batteryHealth >= 80) return "Buena / Aceptable";
  if (batteryHealth >= 70) return "Regular / Mantiene carga";
  return "Mala / Agotada";
}

export function inferShippingV2TechnicalSheetFromItem(item: Pick<ShippingV2Item, "nombre" | "marca" | "modelo" | "categoria">): ShippingV2TechnicalSheetInput {
  const name = item.nombre || "";
  const brand = item.marca || inferBrand(name);
  const cpuModelo = inferCpuModel(name);
  const categoryWithoutBattery = shippingV2CategoryDoesNotUseScreenOrBattery(item.categoria);

  return {
    marcaFicha: brand,
    modeloFicha: item.modelo || inferModel(name, brand),
    cpuMarca: firstOption(SHIPPING_V2_ITEM_SELECT_OPTIONS.cpuMarca, inferCpuBrand(cpuModelo, name)),
    cpuModelo,
    ramCapacidad: inferRam(name),
    almacenamientoPrincipal: inferStorage(name),
    almacenamientoTipo: firstOption(SHIPPING_V2_ITEM_SELECT_OPTIONS.almacenamientoTipo, inferStorageType(name)),
    gpu: inferGpu(name),
    pantallaTamano: categoryWithoutBattery ? "No aplica" : "",
    pantallaResolucion: categoryWithoutBattery ? "No aplica" : "",
    bateriaEstado: categoryWithoutBattery ? "No aplica" : "",
    bateriaSalud: categoryWithoutBattery ? null : undefined,
  };
}
