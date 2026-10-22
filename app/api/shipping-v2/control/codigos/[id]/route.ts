import { NextResponse } from "next/server";
import { marcarCambioCodigoShippingV2 } from "@/lib/shipping-v2/airtable";
import { accesoControl, errorJson } from "../../acceso";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Marcar "Etiqueta reimpresa" o "Anuncios corregidos" (Staff y Administrador). */
export async function PATCH(request: Request, { params }: Params) {
  const a = await accesoControl();
  if (a.response) return a.response;
  const { id } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const data = await marcarCambioCodigoShippingV2(
      id,
      {
        etiquetaReimpresa: typeof body.etiquetaReimpresa === "boolean" ? body.etiquetaReimpresa : undefined,
        anunciosCorregidos: typeof body.anunciosCorregidos === "boolean" ? body.anunciosCorregidos : undefined,
      },
      { actor: a.actor }
    );
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorJson(error, "Error al marcar el cambio de código:");
  }
}
