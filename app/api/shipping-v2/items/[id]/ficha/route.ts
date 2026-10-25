import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/session";
import { cargarFichaArticulo } from "@/lib/shipping-v2/ficha-articulo-servidor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Punto 18 (25-oct-2026): la ficha del artículo para la ventana que se abre
 * encima de las listas. Devuelve el paquete del perfil de la sesión
 * (Administrador, Staff, Técnico o Proveedor) con SOLO sus datos; la misma
 * función arma la página /shipping-v2/items/[id].
 */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const resultado = await cargarFichaArticulo(id, await getSessionFromCookie());
  if (!resultado.ok) {
    return NextResponse.json({ success: false, error: resultado.mensaje }, { status: resultado.estado, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ success: true, data: resultado.ficha }, { headers: { "Cache-Control": "no-store" } });
}
