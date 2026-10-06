import { ShippingV2Pestanas } from "@/components/shipping-v2/ShippingV2Pestanas";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { getShippingV2AccessContextForSession, getShippingV2ArticulosSueltosEnCamino, getShippingV2Novedades, getShippingV2Packings, getShippingV2PackingsReviewProgress, getShippingV2Proveedores } from "@/lib/shipping-v2/airtable";
import { getSessionFromCookie } from "@/lib/session";
import { requirePantallaVisible } from "@/lib/permissions/pantallas";
import type { ShippingV2AccessPermissions, ShippingV2Item, ShippingV2Packing, ShippingV2PackingReviewSummary, ShippingV2Proveedor } from "@/types/shipping-v2";
import { ShippingV2PackingsClient } from "./ShippingV2PackingsClient";
import { ShippingV2SueltosEnCamino, type CajaAbiertaLogistica } from "./ShippingV2SueltosEnCamino";

export const dynamic = "force-dynamic";

export default async function ShippingV2PackingsPage() {
  let packings: ShippingV2Packing[] = [];
  let proveedores: ShippingV2Proveedor[] = [];
  let permissions: ShippingV2AccessPermissions | null = null;
  let providerName = "";
  let error = "";
  let reviewSummaries: Record<string, ShippingV2PackingReviewSummary> = {};
  // Pestaña Logística (punto 2): además de las cajas, los artículos que viajan solos.
  let sueltos: ShippingV2Item[] = [];
  let todosProveedores: ShippingV2Proveedor[] = [];
  let cajasAbiertas: CajaAbiertaLogistica[] = [];

  const sessionForGuard = await getSessionFromCookie();
  requirePantallaVisible(sessionForGuard?.user.pantallasRestringidas ?? {}, "shipping-v2", "packings");

  try {
    const session = await getSessionFromCookie();
    const access = await getShippingV2AccessContextForSession(session);
    permissions = access.permissions;
    providerName = access.providerName || access.providerCode || "";
    [packings, proveedores, sueltos] = await Promise.all([
      getShippingV2Packings(access),
      getShippingV2Proveedores(),
      getShippingV2ArticulosSueltosEnCamino(access).catch((sueltosError) => {
        console.error("No se pudieron cargar los artículos sueltos en camino:", sueltosError);
        return [] as ShippingV2Item[];
      }),
    ]);
    todosProveedores = proveedores;
    // Un proveedor (por ejemplo Roberto) solo debe ver nombres ligados a lo
    // suyo: él mismo y el casillero/transportistas de sus artículos.
    if (!access.isAdmin && access.providerId) {
      const visibles = new Set<string>([access.providerId]);
      for (const item of sueltos) {
        for (const id of [item.proveedorId, item.proveedorLogisticoId, item.transportistaOrigenId, item.transportistaEcuadorId]) {
          if (id) visibles.add(id);
        }
      }
      todosProveedores = proveedores.filter((provider) => visibles.has(provider.id));
    }
    cajasAbiertas = packings
      .filter((p) => (p.estado || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "en proceso")
      .map((p) => ({ id: p.id, codigo: p.packingId || p.id, nombre: p.nombre || "", proveedorResponsableId: p.proveedorResponsableId, proveedorLogisticoEcId: p.proveedorLogisticoEcId }));
    if (!access.isAdmin && access.providerId) proveedores = proveedores.filter((provider) => provider.id === access.providerId);

    // El avance de revisión es informativo: si falla, la lista se muestra
    // igual sin la columna en vez de tumbar la pantalla entera.
    try {
      // Para un proveedor, getShippingV2Novedades vuelve a leer items y
      // packings completos para filtrar por acceso: demasiado caro solo para
      // un aviso de la lista. El proveedor igual ve el avance de revisión.
      const novedades = access.isAdmin ? await getShippingV2Novedades(access) : [];
      reviewSummaries = Object.fromEntries(await getShippingV2PackingsReviewProgress(packings, novedades));
    } catch (progressError) {
      console.error("No se pudo calcular el avance de revisión de packings Shipping V2:", progressError);
    }
  } catch (loadError) {
    console.error("Error al cargar packings Shipping V2:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudieron cargar los packings.";
  }

  return (
    <StaffAppShell activeHref="/shipping-v2/packings" sectionLabel="Shipping V2">
      <div className="w-full max-w-none space-y-3">
      <ShippingV2Pestanas />
      <ShippingV2PackingsClient packings={packings} proveedores={proveedores} error={error} permissions={permissions} providerName={providerName} reviewSummaries={reviewSummaries} sueltosCount={sueltos.length} />
      <div id="sueltos">
        <ShippingV2SueltosEnCamino
          items={sueltos}
          proveedores={todosProveedores}
          cajasAbiertas={cajasAbiertas}
          canEdit={permissions?.canEditItems === true}
          canAddToPacking={permissions?.canAddItemsToPacking === true}
        />
      </div>
    </div>
    </StaffAppShell>
  );
}
