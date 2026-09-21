import { type NextRequest, NextResponse } from "next/server";
import { requireOperacionesSession } from "@/lib/operaciones/auth";
import {
  actualizarEstadoOperacion,
  fetchOperacionDetalle,
  pasarOperacionAPedido,
} from "@/lib/operaciones/airtable";
import { ESTADOS_OPERACION } from "@/types/operaciones";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { session, response } = await requireOperacionesSession();
  if (response || !session) return response ?? NextResponse.json({ success: false }, { status: 401 });

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Cuerpo inválido." }, { status: 400 });
  }

  const estado = typeof body.estado === "string" ? body.estado.trim() : null;
  if (!estado || !(ESTADOS_OPERACION as readonly string[]).includes(estado)) {
    return NextResponse.json({ success: false, error: "Estado inválido." }, { status: 400 });
  }

  // Fetch operation once — used for both validations and post-update side effects
  const op = await fetchOperacionDetalle(id).catch(() => null);
  if (!op) {
    return NextResponse.json({ success: false, error: "Operación no encontrada." }, { status: 404 });
  }

  // Rule: Aprobado requires an Opción Elegida
  if (estado === "Aprobado" && !op.opcionElegidaId) {
    return NextResponse.json(
      { success: false, error: "Se requiere una Opción Elegida para pasar a Aprobado." },
      { status: 422 }
    );
  }

  // "Pedido" tiene efecto secundario (crea el artículo en inventario): pasa
  // por el camino compartido, el mismo que usa la tarjeta Presupuesto.
  if (estado === "Pedido") {
    try {
      const r = await pasarOperacionAPedido(id, op.opcionElegidaId, session.user.nombre);
      if (r.itemCreado) return NextResponse.json({ success: true, itemCreado: true, itemId: r.itemId });
      return NextResponse.json({ success: true, itemCreado: false, itemId: r.itemId, ...(r.aviso ? { itemWarning: r.aviso } : {}) });
    } catch (err) {
      console.error("[api/operaciones/[id]/estado] PATCH error:", err);
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : "Error al actualizar estado." },
        { status: 500 }
      );
    }
  }

  try {
    await actualizarEstadoOperacion(id, estado);
  } catch (err) {
    console.error("[api/operaciones/[id]/estado] PATCH error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error al actualizar estado." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
