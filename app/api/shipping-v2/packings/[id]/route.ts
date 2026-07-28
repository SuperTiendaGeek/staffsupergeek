import { NextResponse } from "next/server";
import { canShippingV2, getShippingV2AccessContextForSession, getShippingV2PackingById, updateShippingV2Packing } from "@/lib/shipping-v2/airtable";
import { SHIPPING_V2_PACKING_SELECT_OPTIONS } from "@/lib/shipping-v2/schema.generated";
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

function parseOptionalMoney(value: unknown, label: string) {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) throw new Error(`${label} debe ser un número válido.`);
  if (parsed < 0) throw new Error(`${label} no puede ser negativo.`);
  return parsed;
}

function parseInput(body: Record<string, unknown>): ShippingV2PackingWriteInput {
  const supportedKeys = new Set(["nombre", "tipo", "ordenReferencia", "proveedorResponsableId", "trackingUsa", "transportistaUsa", "trackingEc", "transportistaEc", "observaciones", "peso", "flete", "arancel", "otrosCostos", "reglaDistribucionCostos", "observacionCostos"]);
  const unsupportedKey = Object.keys(body).find((key) => !supportedKeys.has(key));
  if (unsupportedKey) throw new Error(`Campo no soportado para packing: ${unsupportedKey}.`);
  const input: ShippingV2PackingWriteInput = {};
  for (const key of ["nombre", "tipo", "ordenReferencia", "proveedorResponsableId", "trackingUsa", "transportistaUsa", "trackingEc", "transportistaEc", "observaciones"] as const) {
    if (Object.prototype.hasOwnProperty.call(body, key)) input[key] = String(body[key] ?? "");
  }
  if (Object.prototype.hasOwnProperty.call(body, "peso")) input.peso = parseOptionalWeight(body.peso);
  if (Object.prototype.hasOwnProperty.call(body, "flete")) input.flete = parseOptionalMoney(body.flete, "Flete");
  if (Object.prototype.hasOwnProperty.call(body, "arancel")) input.arancel = parseOptionalMoney(body.arancel, "Arancel");
  if (Object.prototype.hasOwnProperty.call(body, "otrosCostos")) input.otrosCostos = parseOptionalMoney(body.otrosCostos, "Otros costos");
  if (Object.prototype.hasOwnProperty.call(body, "reglaDistribucionCostos")) {
    const value = String(body.reglaDistribucionCostos ?? "").trim();
    if (value && !SHIPPING_V2_PACKING_SELECT_OPTIONS.reglaDistribucionCostos.includes(value as (typeof SHIPPING_V2_PACKING_SELECT_OPTIONS.reglaDistribucionCostos)[number])) {
      throw new Error("Regla de distribución de costos inválida.");
    }
    input.reglaDistribucionCostos = value;
  }
  if (Object.prototype.hasOwnProperty.call(body, "observacionCostos")) input.observacionCostos = String(body.observacionCostos ?? "");
  return input;
}

function isWeightOnlyInput(input: ShippingV2PackingWriteInput) {
  const keys = Object.keys(input).filter((key) => Object.prototype.hasOwnProperty.call(input, key));
  return keys.length === 1 && keys[0] === "peso";
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
    const input = parseInput(body);
    if (!canShippingV2(access, "canEditPacking") && !(isWeightOnlyInput(input) && canShippingV2(access, "canEditPackingWeight"))) {
      return NextResponse.json({ success: false, error: "No tienes permiso para editar packings." }, { status: 403 });
    }
    const packing = await updateShippingV2Packing(id, input, {
      actualizadoPor: getShippingV2SessionName(session),
      access,
    });
    return NextResponse.json({ success: true, data: packing });
  } catch (error) {
    console.error("Error al actualizar packing Shipping V2:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}
