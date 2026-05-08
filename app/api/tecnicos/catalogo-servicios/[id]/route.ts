import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { updateCatalogoServicio } from "@/lib/tecnicos/airtable";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export async function PATCH(request: Request, { params }: Params) {
  const { response } = await requireTecnicosSession();
  if (response) return response;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, error: "Falta id del servicio" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));

  try {
    const updated = await updateCatalogoServicio({
      id,
      nombre: typeof body?.nombre === "string" ? body.nombre : undefined,
      descripcion: typeof body?.descripcion === "string" ? body.descripcion : undefined,
      costoSugerido: body?.costoSugerido === undefined ? undefined : toNumber(body.costoSugerido),
      activo: typeof body?.activo === "boolean" ? body.activo : undefined,
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error al actualizar catálogo de servicios:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
