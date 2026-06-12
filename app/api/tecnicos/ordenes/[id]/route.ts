import { NextResponse } from "next/server";
import { fetchOrdenById, updateOrdenCampos } from "@/lib/tecnicos/airtable";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  const { id: recordId } = await params;

  if (!recordId) {
    return NextResponse.json(
      { success: false, error: "Falta el id de la orden" },
      { status: 400 }
    );
  }

  try {
    const orden = await fetchOrdenById(recordId);
    if (!orden) {
      return NextResponse.json(
        { success: false, error: "Orden no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: orden });
  } catch (error) {
    console.error("Error al obtener la orden desde Airtable:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { id: recordId } = await params;

  if (!recordId) {
    return NextResponse.json({ success: false, error: "Falta el id de la orden" }, { status: 400 });
  }

  let body: { equipo?: string; accesorios?: string; telefono?: string; ingresaPor?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "JSON inválido" }, { status: 400 });
  }

  const campos: Partial<{ equipo: string; accesorios: string; telefono: string; ingresaPor: string }> = {};
  if (typeof body.equipo === "string") campos.equipo = body.equipo.trim();
  if (typeof body.accesorios === "string") campos.accesorios = body.accesorios.trim();
  if (typeof body.telefono === "string") campos.telefono = body.telefono.trim();
  if (typeof body.ingresaPor === "string") campos.ingresaPor = body.ingresaPor.trim();

  if (Object.keys(campos).length === 0) {
    return NextResponse.json({ success: false, error: "No hay campos para actualizar" }, { status: 400 });
  }

  try {
    await updateOrdenCampos({ ordenRecordId: recordId, campos });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error al actualizar campos de la orden:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
