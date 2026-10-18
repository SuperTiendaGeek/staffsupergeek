import { NextResponse } from "next/server";
import { canShippingV2, getShippingV2AccessContextForSession, resolverAsuntoRevisionShippingV2 } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Punto 10c-1: "Está bien" (con motivo), "Resuelto" o volver a abrir un asunto.
export async function PATCH(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  const { id } = await params;
  try {
    const access = await getShippingV2AccessContextForSession(session);
    if (!access.isAdmin || !(canShippingV2(access, "canUseRecepcion") || canShippingV2(access, "canEditItems"))) {
      return NextResponse.json({ success: false, error: "No tienes permiso para el control de inventario." }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const estado = body.estado === "Está bien" || body.estado === "Resuelto" || body.estado === "Abierto" ? body.estado : null;
    if (!estado) throw new Error("Estado no válido.");
    const asunto = await resolverAsuntoRevisionShippingV2(id, { estado, motivo: String(body.motivo ?? "").slice(0, 500) }, { actor: getShippingV2SessionName(session) });
    return NextResponse.json({ success: true, data: asunto });
  } catch (error) {
    console.error("Error al resolver el asunto:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}
