import Link from "next/link";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { StaffPageHeader } from "@/components/staff/StaffDesignSystem";
import { AcreditarPanel } from "@/components/finanzas/AcreditarPanel";

export const dynamic = "force-dynamic";

export default function AcreditarPage() {
  return (
    <StaffAppShell activeHref="/finanzas" sectionLabel="Finanzas">
      <div className="w-full space-y-3">
        <StaffPageHeader
          title="Acreditar pagos en tránsito"
          description="Ingresa el monto neto recibido de la pasarela — la comisión se calcula sola (Fase 20.3)."
          density="compact"
        />
        <Link href="/finanzas" className="text-sm text-[#A7A7A7] transition hover:text-[#F5F5F5]">
          ← Volver a Finanzas
        </Link>
        <AcreditarPanel />
      </div>
    </StaffAppShell>
  );
}
