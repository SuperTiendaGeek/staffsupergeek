import Link from "next/link";
import { AutoPrint } from "@/components/tecnicos/print/AutoPrint";
import { TicketAbono } from "@/components/tecnicos/print/TicketAbono";
import { fetchOrdenById } from "@/lib/tecnicos/airtable";
import { getCuentaUnificada } from "@/lib/cuenta-unificada";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string; abonoId: string }>;
};

export default async function ImprimirTicketAbonoPage({ params }: PageProps) {
  const { id, abonoId } = await params;
  const orden = id ? await fetchOrdenById(id) : null;
  const abono = orden?.abonosPorOrden.find(
    (item) => item.id === abonoId || item.idAbono === abonoId
  );

  if (!orden || !abono) {
    return (
      <main style={{ padding: 24, fontFamily: "Arial, Helvetica, sans-serif" }}>
        <h1>Abono no encontrado</h1>
        <p>No se pudo cargar el comprobante o el abono no pertenece a esta orden.</p>
        <Link href={id ? `/tecnicos/ordenes/${encodeURIComponent(id)}` : "/tecnicos/ordenes"}>Volver</Link>
      </main>
    );
  }

  // Fase 11 — el comprobante imprime el total/saldo de la cuenta unificada
  // (incluye el repuesto real de la operación vinculada, si existe), no el
  // rollup NV de la orden por su cuenta.
  const cuentaUnificada = await getCuentaUnificada({ ordenId: id }).catch(() => null);
  // Sin la cuenta no se imprime: antes caía a los campos NV de Airtable y el
  // cliente se llevaba un saldo distinto al de la pantalla (punto 4).
  if (!cuentaUnificada) {
    return (
      <main style={{ padding: 24, fontFamily: "Arial, Helvetica, sans-serif" }}>
        <h1>No se pudo calcular el saldo</h1>
        <p>El comprobante no se imprime con cifras incompletas. Intenta de nuevo en unos segundos.</p>
        <Link href={`/tecnicos/ordenes/${encodeURIComponent(id)}`}>Volver a la orden</Link>
      </main>
    );
  }

  return (
    <>
      <AutoPrint backHref={`/tecnicos/ordenes/${encodeURIComponent(id)}`} />
      <TicketAbono orden={orden} abono={abono} cuentaUnificada={cuentaUnificada} />
    </>
  );
}
