import { NextResponse } from "next/server";
import { corregirEstadoShippingV2, getShippingV2AccessContextForSession } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Corregir estado (punto 5, 8-oct-2026): ÚNICA forma manual de cambiar el
// "Estado Item" o el "Estado de revisión". Solo el Administrador del sistema
// y con motivo; la función lo vuelve a comprobar por su cuenta.
export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  const { id } = await params;
  try {
    const access = await getShippingV2AccessContextForSession(session);
    if (access.isSiteAdmin !== true) {
      return NextResponse.json({ success: false, error: "Solo un Administrador puede corregir el estado a mano." }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const campo = body.campo === "revision" ? "revision" : body.campo === "estado" ? "estado" : null;
    if (!campo) return NextResponse.json({ success: false, error: "Campo no válido." }, { status: 400 });
    const resultado = await corregirEstadoShippingV2(
      id,
      {
        campo,
        valor: typeof body.valor === "string" ? body.valor : "",
        motivo: typeof body.motivo === "string" ? body.motivo : "",
      },
      { actor: getShippingV2SessionName(session), access }
    );
    return NextResponse.json({ success: true, data: resultado });
  } catch (error) {
    console.error("Error al corregir el estado:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 400 }
    );
  }
}
