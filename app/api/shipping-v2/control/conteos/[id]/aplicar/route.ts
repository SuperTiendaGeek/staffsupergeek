import { NextResponse } from "next/server";
import { aplicarConteoShippingV2 } from "@/lib/shipping-v2/airtable";
import { MOTIVO_AJUSTE, type AccionAjuste, type DecisionAjuste } from "@/lib/shipping-v2/conteo";
import { accesoControl, errorJson } from "../../../acceso";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

/** 10c-2b: aplicar los ajustes del conteo terminado (solo Administrador). */
export async function POST(request: Request, { params }: Params) {
  const a = await accesoControl();
  if (a.response) return a.response;
  if (!a.esAdministrador) return NextResponse.json({ success: false, error: "Solo el Administrador aplica los ajustes." }, { status: 403 });
  const { id } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const decisiones: DecisionAjuste[] = (Array.isArray(body.decisiones) ? body.decisiones : [])
      .slice(0, 300)
      .map((d: { sku?: unknown; lado?: unknown; accion?: unknown }) => ({
        sku: String(d.sku ?? ""),
        lado: d.lado === "sobra" ? "sobra" : "falta",
        accion: String(d.accion ?? "") as AccionAjuste,
      }))
      .filter((d: DecisionAjuste) => d.sku && d.accion in MOTIVO_AJUSTE);
    const data = await aplicarConteoShippingV2(id, decisiones, { actor: a.actor, access: a.access });
    return NextResponse.json({ success: true, data: { ...data, conteo: { ...data.conteo, foto: null } } });
  } catch (error) {
    return errorJson(error, "Error al aplicar el conteo:");
  }
}
