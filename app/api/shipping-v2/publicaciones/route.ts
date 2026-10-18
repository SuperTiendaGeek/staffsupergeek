import { NextResponse } from "next/server";
import {
  canShippingV2,
  getShippingV2AccessContextForSession,
  getShippingV2GestorPublicaciones,
  guardarPublicacionShippingV2,
} from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";
import { CANALES_PUBLICACION, type CanalPublicacion } from "@/lib/shipping-v2/publicaciones";

export const dynamic = "force-dynamic";

// Punto 10d: gestor de publicaciones (anuncios por producto y canal).

function puedePublicar(access: Awaited<ReturnType<typeof getShippingV2AccessContextForSession>>) {
  return canShippingV2(access, "canUseRecepcion") || canShippingV2(access, "canEditItems");
}

export async function GET(request: Request) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  try {
    const access = await getShippingV2AccessContextForSession(session);
    if (!puedePublicar(access)) {
      return NextResponse.json({ success: false, error: "No tienes permiso para gestionar anuncios." }, { status: 403 });
    }
    const sku = new URL(request.url).searchParams.get("sku") ?? "";
    const data = await getShippingV2GestorPublicaciones(sku, access);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error al abrir el gestor de publicaciones:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  try {
    const access = await getShippingV2AccessContextForSession(session);
    if (!puedePublicar(access)) {
      return NextResponse.json({ success: false, error: "No tienes permiso para gestionar anuncios." }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const canal = String(body.canal ?? "") as CanalPublicacion;
    if (!(CANALES_PUBLICACION as readonly string[]).includes(canal)) throw new Error("Canal no válido.");
    const accion = body.accion === "publicar" || body.accion === "retirar" ? body.accion : "guardar";
    const precio = body.precio === null || body.precio === "" || body.precio === undefined ? null : Number(body.precio);
    const resultado = await guardarPublicacionShippingV2(
      {
        sku: String(body.sku ?? ""),
        canal,
        alcance: body.alcance === "Unidad" ? "Unidad" : "Producto",
        unidadId: body.unidadId ? String(body.unidadId) : undefined,
        plantillaId: body.plantillaId ? String(body.plantillaId) : undefined,
        titulo: String(body.titulo ?? ""),
        presentacion: String(body.presentacion ?? ""),
        descripcion: String(body.descripcion ?? ""),
        precio: precio !== null && Number.isFinite(precio) ? precio : null,
        enlace: String(body.enlace ?? ""),
        accion,
      },
      { actor: getShippingV2SessionName(session), access }
    );
    return NextResponse.json({ success: true, data: resultado });
  } catch (error) {
    console.error("Error al guardar el anuncio:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}
