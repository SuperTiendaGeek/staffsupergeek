import { redirect } from "next/navigation";
import { ShippingV2Pestanas } from "@/components/shipping-v2/ShippingV2Pestanas";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { getShippingV2AccessContextForSession } from "@/lib/shipping-v2/airtable";
import { requirePantallaVisible } from "@/lib/permissions/pantallas";
import { esTecnicoShippingV2 } from "@/lib/shipping-v2/access";
import { getSessionFromCookie } from "@/lib/session";
import { ShippingV2KardexClient, type VistaKardex } from "./ShippingV2KardexClient";

export const dynamic = "force-dynamic";

// Pestaña "Kardex" (auditoría Shipping V2, punto 12, 24-oct-2026): libro de
// movimientos del inventario. Producto · Movimientos · Dados de baja ·
// Resumen (este último y los costos, solo el Administrador).

const VISTAS: VistaKardex[] = ["producto", "movimientos", "bajas", "resumen"];

export default async function ShippingV2KardexPage({ searchParams }: { searchParams: Promise<{ vista?: string; q?: string }> }) {
  const session = await getSessionFromCookie();
  requirePantallaVisible(session?.user.pantallasRestringidas ?? {}, "shipping-v2", "kardex");
  const access = await getShippingV2AccessContextForSession(session);
  // Punto 18: el Kardex es del personal; el técnico no lo usa.
  if (!access.isAdmin || !access.permissions.canViewItems || esTecnicoShippingV2(access)) redirect("/shipping-v2");
  const esAdministrador = access.isSiteAdmin === true;
  const { vista, q } = await searchParams;
  let inicial = VISTAS.includes(vista as VistaKardex) ? (vista as VistaKardex) : "producto";
  if (inicial === "resumen" && !esAdministrador) inicial = "producto";

  return (
    <StaffAppShell activeHref="/shipping-v2/items" sectionLabel="Shipping V2">
      <div className="w-full max-w-none space-y-3">
        <ShippingV2Pestanas />
        <ShippingV2KardexClient vistaInicial={inicial} qInicial={q ?? ""} esAdministrador={esAdministrador} />
      </div>
    </StaffAppShell>
  );
}
