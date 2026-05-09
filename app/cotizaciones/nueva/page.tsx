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
          className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-geek-lime/40 hover:text-geek-lime"
        >
          Volver
        </Link>
      }
    >
      <NuevaCotizacionClient />
    </CotizacionesShell>
  );
}
