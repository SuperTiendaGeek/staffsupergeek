import Link from "next/link";
import { redirect } from "next/navigation";
import { CotizacionesShell } from "@/components/cotizaciones/CotizacionesShell";
import { NuevaCotizacionClient } from "@/components/cotizaciones/NuevaCotizacionClient";
import { getSessionFromCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function NuevaCotizacionPage() {
  const session = await getSessionFromCookie();
  if (!session) redirect("/login");

  return (
    <CotizacionesShell
      title="Nueva cotización"
      actions={
        <Link
          href="/cotizaciones"
          className="inline-flex h-8 items-center rounded-full border border-[#3A3A36] px-3 text-sm font-semibold text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]"
        >
          Volver
        </Link>
      }
    >
      <NuevaCotizacionClient />
    </CotizacionesShell>
  );
}
