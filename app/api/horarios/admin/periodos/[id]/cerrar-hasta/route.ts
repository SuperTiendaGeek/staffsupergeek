import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { cerrarPeriodoHastaFecha } from "@/lib/horarios/airtable";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

type Payload = {
  fechaCorte?: unknown;
};

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request, { params }: Params) {
  const { response } = await requireAdminSession();

  if (response) {
    return response;
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Payload | null;
  const fechaCorte = getString(body?.fechaCorte);

  if (!fechaCorte) {
    return NextResponse.json({ success: false, error: "La fecha de corte es obligatoria" }, { status: 400 });
  }

  try {
    const result = await cerrarPeriodoHastaFecha({ periodoId: id, fechaCorte });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo cerrar el periodo hasta la fecha indicada";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
