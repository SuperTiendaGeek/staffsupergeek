import { NextResponse } from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { emitirFactura } from "@/lib/facturacion/emitirFactura";
import type { DatosVenta } from "@/lib/facturacion/emitirFactura";

export const dynamic = "force-dynamic";
// La autorización puede tardar hasta 60 s; extendemos el timeout del route.
export const maxDuration = 90;

export async function POST(request: Request) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  let body: DatosVenta;
  try {
    body = (await request.json()) as DatosVenta;
  } catch {
    return NextResponse.json({ success: false, error: "Body JSON inválido" }, { status: 400 });
  }

  // Validaciones mínimas de servidor
  if (!body.razonSocialComprador?.trim() || !body.identificacionComprador?.trim()) {
    return NextResponse.json({ success: false, error: "Datos del comprador incompletos" }, { status: 400 });
  }
  if (!Array.isArray(body.detalles) || body.detalles.length === 0) {
    return NextResponse.json({ success: false, error: "Al menos un detalle requerido" }, { status: 400 });
  }
  if (!Array.isArray(body.pagos) || body.pagos.length === 0) {
    return NextResponse.json({ success: false, error: "Al menos una forma de pago requerida" }, { status: 400 });
  }

  try {
    const resultado = await emitirFactura(body);
    return NextResponse.json({ success: true, data: resultado });
  } catch (e) {
    console.error("[/api/facturacion/emitir POST]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error interno al emitir" },
      { status: 500 }
    );
  }
}
