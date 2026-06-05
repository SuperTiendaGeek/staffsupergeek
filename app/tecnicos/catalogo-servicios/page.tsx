import { AppShell } from "@/components/tecnicos/layout/AppShell";
import { CatalogoCrudClient } from "@/components/tecnicos/CatalogoCrudClient";
import { fetchCatalogoServiciosGestion } from "@/lib/tecnicos/airtable";
import type { CatalogoServicio } from "@/types/tecnicos";

export const dynamic = "force-dynamic";

export default async function CatalogoServiciosPage() {
  let items: CatalogoServicio[] = [];
  let error = "";

  try {
    items = await fetchCatalogoServiciosGestion({ activo: "todos" });
  } catch (loadError) {
    console.error("Error al cargar catálogo de servicios:", loadError);
    error = "No se pudo cargar el catálogo de servicios.";
  }

  return (
    <AppShell
      title="Catálogo Servicios"
      active="catalogo-servicios"
      hideTopBar
    >
      <div className="w-full space-y-5">
        {error ? <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}
        <CatalogoCrudClient mode="servicios" initialItems={items} />
      </div>
    </AppShell>
  );
}
