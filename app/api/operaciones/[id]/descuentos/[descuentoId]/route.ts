import { requireOperacionesSession } from "@/lib/operaciones/auth";
import { responderAnularDescuento } from "@/lib/estado-cuenta/descuentos-ruta";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; descuentoId: string }> };

// DELETE /api/operaciones/[id]/descuentos/[descuentoId] — quita (anula) el
// descuento; nunca lo borra. Solo administrador (punto 4B).
export async function DELETE(request: Request, { params }: Params) {
  const { response, session } = await requireOperacionesSession();
  if (response || !session) return response;
  const { id, descuentoId } = await params;
  return responderAnularDescuento(request, session, { tipo: "operacion", recordId: id }, descuentoId);
}
