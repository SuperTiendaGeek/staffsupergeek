import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { leerLinea, actualizarLinea, borrarLinea, type CambiosLinea } from "@/lib/tecnicos/presupuesto/airtable";
import { esEditable, aceptaVincularArticulo, validarLinea } from "@/lib/tecnicos/presupuesto/reglas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; lineaId: string }> };

// PATCH  — editar una línea Propuesta, rechazarla, o vincular el artículo de
//          inventario a un repuesto (también si ya está Aprobada y esperando
//          stock). Lo Cargado no se toca desde aquí: se ajusta en su tarjeta.
// DELETE — borrar una línea Propuesta.
async function lineaDeLaOrden(ordenId: string, lineaId: string) {
  const linea = await leerLinea(lineaId);
  if (!linea || linea.ordenId !== ordenId) return null;
  return linea;
}

export async function PATCH(request: Request, { params }: Params) {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  const { id, lineaId } = await params;

  const linea = await lineaDeLaOrden(id, lineaId);
  if (!linea) return NextResponse.json({ success: false, error: "Línea no encontrada en esta orden" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as {
    accion?: "rechazar" | "reabrir";
    descripcion?: string; cantidad?: number; precioUnitario?: number; itemId?: string | null;
  };

  try {
    if (body.accion === "rechazar") {
      if (!esEditable(linea)) return NextResponse.json({ success: false, error: "Solo se rechaza una línea Propuesta." }, { status: 409 });
      return NextResponse.json({ success: true, data: await actualizarLinea(lineaId, { estado: "Rechazada" }) });
    }
    if (body.accion === "reabrir") {
      if (linea.estado !== "Rechazada") return NextResponse.json({ success: false, error: "Solo se reabre una línea Rechazada." }, { status: 409 });
      return NextResponse.json({ success: true, data: await actualizarLinea(lineaId, { estado: "Propuesta" }) });
    }

    const soloArticulo = body.itemId !== undefined && body.descripcion === undefined && body.cantidad === undefined && body.precioUnitario === undefined;
    if (soloArticulo) {
      if (!aceptaVincularArticulo(linea)) return NextResponse.json({ success: false, error: "Esta línea ya no acepta cambios de artículo." }, { status: 409 });
    } else if (!esEditable(linea)) {
      return NextResponse.json({ success: false, error: "Solo se edita una línea Propuesta. Lo aprobado se ajusta en su tarjeta." }, { status: 409 });
    }

    const propuesta = {
      tipo: linea.tipo,
      descripcion: body.descripcion ?? linea.descripcion,
      cantidad: body.cantidad !== undefined ? Number(body.cantidad) : linea.cantidad,
      precioUnitario: body.precioUnitario !== undefined ? Number(body.precioUnitario) : linea.precioUnitario,
      servicioCatalogoId: linea.servicioCatalogoId,
      itemId: body.itemId !== undefined ? body.itemId : linea.itemId,
      productoCatalogoId: linea.productoCatalogoId,
    };
    const error = validarLinea(propuesta);
    if (error) return NextResponse.json({ success: false, error }, { status: 400 });

    const cambios: CambiosLinea = {};
    if (body.descripcion !== undefined) cambios.descripcion = propuesta.descripcion;
    if (body.cantidad !== undefined) cambios.cantidad = propuesta.cantidad;
    if (body.precioUnitario !== undefined) cambios.precioUnitario = propuesta.precioUnitario;
    if (body.itemId !== undefined) { cambios.itemId = body.itemId || null; cambios.notaCarga = ""; }
    return NextResponse.json({ success: true, data: await actualizarLinea(lineaId, cambios) });
  } catch (e) {
    console.error("[presupuesto PATCH]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "No se pudo actualizar la línea" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  const { id, lineaId } = await params;

  const linea = await lineaDeLaOrden(id, lineaId);
  if (!linea) return NextResponse.json({ success: false, error: "Línea no encontrada en esta orden" }, { status: 404 });
  if (!esEditable(linea)) {
    return NextResponse.json({ success: false, error: "Solo se borra una línea Propuesta. Una línea aprobada queda como constancia." }, { status: 409 });
  }
  try {
    await borrarLinea(lineaId);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[presupuesto DELETE]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "No se pudo borrar la línea" }, { status: 500 });
  }
}
