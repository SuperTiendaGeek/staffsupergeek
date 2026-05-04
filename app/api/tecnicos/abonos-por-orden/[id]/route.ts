import { NextResponse } from "next/server";
import { deleteAbonoPorOrdenById } from "@/lib/tecnicos/airtable";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_: Request, { params }: Params) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { success: false, error: "Falta id de abono por orden" },
      { status: 400 }
    );
  }

  try {
    await deleteAbonoPorOrdenById({ abonoPorOrdenRecordId: id });
    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error("Error al eliminar abono por orden", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
