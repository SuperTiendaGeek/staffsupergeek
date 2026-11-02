import "server-only";

import { NextResponse } from "next/server";
import { cargarComprobanteAbono } from "./comprobante-abono-servidor";
import { generarComprobanteAbonoPdf } from "./comprobante-abono-pdf";

/** GET del PDF del comprobante de abono (lo comparten la orden y la operación; cada ruta pone su guardia). */
export async function responderPdfComprobanteAbono(
  origen: { ordenId: string } | { operacionId: string },
  abonoId: string,
): Promise<NextResponse> {
  try {
    const r = await cargarComprobanteAbono(origen, abonoId);
    if (!r.ok) return NextResponse.json({ success: false, error: r.motivo }, { status: r.status });
    const pdf = await generarComprobanteAbonoPdf(r.emisor, r.comprobante);
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${r.comprobante.numero}.pdf"` },
    });
  } catch (e) {
    console.error("[comprobante-abono pdf]", e);
    return NextResponse.json({ success: false, error: "No se pudo generar el PDF." }, { status: 500 });
  }
}
