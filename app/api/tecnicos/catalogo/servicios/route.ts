import { NextResponse } from "next/server";
import { createCatalogoServicio, fetchCatalogoServicios } from "@/lib/tecnicos/airtable";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const catalogo = await fetchCatalogoServicios();
    return NextResponse.json({ success: true, data: catalogo });
  } catch (error) {
    console.error("Error al obtener catálogo de servicios:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

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

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const nombre = String(body?.nombre ?? "").trim();
  const costoSugerido = toNumber(body?.costoSugerido);

  if (!nombre) {
    return NextResponse.json(
      { success: false, error: "El nombre del servicio es obligatorio" },
      { status: 400 }
    );
  }

  try {
    const created = await createCatalogoServicio({ nombre, costoSugerido });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("Error al crear catálogo de servicios:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
