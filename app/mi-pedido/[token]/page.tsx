import type { Metadata } from "next";
import { MiPedidoClient } from "./MiPedidoClient";

// Página PÚBLICA del pedido especial (punto 10A-3): el cliente ve su
// cotización, elige y paga; después, el estado de su pedido.
// Sin login: la protege el token aleatorio. No indexable.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tu pedido · SUPER GEEK",
  robots: { index: false, follow: false },
};

export default async function MiPedidoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <MiPedidoClient token={token} />;
}
