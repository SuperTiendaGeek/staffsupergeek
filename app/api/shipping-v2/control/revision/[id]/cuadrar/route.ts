import { NextResponse } from "next/server";
import { cuadrarUnidadesShippingV2 } from "@/lib/shipping-v2/airtable";
import { CAUSAS_FALTA, CAUSAS_SOBRA, type CausaCuadre } from "@/lib/shipping-v2/cuadre";
import { accesoControl, errorJson } from "../../../acceso";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };
const CAUSAS = new Set<string>([...CAUSAS_FALTA, ...CAUSAS_SOBRA]);

/** Punto 10c-4: el Administrador cuadra las unidades del artículo de este asunto. */
export async function POST(request: Request, { params }: Params) {
  const a = await accesoControl();
  if (a.response) return a.response;
  if (!a.esAdministrador) return NextResponse.json({ success: false, error: "Solo el Administrador cuadra el inventario." }, { status: 403 });
  const { id } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const causa = CAUSAS.has(String(body.causa ?? "")) ? (String(body.causa) as CausaCuadre) : "";
    const data = await cuadrarUnidadesShippingV2(
      { asuntoId: id, itemId: String(body.itemId ?? ""), n: Number(body.n), causa, motivo: String(body.motivo ?? "").slice(0, 500) },
      { actor: a.actor, access: a.access }
    );
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorJson(error, "Error al cuadrar:");
  }
}
