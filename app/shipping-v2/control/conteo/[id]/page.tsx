import { redirect } from "next/navigation";
import { ShippingV2Pestanas } from "@/components/shipping-v2/ShippingV2Pestanas";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { getShippingV2AccessContextForSession } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName } from "@/lib/shipping-v2/auth";
import { requirePantallaVisible } from "@/lib/permissions/pantallas";
import { getSessionFromCookie } from "@/lib/session";
import { ConteoClient } from "./ConteoClient";

export const dynamic = "force-dynamic";

// Conteo físico (punto 10c-2). Lo cuenta el Staff; regularizar el stock queda
// para el Administrador.

export default async function ShippingV2ConteoPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookie();
  requirePantallaVisible(session?.user.pantallasRestringidas ?? {}, "shipping-v2", "control");
  const access = await getShippingV2AccessContextForSession(session);
  if (!access.isAdmin || !(access.permissions.canUseRecepcion || access.permissions.canEditItems)) redirect("/shipping-v2");
  const { id } = await params;

  return (
    <StaffAppShell activeHref="/shipping-v2/items" sectionLabel="Shipping V2">
      <div className="w-full max-w-none space-y-3">
        <ShippingV2Pestanas />
        <ConteoClient conteoId={id} actor={getShippingV2SessionName(session)} esAdministrador={access.isSiteAdmin === true} />
      </div>
    </StaffAppShell>
  );
}
