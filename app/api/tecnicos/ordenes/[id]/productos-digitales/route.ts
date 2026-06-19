import { NextResponse } from "next/server";
import {
  asignarProductoDigitalAOrden,
  desasignarProductoDigitalDeOrden,
} from "@/lib/tecnicos/airtable";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// POST /api/tecnicos/ordenes/[id]/productos-digitales
// Body: { productoId, precioVenta? }
export async function POST(request: Request, { params }: Params) {
  const { id: ordenRecordId } = await params;
  const { response, session } = await requireTecnicosSession();
  if (response) return response;

  if (!ordenRecordId) {
    return NextResponse.json({ success: false, error: "Falta el ID de la orden" }, { status: 400 });
  }

  let body: { productoId?: string; precioVenta?: number | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "JSON inválido" }, { status: 400 });
  }

  const productoId = body.productoId?.trim();
  if (!productoId) {
    return NextResponse.json({ success: false, error: "Falta el ID del producto digital" }, { status: 400 });
  }

  try {
    const producto = await asignarProductoDigitalAOrden({
      productoId,
      ordenRecordId,
      precioVenta: body.precioVenta ?? null,
      usadoPorNombre: session.user.nombre ?? null,
      usadoPorId: session.user.userId ?? null,
    });

    return NextResponse.json({ success: true, data: producto }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    const status = message.includes("no encontrado") ? 404
      : message.includes("ya está vinculado") ? 409
      : message.includes("estado") ? 422
      : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

// DELETE /api/tecnicos/ordenes/[id]/productos-digitales
// Body: { productoId }
export async function DELETE(request: Request, { params }: Params) {
  const { id: ordenRecordId } = await params;
  const { response } = await requireTecnicosSession();
  if (response) return response;

  if (!ordenRecordId) {
    return NextResponse.json({ success: false, error: "Falta el ID de la orden" }, { status: 400 });
  }

  let body: { productoId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "JSON inválido" }, { status: 400 });
  }

  const productoId = body.productoId?.trim();
  if (!productoId) {
    return NextResponse.json({ success: false, error: "Falta el ID del producto digital" }, { status: 400 });
  }

  try {
    const producto = await desasignarProductoDigitalDeOrden({ productoId, ordenRecordId });
    return NextResponse.json({ success: true, data: producto });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    const status = message.includes("no encontrado") ? 404 : message.includes("no está vinculado") ? 409 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
