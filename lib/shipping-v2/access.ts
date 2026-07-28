// Control de acceso de Shipping V2 — puro, sin Airtable ni red, testeable.
//
// Vive aparte de airtable.ts (4.600 líneas) porque es código de seguridad y
// merece poder probarse solo.

import type {
  ShippingV2AccessContext,
  ShippingV2AccessPermissions,
  ShippingV2Proveedor,
} from "@/types/shipping-v2";

const STAFF_SHIPPING_V2_PERMISSIONS: ShippingV2AccessPermissions = {
  canViewItems: true,
  canEditItems: true,
  canEditProviderItemFields: true,
  canViewPackings: true,
  canCreatePacking: true,
  canEditPacking: true,
  canEditPackingWeight: true,
  canAddItemsToPacking: true,
  canRemoveItemsFromPacking: true,
  canClosePacking: true,
  canTransitionPackingStatus: true,
  canViewInvoice: true,
  canGenerateInvoice: true,
  canViewPayments: true,
  canManagePayments: true,
  canViewNovedades: true,
  canCreateNovedades: true,
  canRespondNovedades: true,
  canViewPackingLocation: true,
  canLinkDestinatario: true,
  canUseRecepcion: true,
  canViewCosts: true,
  canViewProviderCost: true,
};

const NO_SHIPPING_V2_PERMISSIONS: ShippingV2AccessPermissions = {
  canViewItems: false,
  canEditItems: false,
  canEditProviderItemFields: false,
  canViewPackings: false,
  canCreatePacking: false,
  canEditPacking: false,
  canEditPackingWeight: false,
  canAddItemsToPacking: false,
  canRemoveItemsFromPacking: false,
  canClosePacking: false,
  canTransitionPackingStatus: false,
  canViewInvoice: false,
  canGenerateInvoice: false,
  canViewPayments: false,
  canManagePayments: false,
  canViewNovedades: false,
  canCreateNovedades: false,
  canRespondNovedades: false,
  canViewPackingLocation: false,
  canLinkDestinatario: false,
  canUseRecepcion: false,
  canViewCosts: false,
  canViewProviderCost: false,
};

function providerShippingV2Permissions(provider?: ShippingV2Proveedor): ShippingV2AccessPermissions {
  return {
    ...NO_SHIPPING_V2_PERMISSIONS,
    canViewItems: true,
    canEditProviderItemFields: true,
    canViewPackings: true,
    canEditPackingWeight: true,
    canAddItemsToPacking: true,
    canClosePacking: true,
    canViewInvoice: true,
    canViewPayments: true,
    canViewNovedades: true,
    canRespondNovedades: provider?.puedeResponderNovedadesGarantias === true,
    canViewPackingLocation: true,
    canViewProviderCost: true,
  };
}

export function staffShippingV2Access(): ShippingV2AccessContext {
  return { isAdmin: true, mode: "staff", permissions: STAFF_SHIPPING_V2_PERMISSIONS };
}

export function noShippingV2Access(): ShippingV2AccessContext {
  return { isAdmin: false, mode: "none", permissions: NO_SHIPPING_V2_PERMISSIONS };
}

export function providerShippingV2Access(provider: ShippingV2Proveedor): ShippingV2AccessContext {
  return {
    isAdmin: false,
    mode: "provider",
    providerId: provider.id,
    providerCode: provider.proveedorId,
    providerName: provider.nombre || provider.label,
    permissions: providerShippingV2Permissions(provider),
  };
}

export function isShippingV2ProviderAccess(access?: ShippingV2AccessContext) {
  return Boolean(access && access.mode === "provider" && access.providerId);
}

export function canShippingV2(access: ShippingV2AccessContext | undefined, permission: keyof ShippingV2AccessPermissions) {
  if (!access) return true;
  return access.permissions[permission] === true;
}

export function assertShippingV2Permission(access: ShippingV2AccessContext | undefined, permission: keyof ShippingV2AccessPermissions, message: string) {
  if (!canShippingV2(access, permission)) {
    throw new Error(message);
  }
}
