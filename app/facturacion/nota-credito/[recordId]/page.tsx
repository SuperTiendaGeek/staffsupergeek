import Link                from "next/link";
import { StaffAppShell }   from "@/components/staff/StaffAppShell";
import { NotaCreditoForm } from "@/components/facturacion/NotaCreditoForm";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ recordId: string }> };

export default async function NotaCreditoPage({ params }: Params) {
  const { recordId } = await params;

  return (
    <StaffAppShell activeHref="/facturacion" sectionLabel="Facturación">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-[#F5F5F5]">Nueva nota de crédito</h1>
        <Link
          href="/facturacion/historial"
          className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#F5F5F5] transition"
        >
          ← Historial
        </Link>
      </div>
      <NotaCreditoForm facturaRecordId={recordId} />
    </StaffAppShell>
  );
}
