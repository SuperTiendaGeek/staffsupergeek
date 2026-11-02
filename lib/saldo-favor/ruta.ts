import "server-only";

// Manejo HTTP compartido del saldo a favor en la orden y en la operación
// (auditoría ops, punto 13B): mismo cuerpo, mismas reglas; solo cambia el
// origen y el permiso de módulo de cada ruta.

import { NextResponse } from "next/server";
import { isAdministratorRole } from "@/lib/apps";
import { cuentaPermiteReembolso, METODOS_REEMBOLSO } from "@/lib/facturacion/notaCredito/reembolso";
import { fetchCuentasFinancieras } from "@/lib/finanzas/cuentas";
import type { StaffSession } from "@/lib/session";
import {
  devolverSobranteDeCuenta,
  pasarCuentaASaldoAFavor,
  saldoDeLaCuenta,
  usarSaldoEnCuenta,
  type OrigenCuenta,
} from "./servidor";

const esRecordId = (v: string) => /^rec[A-Za-z0-9]{14}$/.test(v);

/** GET: saldo a favor del cliente de la cuenta y, al administrador, las cuentas para devolver. */
export async function responderSaldoDeCuenta(session: StaffSession, origen: OrigenCuenta) {
  if (!esRecordId(origen.recordId)) return NextResponse.json({ success: false, error: "Id inválido." }, { status: 400 });
  try {
    const { clienteId, saldo } = await saldoDeLaCuenta(origen);
    const esAdmin = isAdministratorRole(session.user.rol);
    let cuentasDevolucion: Array<{ id: string; nombre: string }> = [];
    if (esAdmin) {
      cuentasDevolucion = (await fetchCuentasFinancieras().catch(() => []))
        .filter((c) => cuentaPermiteReembolso({ id: c.id, nombre: c.nombre, tipo: String(c.tipo), activa: c.activa }))
        .map((c) => ({ id: c.id, nombre: c.nombre }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    }
    return NextResponse.json({
      success: true,
      data: {
        clienteId,
        disponible: saldo?.disponible ?? 0,
        proximoVence: saldo?.proximoVence ?? "",
        puedeDevolver: esAdmin,
        cuentasDevolucion,
        metodosDevolucion: esAdmin ? METODOS_REEMBOLSO : [],
      },
    });
  } catch (e) {
    console.error("[saldo-favor] GET", e);
    return NextResponse.json({ success: false, error: "No se pudo leer el saldo a favor." }, { status: 503 });
  }
}

/**
 * POST { accion: "pasar" } — todo el sobrante pasa al saldo del cliente.
 * POST { accion: "devolver", cuentaOrigenId, metodo, transaccionId } — solo administrador.
 * POST { accion: "usar", monto } — pagar con el saldo del cliente.
 */
export async function responderAccionSaldo(request: Request, session: StaffSession, origen: OrigenCuenta) {
  if (!esRecordId(origen.recordId)) return NextResponse.json({ success: false, error: "Id inválido." }, { status: 400 });
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch {
    return NextResponse.json({ success: false, error: "Cuerpo inválido." }, { status: 400 });
  }
  const accion = body.accion;
  try {
    const r =
      accion === "pasar"
        ? await pasarCuentaASaldoAFavor({ origen, session })
        : accion === "devolver"
          ? await devolverSobranteDeCuenta({
              origen, session,
              solicitud: { cuentaOrigenId: body.cuentaOrigenId, metodo: body.metodo, transaccionId: body.transaccionId },
            })
          : accion === "usar"
            ? await usarSaldoEnCuenta({ origen, session, monto: typeof body.monto === "number" ? body.monto : Number(body.monto) })
            : null;
    if (!r) return NextResponse.json({ success: false, error: "Acción no válida." }, { status: 400 });
    if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: r.status });
    const { ok: _ok, warning, ...data } = r;
    return NextResponse.json({ success: true, data, warning: warning ?? null });
  } catch (e) {
    console.error("[saldo-favor] POST", accion, e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Error inesperado." }, { status: 500 });
  }
}
