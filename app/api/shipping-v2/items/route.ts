import { NextResponse } from "next/server";
import { addFotosToShippingV2Item, canShippingV2, createShippingV2Item, getShippingV2AccessContextForSession, getShippingV2Items, type ShippingV2AttachmentUpload } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";
import type { ShippingV2ItemWriteInput } from "@/types/shipping-v2";

export const dynamic = "force-dynamic";

const MAX_FOTOS_PER_ITEM = 10;
const MAX_FOTO_SIZE = 10 * 1024 * 1024;
const ALLOWED_FOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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

function toBoolean(value: unknown) {
  return value === true || value === "true" || value === "on";
}

function parseInput(body: Record<string, unknown>): ShippingV2ItemWriteInput {
  return {
    nombre: String(body.nombre ?? ""),
    descripcion: String(body.descripcion ?? ""),
    tipoOperacion: String(body.tipoOperacion ?? ""),
    tipoItem: String(body.tipoItem ?? ""),
    categoria: String(body.categoria ?? ""),
    estado: String(body.estado ?? ""),
    proveedorId: String(body.proveedorId ?? ""),
    proveedorLogisticoId: String(body.proveedorLogisticoId ?? ""),
    requierePago: toBoolean(body.requierePago),
    requierePacking: toBoolean(body.requierePacking),
    afectaInventario: toBoolean(body.afectaInventario),
    disponibleVenta: toBoolean(body.disponibleVenta),
    sku: String(body.sku ?? body.skuInterno ?? ""),
    skuInterno: String(body.skuInterno ?? ""),
    skuProveedor: String(body.skuProveedor ?? ""),
    modelo: String(body.modelo ?? ""),
    marca: String(body.marca ?? ""),
    numeroSerie: String(body.numeroSerie ?? ""),
    condicion: String(body.condicion ?? ""),
    costoProveedor: toNumber(body.costoProveedor),
    precioVentaSugerido: toNumber(body.precioVentaSugerido),
    ubicacionActual: String(body.ubicacionActual ?? ""),
    observacionesInternas: String(body.observacionesInternas ?? ""),
    observacionVenta: String(body.observacionVenta ?? ""),
    estadoRevision: String(body.estadoRevision ?? ""),
    estadoTriangulacion: String(body.estadoTriangulacion ?? ""),
    estadoDespiece: String(body.estadoDespiece ?? ""),
    modoLogistico: String(body.modoLogistico ?? ""),
    trackingDirecto: String(body.trackingDirecto ?? ""),
  };
}

function formDataToBody(formData: FormData) {
  const body: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key === "fotos") continue;
    body[key] = typeof value === "string" ? value : "";
  }
  return body;
}

async function parseFotos(formData: FormData): Promise<ShippingV2AttachmentUpload[]> {
  const files = formData.getAll("fotos").filter((value): value is File => value instanceof File && value.size > 0);
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

export async function GET() {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;

  try {
    const access = await getShippingV2AccessContextForSession(session);
    const items = await getShippingV2Items({ access });
    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error("Error al obtener items Shipping V2:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;

  try {
    const access = await getShippingV2AccessContextForSession(session);
    if (!canShippingV2(access, "canEditItems")) {
      return NextResponse.json({ success: false, error: "No tienes permiso para crear items." }, { status: 403 });
    }
    const contentType = request.headers.get("content-type") || "";
    let body: Record<string, unknown>;
    let fotos: ShippingV2AttachmentUpload[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      body = formDataToBody(formData);
      fotos = await parseFotos(formData);
    } else {
      body = await request.json().catch(() => ({}));
    }

    const item = await createShippingV2Item(parseInput(body), {
      registradoPor: getShippingV2SessionName(session),
    });

    let responseItem = item;
    let photoUploadStatus: "none" | "complete" | "partial" | "failed" = fotos.length > 0 ? "complete" : "none";
    let photoWarning = "";
    let uploadedFotos = 0;
    let failedFotos: string[] = [];

    if (fotos.length > 0) {
      try {
        const result = await addFotosToShippingV2Item(item.id, fotos, {
          registradoPor: getShippingV2SessionName(session),
        });
        responseItem = result.item;
        uploadedFotos = result.uploadedCount;
        photoWarning = result.warning || "";
        photoUploadStatus = result.warning ? "partial" : "complete";
      } catch (photoError) {
        photoUploadStatus = "failed";
        photoWarning = photoError instanceof Error
          ? photoError.message
          : "El Item se creó, pero no se pudieron subir las fotos.";
        failedFotos = fotos.map((foto) => foto.filename);
      }
    }

    return NextResponse.json({
      success: true,
      data: responseItem,
      recordId: responseItem.id,
      aiNameSuggestionReviewAvailable: true,
      uploadedFotos,
      failedFotos,
      photoUploadStatus,
      photoWarning,
      warning: photoWarning || undefined,
    }, { status: 201 });
  } catch (error) {
    console.error("Error al crear item Shipping V2:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 400 }
    );
  }
}
