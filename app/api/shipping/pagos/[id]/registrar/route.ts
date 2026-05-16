import { NextResponse } from "next/server";
import { canAccessApp } from "@/lib/apps";
import { isShippingPagoPaid, obtenerShippingPagoPorId, registrarPagoShipping } from "@/lib/shipping/airtable";
import { getSessionFromCookie } from "@/lib/session";
import {
  SHIPPING_PAYMENT_METHODS,
  SHIPPING_PAYMENT_SOURCE_ACCOUNTS,
  type ShippingAttachmentInput,
  type ShippingPaymentMethod,
  type ShippingPaymentSourceAccount,
} from "@/types/shipping";

export const dynamic = "force-dynamic";

const MAX_COMPROBANTE_SIZE_BYTES = 10 * 1024 * 1024;

type RouteContext = {
  params: Promise<{ id: string }>;
};

function getString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function isAirtableRecordId(value: string) {
  return /^rec[a-zA-Z0-9]{14}$/.test(value);
}

function isPaymentMethod(value: string): value is ShippingPaymentMethod {
  return SHIPPING_PAYMENT_METHODS.includes(value as ShippingPaymentMethod);
}

function isSourceAccount(value: string): value is ShippingPaymentSourceAccount {
  return SHIPPING_PAYMENT_SOURCE_ACCOUNTS.includes(value as ShippingPaymentSourceAccount);
}

async function getComprobanteInput(formData: FormData): Promise<ShippingAttachmentInput | null> {
  const file = formData.get("comprobante");
  if (!(file instanceof File) || file.size === 0) return null;

  if (file.size > MAX_COMPROBANTE_SIZE_BYTES) {
    throw new Error("El comprobante excede 10MB.");
  }

  const bytes = await file.arrayBuffer();
  return {
    filename: file.name || `comprobante-${Date.now()}`,
    contentType: file.type || "application/octet-stream",
    fileBase64: Buffer.from(bytes).toString("base64"),
  };
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getSessionFromCookie();

  if (!session) {
    return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
  }

  if (!canAccessApp(session, "Shipping")) {
    return NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!isAirtableRecordId(id)) {
    return NextResponse.json({ success: false, error: "Pago inválido." }, { status: 400 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ success: false, error: "Formulario inválido." }, { status: 400 });
  }

  const fechaPagoReal = getString(formData, "fechaPagoReal");
  const metodoPago = getString(formData, "metodoPago");
  const cuentaOrigen = getString(formData, "cuentaOrigen");
  const transaccionId = getString(formData, "transaccionId");
  const observacion = getString(formData, "observacion");

  if (!fechaPagoReal || !metodoPago || !cuentaOrigen) {
    return NextResponse.json({ success: false, error: "Fecha de pago, método y cuenta origen son obligatorios." }, { status: 400 });
  }

  if (!isPaymentMethod(metodoPago)) {
    return NextResponse.json({ success: false, error: "Método de pago inválido." }, { status: 400 });
  }

  if (!isSourceAccount(cuentaOrigen)) {
    return NextResponse.json({ success: false, error: "Cuenta origen inválida." }, { status: 400 });
  }

  try {
    const pago = await obtenerShippingPagoPorId(id);
    if (isShippingPagoPaid(pago)) {
      return NextResponse.json({ success: false, error: "Este pago ya está registrado como pagado." }, { status: 409 });
    }

    const comprobante = await getComprobanteInput(formData);
    const result = await registrarPagoShipping({
      pagoRecordId: id,
      fechaPagoReal,
      metodoPago,
      cuentaOrigen,
      transaccionId,
      observacion,
      registradoPor: `${session.user.nombre} <${session.user.email}>`,
      comprobante,
    });

    return NextResponse.json({ success: true, data: result.pago, warning: result.warning, meta: result });
  } catch (error) {
    console.error("Error al registrar pago de Shipping:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "No se pudo registrar el pago." },
      { status: 500 }
    );
  }
}
