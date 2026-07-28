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

export const STAFF_SHIPPING_V2_PERMISSIONS: ShippingV2AccessPermissions = {
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

export const NO_SHIPPING_V2_PERMISSIONS: ShippingV2AccessPermissions = {
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

// ─── Permisos que se configuran por proveedor desde Airtable ─────────────────
//
// Campo "Permisos portal proveedor" (multipleSelects) en Shipping Proveedores.
// La etiqueta es la que ve el dueño del negocio al marcar; el valor es el
// permiso interno. Lo que NO está en esta lista no se le puede dar a un
// proveedor por configuración: crear packings, quitar artículos, gestionar
// pagos, usar Recepción, ver los costos internos o facturar son de staff.
export const PERMISOS_PORTAL_PROVEEDOR = {
  "Ver artículos": "canViewItems",
  "Editar nombre y observaciones": "canEditProviderItemFields",
  "Ver packings": "canViewPackings",
  "Editar peso del packing": "canEditPackingWeight",
  "Agregar artículos al packing": "canAddItemsToPacking",
  "Cerrar packing": "canClosePacking",
  "Ver factura del packing": "canViewInvoice",
  "Ver pagos": "canViewPayments",
  "Ver novedades": "canViewNovedades",
  "Responder novedades": "canRespondNovedades",
  "Ver ubicación del packing": "canViewPackingLocation",
  "Ver su costo de proveedor": "canViewProviderCost",
} as const satisfies Record<string, keyof ShippingV2AccessPermissions>;

export type EtiquetaPermisoProveedor = keyof typeof PERMISOS_PORTAL_PROVEEDOR;

export const ETIQUETAS_PERMISO_PROVEEDOR = Object.keys(
  PERMISOS_PORTAL_PROVEEDOR
) as EtiquetaPermisoProveedor[];

function normalizarEtiqueta(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const PERMISO_POR_ETIQUETA_NORMALIZADA = new Map<string, keyof ShippingV2AccessPermissions>(
  Object.entries(PERMISOS_PORTAL_PROVEEDOR).map(([etiqueta, permiso]) => [
    normalizarEtiqueta(etiqueta),
    permiso as keyof ShippingV2AccessPermissions,
  ])
);

/**
 * Traduce lo marcado en Airtable al conjunto de permisos del proveedor.
 *
 * Sin nada marcado: NO puede hacer nada. Dar de alta un proveedor y olvidarse
 * de marcar permisos no debe concederle acceso por accidente.
 */
export function providerShippingV2Permissions(
  provider?: Pick<ShippingV2Proveedor, "permisosPortal">
): ShippingV2AccessPermissions {
  const permisos: ShippingV2AccessPermissions = { ...NO_SHIPPING_V2_PERMISSIONS };
  for (const etiqueta of provider?.permisosPortal ?? []) {
    const permiso = PERMISO_POR_ETIQUETA_NORMALIZADA.get(normalizarEtiqueta(etiqueta));
    if (permiso) permisos[permiso] = true;
  }
  return permisos;
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
