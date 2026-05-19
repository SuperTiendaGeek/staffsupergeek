import Link from "next/link";
import { notFound } from "next/navigation";
import { PortalShell } from "@/components/PortalShell";
import { PackingDetailClient } from "@/components/shipping/PackingDetailClient";
import { ShippingNav } from "@/components/shipping/ShippingDashboard";
import { canAccessApp, isAdministratorRole } from "@/lib/apps";
import { obtenerShippingPackingDetalle } from "@/lib/shipping/airtable";
import { getSessionFromCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

function isAirtableRecordId(value: string) {
  return /^rec[a-zA-Z0-9]{14}$/.test(value);
}

export default async function ShippingPackingDetailPage({ params }: PageProps) {
  const session = await getSessionFromCookie();
  const { id } = await params;

  if (!session || !canAccessApp(session, "Shipping")) {
    return (
      <PortalShell eyebrow="Shipping" title="Acceso denegado" description="No tienes permiso para ver este packing.">
        <Link href="/shipping/packings" className="rounded-md border border-white/10 px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:text-geek-lime">
          Volver a packings
        </Link>
      </PortalShell>
    );
  }

  if (!isAirtableRecordId(id)) {
    notFound();
  }

  let detail: Awaited<ReturnType<typeof obtenerShippingPackingDetalle>> | null = null;
  let error = "";

  try {
    detail = await obtenerShippingPackingDetalle(id);
  } catch (loadError) {
    console.error("Error al cargar detalle de packing:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudo cargar el packing.";
  }

  return (
    <PortalShell eyebrow="Shipping" title={detail?.packing.pack ?? "Packing"} description="Detalle operativo del packing.">
      <div className="w-full space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ShippingNav />
          <Link href="/shipping/packings" className="rounded-md border border-white/10 px-4 py-2.5 text-center text-sm font-semibold text-zinc-200 transition hover:border-geek-lime/50 hover:text-geek-lime">
            Volver a packings
          </Link>
        </div>
        {error ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}
        {detail ? <PackingDetailClient initialDetail={detail} isAdmin={isAdministratorRole(session.user.rol)} /> : null}
      </div>
    </PortalShell>
  );
}
