import { getShippingV2ProveedorLabel } from "@/lib/shipping-v2/provider-labels";
import type { ShippingV2Packing, ShippingV2PackingWriteInput, ShippingV2Proveedor } from "@/types/shipping-v2";

const USA_ZONES = new Set(["usa", "internacional", "otro"]);
const ECUADOR_ZONES = new Set(["miami casillero", "ecuador", "internacional", "otro"]);
const LOCAL_ECUADOR_ZONES = new Set(["ecuador", "local", "internacional", "otro"]);

function normalizeProviderText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function zone(provider: ShippingV2Proveedor) {
  return normalizeProviderText(provider.paisZonaLogistica || provider.pais);
}

export function isActiveLogisticsProvider(provider: ShippingV2Proveedor) {
  return normalizeProviderText(provider.estado) === "activo" && normalizeProviderText(provider.tipoProveedor) === "logistico";
}

export function canBeUsaTransportProvider(provider: ShippingV2Proveedor) {
  return isActiveLogisticsProvider(provider) && USA_ZONES.has(zone(provider));
}

export function canBeEcuadorTransportProvider(provider: ShippingV2Proveedor) {
  return isActiveLogisticsProvider(provider) && ECUADOR_ZONES.has(zone(provider));
}

export function canBeLocalEcuadorTransportProvider(provider: ShippingV2Proveedor) {
  return isActiveLogisticsProvider(provider) && LOCAL_ECUADOR_ZONES.has(zone(provider));
}

export function getActiveLogisticsProviders(proveedores: ShippingV2Proveedor[]) {
  return proveedores.filter(isActiveLogisticsProvider);
}

export function providerTrackingLabel(provider: ShippingV2Proveedor) {
  const label = getShippingV2ProveedorLabel(provider);
  const providerZone = provider.paisZonaLogistica || provider.pais;
  return providerZone ? `${label} · ${providerZone}` : label;
}

export function looksInternationalPacking(input: Pick<ShippingV2Packing | ShippingV2PackingWriteInput, "trackingUsa" | "transportistaUsa">) {
  return Boolean(input.trackingUsa?.trim() || input.transportistaUsa?.trim());
}

export function looksLocalEcuadorPacking(input: Pick<ShippingV2Packing | ShippingV2PackingWriteInput, "trackingUsa" | "transportistaUsa" | "trackingEc" | "transportistaEc" | "tipo">) {
  const tipo = normalizeProviderText(input.tipo);
  const onlyEcRoute = Boolean(input.trackingEc?.trim() || input.transportistaEc?.trim()) && !looksInternationalPacking(input);
  return onlyEcRoute || tipo.includes("local") || tipo.includes("nacional");
}

export function getUsaTransportProviders(proveedores: ShippingV2Proveedor[]) {
  return proveedores.filter(canBeUsaTransportProvider);
}

export function getEcuadorTransportProvidersForPacking(
  proveedores: ShippingV2Proveedor[],
  input: Pick<ShippingV2Packing | ShippingV2PackingWriteInput, "trackingUsa" | "transportistaUsa" | "trackingEc" | "transportistaEc" | "tipo">
) {
  if (looksInternationalPacking(input)) return proveedores.filter(canBeEcuadorTransportProvider);
  if (looksLocalEcuadorPacking(input)) return proveedores.filter(canBeLocalEcuadorTransportProvider);
  return getActiveLogisticsProviders(proveedores);
}

export function isCompatibleEcuadorTransportProvider(
  provider: ShippingV2Proveedor,
  input: Pick<ShippingV2Packing | ShippingV2PackingWriteInput, "trackingUsa" | "transportistaUsa" | "trackingEc" | "transportistaEc" | "tipo">
) {
  if (looksInternationalPacking(input)) return canBeEcuadorTransportProvider(provider);
  if (looksLocalEcuadorPacking(input)) return canBeLocalEcuadorTransportProvider(provider);
  return isActiveLogisticsProvider(provider);
}
