import { type NextRequest, NextResponse } from "next/server";
import { requireOperacionesSession } from "@/lib/operaciones/auth";
import { eliminarOperacionConOpciones, anularOperacion, fetchOperacionDetalle } from "@/lib/operaciones/airtable";
import { evaluarAnularPedido, evaluarEliminarOperacion, type DestinoArticulo } from "@/lib/operaciones/cierre";
import { leerArticuloDePedido, soltarArticuloDePedido } from "@/lib/shipping-v2/airtable";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { response } = await requireOperacionesSession();
  if (response) return response;

  const { id } = await params;
  try {
    // Punto 6 (9-oct): con artículo en inventario no se elimina (sus unidades
    // quedarían apartadas para siempre y el artículo sin dueño: C-7).
    const op = await fetchOperacionDetalle(id);
    const articulo = op?.articulosFisicos[0];
    const permiso = evaluarEliminarOperacion({ articuloSku: articulo ? articulo.sku || articulo.nombre || articulo.id : null });
    if (!permiso.ok) return NextResponse.json({ success: false, error: permiso.motivo }, { status: 409 });

    await eliminarOperacionConOpciones(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al eliminar la operación.";
    const status = msg.includes("abonos") ? 409 : 500;
    console.error("[api/operaciones/[id]] DELETE error:", err);
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { response, session } = await requireOperacionesSession();
  if (response || !session) return response ?? NextResponse.json({ success: false }, { status: 401 });

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Cuerpo inválido." }, { status: 400 });
  }

  if (body.action !== "anular") {
    return NextResponse.json({ success: false, error: "Acción no reconocida." }, { status: 400 });
  }

  try {
    // Punto 6 (9-oct): anular un pedido que ya tiene artículo pregunta qué
    // pasa con él: "stock" (se sueltan las unidades del cliente) o "cancelar"
    // (la compra se cancela; solo si no llegó ni está en un pago).
    const op = await fetchOperacionDetalle(id);
    if (!op) return NextResponse.json({ success: false, error: "Operación no encontrada." }, { status: 404 });
    const destino: DestinoArticulo | null = body.destino === "stock" || body.destino === "cancelar" ? body.destino : null;
    const motivo = typeof body.motivo === "string" ? body.motivo.trim().slice(0, 300) : "";
    const itemId = op.articulosFisicos[0]?.id ?? null;
    const articulo = itemId ? await leerArticuloDePedido(itemId) : null;
    const permiso = evaluarAnularPedido({
      desdeOrden: op.desdePresupuestoOrden ? op.ordenVinculada?.codigoOrden || "vinculada" : null,
      articulo,
      destino,
    });
    if (!permiso.ok) return NextResponse.json({ success: false, error: permiso.motivo }, { status: 409 });

    if (itemId && articulo && destino && (articulo.estado ?? "").toLowerCase() !== "cancelado") {
      await soltarArticuloDePedido(itemId, {
        modo: destino === "stock" ? "liberar" : "cancelar",
        motivo: motivo || "El cliente desistió.",
        registradoPor: session.user.nombre || "Portal",
        descripcion: destino === "stock"
          ? `Pedido ${op.codigo} anulado: el artículo queda en la tienda como stock.`
          : `Pedido ${op.codigo} anulado: se cancela la compra.`,
      });
    }
    await anularOperacion(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api/operaciones/[id]] PATCH error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error al anular la operación." },
      { status: 500 }
    );
  }
}
