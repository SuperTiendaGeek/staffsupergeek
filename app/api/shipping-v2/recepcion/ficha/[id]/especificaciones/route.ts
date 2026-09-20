import { NextResponse } from "next/server";
import {
  canShippingV2,
  getShippingV2AccessContextForSession,
  guardarShippingV2Especificaciones,
} from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Guarda los datos técnicos de la categoría desde la pantalla de ficha.
 *
 * Endpoint aparte del de la ficha a propósito: aquel REEMPLAZA la ficha entera
 * (marca, modelo, CPU, RAM…) con lo que venga en el cuerpo. Una llamada que
 * solo trae especificaciones la dejaría vacía.
 *
 * Qué valores son válidos lo decide el servidor según la categoría del item,
 * en `aplicarCambiosEspec`. Aquí solo se filtran pares de texto.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;

  const { id } = await params;

  try {
    const access = await getShippingV2AccessContextForSession(session);
    if (!canShippingV2(access, "canUseRecepcion")) {
      return NextResponse.json({ success: false, error: "No tienes permiso para usar Recepción." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const bruto = body.especificaciones;
    if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) {
      return NextResponse.json({ success: false, error: "No llegó ningún dato técnico." }, { status: 400 });
    }

    const cambios: Record<string, string> = {};
    for (const [clave, valor] of Object.entries(bruto as Record<string, unknown>)) {
      if (typeof valor === "string" || typeof valor === "number") cambios[clave] = String(valor);
    }

    const resultado = await guardarShippingV2Especificaciones(id, cambios, {
      actor: getShippingV2SessionName(session),
      access,
    });

    return NextResponse.json({ success: true, data: resultado.item, especificaciones: resultado.especificaciones });
  } catch (error) {
    console.error("Error al guardar los datos técnicos del item:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 400 }
    );
  }
}
