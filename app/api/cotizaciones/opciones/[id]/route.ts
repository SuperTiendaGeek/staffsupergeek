import { NextResponse } from "next/server";
import {
  addFotosToOpcionCotizacion,
  deleteOpcionCotizacion,
  replaceFotosOpcionCotizacion,
  updateOpcionCotizacion,
} from "@/lib/cotizaciones/airtable";
import { requireCotizacionesSession } from "@/lib/cotizaciones/auth";
import type { AirtableAttachment } from "@/types/cotizaciones";

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

function parseFotosExistentes(value: unknown): AirtableAttachment[] | null {
  if (typeof value !== "string") return null;
  if (!value.trim()) return [];
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : null,
      url: typeof item.url === "string" ? item.url : "",
      filename: typeof item.filename === "string" ? item.filename : null,
    }))
    .filter((foto) => foto.url || foto.id);
}

async function parseFotos(formData: FormData) {
  const fotoFiles = formData.getAll("fotos").filter((value): value is File => value instanceof File);
  if (fotoFiles.length > MAX_FILES_PER_REQUEST) {
    throw new Error(`Puedes subir hasta ${MAX_FILES_PER_REQUEST} fotos por vez.`);
  }

  const fotos: Array<{ filename: string; contentType: string; fileBase64: string }> = [];
  for (const file of fotoFiles) {
    if (!file.size) continue;
    if (!file.type.startsWith("image/")) {
      throw new Error("Solo se permiten imágenes.");
    }
    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new Error("Una de las imágenes supera el límite de 10 MB.");
    }
    const bytes = await file.arrayBuffer();
    fotos.push({
      filename: file.name || `foto-${Date.now()}`,
      contentType: file.type || "application/octet-stream",
      fileBase64: Buffer.from(bytes).toString("base64"),
    });
  }
  return fotos;
}

export async function PATCH(request: Request, { params }: Params) {
  const { response } = await requireCotizacionesSession();
  if (response) return response;

  const { id } = await params;
  const contentType = request.headers.get("content-type") || "";
  let body: Record<string, unknown> = {};
  let fotos: Array<{ filename: string; contentType: string; fileBase64: string }> = [];
  let fotosExistentes: AirtableAttachment[] | null = null;

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      body = {
        productoDescripcion: formValue(formData, "productoDescripcion"),
        proveedorId: formValue(formData, "proveedorId"),
        urlProveedor: formValue(formData, "urlProveedor"),
        tiempoEstimado: formValue(formData, "tiempoEstimado"),
        costoProveedor: formValue(formData, "costoProveedor"),
        precioVentaCliente: formValue(formData, "precioVentaCliente"),
        estado: formValue(formData, "estado"),
        notaInterna: formValue(formData, "notaInterna"),
        notaParaCliente: formValue(formData, "notaParaCliente"),
      };
      fotosExistentes = parseFotosExistentes(formValue(formData, "fotosExistentesJson"));
      fotos = await parseFotos(formData);
    } else {
      body = await request.json().catch(() => ({}));
    }

    if (typeof body?.productoDescripcion === "string" && !body.productoDescripcion.trim()) {
      return NextResponse.json(
        { success: false, error: "El producto o descripción de la opción es obligatorio." },
        { status: 400 }
      );
    }
    if (typeof body?.proveedorId === "string" && !body.proveedorId.trim()) {
      return NextResponse.json(
        { success: false, error: "Selecciona el proveedor de la opción." },
        { status: 400 }
      );
    }

    const updated = await updateOpcionCotizacion(id, {
      productoDescripcion:
        typeof body?.productoDescripcion === "string" ? body.productoDescripcion : undefined,
      proveedorId: typeof body?.proveedorId === "string" ? body.proveedorId : undefined,
      urlProveedor: typeof body?.urlProveedor === "string" ? body.urlProveedor : undefined,
      tiempoEstimado: typeof body?.tiempoEstimado === "string" ? body.tiempoEstimado : undefined,
      costoProveedor: toNumber(body?.costoProveedor),
      precioVentaCliente: toNumber(body?.precioVentaCliente),
      estado: typeof body?.estado === "string" ? body.estado : undefined,
      notaInterna: typeof body?.notaInterna === "string" ? body.notaInterna : undefined,
      notaParaCliente: typeof body?.notaParaCliente === "string" ? body.notaParaCliente : undefined,
    });
    const result =
      fotosExistentes !== null
        ? { opcion: await replaceFotosOpcionCotizacion(updated.id, fotosExistentes, fotos) }
        : fotos.length > 0
          ? await addFotosToOpcionCotizacion(updated.id, fotos)
          : { opcion: updated };
    return NextResponse.json({ success: true, data: result.opcion, warning: result.warning ?? null });
  } catch (error) {
    console.error("Error al actualizar opción de cotización:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { response } = await requireCotizacionesSession();
  if (response) return response;

  const { id } = await params;
  try {
    await deleteOpcionCotizacion(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error al eliminar opción de cotización:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 500 }
    );
  }
}
