// Control de acceso de Shipping V2 — puro, sin Airtable ni red, testeable.
//
// Vive aparte de airtable.ts (4.600 líneas) por dos razones: es código de
// seguridad y merece poder probarse solo, y porque desde que existe el portal
// de proveedores hay usuarios EXTERNOS entrando al módulo.
//
// ─── Regla de oro: negar por omisión ─────────────────────────────────────────
//
// `canShippingV2()` devolvía `true` cuando no le pasaban contexto. Con 25 rutas
// de API, bastaba con que una nueva olvidara pasar el contexto para quedar
// abierta al proveedor sin que nada avisara. Ahora sin contexto no hay permiso.
// Para las lecturas internas del módulo que sí necesitan permiso amplio está
// `systemShippingV2Access()`, que hay que pedir por su nombre.

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

// ─── Contextos ───────────────────────────────────────────────────────────────

export function staffShippingV2Access(): ShippingV2AccessContext {
  return { isAdmin: true, mode: "staff", permissions: STAFF_SHIPPING_V2_PERMISSIONS };
}

/**
 * Contexto para lecturas INTERNAS del módulo, nunca para usuarios.
 *
 * Se usa cuando una función exportada ya validó el permiso del usuario en la
 * frontera (la ruta de API) y después necesita releer registros para terminar
 * su trabajo — por ejemplo `addFotosToShippingV2Item` releyendo el item que
 * acaba de modificar.
 *
 * REGLA: no usar esto en una ruta de API. Ahí el contexto correcto es el de la
 * sesión (`getShippingV2AccessContextForSession`).
 */
export function systemShippingV2Access(): ShippingV2AccessContext {
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

// ─── Consultas de permiso ────────────────────────────────────────────────────

/** ¿Tiene este permiso? Sin contexto: NO. */
export function canShippingV2(
  access: ShippingV2AccessContext | undefined,
  permission: keyof ShippingV2AccessPermissions
) {
  if (!access) return false;
  return access.permissions[permission] === true;
}

export function assertShippingV2Permission(
  access: ShippingV2AccessContext | undefined,
  permission: keyof ShippingV2AccessPermissions,
  message: string
) {
  if (!canShippingV2(access, permission)) throw new Error(message);
}

// ─── Alcance: ¿de quién es este registro? ────────────────────────────────────
//
// Un proveedor solo ve lo suyo. Staff y operaciones internas ven todo. Sin
// contexto no se ve nada.

export function puedeAlcanzarProveedor(
  access: ShippingV2AccessContext | undefined,
  ...proveedorIds: Array<string | null | undefined>
): boolean {
  if (!access) return false;
  if (access.isAdmin) return true;
  if (!access.providerId) return false;
  return proveedorIds.some((id) => Boolean(id) && id === access.providerId);
}
