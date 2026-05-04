import { NextResponse } from "next/server";
import { createAbonoPorOrden } from "@/lib/tecnicos/airtable";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const METODOS_PAGO_VALIDOS = ["Efectivo", "Transferencia", "Tarjeta", "PayPal"] as const;

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;

const normalizeString = (value: FormDataEntryValue | null): string =>
  typeof value === "string" ? value.trim() : "";

export async function POST(request: Request, { params }: Params) {
  const { id: ordenRecordId } = await params;

  if (!ordenRecordId) {
    return NextResponse.json(
      { success: false, error: "Falta el id de la orden" },
      { status: 400 }
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  let fecha = "";
  let monto: number | null = null;
  let metodoPago = "";
  let observacion: string | null = null;
  let registradoPor: string | null = null;
  let comprobante: string | null = null;
  let comprobanteArchivo:
    | {
        filename: string;
        contentType: string;
        fileBase64: string;
      }
    | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    fecha = normalizeString(form.get("fecha"));
    monto = toNumber(normalizeString(form.get("monto")));
    metodoPago = normalizeString(form.get("metodoPago"));
    observacion = normalizeString(form.get("observacion")) || null;
    registradoPor = normalizeString(form.get("registradoPor")) || null;
    comprobante = normalizeString(form.get("comprobante")) || null;

    const maybeFile = form.get("comprobanteArchivo");
    if (maybeFile instanceof File && maybeFile.size > 0) {
      if (maybeFile.size > MAX_ATTACHMENT_SIZE_BYTES) {
        return NextResponse.json(
          {
            success: false,
            error: "El comprobante excede 5MB. Sube un archivo más liviano.",
          },
          { status: 400 }
        );
      }

      const isAllowedType =
        maybeFile.type.startsWith("image/") ||
        maybeFile.type === "application/pdf" ||
        maybeFile.type === "";
      if (!isAllowedType) {
        return NextResponse.json(
          {
            success: false,
            error: "El comprobante debe ser una imagen o PDF.",
          },
          { status: 400 }
        );
      }

      const bytes = await maybeFile.arrayBuffer();
      comprobanteArchivo = {
        filename: maybeFile.name || `comprobante-${Date.now()}`,
        contentType: maybeFile.type || "application/octet-stream",
        fileBase64: Buffer.from(bytes).toString("base64"),
      };
    }
  } else {
    const body = await request.json().catch(() => ({}));
    fecha = typeof body?.fecha === "string" ? body.fecha.trim() : "";
    monto = toNumber(body?.monto);
    metodoPago = typeof body?.metodoPago === "string" ? body.metodoPago.trim() : "";
    observacion = typeof body?.observacion === "string" ? body.observacion.trim() : null;
    registradoPor =
      typeof body?.registradoPor === "string" ? body.registradoPor.trim() : null;
    comprobante = typeof body?.comprobante === "string" ? body.comprobante.trim() : null;
  }

  if (!fecha) {
    return NextResponse.json(
      { success: false, error: "La fecha del abono es obligatoria" },
      { status: 400 }
    );
  }

  if (monto === null || monto <= 0) {
    return NextResponse.json(
      { success: false, error: "El monto del abono debe ser mayor a 0" },
      { status: 400 }
    );
  }

  if (!metodoPago) {
    return NextResponse.json(
      { success: false, error: "El método de pago es obligatorio" },
      { status: 400 }
    );
  }

  if (!METODOS_PAGO_VALIDOS.includes(metodoPago as (typeof METODOS_PAGO_VALIDOS)[number])) {
    return NextResponse.json(
      { success: false, error: "El método de pago no es válido" },
      { status: 400 }
    );
  }

  try {
    const result = await createAbonoPorOrden({
      ordenRecordId,
      fecha,
      monto,
      metodoPago,
      observacion,
      registradoPor,
      comprobante,
      comprobanteArchivo,
    });

    return NextResponse.json(
      { success: true, data: result.abono, warning: result.warning ?? null },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error al crear abono por orden:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
