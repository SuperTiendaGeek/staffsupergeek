import { NextResponse } from "next/server";
import {
  createCatalogoRepuesto,
  fetchCatalogoRepuestosGestion,
} from "@/lib/tecnicos/airtable";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";

export const dynamic = "force-dynamic";

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

const getActivoFilter = (value: string | null): "todos" | "activos" | "inactivos" => {
  if (value === "activos" || value === "inactivos") return value;
  return "todos";
};

export async function GET(request: Request) {
  const { response } = await requireTecnicosSession();
  if (response) return response;

  const status = new URL(request.url).searchParams.get("estado");

  try {
    const catalogo = await fetchCatalogoRepuestosGestion({ activo: getActivoFilter(status) });
    return NextResponse.json({ success: true, data: catalogo });
  } catch (error) {
    console.error("Error al obtener catálogo de repuestos:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { response } = await requireTecnicosSession();
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const nombre = String(body?.nombre ?? "").trim();

  if (!nombre) {
    return NextResponse.json(
      { success: false, error: "El nombre del repuesto es obligatorio" },
      { status: 400 }
    );
  }

  try {
    const created = await createCatalogoRepuesto({
      nombre,
      descripcionCorta: typeof body?.descripcionCorta === "string" ? body.descripcionCorta : null,
      skuCodigoInterno: typeof body?.skuCodigoInterno === "string" ? body.skuCodigoInterno : null,
      proveedorHabitual: typeof body?.proveedorHabitual === "string" ? body.proveedorHabitual : null,
      costoBase: toNumber(body?.costoBase),
      precioSugeridoCliente: toNumber(body?.precioSugeridoCliente),
      activo: typeof body?.activo === "boolean" ? body.activo : true,
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("Error al crear catálogo de repuestos:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
