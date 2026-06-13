import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CotizacionDetalleClient } from "@/components/cotizaciones/CotizacionDetalleClient";
import { CotizacionesShell } from "@/components/cotizaciones/CotizacionesShell";
import { fetchCotizacionById, fetchProveedoresCotizacion } from "@/lib/cotizaciones/airtable";
import { isAdministratorRole } from "@/lib/apps";
import { getSessionFromCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function CotizacionDetallePage({ params }: Props) {
  const session = await getSessionFromCookie();
  if (!session) redirect("/login");

  const { id } = await params;
  const [cotizacion, proveedores] = await Promise.all([
    fetchCotizacionById(id),
    fetchProveedoresCotizacion(),
  ]);
  if (!cotizacion) notFound();

  return (
    <CotizacionesShell
      title={cotizacion.codigo}
      actions={
        <Link
          href="/cotizaciones"
          className="inline-flex h-8 items-center rounded-full border border-[#3A3A36] px-3 text-sm font-semibold text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]"
        >
          Volver
        </Link>
      }
    >
      <CotizacionDetalleClient
        initialCotizacion={cotizacion}
        proveedores={proveedores}
        canSeeInternalCosts={isAdministratorRole(session.user.rol)}
      />
    </CotizacionesShell>
  );
}
