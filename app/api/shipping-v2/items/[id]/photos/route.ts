import { NextResponse } from "next/server";
import {
  addFotosToShippingV2Item,
  canShippingV2,
  getShippingV2AccessContextForSession,
  getShippingV2ItemById,
  removeFotoFromShippingV2Item,
  type ShippingV2AttachmentUpload,
} from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";
import { validarFotosItem } from "@/lib/shipping-v2/fotos-item";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ id: string }>;
};

/**
 * Valida con las MISMAS reglas que el navegador (`lib/shipping-v2/fotos-item`).
 *
 * El endpoint es alcanzable por cualquiera con sesión, así que esta validación
 * es la que de verdad manda: sin ella se podría mandar una foto de 10 MB que
 * Airtable rechaza en silencio, que es exactamente lo que pasaba antes.
 */
async function parseFotos(formData: FormData, yaSubidas: number): Promise<ShippingV2AttachmentUpload[]> {
  const files = formData.getAll("fotos").filter((value): value is File => value instanceof File);

  const validacion = validarFotosItem(
    files.map((file) => ({ name: file.name, type: file.type, size: file.size })),
    { yaSubidas }
  );
  if (!validacion.ok) throw new Error(validacion.motivo);

  const fotos: ShippingV2AttachmentUpload[] = [];
  for (const file of files) {
    const bytes = await file.arrayBuffer();
    if (bytes.byteLength === 0) {
      throw new Error("Una de las fotos seleccionadas está vacía.");
    }

    fotos.push({
      filename: file.name || `shipping-v2-foto-${Date.now()}`,
      contentType: file.type,
      fileBase64: Buffer.from(bytes).toString("base64"),
    });
  }

  return fotos;
}

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;

  const { id } = await params;

  try {
    const access = await getShippingV2AccessContextForSession(session);
    if (!canShippingV2(access, "canEditItems")) {
      return NextResponse.json({ success: false, error: "No tienes permiso para modificar fotos de items." }, { status: 403 });
    }
    const current = await getShippingV2ItemById(id, { access });
    const formData = await request.formData();
    // El cupo se mide contra las fotos que YA tiene el item, no contra lo que
    // diga el navegador: dos pestañas abiertas podrían pasarse del máximo.
    const fotos = await parseFotos(formData, current.fotos.length);

    const result = await addFotosToShippingV2Item(id, fotos, {
      registradoPor: getShippingV2SessionName(session),
    });
    return NextResponse.json({
      success: true,
      data: result.item,
      warning: result.warning,
      uploadedFotos: result.uploadedCount,
    });
  } catch (error) {
    console.error("Error al agregar fotos al Item Shipping V2:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  try {
    const access = await getShippingV2AccessContextForSession(session);
    if (!canShippingV2(access, "canEditItems")) {
      return NextResponse.json({ success: false, error: "No tienes permiso para modificar fotos de items." }, { status: 403 });
    }
    const item = await removeFotoFromShippingV2Item(
      id,
      {
        attachmentId: typeof body.attachmentId === "string" ? body.attachmentId : null,
        url: typeof body.url === "string" ? body.url : null,
        filename: typeof body.filename === "string" ? body.filename : null,
      },
      { actualizadoPor: getShippingV2SessionName(session) }
    );

    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("Error al eliminar foto del Item Shipping V2:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 400 }
    );
  }
}
