import { NextResponse } from "next/server";
import { createAbonoPorOrden } from "@/lib/tecnicos/airtable";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { crearMovimientoParaAbono } from "@/lib/finanzas/puentes/abonos";
import { esMetodoPagoAbonoValido } from "@/types/abonos";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

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
  const { response, session } = await requireTecnicosSession();
  if (response) return response;

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
  let numeroTransaccion: string | null = null;
  let comprobante: string | null = null;
  let comprobanteArchivo:
    | {
        filename: string;
        contentType: string;
        fileBase64: string;
      }
    | null = null;

  // "Registrado Por" siempre se toma de la sesión autenticada, nunca del cliente.
  const registradoPor = session!.user.nombre?.trim() || session!.user.email?.trim() || null;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    fecha = normalizeString(form.get("fecha"));
    monto = toNumber(normalizeString(form.get("monto")));
    metodoPago = normalizeString(form.get("metodoPago"));
    observacion = normalizeString(form.get("observacion")) || null;
    numeroTransaccion = normalizeString(form.get("numeroTransaccion")) || null;
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
    numeroTransaccion =
      typeof body?.numeroTransaccion === "string" ? body.numeroTransaccion.trim() : null;
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

  if (!esMetodoPagoAbonoValido(metodoPago)) {
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
      numeroTransaccion,
      registradoPor,
      comprobante,
      comprobanteArchivo,
    });

    // Puente 20.2 — nunca bloquea el registro del abono si falla.
    let warning = result.warning ?? null;
    const puente = await crearMovimientoParaAbono({
      abonoId: result.abono.id,
      monto,
      metodoPago,
      fecha,
      registradoPor: registradoPor || "Portal",
      numeroTransaccion: numeroTransaccion ?? undefined,
      observacion: observacion ?? undefined,
    });
    if (!puente.ok) warning = warning ?? "No se pudo registrar el movimiento financiero de este abono.";

    return NextResponse.json(
      { success: true, data: result.abono, warning },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error al crear abono por orden:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
