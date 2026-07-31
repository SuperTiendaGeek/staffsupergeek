import { notFound } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { getShippingV2AccessContextForSession, getShippingV2Destinatarios, getShippingV2Novedades, getShippingV2PackingById, getShippingV2PackingCandidateItems, getShippingV2Proveedores } from "@/lib/shipping-v2/airtable";
import { getSessionFromCookie } from "@/lib/session";
import type { ShippingV2AccessPermissions, ShippingV2Destinatario, ShippingV2Item, ShippingV2Novedad, ShippingV2Packing, ShippingV2Proveedor } from "@/types/shipping-v2";
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
  let permissions: ShippingV2AccessPermissions | null = null;
  let providerName = "";
  let error = "";

  try {
    const session = await getSessionFromCookie();
    const access = await getShippingV2AccessContextForSession(session);
    isAdmin = access.isAdmin;
    permissions = access.permissions;
    providerName = access.providerName || access.providerCode || "";
    const loadedProveedores = await getShippingV2Proveedores();
    const [loadedPacking, loadedNovedades, loadedDestinatarios] = await Promise.all([
      getShippingV2PackingById(id, access, { includeAiName: false, proveedores: loadedProveedores }),
      getShippingV2Novedades(access),
      getShippingV2Destinatarios(access),
    ]);
    const loadedCandidates = await getShippingV2PackingCandidateItems(id, access, {
      packing: loadedPacking,
      proveedores: loadedProveedores,
    });
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
    <StaffAppShell activeHref="/shipping-v2/packings" sectionLabel="Shipping V2">
      {error || !packing ? (
        <section className="rounded-[1rem] border border-orange-300/25 bg-orange-300/10 p-4 text-orange-100">
          <p className="text-sm font-semibold uppercase tracking-normal">Packing no disponible</p>
          <p className="mt-2 text-sm leading-6 text-orange-100/85">{error || "No se pudo cargar el packing."}</p>
        </section>
      ) : (
        <ShippingV2PackingDetailClient packing={packing} candidates={candidates} proveedores={proveedores} novedades={novedades} destinatarios={destinatarios} isAdmin={isAdmin} permissions={permissions} providerName={providerName} />
      )}
    </StaffAppShell>
  );
}
