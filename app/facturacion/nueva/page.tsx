import Link               from "next/link";
import { StaffAppShell }  from "@/components/staff/StaffAppShell";
import { EmisionDesdeOrigen } from "@/components/facturacion/EmisionDesdeOrigen";
import { getConsumidorFinalLimite } from "@/lib/facturacion/config";

export const dynamic = "force-dynamic";

// Pantalla de emisión. Antes vivía en /facturacion (la landing); con el
// rediseño, la landing es la pantalla única de documentos y desde aquí se
// emite. Sigue leyendo ?borrador, ?reemplazoNC y ?origen/?recordId (gancho de
// cuenta unificada) desde la URL.
//
// Con ?origen= presente, EmisionDesdeOrigen agrega el selector Factura /
// Recibo / Proforma conservando los datos precargados de la orden. Sin origen
// se comporta igual que antes: solo el formulario de facturas.
export default function NuevaFacturaPage() {
  return (
    <StaffAppShell activeHref="/facturacion" sectionLabel="Facturación — Nuevo documento">
      <div className="mb-4">
        <Link
          href="/facturacion"
          className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#F5F5F5] transition"
        >
          ← Documentos
        </Link>
      </div>
      <EmisionDesdeOrigen consumidorFinalLimite={getConsumidorFinalLimite()} />
    </StaffAppShell>
  );
}
