import { NextResponse } from "next/server";
import { fusionarSkuShippingV2, getShippingV2Fusion } from "@/lib/shipping-v2/airtable";
import { accesoControl, errorJson } from "../acceso";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Punto 10c-3: fusionar SKU (solo Administrador).
async function soloAdministrador() {
  const a = await accesoControl();
  if (a.response) return a;
  if (!a.esAdministrador) return { ...a, response: NextResponse.json({ success: false, error: "Solo el Administrador fusiona SKU." }, { status: 403 }) };
  return a;
}

function listaSkus(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.map(String);
  return String(valor ?? "").split(/[\s,]+/).filter(Boolean);
}

/** Vista previa: ?skus=A,B,C&principal=A */
export async function GET(request: Request) {
  const a = await soloAdministrador();
  if (a.response) return a.response;
  try {
    const url = new URL(request.url);
    const data = await getShippingV2Fusion(listaSkus(url.searchParams.get("skus")), url.searchParams.get("principal") ?? undefined);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorJson(error, "Error al preparar la fusión:");
  }
}

export async function POST(request: Request) {
  const a = await soloAdministrador();
  if (a.response) return a.response;
  try {
    const body = await request.json().catch(() => ({}));
    const data = await fusionarSkuShippingV2({ skus: listaSkus(body.skus), principal: String(body.principal ?? "") }, { actor: a.actor, access: a.access });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorJson(error, "Error al fusionar:");
  }
}
