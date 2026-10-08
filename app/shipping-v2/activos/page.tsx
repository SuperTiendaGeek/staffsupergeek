import { redirect } from "next/navigation";
import { ShippingV2Pestanas } from "@/components/shipping-v2/ShippingV2Pestanas";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { StaffBadge, StaffPageHeader } from "@/components/staff/StaffDesignSystem";
import { getShippingV2AccessContextForSession, getShippingV2Activos } from "@/lib/shipping-v2/airtable";
import { requirePantallaVisible } from "@/lib/permissions/pantallas";
import { getSessionFromCookie } from "@/lib/session";
import type { ShippingV2Item } from "@/types/shipping-v2";
import { ShippingV2ActivosClient, type ActivoFila } from "./ShippingV2ActivosClient";

export const dynamic = "force-dynamic";

// Pestaña "Activos de la tienda" (auditoría Shipping V2, punto 4, 8-oct-2026).
// Solo los activos fijos ("Es uso local"): lo que la tienda usa y no vende.
// La mercadería está en Artículos; aquí no aparece nada que se venda.

function aFila(item: ShippingV2Item): ActivoFila {
  return {
    id: item.id,
    sku: item.sku,
    nombre: item.nombre,
    categoria: item.categoria ?? "",
    estado: item.estado ?? "",
    cantidad: item.cantidad ?? 0,
    recibido: item.recibido === true,
    costoUnidad: item.costoTotalUnidad ?? item.costoProveedor ?? null,
    proveedor: item.proveedorNombre || "",
    marca: item.marca || "",
    modelo: item.modelo || "",
    numeroSerie: item.numeroSerie || "",
    fechaRegistro: item.fechaRegistro || item.createdTime || "",
  };
}

export default async function ShippingV2ActivosPage() {
  const session = await getSessionFromCookie();
  requirePantallaVisible(session?.user.pantallasRestringidas ?? {}, "shipping-v2", "activos");
  const access = await getShippingV2AccessContextForSession(session);
  if (!access.permissions.canViewItems || !access.isAdmin) redirect("/shipping-v2");

  let filas: ActivoFila[] = [];
  let error = "";
  try {
    filas = (await getShippingV2Activos(access)).map(aFila);
  } catch (e) {
    console.error("Error al cargar los activos de la tienda:", e);
    error = e instanceof Error ? e.message : "No se pudieron cargar los activos.";
  }

  return (
    <StaffAppShell activeHref="/shipping-v2/items" sectionLabel="Shipping V2">
      <div className="w-full max-w-none space-y-3">
        <ShippingV2Pestanas />
        <StaffPageHeader
          eyebrow={<StaffBadge tone="lime">SHIPPING V2</StaffBadge>}
          title="Activos de la tienda"
          density="compact"
        />
        {error ? (
          <section className="rounded-xl border border-orange-300/25 bg-orange-300/10 p-4 text-sm text-orange-100">{error}</section>
        ) : null}
        <ShippingV2ActivosClient
          filas={filas}
          puedeRegistrar={access.permissions.canEditItems === true}
          puedeVerCostos={access.permissions.canViewCosts === true}
        />
      </div>
    </StaffAppShell>
  );
}
