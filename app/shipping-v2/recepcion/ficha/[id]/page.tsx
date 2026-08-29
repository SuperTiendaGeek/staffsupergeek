import { redirect } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { getShippingV2AccessContextForSession, getShippingV2ItemById, getShippingV2TechnicalOptionSets } from "@/lib/shipping-v2/airtable";
import { getSessionFromCookie } from "@/lib/session";
import { requirePantallaVisible } from "@/lib/permissions/pantallas";
import { ShippingV2FichaTecnicaClient } from "./ShippingV2FichaTecnicaClient";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ShippingV2FichaTecnicaPage({ params }: Props) {
  const { id } = await params;
  const session = await getSessionFromCookie();
  requirePantallaVisible(session?.user.pantallasRestringidas ?? {}, "shipping-v2", "recepcion");
  const access = await getShippingV2AccessContextForSession(session);
  if (!access.permissions.canUseRecepcion) {
    redirect("/shipping-v2/packings");
  }
  const [item, technicalOptions] = await Promise.all([
    getShippingV2ItemById(id, { includeAiName: false, access }),
    getShippingV2TechnicalOptionSets(),
  ]);
  if (item.recibido !== true) {
    redirect("/shipping-v2/recepcion");
  }

  return (
    <StaffAppShell activeHref="/shipping-v2/recepcion" sectionLabel="Shipping V2">
      <ShippingV2FichaTecnicaClient item={item} technicalOptions={technicalOptions} />
    </StaffAppShell>
  );
}
