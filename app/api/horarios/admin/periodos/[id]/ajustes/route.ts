import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { fetchAjustesByPeriodo, registrarAmonestacionHorario } from "@/lib/horarios/airtable";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim().replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export async function GET(_: Request, { params }: Params) {
  const { response } = await requireAdminSession();

  if (response) {
    return response;
  }

  const { id } = await params;

  try {
    const ajustes = await fetchAjustesByPeriodo(id);
    return NextResponse.json({ success: true, ajustes });
  } catch (error) {
    console.error("Error al listar ajustes de periodo:", error);
    return NextResponse.json({ success: false, error: "No se pudieron cargar los ajustes del periodo" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  const { session, response } = await requireAdminSession();

  if (response) {
    return response;
  }

  const { id } = await params;
  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const horasDescontadas = toNumber(payload?.horasDescontadas);
  const motivo = normalizeString(payload?.motivo);
  const registroId = normalizeString(payload?.registroId);

  if (horasDescontadas === null || horasDescontadas <= 0 || !motivo) {
    return NextResponse.json({ success: false, error: "Horas a descontar y motivo son obligatorios" }, { status: 400 });
  }

  try {
    const result = await registrarAmonestacionHorario({
      periodoId: id,
      horasDescontadas,
      motivo,
      registroId: registroId || null,
      adminUser: session.user
    });

    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo registrar la amonestación";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
