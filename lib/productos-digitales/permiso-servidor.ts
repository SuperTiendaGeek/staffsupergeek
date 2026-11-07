import "server-only";

import type { StaffSession } from "@/lib/session";

/**
 * Punto 5B-2 (decisión del dueño): solo Staff y Administradores compran y
 * gestionan licencias (editar, reclamo, anular); los técnicos no. Es el mismo
 * permiso que "Registrar compra" en Shipping V2.
 */
export async function puedeGestionarLicencias(session: StaffSession | null | undefined): Promise<boolean> {
  if (!session) return false;
  const { getShippingV2AccessContextForSession } = await import("@/lib/shipping-v2/airtable");
  const { perfilShippingV2 } = await import("@/lib/shipping-v2/access");
  const { puedeComprar } = await import("@/lib/compras/reglas");
  const access = await getShippingV2AccessContextForSession(session).catch(() => undefined);
  return !!access && access.permissions.canEditItems === true && puedeComprar(perfilShippingV2(access));
}
