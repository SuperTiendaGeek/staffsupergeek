import { notFound } from "next/navigation";
import { PortalShell } from "@/components/PortalShell";
import { getShippingV2AccessContextForSession, getShippingV2Destinatarios, getShippingV2Novedades, getShippingV2PackingById, getShippingV2PackingCandidateItems, getShippingV2Proveedores } from "@/lib/shipping-v2/airtable";
import { getSessionFromCookie } from "@/lib/session";
import type { ShippingV2Destinatario, ShippingV2Item, ShippingV2Novedad, ShippingV2Packing, ShippingV2Proveedor } from "@/types/shipping-v2";
import { ShippingV2PackingDetailClient } from "./ShippingV2PackingDetailClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function ShippingV2PackingDetailPage({ params }: Props) {
  const { id } = await params;
  let packing: ShippingV2Packing | null = null;
  let candidates: ShippingV2Item[] = [];
  let proveedores: ShippingV2Proveedor[] = [];
  let novedades: ShippingV2Novedad[] = [];
  let destinatarios: ShippingV2Destinatario[] = [];
  let isAdmin = false;
  let error = "";

  try {
    const session = await getSessionFromCookie();
    const access = await getShippingV2AccessContextForSession(session);
    isAdmin = access.isAdmin;
    const [loadedPacking, loadedCandidates, loadedProveedores, loadedNovedades, loadedDestinatarios] = await Promise.all([
      getShippingV2PackingById(id, access, { includeAiName: false }),
      getShippingV2PackingCandidateItems(id, access),
      getShippingV2Proveedores(),
      getShippingV2Novedades(),
      getShippingV2Destinatarios(),
    ]);
    packing = loadedPacking;
    candidates = loadedCandidates;
    proveedores = loadedProveedores;
    novedades = loadedNovedades.filter((novedad) => novedad.packingId === loadedPacking.id || Boolean(novedad.itemId && loadedPacking.itemIds.includes(novedad.itemId)));
    destinatarios = loadedDestinatarios;
    if (!access.isAdmin && access.providerId) proveedores = proveedores.filter((provider) => provider.id === access.providerId);
  } catch (loadError) {
    console.error("Error al cargar detalle de packing Shipping V2:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudo cargar el packing.";
  }

  if (!packing && !error) notFound();

  return (
    <PortalShell density="compact" eyebrow="Shipping V2" title="Detalle Packing" description="Gestión de grupo físico de items">
      {error || !packing ? (
        <section className="rounded-[1rem] border border-orange-300/25 bg-orange-300/10 p-4 text-orange-100">
          <p className="text-sm font-semibold uppercase tracking-normal">Packing no disponible</p>
          <p className="mt-2 text-sm leading-6 text-orange-100/85">{error || "No se pudo cargar el packing."}</p>
        </section>
      ) : (
        <ShippingV2PackingDetailClient packing={packing} candidates={candidates} proveedores={proveedores} novedades={novedades} destinatarios={destinatarios} isAdmin={isAdmin} />
      )}
    </PortalShell>
  );
}
