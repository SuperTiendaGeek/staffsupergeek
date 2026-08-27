import { NextResponse } from "next/server";
import { canShippingV2, getShippingV2AccessContextForSession, updateShippingV2ItemTechnicalSheet } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";
import type { ShippingV2TechnicalSheetInput } from "@/types/shipping-v2";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function parseBody(value: unknown): ShippingV2TechnicalSheetInput {
  if (!value || typeof value !== "object") throw new Error("Payload inválido.");
  const body = value as Record<string, unknown>;
  return {
    marcaFicha: body.marcaFicha as string | undefined,
    modeloFicha: body.modeloFicha as string | undefined,
    sistemaOperativo: body.sistemaOperativo as string | undefined,
    pantallaTamano: body.pantallaTamano as string | undefined,
    pantallaResolucion: body.pantallaResolucion as string | undefined,
    cpuMarca: body.cpuMarca as string | undefined,
    cpuModelo: body.cpuModelo as string | undefined,
    cpuFrecuenciaBase: body.cpuFrecuenciaBase as string | undefined,
    cpuFrecuenciaTurbo: body.cpuFrecuenciaTurbo as string | undefined,
    ramCapacidad: body.ramCapacidad as string | undefined,
    ramTipo: body.ramTipo as string | undefined,
    almacenamientoPrincipal: body.almacenamientoPrincipal as string | undefined,
    almacenamientoTipo: body.almacenamientoTipo as string | undefined,
    gpu: body.gpu as string | undefined,
    gpuIntegrada: body.gpuIntegrada as string | undefined,
    bateriaSalud: body.bateriaSalud as number | string | null | undefined,
    bateriaEstado: body.bateriaEstado as string | undefined,
    connectivityV2Ids: body.connectivityV2Ids as string[] | undefined,
    portV2Ids: body.portV2Ids as string[] | undefined,
    extraFeatureV2Ids: body.extraFeatureV2Ids as string[] | undefined,
    observacionFichaTecnica: body.observacionFichaTecnica as string | undefined,
    generated: body.generated === true,
    reviewed: body.reviewed === true,
  };
}

export async function PATCH(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const access = await getShippingV2AccessContextForSession(session);
    if (!canShippingV2(access, "canUseRecepcion")) {
      return NextResponse.json({ success: false, error: "No tienes permiso para editar fichas técnicas." }, { status: 403 });
    }
    const item = await updateShippingV2ItemTechnicalSheet(id, parseBody(body), {
      actualizadoPor: getShippingV2SessionName(session),
    });
    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("Error al guardar ficha técnica Shipping V2:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}
