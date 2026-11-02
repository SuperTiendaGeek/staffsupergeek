import Link from "next/link";
import { AutoPrint } from "@/components/tecnicos/print/AutoPrint";
import { cargarComprobanteAbono } from "@/lib/cobros/comprobante-abono-servidor";
import { TicketComprobanteAbono } from "./TicketComprobanteAbono";

// Página de impresión térmica del comprobante de abono (orden u operación).
export async function ImprimirComprobanteAbono({
  origen, abonoId, backHref,
}: { origen: { ordenId: string } | { operacionId: string }; abonoId: string; backHref: string }) {
  const r = await cargarComprobanteAbono(origen, abonoId);
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
      <TicketComprobanteAbono emisor={r.emisor} c={r.comprobante} />
    </>
  );
}
