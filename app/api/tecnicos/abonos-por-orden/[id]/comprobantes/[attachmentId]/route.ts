import { NextResponse } from "next/server";
import { deleteComprobanteFromAbonoPorOrdenById } from "@/lib/tecnicos/airtable";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; attachmentId: string }> };

export async function DELETE(_: Request, { params }: Params) {
  const { id, attachmentId } = await params;

  if (!id) {
    return NextResponse.json(
      { success: false, error: "Falta id de abono por orden" },
      { status: 400 }
    );
  }
  if (!attachmentId) {
    return NextResponse.json({ success: false, error: "Falta id del adjunto" }, { status: 400 });
  }

  try {
    const result = await deleteComprobanteFromAbonoPorOrdenById({
      abonoPorOrdenRecordId: id,
      attachmentId,
    });
    return NextResponse.json({ success: true, data: result.abono });
  } catch (error) {
    console.error("Error al eliminar comprobante del abono", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
