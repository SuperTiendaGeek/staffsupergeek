import { NextResponse } from "next/server";
import { createServicioPorOrden } from "@/lib/tecnicos/airtable";

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

export async function POST(request: Request, { params }: Params) {
  const { id: ordenRecordId } = await params;

  if (!ordenRecordId) {
    return NextResponse.json(
      { success: false, error: "Falta el id de la orden" },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const catalogoServicioId = String(body?.catalogoServicioId ?? "").trim();
  const nombreSnapshot = String(body?.nombreSnapshot ?? "").trim();
  const costo = toNumber(body?.costo);
  const observacion = typeof body?.observacion === "string" ? body.observacion.trim() : null;

  if (!catalogoServicioId) {
    return NextResponse.json(
      { success: false, error: "Debes seleccionar un servicio del catálogo" },
      { status: 400 }
    );
  }
  if (!nombreSnapshot) {
    return NextResponse.json(
      { success: false, error: "Falta el nombre del servicio seleccionado" },
      { status: 400 }
    );
  }
  if (costo === null || costo < 0) {
    return NextResponse.json(
      { success: false, error: "El costo real es obligatorio" },
      { status: 400 }
    );
  }

  try {
    const created = await createServicioPorOrden({
      ordenRecordId,
      catalogoServicioId,
      nombreSnapshot,
      costo,
      observacion,
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("Error al crear servicio por orden:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
