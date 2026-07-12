import { NextResponse } from "next/server";
import { isAdministratorRole } from "@/lib/apps";
import { requireFinanzasSession } from "@/lib/finanzas/auth";
import { crearMovimientoParaAbono } from "@/lib/finanzas/puentes/abonos";
import { fetchRecordById } from "@/lib/finanzas/airtable-client";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Fase 20.2 §4.1 — mecanismo de reparación manual: re-ejecuta el Puente 1
// para un abono puntual que quedó sin Movimiento Financiero (el puente
// falló en su momento). Idempotente por diseño — si el abono ya tiene
// movimiento, no hace nada y lo informa. Admin-only, sin UI todavía.
export async function POST(_request: Request, { params }: Params) {
  const { session, response } = await requireFinanzasSession();
  if (response) return response;
  if (!isAdministratorRole(session?.user.rol)) {
    return NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 });
  }

  const { id } = await params;

  const abono = await fetchRecordById("Abonos", id);
  if (!abono) {
    return NextResponse.json({ success: false, error: `Abono ${id} no encontrado.` }, { status: 404 });
  }

  const monto = Number(abono.fields["Monto"]) || 0;
  const metodoPago = typeof abono.fields["Método de Pago"] === "string" ? (abono.fields["Método de Pago"] as string) : null;
  const fecha = typeof abono.fields["Fecha de Abono"] === "string" ? (abono.fields["Fecha de Abono"] as string) : new Date().toISOString();
  const registradoPor =
    (typeof abono.fields["Registrado Por"] === "string" && abono.fields["Registrado Por"]) ||
    session!.user.nombre ||
    session!.user.email ||
    "Portal";
  const numeroTransaccion =
    typeof abono.fields["Número de Transacción"] === "string" ? (abono.fields["Número de Transacción"] as string) : undefined;
  const observacion = typeof abono.fields["Observación"] === "string" ? (abono.fields["Observación"] as string) : undefined;

  const resultado = await crearMovimientoParaAbono({
    abonoId: id,
    monto,
    metodoPago,
    fecha,
    registradoPor,
    numeroTransaccion,
    observacion,
  });

  if (!resultado.ok) {
    return NextResponse.json({ success: false, error: resultado.error }, { status: 500 });
  }
  return NextResponse.json({ success: true, movimientoId: resultado.movimientoId });
}
