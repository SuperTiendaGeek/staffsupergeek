import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { generarRolPagoPeriodo } from "@/lib/horarios/airtable";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

type GenerarRolPayload = {
  observacionRol?: unknown;
};

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request, { params }: Params) {
  const { session, response } = await requireAdminSession();

  if (response) {
    return response;
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as GenerarRolPayload | null;

  try {
    const periodo = await generarRolPagoPeriodo({
      periodoId: id,
      adminUser: session.user,
      observacionRol: getString(body?.observacionRol)
    });

    return NextResponse.json({ success: true, periodo });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo generar el rol de pago";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
