import { ImprimirComprobanteGarantia } from "@/components/facturacion/print/ImprimirComprobanteGarantia";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

// Ticket de 80 mm de la entrega en garantía de una orden (auditoría ops, punto 20).
export default async function ImprimirTicketGarantiaPage({ params }: PageProps) {
  const { id } = await params;
  return <ImprimirComprobanteGarantia ordenId={id} backHref={`/tecnicos/ordenes/${encodeURIComponent(id)}`} />;
}
