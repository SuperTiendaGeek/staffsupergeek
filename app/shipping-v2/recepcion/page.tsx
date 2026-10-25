import { ShippingV2Pestanas } from "@/components/shipping-v2/ShippingV2Pestanas";
import { redirect } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { getShippingV2AccessContextForSession, getShippingV2Novedades, getShippingV2Packings, getShippingV2Proveedores, getShippingV2ReceptionItems } from "@/lib/shipping-v2/airtable";
import { shouldShowShippingV2ReceptionItem } from "@/lib/shipping-v2/reception-visibility";
import { getSessionFromCookie } from "@/lib/session";
import { requirePantallaVisible } from "@/lib/permissions/pantallas";
import type { ShippingV2Item, ShippingV2Novedad, ShippingV2Packing, ShippingV2Proveedor } from "@/types/shipping-v2";
import { ShippingV2RecepcionClient } from "./ShippingV2RecepcionClient";

export const dynamic = "force-dynamic";

function primero(value: string | string[] | undefined) {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" && /^rec[A-Za-z0-9]{14}$/.test(v) ? v : undefined;
}

/**
 * Recepción (punto 9 · fase 2, 15-oct-2026): empieza con lo que ya llegó.
 * "Por llegar" pasó a Logística, donde se marca "Llegó". Desde allí se puede
 * abrir esta pantalla con solo una caja (?packing=<id>) o un artículo
 * (?articulo=<id>).
 */
export default async function ShippingV2RecepcionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const filtro = { packingId: primero(params.packing), articuloId: primero(params.articulo) };
  let items: ShippingV2Item[] = [];
  let packings: ShippingV2Packing[] = [];
  let proveedores: ShippingV2Proveedor[] = [];
  let novedades: ShippingV2Novedad[] = [];
  let error = "";
  const session = await getSessionFromCookie();
  requirePantallaVisible(session?.user.pantallasRestringidas ?? {}, "shipping-v2", "recepcion");
  const access = await getShippingV2AccessContextForSession(session);
  if (!access.permissions.canUseRecepcion) {
    // Punto 18: quien no usa Recepción (técnico) vuelve a su primera pestaña.
    redirect("/shipping-v2");
  }

  try {
    const [loadedItems, loadedPackings, loadedProveedores, loadedNovedades] = await Promise.all([
      getShippingV2ReceptionItems({ includeAiName: false, access }),
      getShippingV2Packings(access),
      getShippingV2Proveedores(),
      getShippingV2Novedades(access),
    ]);
    items = loadedItems.filter(shouldShowShippingV2ReceptionItem);
    packings = loadedPackings;
    proveedores = !access.isAdmin && access.providerId ? loadedProveedores.filter((provider) => provider.id === access.providerId) : loadedProveedores;
    novedades = loadedNovedades;
  } catch (loadError) {
    console.error("Error al cargar recepción Shipping V2:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudo cargar recepción.";
  }

  return (
    <StaffAppShell activeHref="/shipping-v2/recepcion" sectionLabel="Shipping V2">
      <div className="w-full max-w-none space-y-3">
        <ShippingV2Pestanas />
        <ShippingV2RecepcionClient
          items={items}
          packings={packings}
          proveedores={proveedores}
          novedades={novedades}
          error={error}
          preferenceScope={session?.user.userId || session?.user.email || "staff"}
          filtro={filtro.packingId || filtro.articuloId ? filtro : undefined}
        />
      </div>
    </StaffAppShell>
  );
}
