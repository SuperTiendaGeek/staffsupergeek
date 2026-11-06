import Link from "next/link";
import { AutoPrint } from "@/components/tecnicos/print/AutoPrint";
import { cargarComprobanteEntrega } from "@/lib/entrega/comprobante-servidor";
import { TicketComprobanteEntrega } from "./TicketComprobanteEntrega";

// Página de impresión térmica del Comprobante de entrega de una orden.
export async function ImprimirComprobanteEntrega({ ordenId, backHref }: { ordenId: string; backHref: string }) {
  const r = await cargarComprobanteEntrega(ordenId);
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
      <TicketComprobanteEntrega emisor={r.emisor} c={r.comprobante} />
    </>
  );
}
