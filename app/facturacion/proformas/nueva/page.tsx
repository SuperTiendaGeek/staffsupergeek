import Link from "next/link";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { ProformaForm }  from "@/components/facturacion/ProformaForm";

export const dynamic = "force-dynamic";

export default function NuevaProformaPage() {
  return (
    <StaffAppShell activeHref="/facturacion" sectionLabel="Facturación">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-[#F5F5F5]">Nueva proforma</h1>
        <Link href="/facturacion/proformas" className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#F5F5F5]">← Proformas</Link>
      </div>
      <ProformaForm />
    </StaffAppShell>
  );
}
