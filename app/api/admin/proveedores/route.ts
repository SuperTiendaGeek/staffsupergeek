import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { respuestaErrorProveedor } from "@/lib/admin/proveedores-respuesta";
import { crearProveedorAdmin, getProveedoresAdmin } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

// Administrar › Proveedores (auditoría Shipping V2, punto 11). Solo Administrador.

export async function GET() {
  const { response } = await requireAdminSession();
  if (response) return response;
  try {
    return NextResponse.json({ success: true, data: await getProveedoresAdmin() });
  } catch (error) {
    return respuestaErrorProveedor(error, "listar");
  }
}

export async function POST(request: Request) {
  const { response, session } = await requireAdminSession();
  if (response) return response;
  try {
    const body = (await request.json().catch(() => null)) as { datos?: unknown } | null;
    const data = await crearProveedorAdmin(body?.datos, { registradoPor: getShippingV2SessionName(session) });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return respuestaErrorProveedor(error, "crear");
  }
}
