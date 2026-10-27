import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { responderCrearDescuento } from "@/lib/estado-cuenta/descuentos-ruta";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// POST /api/tecnicos/ordenes/[id]/descuentos — solo administrador (punto 4B).
export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response || !session) return response;
  const { id } = await params;
  return responderCrearDescuento(request, session, { tipo: "orden", recordId: id });
}
