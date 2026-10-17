import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getShippingV2AccessContextForSession, getShippingV2ItemById, getShippingV2TechnicalOptionSets } from "@/lib/shipping-v2/airtable";
import { getSessionFromCookie } from "@/lib/session";
import { requirePantallaVisible } from "@/lib/permissions/pantallas";
import { buildFichaVentaData } from "@/lib/shipping-v2/ficha-venta-data";
import { isFichaGenerada } from "@/lib/shipping-v2/technical-sheet";
import { rutaUnidad } from "@/lib/shipping-v2/unidades-serie";
import { ShippingV2PrintControls } from "@/components/shipping-v2/ficha/print/ShippingV2PrintControls";
import { FichaVentaPrintTemplate } from "@/components/shipping-v2/ficha/print/FichaVentaPrintTemplate";
import pageStyles from "@/components/shipping-v2/ficha/print/page.module.css";
import { asegurarRutaCanonica, leerRutaUnidad, type BusquedaUnidad, type ParamsUnidad } from "../../unidad-ruta";

export const dynamic = "force-dynamic";

function clean(value?: string | number | null) {
  return String(value ?? "").trim();
}

/** Punto 10b-4: ficha de mostrador lista para imprimir (antes en /shipping-v2/recepcion/ficha/[id]/print). */
export default async function ShippingV2FichaUnidadPrintPage({ params, searchParams }: { params: ParamsUnidad; searchParams: BusquedaUnidad }) {
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
  asegurarRutaCanonica(item, ruta, "ficha/print");

  if (!isFichaGenerada(item)) {
    const hasMinimumFicha = Boolean(clean(item.technicalSheet.marcaFicha) && clean(item.technicalSheet.modeloFicha));
    if (hasMinimumFicha) {
      redirect(rutaUnidad(item, "ficha"));
    }
    return (
      <main className={pageStyles.printPage}>
        <div className={pageStyles.emptyState}>Ficha no generada</div>
      </main>
    );
  }

  const ficha = buildFichaVentaData(item, technicalOptions);

  return (
    <main className={pageStyles.printPage}>
      <Suspense fallback={null}>
        <ShippingV2PrintControls />
      </Suspense>

      <section className={pageStyles.sheet} aria-label="Hoja A4 con la ficha de venta en la mitad derecha">
        <div className={pageStyles.half} aria-hidden="true" />
        <div className={pageStyles.cutLine} aria-hidden="true" />
        <div className={pageStyles.half}>
          <FichaVentaPrintTemplate ficha={ficha} />
        </div>
      </section>
    </main>
  );
}
