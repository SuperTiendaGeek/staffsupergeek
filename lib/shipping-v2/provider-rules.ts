import type { ShippingV2Proveedor } from "@/types/shipping-v2";

function normalizeRuleText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isActiveProvider(provider: ShippingV2Proveedor) {
  return normalizeRuleText(provider.estado) === "activo";
}

export function canBePurchaseProvider(provider: ShippingV2Proveedor) {
  if (!isActiveProvider(provider)) return false;
  return normalizeRuleText(provider.tipoProveedor) !== "logistico";
}

export function canBeItemLogisticsProvider(provider: ShippingV2Proveedor) {
  if (!isActiveProvider(provider)) return false;
  return Boolean(provider.puedeRecibirEncargosTerceros || provider.permiteTriangulacion || provider.puedeArmarPackings);
}

export function canBePackingLogisticsProvider(provider: ShippingV2Proveedor) {
  if (!isActiveProvider(provider)) return false;
  return Boolean(normalizeRuleText(provider.tipoProveedor) === "logistico" || provider.puedeArmarPackings || provider.permiteTriangulacion);
}
