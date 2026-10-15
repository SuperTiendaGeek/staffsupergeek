import { ShippingV2Pestanas } from "@/components/shipping-v2/ShippingV2Pestanas";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { getShippingV2AccessContextForSession, getShippingV2OrdenCompraById, getShippingV2OrdenesDeProveedor } from "@/lib/shipping-v2/airtable";
import { getSessionFromCookie } from "@/lib/session";
import { requirePantallaVisible } from "@/lib/permissions/pantallas";
import type { ShippingV2OrdenCompra } from "@/types/shipping-v2";
import { OrdenCompraClient } from "./OrdenCompraClient";

export const dynamic = "force-dynamic";

/** Punto 9d (14-oct-2026): una orden de compra con sus artículos y su pago. */
export default async function OrdenCompraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionFromCookie();
  requirePantallaVisible(session?.user.pantallasRestringidas ?? {}, "shipping-v2", "pagos");

  let orden: ShippingV2OrdenCompra | null = null;
  let otras: Array<{ id: string; ocId: string; numeroProveedor?: string; fechaCompra?: string }> = [];
  let error = "";
  let puedePagar = false;
  let esAdmin = false;
  let puedeAgregar = false;
  try {
    const access = await getShippingV2AccessContextForSession(session);
    puedePagar = access.permissions.canManagePayments === true;
    puedeAgregar = access.permissions.canEditItems === true;
    esAdmin = access.isSiteAdmin === true;
    orden = await getShippingV2OrdenCompraById(id, access);
    if (esAdmin && orden.proveedorId) {
      otras = (await getShippingV2OrdenesDeProveedor(orden.proveedorId, access)).filter((o) => o.id !== orden?.id);
    }
  } catch (loadError) {
    console.error("Error al cargar la orden de compra:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudo cargar la orden.";
  }

  return (
    <StaffAppShell activeHref="/shipping-v2/pagos" sectionLabel="Shipping V2">
      <div className="w-full max-w-none space-y-3">
        <ShippingV2Pestanas />
        {orden ? (
          <OrdenCompraClient orden={orden} otras={otras} puedePagar={puedePagar} puedeAgregar={puedeAgregar} esAdmin={esAdmin} />
        ) : (
          <section className="rounded-xl border border-orange-300/25 bg-orange-300/10 p-4 text-sm text-orange-100">{error || "Orden no encontrada."}</section>
        )}
      </div>
    </StaffAppShell>
  );
}
