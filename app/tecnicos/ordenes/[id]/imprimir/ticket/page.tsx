import Link from "next/link";
import { AutoPrint } from "@/components/tecnicos/print/AutoPrint";
import { TicketOrden } from "@/components/tecnicos/print/TicketOrden";
import { fetchOrdenById } from "@/lib/tecnicos/airtable";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ImprimirTicketOrdenPage({ params }: PageProps) {
  const { id } = await params;
  const orden = id ? await fetchOrdenById(id) : null;

  if (!orden) {
    return (
      <main style={{ padding: 24, fontFamily: "Arial, Helvetica, sans-serif" }}>
        <h1>Orden no encontrada</h1>
        <p>No se pudo cargar el ticket de constancia.</p>
        <Link href={id ? `/tecnicos/ordenes/${encodeURIComponent(id)}` : "/tecnicos/ordenes"}>Volver</Link>
      </main>
    );
  }

  return (
    <>
      <AutoPrint backHref={`/tecnicos/ordenes/${encodeURIComponent(id)}`} />
      <TicketOrden orden={orden} />
    </>
  );
}
