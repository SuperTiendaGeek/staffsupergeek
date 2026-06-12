import { PortalShell } from "@/components/PortalShell";
import { CatalogoCrudClient } from "@/components/tecnicos/CatalogoCrudClient";
import styles from "@/components/tecnicos/layout/TecnicosTheme.module.css";
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
    <PortalShell
      eyebrow="Gestión de Reparaciones"
      title="Catálogo Servicios"
      activeHref="/tecnicos/catalogo-servicios"
      sectionLabel="Técnicos"
      density="compact"
    >
      <div className={`${styles.theme} w-full space-y-5`}>
        {error ? <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}
        <CatalogoCrudClient mode="servicios" initialItems={items} />
      </div>
    </PortalShell>
  );
}
