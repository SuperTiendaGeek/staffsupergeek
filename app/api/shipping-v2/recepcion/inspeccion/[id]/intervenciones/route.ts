import { NextResponse } from "next/server";
import {
  canShippingV2,
  getShippingV2AccessContextForSession,
  getShippingV2IntervencionesDeItem,
  registrarShippingV2Intervencion,
} from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Registra un mantenimiento o una mejora.
 *
 * Una mejora descuenta el repuesto del inventario, así que exige permiso de
 * edición de items — no basta con poder usar Recepción.
 */
export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;

  const { id } = await params;

  try {
    const access = await getShippingV2AccessContextForSession(session);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const tipo = typeof body.tipo === "string" ? body.tipo.trim() : "";

    if (!canShippingV2(access, "canUseRecepcion")) {
      return NextResponse.json({ success: false, error: "No tienes permiso para usar Recepción." }, { status: 403 });
    }
    if (tipo === "Mejora" && !canShippingV2(access, "canEditItems")) {
      return NextResponse.json(
        { success: false, error: "Registrar una mejora descuenta stock: necesitas permiso para editar items." },
        { status: 403 }
      );
    }

    const resultado = await registrarShippingV2Intervencion(
      id,
      {
        tipo,
        detalle: typeof body.detalle === "string" ? body.detalle : "",
        nota: typeof body.nota === "string" ? body.nota : undefined,
        repuestoId: typeof body.repuestoId === "string" ? body.repuestoId : undefined,
        cantidadUsada: typeof body.cantidadUsada === "number" ? body.cantidadUsada : undefined,
      },
      { actor: getShippingV2SessionName(session), access }
    );

    const intervenciones = await getShippingV2IntervencionesDeItem(id);
    return NextResponse.json({
      success: true,
      data: resultado.intervencion,
      intervenciones,
      repuestoDescontado: resultado.repuestoDescontado,
    });
  } catch (error) {
    console.error("Error al registrar la intervención:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 400 }
    );
  }
}
