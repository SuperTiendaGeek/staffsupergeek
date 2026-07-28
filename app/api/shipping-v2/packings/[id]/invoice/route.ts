import { NextResponse } from "next/server";
import { attachShippingV2PackingInvoice, canShippingV2, getShippingV2AccessContextForSession, getShippingV2PackingInvoiceData } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";
import { generateShippingV2PackingInvoicePdf } from "@/lib/shipping-v2/invoice";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function statusForError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("no encontrado") || message.includes("no existe")) return 404;
  if (message.includes("no tiene") || message.includes("Agrega") || message.includes("Asigna")) return 400;
  return 500;
}

export async function POST(_request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  const { id } = await params;

  try {
    const access = await getShippingV2AccessContextForSession(session);
    if (!canShippingV2(access, "canGenerateInvoice")) {
      return NextResponse.json({ ok: false, success: false, error: "No tienes permiso para generar facturas de packing." }, { status: 403 });
    }
    const invoiceData = await getShippingV2PackingInvoiceData(id, access);
    const pdfBytes = await generateShippingV2PackingInvoicePdf(invoiceData);
    const result = await attachShippingV2PackingInvoice({
      packingId: invoiceData.packing.id,
      filename: invoiceData.invoice.filename,
      pdfBytes,
      invoiceNumber: invoiceData.invoice.invoiceNumber,
      registradoPor: getShippingV2SessionName(session),
      access,
    });

    return NextResponse.json({
      ok: true,
      success: true,
      facturaUrl: result.attachment?.url,
      filename: result.attachment?.filename || invoiceData.invoice.filename,
      invoiceNumber: invoiceData.invoice.invoiceNumber,
      warnings: invoiceData.warnings,
      data: result.packing,
    });
  } catch (error) {
    console.error("Error al generar factura proveedor Shipping V2:", error);
    return NextResponse.json(
      { ok: false, success: false, error: error instanceof Error ? error.message : "No se pudo generar la factura proveedor." },
      { status: statusForError(error) }
    );
  }
}
