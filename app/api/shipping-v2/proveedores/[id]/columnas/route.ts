import { NextResponse } from "next/server";
import { getShippingV2AccessContextForSession, guardarColumnasImportacionProveedor } from "@/lib/shipping-v2/airtable";
import { requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

/**
 * Punto 9d (entrega 2, 15-oct-2026): "Recordar estas columnas" al cargar la
 * lista de un proveedor (Pegar desde hoja / Subir archivo).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  try {
    const { id } = await params;
    const access = await getShippingV2AccessContextForSession(session);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const columnas = await guardarColumnasImportacionProveedor(id, body.columnas, { access });
    return NextResponse.json({ success: true, data: columnas });
  } catch (error) {
    console.error("Error al recordar las columnas del proveedor:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}
