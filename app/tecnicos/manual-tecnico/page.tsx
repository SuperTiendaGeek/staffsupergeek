import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { ManualTecnicoPageClient } from "./ManualTecnicoPageClient";

export const dynamic = "force-dynamic";

// Técnicos → Manual técnico (auditoría ops, punto 11B · lienzo, tablero 9):
// la biblioteca de soluciones probadas, procedimientos y reglas de la tienda.
export default async function ManualTecnicoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const ver = typeof q.ver === "string" && /^rec[A-Za-z0-9]{14}$/.test(q.ver) ? q.ver : null;
  return (
    <StaffAppShell activeHref="/tecnicos/manual-tecnico" sectionLabel="Técnicos">
      <ManualTecnicoPageClient ver={ver} />
    </StaffAppShell>
  );
}
