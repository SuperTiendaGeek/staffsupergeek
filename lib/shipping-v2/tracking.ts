import type { ShippingV2Proveedor } from "@/types/shipping-v2";

export function buildTrackingUrl(provider: ShippingV2Proveedor | null | undefined, trackingNumber: string | null | undefined) {
  const tracking = trackingNumber?.trim();
  if (!provider || !tracking) return null;
  if (provider.permiteRastreoWeb !== true) return null;

  const template = provider.plantillaUrlRastreo?.trim();
  if (template) return template.replaceAll("{TRACKING}", encodeURIComponent(tracking));

  const url = provider.urlRastreo?.trim();
  return url || null;
}
