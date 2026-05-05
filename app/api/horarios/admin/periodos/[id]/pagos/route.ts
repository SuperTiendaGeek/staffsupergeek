import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { fetchPagosByPeriodo, normalizeHorarioMetodoPago, registrarPagoHorario } from "@/lib/horarios/airtable";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;

function normalizeString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim().replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getRegistradoPorText(user?: { email?: string; nombre?: string } | null) {
  return user?.email?.trim() || user?.nombre?.trim() || "Administrador";
}

export async function GET(_: Request, { params }: Params) {
  const { response } = await requireAdminSession();

  if (response) {
    return response;
  }

  const { id } = await params;

  try {
    const pagos = await fetchPagosByPeriodo(id);
    return NextResponse.json({ success: true, pagos });
  } catch (error) {
    console.error("Error al listar pagos de periodo:", error);
    return NextResponse.json({ success: false, error: "No se pudieron cargar los pagos del periodo" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  const { session, response } = await requireAdminSession();

  if (response) {
    return response;
  }

  const { id } = await params;
  const form = await request.formData();
  const fechaPago = normalizeString(form.get("fechaPago"));
  const montoPagado = toNumber(normalizeString(form.get("montoPagado")));
  const metodoPago = normalizeHorarioMetodoPago(normalizeString(form.get("metodoPago")));
  const numeroTransaccion = normalizeString(form.get("numeroTransaccion"));
  const bancoCuentaOrigen = normalizeString(form.get("bancoCuentaOrigen"));
  const observacion = normalizeString(form.get("observacion"));
  const maybeFile = form.get("comprobante");
  let comprobanteArchivo: {
    filename: string;
    contentType: string;
    fileBase64: string;
  } | null = null;

  if (!fechaPago || montoPagado === null) {
    return NextResponse.json({ success: false, error: "Fecha y monto son obligatorios" }, { status: 400 });
  }

  if (maybeFile instanceof File && maybeFile.size > 0) {
    if (maybeFile.size > MAX_ATTACHMENT_SIZE_BYTES) {
      return NextResponse.json({ success: false, error: "El comprobante excede 5MB" }, { status: 400 });
    }

    const isAllowedType = maybeFile.type.startsWith("image/") || maybeFile.type === "application/pdf" || maybeFile.type === "";

    if (!isAllowedType) {
      return NextResponse.json({ success: false, error: "El comprobante debe ser imagen o PDF" }, { status: 400 });
    }

    const bytes = await maybeFile.arrayBuffer();
    comprobanteArchivo = {
      filename: maybeFile.name || `comprobante-${Date.now()}`,
      contentType: maybeFile.type || "application/octet-stream",
      fileBase64: Buffer.from(bytes).toString("base64")
    };
  }

  try {
    const result = await registrarPagoHorario({
      periodoId: id,
      fechaPago,
      montoPagado,
      metodoPago,
      numeroTransaccion,
      bancoCuentaOrigen,
      observacion,
      registradoPor: getRegistradoPorText(session.user),
      comprobanteArchivo
    });

    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo registrar el pago";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
