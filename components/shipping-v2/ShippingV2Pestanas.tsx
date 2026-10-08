import { getShippingV2AccessContextForSession } from "@/lib/shipping-v2/airtable";
import { PESTANAS_SHIPPING_V2 } from "@/lib/shipping-v2/pestanas";
import { puedeVerPantalla } from "@/lib/permissions/pantallas";
import { getSessionFromCookie } from "@/lib/session";
import { ShippingV2PestanasBarra } from "./ShippingV2PestanasBarra";

/**
 * Barra de pestañas fija de Shipping V2 (punto 2 de la auditoría). Va arriba
 * de cada pantalla del módulo. Solo muestra las pestañas que el usuario puede
 * ver: respeta las "Pantallas restringidas" de cada usuario y los permisos de
 * Shipping V2 (un proveedor ve solo lo que su acceso le permite).
 */
export async function ShippingV2Pestanas() {
  const session = await getSessionFromCookie();
  const restringidas = session?.user.pantallasRestringidas ?? {};
  const access = await getShippingV2AccessContextForSession(session);
  const pestanas = PESTANAS_SHIPPING_V2.filter(
    (p) => puedeVerPantalla(restringidas, "shipping-v2", p.key) && access.permissions[p.permiso] === true && (!p.soloStaff || access.isAdmin)
  );
  const puedeRegistrar = access.permissions.canEditItems === true && puedeVerPantalla(restringidas, "shipping-v2", "items");
  return <ShippingV2PestanasBarra pestanas={[...pestanas]} puedeRegistrar={puedeRegistrar} />;
}
