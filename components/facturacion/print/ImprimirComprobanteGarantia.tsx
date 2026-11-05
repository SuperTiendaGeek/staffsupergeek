import Link from "next/link";
import { AutoPrint } from "@/components/tecnicos/print/AutoPrint";
import { cargarComprobanteGarantia } from "@/lib/garantias/comprobante-servidor";
import { TicketComprobanteGarantia } from "./TicketComprobanteGarantia";

// Página de impresión térmica de la entrega en garantía de una orden.
export async function ImprimirComprobanteGarantia({ ordenId, backHref }: { ordenId: string; backHref: string }) {
  const r = await cargarComprobanteGarantia(ordenId);
  if (!r.ok) {
    return (
      <main style={{ padding: 24, fontFamily: "Arial, Helvetica, sans-serif" }}>
        <h1>No se puede imprimir</h1>
        <p>{r.motivo}</p>
        <Link href={backHref}>Volver</Link>
      </main>
    );
  }
  return (
    <>
      <AutoPrint backHref={backHref} />
      <TicketComprobanteGarantia emisor={r.emisor} c={r.comprobante} />
    </>
  );
}
