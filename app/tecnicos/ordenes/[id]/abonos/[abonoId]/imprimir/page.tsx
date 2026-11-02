import { ImprimirComprobanteAbono } from "@/components/facturacion/print/ImprimirComprobanteAbono";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string; abonoId: string }> };

// Ticket de 80 mm del comprobante de abono de una orden. Mismo documento que
// el de Operaciones y mismo estilo que Facturación (2-nov-2026); reemplaza al
// ticket viejo (TicketAbono).
export default async function ImprimirTicketAbonoPage({ params }: PageProps) {
  const { id, abonoId } = await params;
  return <ImprimirComprobanteAbono origen={{ ordenId: id }} abonoId={abonoId} backHref={`/tecnicos/ordenes/${encodeURIComponent(id)}`} />;
}
