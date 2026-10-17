import { ShippingV2Pestanas } from "@/components/shipping-v2/ShippingV2Pestanas";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { especificacionesDeItem, getShippingV2AccessContextForSession, getShippingV2ItemById, getShippingV2TechnicalOptionSets } from "@/lib/shipping-v2/airtable";
import { getSessionFromCookie } from "@/lib/session";
import { requirePantallaVisible } from "@/lib/permissions/pantallas";
import { rutaUnidad } from "@/lib/shipping-v2/unidades-serie";
import { ShippingV2FichaTecnicaClient } from "@/components/shipping-v2/ficha/ShippingV2FichaTecnicaClient";
import { asegurarRutaCanonica, leerRutaUnidad, volverDeUnidad, type BusquedaUnidad, type ParamsUnidad } from "../unidad-ruta";

export const dynamic = "force-dynamic";

/** Punto 10b-4: ficha de mostrador de una unidad (antes en /shipping-v2/recepcion/ficha/[id]). */
export default async function ShippingV2FichaUnidadPage({ params, searchParams }: { params: ParamsUnidad; searchParams: BusquedaUnidad }) {
  const session = await getSessionFromCookie();
  requirePantallaVisible(session?.user.pantallasRestringidas ?? {}, "shipping-v2", "recepcion");
  const access = await getShippingV2AccessContextForSession(session);
  if (!access.permissions.canUseRecepcion) {
    redirect("/shipping-v2/packings");
  }
  const ruta = await leerRutaUnidad(params, searchParams);
  const [item, technicalOptions] = await Promise.all([
    getShippingV2ItemById(ruta.itemId, { includeAiName: false, access }),
    getShippingV2TechnicalOptionSets(),
  ]);
  if (item.recibido !== true) {
    redirect("/shipping-v2/recepcion");
  }
  asegurarRutaCanonica(item, ruta, "ficha");
  const volver = volverDeUnidad(item, ruta.desdeRecepcion);

  return (
    <StaffAppShell activeHref={ruta.desdeRecepcion ? "/shipping-v2/recepcion" : "/shipping-v2/items"} sectionLabel="Shipping V2">
      <div className="w-full max-w-none space-y-3">
      <ShippingV2Pestanas />
      <Link href={volver.href} className="inline-flex h-8 items-center rounded-md px-2 text-[12.5px] font-semibold text-[#B4B5AC] transition hover:bg-[#20211D] hover:text-[#D7FF4F]">
        ← {volver.etiqueta}
      </Link>
      <ShippingV2FichaTecnicaClient
        item={item}
        technicalOptions={technicalOptions}
        especificaciones={especificacionesDeItem(item)}
        vistaPreviaHref={rutaUnidad(item, "ficha/print")}
        imprimirHref={rutaUnidad(item, "ficha/print", { imprimir: true })}
      />
    </div>
    </StaffAppShell>
  );
}
