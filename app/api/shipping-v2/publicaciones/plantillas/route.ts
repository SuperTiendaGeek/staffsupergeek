import { NextResponse } from "next/server";
import { canShippingV2, getShippingV2AccessContextForSession, guardarPlantillaPublicacionShippingV2 } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";
import type { CanalPublicacion } from "@/lib/shipping-v2/publicaciones";

export const dynamic = "force-dynamic";

// Punto 10d-2: crear o editar una plantilla de anuncio (Administrador y Staff).
export async function POST(request: Request) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  try {
    const access = await getShippingV2AccessContextForSession(session);
    if (!access.isAdmin || !(canShippingV2(access, "canUseRecepcion") || canShippingV2(access, "canEditItems"))) {
      return NextResponse.json({ success: false, error: "No tienes permiso para editar plantillas." }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const plantilla = await guardarPlantillaPublicacionShippingV2(
      {
        id: body.id ? String(body.id) : undefined,
        nombre: String(body.nombre ?? ""),
        categoria: String(body.categoria ?? ""),
        canal: String(body.canal ?? "") as CanalPublicacion,
        titulo: String(body.titulo ?? ""),
        descripcion: String(body.descripcion ?? ""),
        activa: body.activa !== false,
      },
      { actor: getShippingV2SessionName(session) }
    );
    return NextResponse.json({ success: true, data: plantilla });
  } catch (error) {
    console.error("Error al guardar la plantilla:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}
