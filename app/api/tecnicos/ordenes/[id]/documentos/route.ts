import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import {
  addDocumentosToOrdenById,
  deleteDocumentoFromOrdenById,
} from "@/lib/tecnicos/airtable";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 5;

const resolveAttachmentIdFromDeleteRequest = async (request: Request) => {
  const fromQuery = new URL(request.url).searchParams.get("attachmentId")?.trim();
  if (fromQuery) return fromQuery;

  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  if (contentType.includes("application/json")) {
    try {
      const body = (await request.json()) as { attachmentId?: unknown } | null;
      if (typeof body?.attachmentId === "string" && body.attachmentId.trim()) {
        return body.attachmentId.trim();
      }
    } catch {
      return null;
    }
  }

  return null;
};

export async function POST(request: Request, { params }: Params) {
  const { response } = await requireTecnicosSession();
  if (response) return response;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, error: "Falta el id de la orden" }, { status: 400 });
  }

  const formData = await request.formData();
  const files = formData
    .getAll("documentos")
    .filter((item): item is File => item instanceof File && item.size > 0);

  if (!files.length) {
    const fallbackFile = formData.get("documento");
    if (fallbackFile instanceof File && fallbackFile.size > 0) {
      files.push(fallbackFile);
    }
  }

  if (!files.length) {
    return NextResponse.json(
      { success: false, error: "Debes seleccionar al menos un archivo." },
      { status: 400 }
    );
  }

  if (files.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json(
      { success: false, error: `Puedes subir hasta ${MAX_FILES_PER_REQUEST} archivos por vez.` },
      { status: 400 }
    );
  }

  const documentos: Array<{ filename: string; contentType: string; fileBase64: string }> = [];

  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: `El archivo ${file.name || "seleccionado"} excede 10MB.` },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    documentos.push({
      filename: file.name || `documento-${Date.now()}`,
      contentType: file.type || "application/octet-stream",
      fileBase64: Buffer.from(bytes).toString("base64"),
    });
  }

  try {
    const result = await addDocumentosToOrdenById({
      ordenRecordId: id,
      documentos,
    });

    return NextResponse.json(
      { success: true, data: result.orden, warning: result.warning ?? null },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error al agregar documentos a la orden", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { response } = await requireTecnicosSession();
  if (response) return response;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, error: "Falta el id de la orden" }, { status: 400 });
  }

  const attachmentId = await resolveAttachmentIdFromDeleteRequest(request);
  if (!attachmentId) {
    return NextResponse.json({ success: false, error: "Falta id del documento" }, { status: 400 });
  }

  try {
    const result = await deleteDocumentoFromOrdenById({
      ordenRecordId: id,
      attachmentId,
    });
    return NextResponse.json({ success: true, data: result.orden });
  } catch (error) {
    console.error("Error al eliminar documento de la orden", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
