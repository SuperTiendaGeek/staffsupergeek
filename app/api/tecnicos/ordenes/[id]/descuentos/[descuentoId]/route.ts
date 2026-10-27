import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { responderAnularDescuento } from "@/lib/estado-cuenta/descuentos-ruta";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; descuentoId: string }> };

// DELETE /api/tecnicos/ordenes/[id]/descuentos/[descuentoId] — quita (anula)
// el descuento; nunca lo borra. Solo administrador (punto 4B).
export async function DELETE(request: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response || !session) return response;
  const { id, descuentoId } = await params;
  return responderAnularDescuento(request, session, { tipo: "orden", recordId: id }, descuentoId);
}
