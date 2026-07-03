import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { fetchPeriodoPagoById, registrarAjusteHorario } from "@/lib/horarios/airtable";
import type { HorarioImpactoAjuste, HorarioTipoAjuste, HorarioTipoCalculoAjuste } from "@/types/horarios";
import { HORARIO_TIPOS_AJUSTE } from "@/types/horarios";

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
    const periodo = await fetchPeriodoPagoById(id);

    if (!periodo) {
      return NextResponse.json({ success: false, error: "No se encontró el periodo de pago" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      ajustes: periodo.ajustes,
      ajustesPeriodo: periodo.ajustes,
      ajustesEmpleado: periodo.ajustesEmpleado
    });
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
  const legacyHoras = toNumber(payload?.horasDescontadas);
  const tipoAjuste = normalizeString(payload?.tipoAjuste) || (legacyHoras !== null ? "Descuento" : "");
  const tipoCalculo = normalizeString(payload?.tipoCalculo) || (legacyHoras !== null ? "horas" : "");
  const horas = toNumber(payload?.horas) ?? legacyHoras;
  const monto = toNumber(payload?.monto);
  const impacto = normalizeString(payload?.impacto);
  const motivo = normalizeString(payload?.motivo);
  const registroId = normalizeString(payload?.registroId);

  if (!motivo) {
    return NextResponse.json({ success: false, error: "El motivo es obligatorio" }, { status: 400 });
  }

  if (!tipoAjuste || !(HORARIO_TIPOS_AJUSTE as readonly string[]).includes(tipoAjuste)) {
    return NextResponse.json({ success: false, error: "Tipo de ajuste obligatorio o no válido" }, { status: 400 });
  }

  if (tipoCalculo !== "horas" && tipoCalculo !== "monto") {
    return NextResponse.json({ success: false, error: "Tipo de cálculo obligatorio o no válido" }, { status: 400 });
  }

  if (horas !== null && horas > 0 && monto !== null && monto > 0) {
    return NextResponse.json({ success: false, error: "Registra el ajuste por horas o por monto, no ambos a la vez" }, { status: 400 });
  }

  if (tipoCalculo === "horas" && (horas === null || horas <= 0)) {
    return NextResponse.json({ success: false, error: "Las horas a ajustar deben ser mayores a 0" }, { status: 400 });
  }

  if (tipoCalculo === "monto" && (monto === null || monto <= 0)) {
    return NextResponse.json({ success: false, error: "El monto a ajustar debe ser mayor a 0" }, { status: 400 });
  }

  if (impacto && impacto !== "suma" && impacto !== "resta") {
    return NextResponse.json({ success: false, error: "Impacto no válido" }, { status: 400 });
  }

  try {
    const result = await registrarAjusteHorario({
      periodoId: id,
      tipoAjuste: tipoAjuste as HorarioTipoAjuste,
      tipoCalculo: tipoCalculo as HorarioTipoCalculoAjuste,
      horas,
      monto,
      impacto: impacto ? (impacto as HorarioImpactoAjuste) : null,
      motivo,
      registroId: registroId || null,
      adminUser: session.user
    });

    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo registrar el ajuste";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
