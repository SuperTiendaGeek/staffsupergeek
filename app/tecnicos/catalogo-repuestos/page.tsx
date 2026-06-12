import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { CatalogoCrudClient } from "@/components/tecnicos/CatalogoCrudClient";
import styles from "@/components/tecnicos/layout/TecnicosTheme.module.css";
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
    <StaffAppShell activeHref="/tecnicos/catalogo-repuestos" sectionLabel="Técnicos">
      <div className={`${styles.theme} w-full space-y-5`}>
        {error ? <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}
        <CatalogoCrudClient mode="repuestos" initialItems={items} />
      </div>
    </StaffAppShell>
  );
}
