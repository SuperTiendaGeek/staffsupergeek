import type { ShippingV2Proveedor } from "@/types/shipping-v2";
import { getActiveLogisticsProviders, isActiveLogisticsProvider } from "@/lib/shipping-v2/tracking-providers";
import { esProveedorLogistico, proveeMercaderia } from "@/lib/shipping-v2/provider-types";

function normalizeRuleText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isLogisticsProvider(provider: ShippingV2Proveedor) {
  return esProveedorLogistico(provider);
}

export function canBePurchaseProvider(provider: ShippingV2Proveedor) {
  if (normalizeRuleText(provider.estado) !== "activo") return false;
  return proveeMercaderia(provider);
}

export function canBeItemLogisticsProvider(provider: ShippingV2Proveedor) {
  if (normalizeRuleText(provider.estado) !== "activo") return false;
  return Boolean(provider.puedeRecibirEncargosTerceros || provider.permiteTriangulacion || provider.puedeArmarPackings);
}

export function canBePackingLogisticsProvider(provider: ShippingV2Proveedor) {
  return isActiveLogisticsProvider(provider) && isLogisticsProvider(provider);
}

export { getActiveLogisticsProviders, isActiveLogisticsProvider };
