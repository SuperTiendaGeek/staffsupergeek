import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { leerLinea, actualizarLinea, borrarLinea, cargarInfoPedidos, listarLineas, type CambiosLinea } from "@/lib/tecnicos/presupuesto/airtable";
import { actualizarEstadoOperacion, actualizarOpcion, eliminarOperacionConOpciones } from "@/lib/operaciones/airtable";
import { revertirLinea } from "@/lib/tecnicos/presupuesto/cargar";
import { esEditable, aceptaVincularArticulo, validarLinea, normalizarPrioridad, nuevoGrupoAlternativas, NOTA_CLIENTE_MAX } from "@/lib/tecnicos/presupuesto/reglas";

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
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  const { id, lineaId } = await params;

  const linea = await lineaDeLaOrden(id, lineaId);
  if (!linea) return NextResponse.json({ success: false, error: "Línea no encontrada en esta orden" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as {
    accion?: "rechazar" | "reabrir" | "reactivar" | "cancelar" | "recotizar" | "liberar" | "detalle";
    prioridad?: string; notaCliente?: string; alternativaDe?: string | null; quitarAlternativa?: boolean;
    motivo?: string;
    descripcion?: string; cantidad?: number; precioUnitario?: number; itemId?: string | null;
  };

  try {
    // Repuesto bajo pedido: la operación comercial acompaña a la línea, para
    // que el tablero de Operaciones nunca muestre algo que la orden ya
    // descartó (o al revés).
    // Prioridad, nota para el cliente y grupo de alternativas (solo Propuesta:
    // lo que el cliente ya aprobó no cambia de condiciones por debajo).
    if (body.accion === "detalle") {
      if (!esEditable(linea)) return NextResponse.json({ success: false, error: "Solo se ajusta una línea Propuesta." }, { status: 409 });
      const nota = typeof body.notaCliente === "string" ? body.notaCliente : undefined;
      if (nota !== undefined && nota.length > NOTA_CLIENTE_MAX) return NextResponse.json({ success: false, error: `La nota admite hasta ${NOTA_CLIENTE_MAX} caracteres.` }, { status: 400 });
      const cambios: CambiosLinea = {};
      if (nota !== undefined) cambios.notaCliente = nota;
      const todas = await listarLineas(id);
      let grupo = linea.grupoAlternativas ?? "";
      if (body.quitarAlternativa) { cambios.grupoAlternativas = ""; grupo = ""; }
      else if (body.alternativaDe) {
        const base = todas.find((l) => l.id === body.alternativaDe);
        if (!base || base.id === linea.id || base.estado !== "Propuesta") return NextResponse.json({ success: false, error: "Solo se agrupa con otra línea Propuesta de esta orden." }, { status: 409 });
        grupo = base.grupoAlternativas || nuevoGrupoAlternativas();
        if (!base.grupoAlternativas) await actualizarLinea(base.id, { grupoAlternativas: grupo });
        cambios.grupoAlternativas = grupo;
        if (body.prioridad === undefined) cambios.prioridad = normalizarPrioridad(base.prioridad);
      }
      if (body.prioridad !== undefined) cambios.prioridad = normalizarPrioridad(body.prioridad);
      const actualizada = await actualizarLinea(lineaId, cambios);
      // Todas las alternativas de un grupo comparten la prioridad.
      if (grupo && cambios.prioridad) {
        for (const h of todas.filter((l) => l.id !== lineaId && l.grupoAlternativas === grupo && l.estado === "Propuesta" && l.prioridad !== cambios.prioridad)) {
          await actualizarLinea(h.id, { prioridad: cambios.prioridad });
        }
      }
      return NextResponse.json({ success: true, data: actualizada });
    }
    if (body.accion === "rechazar") {
      if (!esEditable(linea)) return NextResponse.json({ success: false, error: "Solo se rechaza una línea Propuesta." }, { status: 409 });
      if (linea.operacionId) await actualizarEstadoOperacion(linea.operacionId, "Rechazado");
      return NextResponse.json({ success: true, data: await actualizarLinea(lineaId, { estado: "Rechazada" }) });
    }
    if (body.accion === "reabrir") {
      if (linea.estado !== "Rechazada") return NextResponse.json({ success: false, error: "Solo se reabre una línea Rechazada." }, { status: 409 });
      // Una línea que llegó a aprobarse y después se canceló/recotizó ya tiene
      // su operación CERRADA (y quizá un artículo cancelado): reabrirla es una
      // propuesta nueva, sin esa operación — si el cliente vuelve a aprobar,
      // nace una operación nueva. Solo una cotización del flujo anterior
      // (operación creada en Cotizado, nunca aprobada) se reactiva tal cual.
      if (linea.operacionId && linea.aprobadoPor) {
        return NextResponse.json({ success: true, data: await actualizarLinea(lineaId, { estado: "Propuesta", operacionId: null, itemId: null, notaCarga: "" }) });
      }
      if (linea.operacionId) await actualizarEstadoOperacion(linea.operacionId, "Cotizado");
      return NextResponse.json({ success: true, data: await actualizarLinea(lineaId, { estado: "Propuesta" }) });
    }
    // Reversas de algo ya aprobado (el cliente desiste, el proveedor no lo
    // tiene, llegó y ya no lo quieren). Las reglas de qué se permite y por
    // qué no viven en reversasDisponibles(); revertirLinea() las verifica.
    if (body.accion === "cancelar" || body.accion === "recotizar" || body.accion === "liberar") {
      try {
        await revertirLinea({
          ordenId: id, lineaId, accion: body.accion, motivo: String(body.motivo ?? ""),
          usuario: { nombre: session?.user.nombre || session?.user.email || "Portal" },
        });
      } catch (e) {
        return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "No se pudo revertir" }, { status: 409 });
      }
      return NextResponse.json({ success: true, data: await leerLinea(lineaId) });
    }
    if (body.accion === "reactivar") {
      // Cotización rechazada en Operaciones o auto-rechazada por el cron de
      // 15 días sin gestión: vuelve al estado que corresponde a la línea.
      if (!linea.operacionId) return NextResponse.json({ success: false, error: "Solo un repuesto bajo pedido se reactiva." }, { status: 409 });
      const info = (await cargarInfoPedidos([linea.operacionId])).get(linea.operacionId);
      if (!info || info.estadoOperacion !== "Rechazado") return NextResponse.json({ success: false, error: "La operación no está rechazada." }, { status: 409 });
      if (linea.estado !== "Propuesta" && linea.estado !== "Aprobada") return NextResponse.json({ success: false, error: "Esta línea ya no se puede reactivar." }, { status: 409 });
      await actualizarEstadoOperacion(linea.operacionId, linea.estado === "Aprobada" ? "Aprobado" : "Cotizado");
      return NextResponse.json({ success: true, data: await actualizarLinea(lineaId, { notaCarga: linea.estado === "Aprobada" ? "Esperando pedido al proveedor." : "" }) });
    }

    const soloArticulo = body.itemId !== undefined && body.descripcion === undefined && body.cantidad === undefined && body.precioUnitario === undefined;
    if (soloArticulo) {
      if (linea.operacionId) return NextResponse.json({ success: false, error: "Un repuesto bajo pedido recibe su artículo solo, cuando se le pide al proveedor." }, { status: 409 });
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
    // La opción elegida de la operación es la fuente del precio del artículo
    // que nacerá al pedirlo: se mantiene igual a la línea.
    if (linea.operacionId && (cambios.descripcion !== undefined || cambios.precioUnitario !== undefined)) {
      const info = (await cargarInfoPedidos([linea.operacionId])).get(linea.operacionId);
      if (info?.opcionElegidaId) {
        await actualizarOpcion(info.opcionElegidaId, {
          ...(cambios.descripcion !== undefined ? { productoDescripcion: cambios.descripcion } : {}),
          ...(cambios.precioUnitario !== undefined ? { precioVentaCliente: cambios.precioUnitario } : {}),
        });
      }
    }
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
    // Borrar un repuesto bajo pedido borra su cotización. Si la operación ya
    // tiene abonos, eliminarOperacionConOpciones se niega (ese dinero tiene
    // que quedar registrado) y la línea tampoco se borra: se rechaza.
    if (linea.operacionId) {
      try { await eliminarOperacionConOpciones(linea.operacionId); }
      catch (e) {
        return NextResponse.json({ success: false, error: `${e instanceof Error ? e.message : "No se pudo borrar la cotización."} Usa "Rechazar" en su lugar.` }, { status: 409 });
      }
    }
    await borrarLinea(lineaId);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[presupuesto DELETE]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "No se pudo borrar la línea" }, { status: 500 });
  }
}
