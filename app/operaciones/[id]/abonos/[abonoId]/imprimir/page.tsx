import { redirect } from "next/navigation";
import { getSessionFromCookie } from "@/lib/session";
import { ImprimirComprobanteAbono } from "@/components/facturacion/print/ImprimirComprobanteAbono";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string; abonoId: string }> };

// Ticket de 80 mm del comprobante de abono de un pedido (Operación Comercial).
export default async function ImprimirAbonoOperacionPage({ params }: PageProps) {
  const session = await getSessionFromCookie();
  if (!session) redirect("/login");
  const { id, abonoId } = await params;
  return <ImprimirComprobanteAbono origen={{ operacionId: id }} abonoId={abonoId} backHref={`/operaciones/${encodeURIComponent(id)}`} />;
}
