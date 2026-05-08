import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { updateCatalogoRepuesto } from "@/lib/tecnicos/airtable";

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
    return NextResponse.json({ success: false, error: "Falta id del repuesto" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));

  try {
    const updated = await updateCatalogoRepuesto({
      id,
      nombre: typeof body?.nombre === "string" ? body.nombre : undefined,
      descripcionCorta: typeof body?.descripcionCorta === "string" ? body.descripcionCorta : undefined,
      skuCodigoInterno: typeof body?.skuCodigoInterno === "string" ? body.skuCodigoInterno : undefined,
      proveedorHabitual: typeof body?.proveedorHabitual === "string" ? body.proveedorHabitual : undefined,
      costoBase: body?.costoBase === undefined ? undefined : toNumber(body.costoBase),
      precioSugeridoCliente: body?.precioSugeridoCliente === undefined ? undefined : toNumber(body.precioSugeridoCliente),
      activo: typeof body?.activo === "boolean" ? body.activo : undefined,
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error al actualizar catálogo de repuestos:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
