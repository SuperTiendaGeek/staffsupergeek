import { NextResponse } from "next/server";
import { requireOperacionesSession } from "@/lib/operaciones/auth";
import { fetchTiemposEstimados } from "@/lib/operaciones/airtable";

export const dynamic = "force-dynamic";

export async function GET() {
  const { response } = await requireOperacionesSession();
  if (response) return response;

  try {
    const data = await fetchTiemposEstimados();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[api/operaciones/tiempos-estimados] GET error:", err);
    return NextResponse.json({ success: false, error: "Error al cargar tiempos estimados." }, { status: 500 });
  }
}
