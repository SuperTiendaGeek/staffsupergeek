import { NextResponse } from "next/server";
import { getShippingV2AccessContextForSession, getShippingV2PackingById, updateShippingV2Packing } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";
import type { ShippingV2PackingWriteInput } from "@/types/shipping-v2";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function parseOptionalWeight(value: unknown) {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) throw new Error("Peso inválido.");
  if (parsed < 0) throw new Error("El peso no puede ser negativo.");
  return parsed;
}

function parseInput(body: Record<string, unknown>): ShippingV2PackingWriteInput {
  const input: ShippingV2PackingWriteInput = {};
  for (const key of ["nombre", "tipo", "proveedorResponsableId", "proveedorLogisticoEcId", "trackingUsa", "transportistaUsa", "trackingEc", "unidadPeso", "observaciones"] as const) {
    if (Object.prototype.hasOwnProperty.call(body, key)) input[key] = String(body[key] ?? "");
  }
  if (Object.prototype.hasOwnProperty.call(body, "peso")) input.peso = parseOptionalWeight(body.peso);
  return input;
}

export async function GET(_request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  const { id } = await params;

  try {
    const access = await getShippingV2AccessContextForSession(session);
    const packing = await getShippingV2PackingById(id, access, { includeAiName: false });
    return NextResponse.json({ success: true, data: packing });
  } catch (error) {
    console.error("Error al obtener packing Shipping V2:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const access = await getShippingV2AccessContextForSession(session);
    const packing = await updateShippingV2Packing(id, parseInput(body), {
      actualizadoPor: getShippingV2SessionName(session),
      access,
    });
    return NextResponse.json({ success: true, data: packing });
  } catch (error) {
    console.error("Error al actualizar packing Shipping V2:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}
