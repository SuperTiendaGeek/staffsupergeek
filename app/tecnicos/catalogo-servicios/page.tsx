import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { CatalogoCrudClient } from "@/components/tecnicos/CatalogoCrudClient";
import styles from "@/components/tecnicos/layout/TecnicosTheme.module.css";
import { fetchCatalogoServiciosGestion } from "@/lib/tecnicos/airtable";
import { AvisosGeneralesClient } from "@/components/tecnicos/AvisosGeneralesClient";
import { cartelesDeServicios, listarAlertasGenerales } from "@/lib/tecnicos/carteles/airtable";
import type { AlertaGeneral, CartelServicio } from "@/lib/tecnicos/carteles/reglas";
import type { CatalogoServicio } from "@/types/tecnicos";

export const dynamic = "force-dynamic";

export default async function CatalogoServiciosPage() {
  let items: CatalogoServicio[] = [];
  let carteles: CartelServicio[] = [];
  let alertas: AlertaGeneral[] = [];
  let error = "";

  try {
    items = await fetchCatalogoServiciosGestion({ activo: "todos" });
    // Carteles de consentimiento (se editan dentro del modal "Editar servicio") y avisos generales.
    [carteles, alertas] = await Promise.all([
      cartelesDeServicios(items.map((s) => s.id)).then((m) => [...m.values()]).catch(() => []),
      listarAlertasGenerales().catch(() => []),
    ]);
  } catch (loadError) {
    console.error("Error al cargar catálogo de servicios:", loadError);
    error = "No se pudo cargar el catálogo de servicios.";
  }

  return (
    <StaffAppShell activeHref="/tecnicos/catalogo-servicios" sectionLabel="Técnicos">
      <div className={`${styles.theme} w-full space-y-5`}>
        {error ? <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}
        <CatalogoCrudClient mode="servicios" initialItems={items} carteles={carteles} />
        <AvisosGeneralesClient alertas={alertas} />
      </div>
    </StaffAppShell>
  );
}
