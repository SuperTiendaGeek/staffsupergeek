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

export const dynamic = "force-dynamic";

const MAX_FOTOS_PER_ITEM = 10;
const MAX_FOTO_SIZE = 10 * 1024 * 1024;
const ALLOWED_FOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type Params = {
  params: Promise<{ id: string }>;
};

async function parseFotos(formData: FormData): Promise<ShippingV2AttachmentUpload[]> {
  const files = formData.getAll("fotos").filter((value): value is File => value instanceof File && value.size > 0);
  if (!files.length) {
    throw new Error("Selecciona al menos una foto.");
  }
  if (files.length > MAX_FOTOS_PER_ITEM) {
    throw new Error(`Puedes subir hasta ${MAX_FOTOS_PER_ITEM} fotos por item.`);
  }

  const fotos: ShippingV2AttachmentUpload[] = [];
  for (const file of files) {
    if (!ALLOWED_FOTO_TYPES.has(file.type)) {
      throw new Error("Las fotos deben ser JPEG, PNG o WebP.");
    }
    if (file.size > MAX_FOTO_SIZE) {
      throw new Error("Cada foto debe pesar máximo 10 MB.");
    }

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
    const fotos = await parseFotos(formData);
    if (current.fotos.length + fotos.length > MAX_FOTOS_PER_ITEM) {
      return NextResponse.json(
        { success: false, error: `El Item puede tener máximo ${MAX_FOTOS_PER_ITEM} fotos.` },
        { status: 400 }
      );
    }

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
