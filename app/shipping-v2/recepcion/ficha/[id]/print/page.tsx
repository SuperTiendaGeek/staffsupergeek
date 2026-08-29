import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getShippingV2AccessContextForSession, getShippingV2ItemById, getShippingV2TechnicalOptionSets } from "@/lib/shipping-v2/airtable";
import { getSessionFromCookie } from "@/lib/session";
import { requirePantallaVisible } from "@/lib/permissions/pantallas";
import { buildFichaVentaData } from "@/lib/shipping-v2/ficha-venta-data";
import { isFichaGenerada } from "@/lib/shipping-v2/technical-sheet";
import { ShippingV2PrintControls } from "./ShippingV2PrintControls";
import { FichaVentaPrintTemplate } from "./FichaVentaPrintTemplate";
import pageStyles from "./page.module.css";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

function clean(value?: string | number | null) {
  return String(value ?? "").trim();
}

export default async function ShippingV2FichaTecnicaPrintPage({ params }: Props) {
  const { id } = await params;
  const session = await getSessionFromCookie();
  requirePantallaVisible(session?.user.pantallasRestringidas ?? {}, "shipping-v2", "recepcion");
  const access = await getShippingV2AccessContextForSession(session);
  if (!access.permissions.canUseRecepcion) {
    redirect("/shipping-v2/packings");
  }
  const [item, technicalOptions] = await Promise.all([
    getShippingV2ItemById(id, { includeAiName: false, access }),
    getShippingV2TechnicalOptionSets(),
  ]);
  if (item.recibido !== true) {
    redirect("/shipping-v2/recepcion");
  }

  if (!isFichaGenerada(item)) {
    const hasMinimumFicha = Boolean(clean(item.technicalSheet.marcaFicha) && clean(item.technicalSheet.modeloFicha));
    if (hasMinimumFicha) {
      redirect(`/shipping-v2/recepcion/ficha/${encodeURIComponent(item.id)}`);
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
