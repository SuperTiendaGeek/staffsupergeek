import { NextResponse } from "next/server";
import { asignarSerieInternaShippingV2, canShippingV2, getShippingV2AccessContextForSession } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";
import { isAdministratorRole } from "@/lib/apps";
import { camposConEstado, ocultarCamposDeObjeto } from "@/lib/permissions/campos";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Punto 10b-5: "Usar serie interna" (SG00000001…) para un equipo sin serie legible. */
export async function POST(_request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  const { id } = await params;

  try {
    const access = await getShippingV2AccessContextForSession(session);
    if (!canShippingV2(access, "canEditItems")) {
      return NextResponse.json({ success: false, error: "No tienes permiso para editar items." }, { status: 403 });
    }
    const esAdmin = isAdministratorRole(session?.user.rol);
    const restringidos = esAdmin ? {} : (session?.user.camposRestringidos ?? {});
    const ocultos = camposConEstado(restringidos, "shipping-v2", "items", "oculto");
    const soloLectura = camposConEstado(restringidos, "shipping-v2", "items", "solo-lectura");
    const item = await asignarSerieInternaShippingV2(id, {
      actualizadoPor: getShippingV2SessionName(session),
      esAdmin,
      access,
      camposNoEditables: [...ocultos, ...soloLectura],
    });
    return NextResponse.json({ success: true, data: ocultarCamposDeObjeto(item, ocultos) });
  } catch (error) {
    console.error("Error al asignar la serie interna:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}
