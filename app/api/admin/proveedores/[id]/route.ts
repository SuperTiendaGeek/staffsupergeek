import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { respuestaErrorProveedor } from "@/lib/admin/proveedores-respuesta";
import { actualizarProveedorAdmin, eliminarProveedorAdmin } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { response, session } = await requireAdminSession();
  if (response) return response;
  const { id } = await params;
  try {
    const body = (await request.json().catch(() => null)) as { datos?: unknown; olvidarColumnas?: unknown } | null;
    const data = await actualizarProveedorAdmin(id, body?.datos, {
      registradoPor: getShippingV2SessionName(session),
      olvidarColumnas: body?.olvidarColumnas === true,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return respuestaErrorProveedor(error, "actualizar");
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { response, session } = await requireAdminSession();
  if (response) return response;
  const { id } = await params;
  try {
    const data = await eliminarProveedorAdmin(id, { registradoPor: getShippingV2SessionName(session) });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return respuestaErrorProveedor(error, "eliminar");
  }
}
