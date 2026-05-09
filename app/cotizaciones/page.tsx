import Link from "next/link";
import { redirect } from "next/navigation";
import { CotizacionesListClient } from "@/components/cotizaciones/CotizacionesListClient";
import { CotizacionesShell } from "@/components/cotizaciones/CotizacionesShell";
import { fetchCotizaciones, summarizeCotizaciones } from "@/lib/cotizaciones/airtable";
import { getSessionFromCookie } from "@/lib/session";
import type { CotizacionListado } from "@/types/cotizaciones";

export const dynamic = "force-dynamic";

export default async function CotizacionesPage() {
  const session = await getSessionFromCookie();
  if (!session) redirect("/login");

  let items: CotizacionListado[] = [];
  let error = "";

  try {
    items = await fetchCotizaciones();
  } catch (loadError) {
    console.error("Error al cargar cotizaciones:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudieron cargar las cotizaciones.";
  }

  return (
    <CotizacionesShell
      title="Listado"
      actions={
        <Link
          href="/cotizaciones/nueva"
          className="rounded-xl border border-geek-lime bg-geek-lime px-4 py-2.5 text-sm font-extrabold text-black shadow-glow transition hover:brightness-95"
        >
          + Nueva cotización
        </Link>
      }
    >
      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}
      <CotizacionesListClient initialItems={items} initialSummary={summarizeCotizaciones(items)} />
    </CotizacionesShell>
  );
}
