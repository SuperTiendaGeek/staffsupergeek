import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { actualizarEstadosPeriodosPago } from "@/lib/horarios/airtable";

export const dynamic = "force-dynamic";

export async function POST() {
  const { response } = await requireAdminSession();

  if (response) {
    return response;
  }

  try {
    const result = await actualizarEstadosPeriodosPago();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudieron actualizar los estados de periodos";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
