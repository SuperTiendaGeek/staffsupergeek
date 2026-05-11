import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PedidoDetalleClient } from "@/components/pedidos/PedidoDetalleClient";
import { PedidosShell } from "@/components/pedidos/PedidosShell";
import { fetchCotizacionById } from "@/lib/cotizaciones/airtable";
import { fetchPedidoById } from "@/lib/pedidos/airtable";
import { getSessionFromCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function PedidoDetallePage({ params }: Props) {
  const session = await getSessionFromCookie();
  if (!session) redirect("/login");

  const { id } = await params;
  const pedido = await fetchPedidoById(id);
  if (!pedido) notFound();
  const cotizacionOrigen = pedido.cotizacionId ? await fetchCotizacionById(pedido.cotizacionId) : null;

  return (
    <PedidosShell
      title={pedido.codigo}
      actions={
        <Link href="/pedidos" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-geek-lime/40 hover:text-geek-lime">
          Volver
        </Link>
      }
    >
      <PedidoDetalleClient initialPedido={pedido} cotizacionOrigen={cotizacionOrigen} />
    </PedidosShell>
  );
}
