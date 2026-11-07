import { ImprimirComprobanteEntrega } from "@/components/facturacion/print/ImprimirComprobanteEntrega";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

// Ticket de 80 mm del Comprobante de entrega (sin cobro) de una orden (auditoría ops, punto 6).
export default async function ImprimirTicketEntregaPage({ params }: PageProps) {
  const { id } = await params;
  return <ImprimirComprobanteEntrega ordenId={id} backHref={`/tecnicos/ordenes/${encodeURIComponent(id)}`} />;
}
