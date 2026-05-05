import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { crearPeriodoPago, fetchPeriodosPago } from "@/lib/horarios/airtable";

export const dynamic = "force-dynamic";

type CrearPeriodoPayload = {
  empleadoId?: unknown;
  fechaInicio?: unknown;
  fechaFin?: unknown;
};

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET() {
  const { response } = await requireAdminSession();

  if (response) {
    return response;
  }

  try {
    const periodos = await fetchPeriodosPago();
    return NextResponse.json({ success: true, periodos });
  } catch (error) {
    console.error("Error al listar periodos de pago:", error);
    return NextResponse.json({ success: false, error: "No se pudieron cargar los periodos de pago" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { response } = await requireAdminSession();

  if (response) {
    return response;
  }

  const body = (await request.json().catch(() => null)) as CrearPeriodoPayload | null;
  const empleadoId = getString(body?.empleadoId);
  const fechaInicio = getString(body?.fechaInicio);
  const fechaFin = getString(body?.fechaFin);

  if (!empleadoId || !fechaInicio || !fechaFin) {
    return NextResponse.json({ success: false, error: "Empleado, fecha inicio y fecha fin son obligatorios" }, { status: 400 });
  }

  try {
    const periodo = await crearPeriodoPago({ empleadoId, fechaInicio, fechaFin });
    return NextResponse.json({ success: true, periodo }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo crear el periodo de pago";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
