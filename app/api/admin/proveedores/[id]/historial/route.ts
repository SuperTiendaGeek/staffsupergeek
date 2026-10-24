import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { respuestaErrorProveedor } from "@/lib/admin/proveedores-respuesta";
import { getHistorialProveedorAdmin } from "@/lib/shipping-v2/airtable";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { response } = await requireAdminSession();
  if (response) return response;
  const { id } = await params;
  try {
    return NextResponse.json({ success: true, data: await getHistorialProveedorAdmin(id) });
  } catch (error) {
    return respuestaErrorProveedor(error, "historial");
  }
}
