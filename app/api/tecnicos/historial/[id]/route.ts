import { NextResponse } from "next/server";
import { deleteHistorialById, fetchHistorialById, updateHistorialEstado } from "@/lib/tecnicos/airtable";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ success: false, error: "Falta id de historial" }, { status: 400 });
  }

  try {
    const record = await fetchHistorialById(id);
    if (!record) {
      return NextResponse.json({ success: false, error: "Historial no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: record });
  } catch (error) {
    console.error("Error al obtener historial por id", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ success: false, error: "Falta id de historial" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const { estadoNuevo, estadoGeneradoIA } = body ?? {};

  if (estadoNuevo === undefined && estadoGeneradoIA === undefined) {
    return NextResponse.json(
      { success: false, error: "No hay datos para actualizar" },
      { status: 400 }
    );
  }

  try {
    const record = await updateHistorialEstado({
      historialRecordId: id,
      estadoNuevo,
      estadoGeneradoIA,
    });
    return NextResponse.json({ success: true, data: record });
  } catch (error) {
    console.error("Error al actualizar historial", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: Params) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ success: false, error: "Falta id de historial" }, { status: 400 });
  }

  try {
    await deleteHistorialById({ historialRecordId: id });
    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error("Error al eliminar historial", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
