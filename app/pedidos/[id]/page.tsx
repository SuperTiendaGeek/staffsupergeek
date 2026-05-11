import { notFound, redirect } from "next/navigation";
import { PedidoDetalleClient } from "@/components/pedidos/PedidoDetalleClient";
import { PedidosShell } from "@/components/pedidos/PedidosShell";
import { fetchCotizacionById } from "@/lib/cotizaciones/airtable";
import { fetchEstadosPedidoOptions, fetchPedidoById } from "@/lib/pedidos/airtable";
import { getSessionFromCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function PedidoDetallePage({ params }: Props) {
  const session = await getSessionFromCookie();
  if (!session) redirect("/login");

  const { id } = await params;
  const pedido = await fetchPedidoById(id);
  if (!pedido) notFound();
  const [cotizacionOrigen, estadosPedidoOptions] = await Promise.all([
    pedido.cotizacionId ? fetchCotizacionById(pedido.cotizacionId) : Promise.resolve(null),
    fetchEstadosPedidoOptions(),
  ]);

  return (
    <PedidosShell title={pedido.codigo}>
      <PedidoDetalleClient
        initialPedido={pedido}
        cotizacionOrigen={cotizacionOrigen}
        estadosPedidoOptions={estadosPedidoOptions}
      />
    </PedidosShell>
  );
}
