import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PedidoDetalleClient } from "@/components/pedidos/PedidoDetalleClient";
import { PedidosShell } from "@/components/pedidos/PedidosShell";
import { fetchCotizacionById } from "@/lib/cotizaciones/airtable";
import { fetchEstadosPedidoOptions, fetchPedidoById } from "@/lib/pedidos/airtable";
import { getSessionFromCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

function formatPedidoCreatedDate(value: string) {
  if (!value) return "";
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnlyMatch
    ? new Date(Date.UTC(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3])))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-EC", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: dateOnlyMatch ? "UTC" : "America/Guayaquil",
  }).format(date);
}

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
  const pageTitle = pedido.item || pedido.codigoPedido || pedido.identificador || pedido.id;
  const createdDate = formatPedidoCreatedDate(pedido.fechaOfertado);
  const subtitle = [createdDate ? `Pedido creado el ${createdDate}` : "", pedido.codigo].filter(Boolean).join(" · ");

  return (
    <PedidosShell
      title={pedido.codigo}
      pageTitle={pageTitle}
      subtitle={subtitle}
      actions={
        <Link href="/pedidos" className="inline-flex h-8 items-center rounded-full border border-[#3A3A36] px-3 text-sm font-semibold text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]">
          Volver
        </Link>
      }
    >
      <PedidoDetalleClient
        initialPedido={pedido}
        cotizacionOrigen={cotizacionOrigen}
        estadosPedidoOptions={estadosPedidoOptions}
      />
    </PedidosShell>
  );
}
