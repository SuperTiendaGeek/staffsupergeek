import { type NextRequest, NextResponse } from "next/server";
import { requireOperacionesSession } from "@/lib/operaciones/auth";
import { actualizarEstadoOperacion, fetchOperacionDetalle } from "@/lib/operaciones/airtable";
import { ESTADOS_OPERACION } from "@/types/operaciones";
import { asegurarSolicitudDeOpcion, cancelarSolicitudesDeOperacion } from "@/lib/compras/servidor";
import { evaluarCambioEstadoOperacion } from "@/lib/operaciones/cierre";

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

  // Punto 6 (9-oct): "Entregado" no se marca a mano, y una operación que ya
  // tiene artículo no se regresa ni se rechaza por aquí (se anula eligiendo
  // qué pasa con el artículo). Ver lib/operaciones/cierre.ts.
  const articulo = op.articulosFisicos[0];
  const permiso = evaluarCambioEstadoOperacion({
    estadoActual: op.estado,
    estadoNuevo: estado,
    articuloSku: articulo ? articulo.sku || articulo.nombre || articulo.id : null,
  });
  if (!permiso.ok) {
    return NextResponse.json({ success: false, error: permiso.motivo }, { status: 409 });
  }

  // Rule: Aprobado requires an Opción Elegida
  if (estado === "Aprobado" && !op.opcionElegidaId) {
    return NextResponse.json(
      { success: false, error: "Se requiere una Opción Elegida para pasar a Aprobado." },
      { status: 422 }
    );
  }

  // Fase 2 (2-nov-2026): "Pedido" ya no crea el artículo. Lo que el cliente
  // aprobó se compra en Logística (bandeja "Por comprar" → Registrar compra) y
  // el pedido pasa a "Pedido" solo cuando esa compra se registra.
  if (estado === "Pedido" && op.articulosFisicos.length === 0) {
    return NextResponse.json(
      { success: false, error: "Se compra desde Logística (Shipping V2 → Por comprar). El pedido pasa a \"Pedido\" solo al registrar la compra." },
      { status: 409 }
    );
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

  if (estado === "Rechazado") {
    await cancelarSolicitudesDeOperacion(id, "El pedido se rechazó.", session.user.nombre).catch((err) =>
      console.error("[api/operaciones/[id]/estado] cancelar solicitudes:", err)
    );
  }

  // Al aprobar nace su solicitud de compra (una sola por opción).
  if (estado === "Aprobado" && op.opcionElegidaId) {
    try {
      await asegurarSolicitudDeOpcion({ operacionId: id, opcionId: op.opcionElegidaId, usuario: session.user.nombre });
    } catch (err) {
      console.error("[api/operaciones/[id]/estado] solicitud de compra:", err);
      return NextResponse.json({ success: true, warning: "Quedó aprobado, pero no se pudo crear la solicitud de compra. Vuelve a intentarlo o avisa al administrador." });
    }
  }

  return NextResponse.json({ success: true });
}
