import { redirect } from "next/navigation";
import { ShippingV2Pestanas } from "@/components/shipping-v2/ShippingV2Pestanas";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { StaffBadge, StaffPageHeader } from "@/components/staff/StaffDesignSystem";
import { contarCambiosCodigoPendientes, getShippingV2AccessContextForSession, getShippingV2AsuntosRevision, type ShippingV2AsuntoRevision } from "@/lib/shipping-v2/airtable";
import { requirePantallaVisible } from "@/lib/permissions/pantallas";
import { getSessionFromCookie } from "@/lib/session";
import { ShippingV2ControlClient } from "./ShippingV2ControlClient";

export const dynamic = "force-dynamic";

// Pestaña "Control" (auditoría Shipping V2, punto 10c, 18-oct-2026). 10c-1:
// revisión de inventario. 10c-2: conteos físicos (pestaña "Conteos"). 10c-3:
// cambios de código y fusionar SKU (pestaña "Códigos"). El Staff la usa; regularizar el stock (dar de baja,
// agregar, fusionar) queda para el Administrador.

export default async function ShippingV2ControlPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const session = await getSessionFromCookie();
  requirePantallaVisible(session?.user.pantallasRestringidas ?? {}, "shipping-v2", "control");
  const access = await getShippingV2AccessContextForSession(session);
  if (!access.isAdmin || !(access.permissions.canUseRecepcion || access.permissions.canEditItems)) redirect("/shipping-v2");

  const { vista } = await searchParams;
  let asuntos: ShippingV2AsuntoRevision[] = [];
  let codigosPendientes = 0;
  let error = "";
  try {
    [asuntos, codigosPendientes] = await Promise.all([getShippingV2AsuntosRevision(), contarCambiosCodigoPendientes().catch(() => 0)]);
  } catch (e) {
    console.error("Error al cargar Control:", e);
    error = e instanceof Error ? e.message : "No se pudo cargar.";
  }

  return (
    <StaffAppShell activeHref="/shipping-v2/items" sectionLabel="Shipping V2">
      <div className="w-full max-w-none space-y-3">
        <ShippingV2Pestanas />
        <StaffPageHeader eyebrow={<StaffBadge tone="lime">SHIPPING V2</StaffBadge>} title="Control" density="compact" />
        {error ? (
          <section className="rounded-xl border border-orange-300/25 bg-orange-300/10 p-4 text-sm text-orange-100">{error}</section>
        ) : (
          <ShippingV2ControlClient
            asuntosIniciales={asuntos}
            vistaInicial={vista === "conteos" || vista === "codigos" ? vista : "revision"}
            esAdministrador={access.isSiteAdmin === true}
            codigosPendientes={codigosPendientes}
          />
        )}
      </div>
    </StaffAppShell>
  );
}
