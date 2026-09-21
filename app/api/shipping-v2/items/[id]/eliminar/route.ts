import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { EliminacionBloqueadaError, eliminarShippingItem, evaluarEliminacionShippingItem } from "@/lib/shipping-v2/airtable";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Eliminar un Shipping Item — SOLO Administrador (se valida aquí, en el
// servidor; ocultar el botón en pantalla no es la protección).
//   GET  → vista previa: qué lo bloquea y qué se pierde. No escribe nada.
//   POST → { confirmacion: <SKU escrito>, motivo } → evento de auditoría + borrado.

export async function GET(_request: Request, { params }: Params) {
  const { response } = await requireAdminSession();
  if (response) return response;
  const { id } = await params;
  try {
    return NextResponse.json({ success: true, data: await evaluarEliminacionShippingItem(id) });
  } catch (e) {
    console.error("[shipping-v2 eliminar item · evaluar]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "No se pudo revisar el item" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireAdminSession();
  if (response) return response;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { confirmacion?: unknown; motivo?: unknown };
  try {
    const data = await eliminarShippingItem(id, {
      confirmacion: body.confirmacion,
      motivo: typeof body.motivo === "string" ? body.motivo : "",
      registradoPor: session.user.nombre || session.user.email || "Administrador",
    });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    if (e instanceof EliminacionBloqueadaError) {
      return NextResponse.json({ success: false, error: e.message, data: e.evaluacion }, { status: 409 });
    }
    console.error("[shipping-v2 eliminar item]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "No se pudo eliminar el item" }, { status: 400 });
  }
}
