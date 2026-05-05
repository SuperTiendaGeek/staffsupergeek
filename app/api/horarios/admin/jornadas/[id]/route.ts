import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { corregirJornadaAdmin, fetchHorarioRegistroById } from "@/lib/horarios/airtable";
import type { CorregirJornadaAdminInput } from "@/types/horarios";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

type CorregirJornadaPayload = {
  entrada?: unknown;
  salidaAlmuerzo?: unknown;
  regresoAlmuerzo?: unknown;
  salidaFinal?: unknown;
  observaciones?: unknown;
  estadoDia?: unknown;
};

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function datetimeLocalToIso(value: unknown) {
  const textValue = getString(value);

  if (!textValue) {
    return "";
  }

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(textValue)) {
    throw new Error("Las horas deben tener formato válido.");
  }

  const date = new Date(`${textValue}:00-05:00`);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Las horas deben tener formato válido.");
  }

  return date.toISOString();
}

function normalizeEstadoDia(value: unknown): CorregirJornadaAdminInput["estadoDia"] {
  const textValue = getString(value);

  return textValue === "Finalizado" ? "Finalizado" : "Revisado";
}

export async function GET(_: Request, { params }: Params) {
  const { response } = await requireAdminSession();

  if (response) {
    return response;
  }

  const { id } = await params;

  try {
    const jornada = await fetchHorarioRegistroById(id);

    if (!jornada) {
      return NextResponse.json({ success: false, error: "No se encontró la jornada" }, { status: 404 });
    }

    return NextResponse.json({ success: true, jornada });
  } catch (error) {
    console.error("Error al cargar jornada para revisión:", error);
    return NextResponse.json({ success: false, error: "No se pudo cargar la jornada" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { session, response } = await requireAdminSession();

  if (response) {
    return response;
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as CorregirJornadaPayload | null;

  if (!body) {
    return NextResponse.json({ success: false, error: "Payload inválido" }, { status: 400 });
  }

  try {
    const jornada = await corregirJornadaAdmin(
      id,
      {
        entrada: datetimeLocalToIso(body.entrada),
        salidaAlmuerzo: datetimeLocalToIso(body.salidaAlmuerzo) || undefined,
        regresoAlmuerzo: datetimeLocalToIso(body.regresoAlmuerzo) || undefined,
        salidaFinal: datetimeLocalToIso(body.salidaFinal),
        observaciones: getString(body.observaciones),
        estadoDia: normalizeEstadoDia(body.estadoDia)
      },
      { adminUser: session.user }
    );

    return NextResponse.json({ success: true, jornada });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo corregir la jornada";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
