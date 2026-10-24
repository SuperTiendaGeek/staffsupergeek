import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { respuestaErrorProveedor } from "@/lib/admin/proveedores-respuesta";
import { cambiarLogoProveedorAdmin, quitarLogoProveedorAdmin } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Cambia el logo (factura del packing). FormData con "logo". */
export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireAdminSession();
  if (response) return response;
  const { id } = await params;
  try {
    const form = await request.formData();
    const archivo = form.get("logo");
    if (!(archivo instanceof File)) throw new Error("Elige una imagen.");
    const bytes = await archivo.arrayBuffer();
    const data = await cambiarLogoProveedorAdmin(
      id,
      {
        filename: archivo.name || `logo-${Date.now()}.png`,
        contentType: archivo.type,
        size: bytes.byteLength,
        fileBase64: Buffer.from(bytes).toString("base64"),
      },
      { registradoPor: getShippingV2SessionName(session) }
    );
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return respuestaErrorProveedor(error, "logo");
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { response, session } = await requireAdminSession();
  if (response) return response;
  const { id } = await params;
  try {
    const data = await quitarLogoProveedorAdmin(id, { registradoPor: getShippingV2SessionName(session) });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return respuestaErrorProveedor(error, "quitar logo");
  }
}
