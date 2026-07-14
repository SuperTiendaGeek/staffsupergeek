import { NextResponse } from "next/server";
import { isAdministratorRole } from "@/lib/apps";
import { requireFinanzasSession } from "@/lib/finanzas/auth";
import { listarMovimientos } from "@/lib/finanzas/movimientos";
import { crearMovimientoManual } from "@/lib/finanzas/movimiento-manual";
import type { CategoriaMovimiento, EstadoMovimiento, TipoMovimiento } from "@/types/finanzas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { response } = await requireFinanzasSession();
  if (response) return response;

  try {
    const { searchParams } = new URL(request.url);
    const movimientos = await listarMovimientos({
      tipo: (searchParams.get("tipo") as TipoMovimiento) || undefined,
      categoria: (searchParams.get("categoria") as CategoriaMovimiento) || undefined,
      estado: (searchParams.get("estado") as EstadoMovimiento) || undefined,
      desde: searchParams.get("desde") || undefined,
      hasta: searchParams.get("hasta") || undefined,
      maxRecords: 200,
    });
    return NextResponse.json({ success: true, data: movimientos });
  } catch (error) {
    console.error("Error al listar movimientos financieros:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 500 });
  }
}

// Fase 20.3 §5 — movimiento manual, admin-only (mismo patrón inline que
// reparar-abono/anular): ingresos/egresos sueltos que ningún puente cubre.
export async function POST(request: Request) {
  const { session, response } = await requireFinanzasSession();
  if (response) return response;
  if (!isAdministratorRole(session?.user.rol)) {
    return NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const tipo = body?.tipo === "Ingreso" || body?.tipo === "Egreso" ? body.tipo : null;
  const categoria = typeof body?.categoria === "string" ? (body.categoria as CategoriaMovimiento) : null;
  const monto = Number(body?.monto);
  const cuentaId = typeof body?.cuentaId === "string" ? body.cuentaId : "";
  const metodo = typeof body?.metodo === "string" ? body.metodo : undefined;
  const fecha = typeof body?.fecha === "string" && body.fecha ? body.fecha : new Date().toISOString();
  const observacion = typeof body?.observacion === "string" ? body.observacion : "";
  const comprobanteUrl = typeof body?.comprobanteUrl === "string" ? body.comprobanteUrl : undefined;

  if (!tipo) {
    return NextResponse.json({ success: false, error: 'El tipo debe ser "Ingreso" o "Egreso".' }, { status: 400 });
  }
  if (!categoria) {
    return NextResponse.json({ success: false, error: "La categoría es obligatoria." }, { status: 400 });
  }
  if (!cuentaId) {
    return NextResponse.json({ success: false, error: "La cuenta es obligatoria." }, { status: 400 });
  }
  if (!(monto > 0)) {
    return NextResponse.json({ success: false, error: "El monto debe ser mayor a 0." }, { status: 400 });
  }

  try {
    const registradoPor = session!.user.nombre || session!.user.email || "Portal";
    const movimiento = await crearMovimientoManual({
      tipo,
      categoria,
      monto,
      cuentaId,
      metodo,
      fecha,
      observacion,
      comprobanteUrl,
      registradoPor,
    });
    return NextResponse.json({ success: true, data: movimiento });
  } catch (error) {
    console.error("Error al crear movimiento manual:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 500 });
  }
}
