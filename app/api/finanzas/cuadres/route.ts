import { NextResponse } from "next/server";
import { requireFinanzasSession } from "@/lib/finanzas/auth";
import { crearCuadre, fetchUltimoCuadre, listarCuadresDeCuenta } from "@/lib/finanzas/cuadres";
import { fetchCuentaPorNombre } from "@/lib/finanzas/cuentas";
import { PreGoLiveError } from "@/lib/finanzas/pre-go-live";

export const dynamic = "force-dynamic";

async function resolverCuentaId(searchParams: URLSearchParams): Promise<string | null> {
  const cuentaId = searchParams.get("cuentaId");
  if (cuentaId) return cuentaId;
  const caja = await fetchCuentaPorNombre("Caja Registradora");
  return caja?.id ?? null;
}

// Fase 20.4 §2.6 — historial de cuadres (default: Caja Registradora).
export async function GET(request: Request) {
  const { response } = await requireFinanzasSession();
  if (response) return response;

  try {
    const { searchParams } = new URL(request.url);
    const cuentaId = await resolverCuentaId(searchParams);
    if (!cuentaId) {
      return NextResponse.json({ success: false, error: "No se pudo resolver la cuenta." }, { status: 404 });
    }
    const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined;
    const soloUltimo = searchParams.get("ultimo") === "1";

    if (soloUltimo) {
      const ultimo = await fetchUltimoCuadre(cuentaId);
      return NextResponse.json({ success: true, data: ultimo });
    }

    const cuadres = await listarCuadresDeCuenta(cuentaId, limit);
    return NextResponse.json({ success: true, data: cuadres });
  } catch (error) {
    console.error("Error al listar cuadres de caja:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 500 });
  }
}

// Fase 20.4 §2.6 — crear un cuadre. Operativo + admin (el empleado hace el conteo).
export async function POST(request: Request) {
  const { session, response } = await requireFinanzasSession();
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const cuentaId = typeof body?.cuentaId === "string" ? body.cuentaId : "";
  const montoContado = Number(body?.montoContado);
  const fecha = typeof body?.fecha === "string" && body.fecha ? body.fecha : new Date().toISOString();
  const observacion = typeof body?.observacion === "string" ? body.observacion : undefined;

  if (!cuentaId) {
    return NextResponse.json({ success: false, error: "La cuenta es obligatoria." }, { status: 400 });
  }
  if (!Number.isFinite(montoContado) || montoContado < 0) {
    return NextResponse.json({ success: false, error: "El monto contado debe ser un número mayor o igual a 0." }, { status: 400 });
  }

  try {
    const realizadoPor = session!.user.nombre || session!.user.email || "Portal";
    const cuadre = await crearCuadre({ cuentaId, montoContado, fecha, observacion, realizadoPor });
    return NextResponse.json({ success: true, data: cuadre });
  } catch (error) {
    if (error instanceof PreGoLiveError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 409 });
    }
    console.error("Error al crear cuadre de caja:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 500 });
  }
}
