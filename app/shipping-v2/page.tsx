import { redirect } from "next/navigation";
import { getShippingV2AccessContextForSession } from "@/lib/shipping-v2/airtable";
import { PESTANAS_SHIPPING_V2 } from "@/lib/shipping-v2/pestanas";
import { puedeVerPantalla } from "@/lib/permissions/pantallas";
import { getSessionFromCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

// La portada con números se retiró (punto 2 de la auditoría, oct-2026): esos
// pendientes ahora se ven en la barra de pestañas de cada pantalla. Entrar a
// Shipping V2 lleva a la primera pestaña que el usuario puede ver.
export default async function ShippingV2Home() {
  const session = await getSessionFromCookie();
  const restringidas = session?.user.pantallasRestringidas ?? {};
  const access = await getShippingV2AccessContextForSession(session);
  const primera = PESTANAS_SHIPPING_V2.find(
    (p) => puedeVerPantalla(restringidas, "shipping-v2", p.key) && access.permissions[p.permiso] === true
  );
  redirect(primera?.href ?? "/acceso-denegado");
}
