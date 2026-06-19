import { NextResponse } from "next/server";
import { fetchOrdenById, updateOrdenCampos } from "@/lib/tecnicos/airtable";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { createCotizacion, fetchCotizacionPorOrdenId, deleteCotizacionIfSafe } from "@/lib/cotizaciones/airtable";
import { getSessionDisplayName } from "@/lib/cotizaciones/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const { response, session } = await requireTecnicosSession();
  if (response) return response;

  if (!id) {
    return NextResponse.json({ success: false, error: "Falta el ID de la orden." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const productoSolicitado = String(body?.productoSolicitado ?? "").trim();
  const descripcionRequerimiento =
    typeof body?.descripcionRequerimiento === "string" ? body.descripcionRequerimiento.trim() : null;

  if (!productoSolicitado) {
    return NextResponse.json(
      { success: false, error: "El producto o equipo solicitado es obligatorio." },
      { status: 400 }
    );
  }

  try {
    const orden = await fetchOrdenById(id);
    if (!orden) {
      return NextResponse.json({ success: false, error: "Orden no encontrada." }, { status: 404 });
    }

    if (orden.cotizacionId) {
      return NextResponse.json(
        {
          success: false,
          error: "Esta orden ya tiene una cotización vinculada.",
          data: { cotizacionId: orden.cotizacionId, cotizacionCodigo: orden.cotizacionCodigo },
        },
        { status: 409 }
      );
    }

    if (!orden.clienteRecordId) {
      return NextResponse.json(
        { success: false, error: "La orden no tiene un cliente vinculado. Asigna un cliente antes de crear la cotización." },
        { status: 422 }
      );
    }

    const cotizacion = await createCotizacion({
      cliente: {
        recordId: orden.clienteRecordId,
        nombre: orden.clienteNombre,
        telefono: orden.telefono !== "-" ? orden.telefono : "",
        email: "",
        cedula: orden.cedula !== "-" ? orden.cedula : "",
      },
      productoSolicitado,
      descripcionRequerimiento: descripcionRequerimiento || null,
      registradoPor: getSessionDisplayName(session),
      ordenReparacionId: orden.recordId,
      ordenReparacionCodigo: orden.idVisible,
    });

    // Vincular la orden con la cotización creada. Si falla no revertimos la cotización
    // sino que el usuario puede reparar el vínculo con el endpoint de reparación.
    try {
      await updateOrdenCampos({
        ordenRecordId: id,
        campos: {
          cotizacionId: cotizacion.id,
          cotizacionCodigo: cotizacion.codigo,
        },
      });
    } catch (linkError) {
      console.error("Cotización creada pero falló el vínculo con la orden:", linkError);
      return NextResponse.json(
        {
          success: true,
          partial: true,
          warning: "La cotización fue creada pero no se pudo vincular a la orden automáticamente. Usa 'Reparar vínculo' para completarlo.",
          data: { cotizacionId: cotizacion.id, cotizacionCodigo: cotizacion.codigo },
        },
        { status: 207 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: { cotizacionId: cotizacion.id, cotizacionCodigo: cotizacion.codigo },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error al crear cotización desde orden:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

export async function GET(_: Request, { params }: Params) {
  const { id } = await params;
  const { response } = await requireTecnicosSession();
  if (response) return response;

  if (!id) {
    return NextResponse.json({ success: false, error: "Falta el ID de la orden." }, { status: 400 });
  }

  try {
    const orden = await fetchOrdenById(id);
    if (!orden) {
      return NextResponse.json({ success: false, error: "Orden no encontrada." }, { status: 404 });
    }

    if (!orden.cotizacionId) {
      const cotizacionHuerfana = await fetchCotizacionPorOrdenId(id);
      if (cotizacionHuerfana) {
        // Reparar vínculo automáticamente si encontramos la cotización por búsqueda
        await updateOrdenCampos({
          ordenRecordId: id,
          campos: {
            cotizacionId: cotizacionHuerfana.id,
            cotizacionCodigo: cotizacionHuerfana.codigo,
          },
        });
        return NextResponse.json({
          success: true,
          repaired: true,
          data: { cotizacionId: cotizacionHuerfana.id, cotizacionCodigo: cotizacionHuerfana.codigo },
        });
      }
      return NextResponse.json({ success: true, data: null });
    }

    return NextResponse.json({
      success: true,
      data: { cotizacionId: orden.cotizacionId, cotizacionCodigo: orden.cotizacionCodigo },
    });
  } catch (error) {
    console.error("Error al verificar cotización de orden:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

export async function DELETE(_: Request, { params }: Params) {
  const { id } = await params;
  const { response } = await requireTecnicosSession();
  if (response) return response;

  if (!id) {
    return NextResponse.json({ success: false, error: "Falta el ID de la orden." }, { status: 400 });
  }

  try {
    const orden = await fetchOrdenById(id);
    if (!orden) {
      return NextResponse.json({ success: false, error: "Orden no encontrada." }, { status: 404 });
    }

    if (!orden.cotizacionId) {
      return NextResponse.json({ success: false, error: "Esta orden no tiene cotización vinculada." }, { status: 404 });
    }

    const cotizacionId = orden.cotizacionId;

    const result = await deleteCotizacionIfSafe(cotizacionId);

    // Siempre limpiar el vínculo en la orden (tanto en delete físico como en anulación)
    try {
      await updateOrdenCampos({
        ordenRecordId: id,
        campos: { cotizacionId: "", cotizacionCodigo: "" },
      });
    } catch (unlinkError) {
      console.error("Cotización procesada pero falló la limpieza del vínculo en la orden:", unlinkError);
      return NextResponse.json(
        {
          success: true,
          partial: true,
          warning: "La cotización fue procesada pero no se pudo limpiar el vínculo en la orden. Recarga la página.",
          data: result,
        },
        { status: 207 }
      );
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado.";
    const status = message.includes("no encontrada") ? 404 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
