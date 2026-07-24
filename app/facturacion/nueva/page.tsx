import Link               from "next/link";
import { StaffAppShell }  from "@/components/staff/StaffAppShell";
import { FacturacionForm } from "@/components/facturacion/FacturacionForm";
import { getConsumidorFinalLimite } from "@/lib/facturacion/config";

export const dynamic = "force-dynamic";

// Formulario de emisión de factura. Antes vivía en /facturacion (la landing);
// con el rediseño, la landing es la pantalla única de documentos y el
// formulario se emite desde aquí. Sigue leyendo ?borrador, ?reemplazoNC y
// ?origen/?recordId (gancho de cuenta unificada) desde la URL.
export default function NuevaFacturaPage() {
  return (
    <StaffAppShell activeHref="/facturacion" sectionLabel="Facturación — Nueva factura">
      <div className="mb-4">
        <Link
          href="/facturacion"
          className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#F5F5F5] transition"
        >
          ← Documentos
        </Link>
      </div>
      <FacturacionForm consumidorFinalLimite={getConsumidorFinalLimite()} />
    </StaffAppShell>
  );
}
