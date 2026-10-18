import { NextResponse } from "next/server";
import { canShippingV2, getShippingV2AccessContextForSession, getShippingV2GestorPublicaciones } from "@/lib/shipping-v2/airtable";
import { requireShippingV2Session } from "@/lib/shipping-v2/auth";
import { sugerirTextoAnuncio } from "@/lib/shipping-v2/ia-anuncios-servidor";
import { CANALES_PUBLICACION, unidadesCubiertas, type CanalPublicacion } from "@/lib/shipping-v2/publicaciones";

export const dynamic = "force-dynamic";

// Punto 10d-3: ✨ Sugerir presentación o título con Claude.
export async function POST(request: Request) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  try {
    const access = await getShippingV2AccessContextForSession(session);
    if (!canShippingV2(access, "canUseRecepcion") && !canShippingV2(access, "canEditItems")) {
      return NextResponse.json({ success: false, error: "No tienes permiso para gestionar anuncios." }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const canal = String(body.canal ?? "") as CanalPublicacion;
    if (!(CANALES_PUBLICACION as readonly string[]).includes(canal)) throw new Error("Canal no válido.");
    const que = body.que === "titulo" ? "titulo" : "presentacion";
    const alcance = body.alcance === "Unidad" ? "Unidad" : "Producto";
    const datos = await getShippingV2GestorPublicaciones(String(body.sku ?? ""), access);
    const unidades = unidadesCubiertas(datos.unidades, datos.publicaciones, canal, alcance, body.unidadId ? String(body.unidadId) : undefined);
    if (!unidades.length) throw new Error("No hay unidades en este anuncio.");
    const texto = await sugerirTextoAnuncio({
      que,
      canal,
      alcance,
      unidades,
      tituloPlantilla: String(body.tituloPlantilla ?? "").slice(0, 300),
      actual: String(body.actual ?? "").slice(0, 2000),
    });
    return NextResponse.json({ success: true, data: { texto } });
  } catch (error) {
    console.error("Error en ✨ Sugerir:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}
