import { NextResponse } from "next/server";
import { getShippingV2AccessContextForSession, transitionShippingV2Novedad } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";
import type { ValoresAccionNovedad } from "@/lib/shipping-v2/novedades";
import { origenPublico } from "@/lib/tecnicos/presupuesto/origen";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function numero(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function texto(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

// Acciones sobre una novedad (punto 8). Quién puede qué —proveedor, personal,
// Administrador— lo decide transitionShippingV2Novedad con las reglas de
// lib/shipping-v2/novedades.ts. Aquí solo se limpia la entrada.
export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  const { id } = await params;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const v = (body.valores && typeof body.valores === "object" ? body.valores : {}) as Record<string, unknown>;
    const access = await getShippingV2AccessContextForSession(session);
    const valores: ValoresAccionNovedad = {
      texto: texto(v.texto),
      decision: texto(v.decision),
      propuesta: texto(v.propuesta),
      precio: numero(v.precio),
      cantidad: numero(v.cantidad),
      comoAparecio: texto(v.comoAparecio),
      pendienteProveedor: v.pendienteProveedor === true,
      desbloquear: v.desbloquear === true,
      montoReclamado: numero(v.montoReclamado),
      montoRecuperado: numero(v.montoRecuperado),
    };

    const resultado = await transitionShippingV2Novedad(id, {
      accion: String(body.accion ?? ""),
      valores,
      actor: getShippingV2SessionName(session),
      access,
      origin: origenPublico(request),
    });

    return NextResponse.json({ success: true, data: resultado });
  } catch (error) {
    console.error("Error en una acción de novedad Shipping V2:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 400 }
    );
  }
}
