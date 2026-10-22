import { redirect } from "next/navigation";
import { ShippingV2Pestanas } from "@/components/shipping-v2/ShippingV2Pestanas";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { getShippingV2AccessContextForSession } from "@/lib/shipping-v2/airtable";
import { requirePantallaVisible } from "@/lib/permissions/pantallas";
import { getSessionFromCookie } from "@/lib/session";
import { FusionarClient } from "./FusionarClient";

export const dynamic = "force-dynamic";

// Fusionar SKU (punto 10c-3): solo el Administrador.

export default async function ShippingV2FusionarPage({ searchParams }: { searchParams: Promise<{ skus?: string }> }) {
  const session = await getSessionFromCookie();
  requirePantallaVisible(session?.user.pantallasRestringidas ?? {}, "shipping-v2", "control");
  const access = await getShippingV2AccessContextForSession(session);
  if (!access.isAdmin || access.isSiteAdmin !== true) redirect("/shipping-v2/control");
  const { skus } = await searchParams;
  const lista = String(skus ?? "").split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 10);

  return (
    <StaffAppShell activeHref="/shipping-v2/items" sectionLabel="Shipping V2">
      <div className="w-full max-w-none space-y-3">
        <ShippingV2Pestanas />
        <FusionarClient skusIniciales={Array.from(new Set(lista))} />
      </div>
    </StaffAppShell>
  );
}
