import type { ShippingV2Proveedor } from "@/types/shipping-v2";
import { getActiveLogisticsProviders, isActiveLogisticsProvider } from "@/lib/shipping-v2/tracking-providers";
import { esProveedorLogistico, proveeMercaderia } from "@/lib/shipping-v2/provider-types";

function normalizeRuleText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
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

/**
 * "Proveedor logístico / intermediario" del artículo: el casillero que recibe
 * lo importado (Laarbox) u otro proveedor logístico activo.
 *
 * Punto 11 (22-oct-2026): antes exigía alguna de las casillas viejas "Puede
 * armar packings", "Puede recibir encargos de terceros" o "Permite
 * triangulación"; un casillero nuevo marcado solo como casillero hacía fallar
 * el registro de una compra de importación. Esas casillas se retiraron.
 */
export function canBeItemLogisticsProvider(provider: ShippingV2Proveedor) {
  if (normalizeRuleText(provider.estado) !== "activo") return false;
  return provider.esCasillero === true || isLogisticsProvider(provider);
}

export function canBePackingLogisticsProvider(provider: ShippingV2Proveedor) {
  return isActiveLogisticsProvider(provider) && isLogisticsProvider(provider);
}

export { getActiveLogisticsProviders, isActiveLogisticsProvider };
