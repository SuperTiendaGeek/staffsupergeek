import { NextResponse } from "next/server";
import { getShippingV2AccessContextForSession, moverActivoShippingV2, type AccionActivo } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const ACCIONES = new Set<AccionActivo>(["uso-local", "venta", "baja", "revertir-baja"]);

// Activos de la tienda (punto 4, 8-oct-2026): Pasar a uso local, Pasar a la
// venta y Dar de baja. SOLO el Administrador del sistema; la función lo
// vuelve a comprobar por su cuenta.
export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  const { id } = await params;
  try {
    const access = await getShippingV2AccessContextForSession(session);
    if (access.isSiteAdmin !== true) {
      return NextResponse.json({ success: false, error: "Solo un Administrador puede hacer este movimiento." }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const accion = String(body.accion ?? "") as AccionActivo;
    if (!ACCIONES.has(accion)) return NextResponse.json({ success: false, error: "Acción no válida." }, { status: 400 });
    const precio = body.precioVenta === null || body.precioVenta === undefined || body.precioVenta === "" ? null : Number(body.precioVenta);
    const resultado = await moverActivoShippingV2(
      id,
      {
        accion,
        cantidad: Number(body.cantidad),
        motivo: typeof body.motivo === "string" ? body.motivo : "",
        precioVenta: precio,
      },
      { actor: getShippingV2SessionName(session), access }
    );
    return NextResponse.json({ success: true, data: resultado });
  } catch (error) {
    console.error("Error al mover el activo:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 400 }
    );
  }
}
