import { ShippingV2Pestanas } from "@/components/shipping-v2/ShippingV2Pestanas";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { StaffBadge, StaffPageHeader } from "@/components/staff/StaffDesignSystem";
import { Button } from "@/components/ui/button";
import { getShippingV2AccessContextForSession, getShippingV2Packings, getShippingV2Proveedores } from "@/lib/shipping-v2/airtable";
import { getSessionFromCookie } from "@/lib/session";
import { requirePantallaVisible } from "@/lib/permissions/pantallas";
import type { ShippingV2Proveedor } from "@/types/shipping-v2";
import { ShippingV2NewItemForm, type ShippingV2CajaAbierta } from "./ShippingV2NewItemForm";

export const dynamic = "force-dynamic";

export default async function ShippingV2NewItemPage({ searchParams }: { searchParams?: Promise<{ activo?: string | string[] }> }) {
  const params = searchParams ? await searchParams : {};
  const activoParam = Array.isArray(params.activo) ? params.activo[0] : params.activo;
  const esActivo = activoParam === "1";
  let proveedores: ShippingV2Proveedor[] = [];
  let cajasAbiertas: ShippingV2CajaAbierta[] = [];
  let error = "";
  const session = await getSessionFromCookie();
  requirePantallaVisible(session?.user.pantallasRestringidas ?? {}, "shipping-v2", "items");
  const access = await getShippingV2AccessContextForSession(session);
  if (!access.permissions.canEditItems) {
    redirect("/shipping-v2/packings");
  }

  try {
    const [listaProveedores, packings] = await Promise.all([getShippingV2Proveedores(), getShippingV2Packings(access)]);
    proveedores = listaProveedores;
    // Cajas donde todavía se pueden meter artículos ("En Proceso").
    cajasAbiertas = packings
      .filter((p) => (p.estado || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "en proceso")
      .map((p) => ({
        id: p.id,
        codigo: p.packingId || p.id,
        nombre: p.nombre || "",
        proveedorResponsableId: p.proveedorResponsableId,
        proveedorLogisticoEcId: p.proveedorLogisticoEcId,
      }));
  } catch (loadError) {
    console.error("Error al cargar proveedores de Shipping V2:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudieron cargar proveedores.";
  }

  return (
    <StaffAppShell activeHref="/shipping-v2/items" sectionLabel="Shipping V2">
      <div className="w-full max-w-none space-y-3">
      <ShippingV2Pestanas />
      <div className="w-full max-w-none space-y-3">
        <StaffPageHeader
          eyebrow={<StaffBadge tone="lime">SHIPPING V2</StaffBadge>}
          title={esActivo ? "Registrar activo de la tienda" : "Registrar artículo"}
          density="compact"
          actions={
            <Button asChild className="h-9 rounded-lg bg-[#D7FF4F] px-4 text-sm font-black text-[#151515] hover:bg-[#D7FF4F]/90">
              <Link href={esActivo ? "/shipping-v2/activos" : "/shipping-v2/items"}>{esActivo ? "Volver a Activos" : "Volver a Items"}</Link>
            </Button>
          }
        />
        {error ? (
          <section className="rounded-xl border border-orange-300/25 bg-orange-300/10 p-4 text-orange-100">
            <p className="text-sm font-semibold uppercase tracking-normal">Airtable V2 no disponible</p>
            <p className="mt-2 text-sm leading-6 text-orange-100/85">{error}</p>
          </section>
        ) : null}
        <ShippingV2NewItemForm proveedores={proveedores} cajasAbiertas={cajasAbiertas} esActivoInicial={esActivo} />
      </div>
    </div>
    </StaffAppShell>
  );
}
