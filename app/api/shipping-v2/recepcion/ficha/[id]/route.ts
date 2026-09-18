import { NextResponse } from "next/server";
import { canShippingV2, getShippingV2AccessContextForSession, updateShippingV2ItemTechnicalSheet } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";
import type { ShippingV2TechnicalSheetInput } from "@/types/shipping-v2";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Campos de la ficha, sin las dos banderas de estado.
 *
 * `Required<>` en las CLAVES obliga a nombrarlos todos abajo. Es a propósito:
 * `updateShippingV2ItemTechnicalSheet` REEMPLAZA la ficha entera, no la mezcla,
 * así que un campo que no se lea aquí se guarda como `null` y borra en silencio
 * lo que hubiera. Ya pasó con `Almacenamiento 2`: la inspección lo llenaba y el
 * primer guardado desde esta pantalla lo dejaba vacío. Con este tipo, olvidarse
 * de un campo nuevo no compila.
 */
// Los `*V2Names` se omiten porque son derivados: la ficha se guarda por ids y
// Airtable resuelve los nombres. Todo lo demás sí hay que nombrarlo.
type CamposFicha = Omit<
  ShippingV2TechnicalSheetInput,
  "generated" | "reviewed" | "connectivityV2Names" | "portV2Names" | "extraFeatureV2Names"
>;

function parseBody(value: unknown): ShippingV2TechnicalSheetInput {
  if (!value || typeof value !== "object") throw new Error("Payload inválido.");
  const body = value as Record<string, unknown>;
  const campos: { [K in keyof Required<CamposFicha>]: CamposFicha[K] } = {
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
    almacenamiento2: body.almacenamiento2 as string | undefined,
    almacenamiento2Tipo: body.almacenamiento2Tipo as string | undefined,
    gpu: body.gpu as string | undefined,
    gpuIntegrada: body.gpuIntegrada as string | undefined,
    bateriaSalud: body.bateriaSalud as number | string | null | undefined,
    bateriaEstado: body.bateriaEstado as string | undefined,
    connectivityV2Ids: body.connectivityV2Ids as string[] | undefined,
    portV2Ids: body.portV2Ids as string[] | undefined,
    extraFeatureV2Ids: body.extraFeatureV2Ids as string[] | undefined,
    observacionFichaTecnica: body.observacionFichaTecnica as string | undefined,
  };

  return { ...campos, generated: body.generated === true, reviewed: body.reviewed === true };
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
