import { NextResponse } from "next/server";
import { deleteServicioPorOrdenById } from "@/lib/tecnicos/airtable";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_: Request, { params }: Params) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { success: false, error: "Falta id de servicio por orden" },
      { status: 400 }
    );
  }

  try {
    await deleteServicioPorOrdenById({ servicioPorOrdenRecordId: id });
    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error("Error al eliminar servicio por orden", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
