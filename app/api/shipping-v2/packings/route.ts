import { NextResponse } from "next/server";
import { createShippingV2Packing, getShippingV2AccessContextForSession, getShippingV2Packings } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";
import type { ShippingV2PackingWriteInput } from "@/types/shipping-v2";

export const dynamic = "force-dynamic";

function parseOptionalWeight(value: unknown) {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) throw new Error("Peso inválido.");
  if (parsed < 0) throw new Error("El peso no puede ser negativo.");
  return parsed;
}

function parseInput(body: Record<string, unknown>): ShippingV2PackingWriteInput {
  return {
    nombre: String(body.nombre ?? ""),
    tipo: String(body.tipo ?? ""),
    estado: String(body.estado ?? ""),
    proveedorResponsableId: String(body.proveedorResponsableId ?? ""),
    proveedorLogisticoEcId: String(body.proveedorLogisticoEcId ?? ""),
    trackingUsa: String(body.trackingUsa ?? ""),
    transportistaUsa: String(body.transportistaUsa ?? ""),
    trackingEc: String(body.trackingEc ?? ""),
    peso: parseOptionalWeight(body.peso),
    unidadPeso: String(body.unidadPeso ?? ""),
    observaciones: String(body.observaciones ?? ""),
  };
}

export async function GET() {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;

  try {
    const access = await getShippingV2AccessContextForSession(session);
    const packings = await getShippingV2Packings(access);
    return NextResponse.json({ success: true, data: packings });
  } catch (error) {
    console.error("Error al obtener packings Shipping V2:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;

  try {
    const body = await request.json().catch(() => ({}));
    const access = await getShippingV2AccessContextForSession(session);
    const packing = await createShippingV2Packing(parseInput(body), {
      creadoPor: getShippingV2SessionName(session),
      access,
    });
    return NextResponse.json({ success: true, data: packing, recordId: packing.id }, { status: 201 });
  } catch (error) {
    console.error("Error al crear packing Shipping V2:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}
