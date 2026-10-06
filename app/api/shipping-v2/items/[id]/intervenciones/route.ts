import { NextResponse } from "next/server";
import {
  canShippingV2,
  getShippingV2AccessContextForSession,
  getShippingV2PanelIntervenciones,
  registrarShippingV2Intervencion,
} from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Mantenimientos y mejoras de un artículo (pestaña de su ficha).
// Desde el punto 3 de la auditoría (6-oct-2026) es el ÚNICO lugar para
// registrarlos; antes vivían dentro de la Inspección de Recepción.
//
// Una mejora descuenta una pieza del inventario: exige `canEditItems`. Un
// mantenimiento basta con poder usar Recepción o editar artículos. Un
// proveedor externo no tiene ninguno de los dos.

function puedeRegistrar(access: Awaited<ReturnType<typeof getShippingV2AccessContextForSession>>) {
  return canShippingV2(access, "canUseRecepcion") || canShippingV2(access, "canEditItems");
}

export async function GET(_request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  const { id } = await params;
  try {
    const access = await getShippingV2AccessContextForSession(session);
    if (!puedeRegistrar(access)) {
      return NextResponse.json({ success: false, error: "No tienes acceso a los mantenimientos y mejoras." }, { status: 403 });
    }
    const panel = await getShippingV2PanelIntervenciones(id, access);
    return NextResponse.json({
      success: true,
      data: { ...panel, puedeMejorar: canShippingV2(access, "canEditItems") },
    });
  } catch (error) {
    console.error("Error al leer mantenimientos y mejoras:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 400 }
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  const { id } = await params;
  try {
    const access = await getShippingV2AccessContextForSession(session);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const tipo = typeof body.tipo === "string" ? body.tipo.trim() : "";

    if (!puedeRegistrar(access)) {
      return NextResponse.json({ success: false, error: "No tienes permiso para registrar mantenimientos ni mejoras." }, { status: 403 });
    }
    if (tipo === "Mejora" && !canShippingV2(access, "canEditItems")) {
      return NextResponse.json(
        { success: false, error: "Registrar una mejora descuenta stock: necesitas permiso para editar artículos." },
        { status: 403 }
      );
    }

    const numero = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : undefined);
    const resultado = await registrarShippingV2Intervencion(
      id,
      {
        tipo,
        detalle: typeof body.detalle === "string" ? body.detalle : "",
        nota: typeof body.nota === "string" ? body.nota : undefined,
        repuestoId: typeof body.repuestoId === "string" ? body.repuestoId : undefined,
        cantidadUsada: numero(body.cantidadUsada),
        costoSumado: numero(body.costoSumado) ?? null,
        piezaRetirada:
          body.piezaRetirada && typeof body.piezaRetirada === "object"
            ? (() => {
                const p = body.piezaRetirada as Record<string, unknown>;
                return {
                  nombre: typeof p.nombre === "string" ? p.nombre : "",
                  categoria: typeof p.categoria === "string" ? p.categoria : "",
                  cantidad: numero(p.cantidad),
                  valor: numero(p.valor) ?? 0,
                };
              })()
            : null,
      },
      { actor: getShippingV2SessionName(session), access }
    );

    const panel = await getShippingV2PanelIntervenciones(id, access);
    return NextResponse.json({
      success: true,
      data: { ...panel, puedeMejorar: canShippingV2(access, "canEditItems") },
      repuestoDescontado: resultado.repuestoDescontado,
      piezaRetiradaSku: resultado.piezaRetiradaSku ?? "",
      avisos: resultado.avisos ?? [],
    });
  } catch (error) {
    console.error("Error al registrar la intervención:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 400 }
    );
  }
}
