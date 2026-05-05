import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { anularPagoHorario } from "@/lib/horarios/airtable";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; pagoId: string }> };

type AnularPagoPayload = {
  motivo?: unknown;
};

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function PATCH(request: Request, { params }: Params) {
  const { session, response } = await requireAdminSession();

  if (response) {
    return response;
  }

  const { id, pagoId } = await params;
  const body = (await request.json().catch(() => null)) as AnularPagoPayload | null;
  const motivo = getString(body?.motivo);

  if (!motivo) {
    return NextResponse.json({ success: false, error: "El motivo de anulación es obligatorio" }, { status: 400 });
  }

  try {
    const result = await anularPagoHorario({
      periodoId: id,
      pagoId,
      motivo,
      adminUser: session.user
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo anular el pago";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
