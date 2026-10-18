import { redirect } from "next/navigation";
import { ShippingV2Pestanas } from "@/components/shipping-v2/ShippingV2Pestanas";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { StaffBadge, StaffPageHeader } from "@/components/staff/StaffDesignSystem";
import {
  categoriasDePlantilla,
  contarPublicacionesDesactualizadasShippingV2,
  getShippingV2AnunciosPendientes,
  getShippingV2AccessContextForSession,
  getShippingV2DatosTienda,
  getShippingV2PlantillasPublicacion,
  type ShippingV2AnunciosPendientes,
} from "@/lib/shipping-v2/airtable";
import { requirePantallaVisible } from "@/lib/permissions/pantallas";
import { getSessionFromCookie } from "@/lib/session";
import type { DatosTienda, PlantillaPublicacion } from "@/lib/shipping-v2/publicaciones";
import { ShippingV2AnunciosClient } from "./ShippingV2AnunciosClient";

export const dynamic = "force-dynamic";

// Pestaña "Anuncios" (auditoría Shipping V2, punto 10d-2, 18-oct-2026):
// plantillas de anuncios por categoría y canal, y datos fijos de la tienda.

type Props = { searchParams: Promise<{ ver?: string; categoria?: string }> };

export default async function ShippingV2AnunciosPage({ searchParams }: Props) {
  const session = await getSessionFromCookie();
  requirePantallaVisible(session?.user.pantallasRestringidas ?? {}, "shipping-v2", "anuncios");
  const access = await getShippingV2AccessContextForSession(session);
  if (!access.isAdmin || !(access.permissions.canUseRecepcion || access.permissions.canEditItems)) redirect("/shipping-v2");
  const { ver, categoria } = await searchParams;

  let plantillas: PlantillaPublicacion[] = [];
  let tienda: DatosTienda | null = null;
  let desactualizadas = 0;
  let pendientes: ShippingV2AnunciosPendientes = { porRetirar: [], porActualizar: [], retirados: [] };
  let error = "";
  try {
    [plantillas, tienda, pendientes] = await Promise.all([
      getShippingV2PlantillasPublicacion(),
      getShippingV2DatosTienda(),
      getShippingV2AnunciosPendientes({ conRetirados: true }),
    ]);
    desactualizadas = await contarPublicacionesDesactualizadasShippingV2(tienda.version);
  } catch (e) {
    console.error("Error al cargar Anuncios:", e);
    error = e instanceof Error ? e.message : "No se pudo cargar.";
  }

  return (
    <StaffAppShell activeHref="/shipping-v2/items" sectionLabel="Shipping V2">
      <div className="w-full max-w-none space-y-3">
        <ShippingV2Pestanas />
        <StaffPageHeader eyebrow={<StaffBadge tone="lime">SHIPPING V2</StaffBadge>} title="Anuncios" density="compact" />
        {error || !tienda ? (
          <section className="rounded-xl border border-orange-300/25 bg-orange-300/10 p-4 text-sm text-orange-100">{error || "No se pudo cargar."}</section>
        ) : (
          <ShippingV2AnunciosClient
            plantillas={plantillas}
            tienda={tienda}
            desactualizadas={desactualizadas}
            categorias={categoriasDePlantilla()}
            puedeEditarTienda={access.isSiteAdmin === true}
            pendientes={pendientes}
            vistaInicial={
              ver === "tienda" || ver === "plantillas" || ver === "retirar" || ver === "actualizar" || ver === "retirados"
                ? ver
                : pendientes.porRetirar.length ? "retirar" : pendientes.porActualizar.length ? "actualizar" : "plantillas"
            }
            categoriaInicial={categoria && categoriasDePlantilla().includes(categoria) ? categoria : "Laptop"}
          />
        )}
      </div>
    </StaffAppShell>
  );
}
