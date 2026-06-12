import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { OrdenesPageClient } from "./OrdenesPageClient";

export const dynamic = "force-dynamic";

export default async function OrdenesPage() {
  return (
    <StaffAppShell activeHref="/tecnicos/ordenes" sectionLabel="Técnicos">
      <OrdenesPageClient />
    </StaffAppShell>
  );
}
