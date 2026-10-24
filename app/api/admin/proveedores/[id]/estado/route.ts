import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { respuestaErrorProveedor } from "@/lib/admin/proveedores-respuesta";
import { cambiarEstadoProveedorAdmin } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Desactivar o reactivar. Body: { activo: boolean }. */
export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireAdminSession();
  if (response) return response;
  const { id } = await params;
  try {
    const body = (await request.json().catch(() => null)) as { activo?: unknown } | null;
    if (typeof body?.activo !== "boolean") throw new Error("Falta indicar si queda activo.");
    const data = await cambiarEstadoProveedorAdmin(id, body.activo, { registradoPor: getShippingV2SessionName(session) });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return respuestaErrorProveedor(error, "estado");
  }
}
