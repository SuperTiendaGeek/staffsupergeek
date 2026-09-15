import { redirect } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import {
  getShippingV2AccessContextForSession,
  getShippingV2InspeccionTecnica,
  getShippingV2RepuestosDisponibles,
} from "@/lib/shipping-v2/airtable";
import { getSessionFromCookie } from "@/lib/session";
import { requirePantallaVisible } from "@/lib/permissions/pantallas";
import { ShippingV2InspeccionClient } from "./ShippingV2InspeccionClient";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export default async function ShippingV2InspeccionPage({ params }: Params) {
  const { id } = await params;

  const session = await getSessionFromCookie();
  requirePantallaVisible(session?.user.pantallasRestringidas ?? {}, "shipping-v2", "recepcion");

  const access = await getShippingV2AccessContextForSession(session);
  if (!access.permissions.canUseRecepcion) redirect("/shipping-v2");

  const inspeccion = await getShippingV2InspeccionTecnica(id, { access });

  // Un item que todavía no llegó no se puede inspeccionar. Se devuelve a
  // Recepción en vez de mostrar una pantalla que no va a poder guardar nada.
  if (inspeccion.item.recibido !== true) redirect("/shipping-v2/recepcion");

  // Repuestos con unidades libres, para la pestaña de Mejoras. Se leen en el
  // servidor: el token de Airtable no sale de aquí.
  const repuestos = (await getShippingV2RepuestosDisponibles(access))
    .filter((repuesto) => repuesto.id !== inspeccion.item.id);

  return (
    <StaffAppShell activeHref="/shipping-v2/recepcion" sectionLabel="Shipping V2">
      <ShippingV2InspeccionClient
        inicial={inspeccion}
        repuestos={repuestos}
        usuario={session?.user.nombre || session?.user.email || "Portal Staff"}
        puedeEditarItems={access.permissions.canEditItems}
        puedeCrearNovedades={access.permissions.canCreateNovedades}
      />
    </StaffAppShell>
  );
}
