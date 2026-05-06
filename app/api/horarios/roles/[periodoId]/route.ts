import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { isAdministratorRole } from "@/lib/apps";
import { fetchPeriodoPagoById } from "@/lib/horarios/airtable";
import { getSessionFromCookie, type SessionUser } from "@/lib/session";
import type { HorarioPeriodoPagoDetalle } from "@/types/horarios";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ periodoId: string }> };

function userOwnsPeriodo(user: SessionUser, periodo: HorarioPeriodoPagoDetalle) {
  const userEmail = user.email.trim().toLowerCase();
  const periodoEmail = periodo.correo.trim().toLowerCase();

  return (
    periodo.usuarioId === user.userId ||
    periodo.empleadoRecordId === user.userId ||
    (Boolean(userEmail) && periodoEmail === userEmail)
  );
}

function sanitizeFilenamePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export async function GET(_request: Request, { params }: Params) {
  const session = await getSessionFromCookie();

  if (!session) {
    return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
  }

  const { periodoId } = await params;
  const periodo = await fetchPeriodoPagoById(periodoId);

  if (!periodo) {
    return NextResponse.json({ success: false, error: "No se encontró el periodo de pago" }, { status: 404 });
  }

  if (!isAdministratorRole(session.user.rol) && !userOwnsPeriodo(session.user, periodo)) {
    return NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 });
  }

  const blobReference = periodo.rolPagoBlobPathname || periodo.rolPagoBlobUrl;

  if (!blobReference) {
    return NextResponse.json({ success: false, error: "El periodo no tiene un rol de pago generado" }, { status: 404 });
  }

  const blob = await get(blobReference, { access: "private", useCache: false }).catch(() => null);

  if (!blob || blob.statusCode !== 200 || !blob.stream) {
    return NextResponse.json({ success: false, error: "No se encontró el PDF del rol de pago" }, { status: 404 });
  }

  const periodoFilename = sanitizeFilenamePart(`${periodo.fechaInicio}-${periodo.fechaFin}`) || periodo.id;

  return new Response(blob.stream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="rol-pago-${periodoFilename}.pdf"`,
      "Cache-Control": "private, no-store"
    }
  });
}
