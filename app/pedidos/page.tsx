import { redirect } from "next/navigation";
import { PedidosListClient } from "@/components/pedidos/PedidosListClient";
import { PedidosShell } from "@/components/pedidos/PedidosShell";
import { fetchPedidos } from "@/lib/pedidos/airtable";
import { getSessionFromCookie } from "@/lib/session";
import type { PedidoItem } from "@/types/pedidos";

export const dynamic = "force-dynamic";

export default async function PedidosPage() {
  const session = await getSessionFromCookie();
  if (!session) redirect("/login");

  let pedidos: PedidoItem[] = [];
  let error = "";

  try {
    pedidos = await fetchPedidos();
  } catch (loadError) {
    console.error("Error al cargar pedidos:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudieron cargar los pedidos.";
  }

  return (
    <PedidosShell title="Pedidos">
      {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}
      <PedidosListClient initialItems={pedidos} />
    </PedidosShell>
  );
}
