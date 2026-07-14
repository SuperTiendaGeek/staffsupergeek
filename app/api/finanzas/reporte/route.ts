import { NextResponse } from "next/server";
import { requireFinanzasSession } from "@/lib/finanzas/auth";
import { calcularReporteDiario } from "@/lib/finanzas/reporte";

export const dynamic = "force-dynamic";

function diaSiguiente(fechaYMD: string): string {
  const fecha = new Date(`${fechaYMD}T00:00:00.000Z`);
  fecha.setUTCDate(fecha.getUTCDate() + 1);
  return fecha.toISOString().slice(0, 10);
}

// Fase 20.4 §3.6 — reporte diario, parametrizado por fecha (default hoy).
// Cualquier rol con acceso a Finanzas — es de solo lectura.
export async function GET(request: Request) {
  const { response } = await requireFinanzasSession();
  if (response) return response;

  try {
    const { searchParams } = new URL(request.url);
    const fecha = searchParams.get("fecha") || new Date().toISOString().slice(0, 10);
    const desde = `${fecha}T00:00:00.000`;
    const hasta = `${diaSiguiente(fecha)}T00:00:00.000`;

    const reporte = await calcularReporteDiario({ desde, hasta });
    return NextResponse.json({ success: true, data: reporte });
  } catch (error) {
    console.error("Error al calcular el reporte diario:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 500 });
  }
}
