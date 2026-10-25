import { ShippingV2Pestanas } from "@/components/shipping-v2/ShippingV2Pestanas";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { StaffBadge, StaffPageHeader } from "@/components/staff/StaffDesignSystem";
import { Button } from "@/components/ui/button";
import { canAccessApp } from "@/lib/apps";
import { getSessionFromCookie } from "@/lib/session";
import { requirePantallaVisible } from "@/lib/permissions/pantallas";
import { getShippingV2AccessContextForSession, getShippingV2ItemNavigation, type ShippingV2ItemNavigation } from "@/lib/shipping-v2/airtable";
import { cargarFichaArticulo } from "@/lib/shipping-v2/ficha-articulo-servidor";
import { FichaArticuloVista } from "@/components/shipping-v2/ficha-articulo/FichaArticuloVista";
import { ShippingV2ItemHeaderNavigation } from "./ShippingV2ItemHeaderNavigation";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

const emptyItemNavigation: ShippingV2ItemNavigation = {
  previous: null,
  next: null,
  index: null,
  total: 0,
  items: [],
};

function DetailUnavailable({ title, message }: { title: string; message: string }) {
  return (
    <div className="w-full max-w-none space-y-3">
      <StaffPageHeader
        eyebrow={<StaffBadge tone="lime">SHIPPING V2</StaffBadge>}
        title={title}
        description={message}
        actions={
          <Button asChild className="h-9 rounded-lg bg-[#D7FF4F] px-4 text-sm font-black text-[#151515] hover:bg-[#D7FF4F]/90">
            <Link href="/shipping-v2/items">Volver a Artículos</Link>
          </Button>
        }
      />
    </div>
  );
}

/**
 * Página completa de la ficha del artículo: entrada por enlace directo,
 * recarga o pestaña nueva. Punto 18 (25-oct-2026): la arma el MISMO cargador
 * que la ventana (cargarFichaArticulo), que valida la sesión y entrega solo
 * los datos del perfil antes de pintar nada.
 */
export default async function ShippingV2ItemDetailPage({ params }: Props) {
  const session = await getSessionFromCookie();

  if (!session || !canAccessApp(session, "Shipping")) {
    redirect("/acceso-denegado");
  }
  requirePantallaVisible(session.user.pantallasRestringidas, "shipping-v2", "items");

  const { id } = await params;
  const resultado = await cargarFichaArticulo(id, session);
  if (!resultado.ok && resultado.estado === 401) redirect("/login");
  if (!resultado.ok && resultado.estado === 403) redirect("/acceso-denegado");

  const ficha = resultado.ok ? resultado.ficha : null;
  // Anterior / siguiente: solo para el personal (el proveedor navega desde su lista).
  let navigation = emptyItemNavigation;
  if (ficha && ficha.perfil !== "proveedor") {
    const access = await getShippingV2AccessContextForSession(session);
    navigation = await getShippingV2ItemNavigation(ficha.datos.item.id, access).catch((navigationError) => {
      console.warn("No se pudo cargar navegación de item Shipping V2:", navigationError);
      return emptyItemNavigation;
    });
  }
  const esActivo = ficha?.perfil === "admin" || ficha?.perfil === "staff" ? ficha.datos.item.usoLocal === true : false;

  return (
    <StaffAppShell activeHref="/shipping-v2/items" sectionLabel="Shipping V2">
      <div className="w-full max-w-none space-y-3">
        <ShippingV2Pestanas />
        {!ficha ? (
          <DetailUnavailable
            title={!resultado.ok && resultado.estado === 404 ? "Artículo no encontrado" : "Artículo no disponible"}
            message={!resultado.ok ? resultado.mensaje : "No se pudo cargar el artículo."}
          />
        ) : (
          <div className="w-full max-w-none space-y-2">
            {/* Una barra fina (volver y anterior/siguiente); el nombre va en la ficha. */}
            <div className="flex items-center gap-2">
              <Link href={esActivo ? "/shipping-v2/activos" : "/shipping-v2/items"} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-semibold text-[#B4B5AC] transition hover:bg-[#20211D] hover:text-[#D7FF4F]">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                {esActivo ? "Activos" : "Artículos"}
              </Link>
              {navigation.total ? (
                <div className="ml-auto">
                  <ShippingV2ItemHeaderNavigation currentItemId={ficha.datos.item.id} navigation={navigation} />
                </div>
              ) : null}
            </div>
            <FichaArticuloVista ficha={ficha} modo="pagina" />
          </div>
        )}
      </div>
    </StaffAppShell>
  );
}
