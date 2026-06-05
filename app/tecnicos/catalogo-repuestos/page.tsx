import { AppShell } from "@/components/tecnicos/layout/AppShell";
import { CatalogoCrudClient } from "@/components/tecnicos/CatalogoCrudClient";
import { fetchCatalogoRepuestosGestion } from "@/lib/tecnicos/airtable";
import type { CatalogoRepuesto } from "@/types/tecnicos";

export const dynamic = "force-dynamic";

export default async function CatalogoRepuestosPage() {
  let items: CatalogoRepuesto[] = [];
  let error = "";

  try {
    items = await fetchCatalogoRepuestosGestion({ activo: "todos" });
  } catch (loadError) {
    console.error("Error al cargar catálogo de repuestos:", loadError);
    error = "No se pudo cargar el catálogo de repuestos.";
  }

  return (
    <AppShell
      title="Catálogo Repuestos"
      active="catalogo-repuestos"
      hideTopBar
    >
      <div className="w-full space-y-5">
        {error ? <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}
        <CatalogoCrudClient mode="repuestos" initialItems={items} />
      </div>
    </AppShell>
  );
}
