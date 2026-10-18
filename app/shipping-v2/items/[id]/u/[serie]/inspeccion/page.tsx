import { ShippingV2Pestanas } from "@/components/shipping-v2/ShippingV2Pestanas";
import { redirect } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { getShippingV2AccessContextForSession, getShippingV2InspeccionTecnica, getShippingV2UnidadesDelProducto } from "@/lib/shipping-v2/airtable";
import { getSessionFromCookie } from "@/lib/session";
import { requirePantallaVisible } from "@/lib/permissions/pantallas";
import { rutaUnidad } from "@/lib/shipping-v2/unidades-serie";
import { ShippingV2InspeccionClient } from "@/components/shipping-v2/inspeccion/ShippingV2InspeccionClient";
import { asegurarRutaCanonica, leerRutaUnidad, volverDeUnidad, type BusquedaUnidad, type ParamsUnidad } from "../unidad-ruta";

export const dynamic = "force-dynamic";

/** Punto 10b-4: inspección técnica de una unidad (antes en /shipping-v2/recepcion/inspeccion/[id]). */
export default async function ShippingV2InspeccionUnidadPage({ params, searchParams }: { params: ParamsUnidad; searchParams: BusquedaUnidad }) {
  const session = await getSessionFromCookie();
  requirePantallaVisible(session?.user.pantallasRestringidas ?? {}, "shipping-v2", "recepcion");

  const access = await getShippingV2AccessContextForSession(session);
  if (!access.permissions.canUseRecepcion) redirect("/shipping-v2");

  const ruta = await leerRutaUnidad(params, searchParams);
  const inspeccion = await getShippingV2InspeccionTecnica(ruta.itemId, { access });
  const item = inspeccion.item;

  // Un item que todavía no llegó no se puede inspeccionar. Se devuelve a
  // Recepción en vez de mostrar una pantalla que no va a poder guardar nada.
  if (item.recibido !== true) redirect("/shipping-v2/recepcion");
  asegurarRutaCanonica(item, ruta, "inspeccion");
  // Punto 10b-4b: unidades del mismo producto con la inspección firmada ("⋯ Copiar de otra unidad").
  const hermanas = await getShippingV2UnidadesDelProducto(item.sku, access).catch(() => []);

  return (
    <StaffAppShell activeHref={ruta.desdeRecepcion ? "/shipping-v2/recepcion" : "/shipping-v2/items"} sectionLabel="Shipping V2">
      <div className="w-full max-w-none space-y-3">
      <ShippingV2Pestanas />
      <ShippingV2InspeccionClient
        inicial={inspeccion}
        usuario={session?.user.nombre || session?.user.email || "Portal Staff"}
        puedeEditarItems={access.permissions.canEditItems}
        puedeCrearNovedades={access.permissions.canCreateNovedades}
        volver={volverDeUnidad(item, ruta.desdeRecepcion)}
        fichaHref={rutaUnidad(item, "ficha", { desde: ruta.desdeRecepcion ? "recepcion" : undefined })}
        firmadasParaCopiar={hermanas.filter((h) => h.id !== item.id && h.inspeccionFirmada)}
      />
    </div>
    </StaffAppShell>
  );
}
