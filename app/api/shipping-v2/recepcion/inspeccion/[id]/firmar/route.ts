import { NextResponse } from "next/server";
import {
  canShippingV2,
  firmarShippingV2InspeccionTecnica,
  getShippingV2AccessContextForSession,
} from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Firma la inspección.
 *
 * El servidor vuelve a comprobar que esté completa; no confía en que el botón
 * del navegador estuviera habilitado. Si falta algo, el mensaje de error dice
 * exactamente qué — es el mismo texto que ve el técnico abajo en la pantalla.
 */
export async function POST(_request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;

  const { id } = await params;

  try {
    const access = await getShippingV2AccessContextForSession(session);
    if (!canShippingV2(access, "canUseRecepcion")) {
      return NextResponse.json({ success: false, error: "No tienes permiso para usar Recepción." }, { status: 403 });
    }

    const resultado = await firmarShippingV2InspeccionTecnica(id, {
      actor: getShippingV2SessionName(session),
      access,
    });

    return NextResponse.json({ success: true, data: resultado.item, estado: resultado.estado });
  } catch (error) {
    console.error("Error al firmar la inspección técnica:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 400 }
    );
  }
}
