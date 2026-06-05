import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { eliminarPeriodoPago } from "@/lib/horarios/airtable";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_: Request, { params }: Params) {
  const { response } = await requireAdminSession();

  if (response) {
    return response;
  }

  const { id } = await params;

  try {
    const result = await eliminarPeriodoPago(id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo eliminar el periodo de pago";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
