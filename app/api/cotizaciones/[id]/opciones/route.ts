import { NextResponse } from "next/server";
import { addFotosToOpcionCotizacion, createOpcionCotizacion } from "@/lib/cotizaciones/airtable";
import { requireCotizacionesSession } from "@/lib/cotizaciones/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 5;

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request, { params }: Params) {
  const { response } = await requireCotizacionesSession();
  if (response) return response;

  const { id } = await params;
  const contentType = request.headers.get("content-type") || "";
  let body: Record<string, unknown> = {};
  let fotoFiles: File[] = [];

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    body = {
      productoDescripcion: formValue(formData, "productoDescripcion") || formValue(formData, "nombre"),
      proveedorId: formValue(formData, "proveedorId"),
      urlProveedor: formValue(formData, "urlProveedor"),
      tiempoEstimado: formValue(formData, "tiempoEstimado"),
      costoProveedor: formValue(formData, "costoProveedor"),
      precioVentaCliente: formValue(formData, "precioVentaCliente"),
      notaInterna: formValue(formData, "notaInterna"),
      notaParaCliente: formValue(formData, "notaParaCliente"),
    };
    fotoFiles = formData.getAll("fotos").filter((value): value is File => value instanceof File);
  } else {
    body = await request.json().catch(() => ({}));
  }

  const productoDescripcion = String(body?.productoDescripcion ?? body?.nombre ?? "").trim();
  const proveedorId = String(body?.proveedorId ?? "").trim();

  if (!productoDescripcion) {
    return NextResponse.json(
      { success: false, error: "El producto o descripción de la opción es obligatorio." },
      { status: 400 }
    );
  }

  if (!proveedorId) {
    return NextResponse.json(
      { success: false, error: "Selecciona el proveedor de la opción." },
      { status: 400 }
    );
  }

  if (fotoFiles.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json(
      { success: false, error: `Puedes subir hasta ${MAX_FILES_PER_REQUEST} fotos por vez.` },
      { status: 400 }
    );
  }

  const fotos: Array<{ filename: string; contentType: string; fileBase64: string }> = [];

  for (const file of fotoFiles) {
    if (!file.size) continue;
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { success: false, error: "Solo se pueden adjuntar imágenes en Fotos." },
        { status: 400 }
      );
    }
    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: `La foto ${file.name || "seleccionada"} excede 10MB.` },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    fotos.push({
      filename: file.name || `foto-${Date.now()}`,
      contentType: file.type || "application/octet-stream",
      fileBase64: Buffer.from(bytes).toString("base64"),
    });
  }

  try {
    const created = await createOpcionCotizacion({
      cotizacionId: id,
      productoDescripcion,
      proveedorId,
      urlProveedor: typeof body?.urlProveedor === "string" ? body.urlProveedor : null,
      tiempoEstimado: typeof body?.tiempoEstimado === "string" ? body.tiempoEstimado : null,
      costoProveedor: toNumber(body?.costoProveedor),
      precioVentaCliente: toNumber(body?.precioVentaCliente),
      notaInterna: typeof body?.notaInterna === "string" ? body.notaInterna : null,
      notaParaCliente: typeof body?.notaParaCliente === "string" ? body.notaParaCliente : null,
    });
    const result = await addFotosToOpcionCotizacion(created.id, fotos);
    return NextResponse.json(
      { success: true, data: result.opcion, warning: result.warning ?? null },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error al crear opción de cotización:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 500 }
    );
  }
}
