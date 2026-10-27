import { requireOperacionesSession } from "@/lib/operaciones/auth";
import { responderCrearDescuento } from "@/lib/estado-cuenta/descuentos-ruta";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// POST /api/operaciones/[id]/descuentos — solo administrador (punto 4B).
// Si el pedido es de una orden, el descuento queda en la cuenta de la orden.
export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireOperacionesSession();
  if (response || !session) return response;
  const { id } = await params;
  return responderCrearDescuento(request, session, { tipo: "operacion", recordId: id });
}
