import { NextResponse } from "next/server";
import { actualizarLlegadaShippingV2Item, getShippingV2AccessContextForSession, type ShippingV2LlegadaInput } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const TEXTOS = [
  "origenArticulo",
  "proveedorLogisticoId",
  "trackingHaciaIntermediario",
  "transportistaOrigenId",
  "trackingDesdeIntermediario",
  "transportistaEcuadorId",
  "trackingDirecto",
] as const;
const MONTOS = ["flete", "arancel", "otrosCostos"] as const;

/** Solo copia los campos que vinieron: lo que no se manda no se toca. */
function parseLlegada(body: Record<string, unknown>): ShippingV2LlegadaInput {
  const input: Record<string, unknown> = {};
  for (const key of TEXTOS) if (key in body) input[key] = String(body[key] ?? "");
  for (const key of MONTOS) {
    if (!(key in body)) continue;
    const raw = body[key];
    if (raw === null || raw === "") { input[key] = null; continue; }
    const n = Number(String(raw).replace(",", "."));
    if (!Number.isFinite(n)) throw new Error("Monto inválido.");
    input[key] = n;
  }
  return input as ShippingV2LlegadaInput;
}

// Pestaña Logística — rastreos, transportistas, casillero, costos y origen de
// un artículo que viaja suelto (auditoría Shipping V2, punto 2).
export async function PATCH(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  try {
    const { id } = await params;
    const access = await getShippingV2AccessContextForSession(session);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const item = await actualizarLlegadaShippingV2Item(id, parseLlegada(body), {
      actualizadoPor: getShippingV2SessionName(session),
      access,
    });
    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 400 }
    );
  }
}
