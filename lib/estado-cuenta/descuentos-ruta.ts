import "server-only";

// Manejo HTTP compartido de las rutas de descuentos de la orden y de la
// operación (auditoría ops, punto 4B): mismo cuerpo, misma validación; solo
// cambia el origen y el permiso de módulo.

import { NextResponse } from "next/server";
import { isAdministratorRole } from "@/lib/apps";
import type { StaffSession } from "@/lib/session";
import { anularDescuentoDeCuenta, crearDescuentoEnCuenta, type OrigenDescuento } from "./descuentos-servidor";

const esRecordId = (v: string) => /^rec[A-Za-z0-9]{14}$/.test(v);

function usuario(session: StaffSession) {
  return { nombre: session.user.nombre, email: session.user.email, esAdmin: isAdministratorRole(session.user.rol) };
}

export async function responderCrearDescuento(request: Request, session: StaffSession, origen: OrigenDescuento) {
  if (!esRecordId(origen.recordId)) return NextResponse.json({ success: false, error: "Id inválido." }, { status: 400 });
  let body: { cargoId?: unknown; monto?: unknown; motivo?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: "Cuerpo inválido." }, { status: 400 }); }
  const cargoId = typeof body.cargoId === "string" ? body.cargoId : "";
  const monto = typeof body.monto === "number" ? body.monto : Number(body.monto);
  const motivo = typeof body.motivo === "string" ? body.motivo : "";
  if (!esRecordId(cargoId)) return NextResponse.json({ success: false, error: "Línea inválida." }, { status: 400 });
  const r = await crearDescuentoEnCuenta({ origen, cargoId, monto, motivo, usuario: usuario(session) });
  return r.ok
    ? NextResponse.json({ success: true, data: { id: r.id } })
    : NextResponse.json({ success: false, error: r.error }, { status: r.status });
}

export async function responderAnularDescuento(request: Request, session: StaffSession, origen: OrigenDescuento, descuentoId: string) {
  if (!esRecordId(origen.recordId)) return NextResponse.json({ success: false, error: "Id inválido." }, { status: 400 });
  let motivo = "";
  try { const b = (await request.json()) as { motivo?: unknown }; motivo = typeof b.motivo === "string" ? b.motivo : ""; } catch { /* sin cuerpo */ }
  const r = await anularDescuentoDeCuenta({ origen, descuentoId, motivo, usuario: usuario(session) });
  return r.ok
    ? NextResponse.json({ success: true, data: { id: r.id } })
    : NextResponse.json({ success: false, error: r.error }, { status: r.status });
}
