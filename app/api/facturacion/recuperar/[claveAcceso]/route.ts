import "server-only";

import { NextResponse } from "next/server";
import { requireFacturacionSession }            from "@/lib/facturacion/api-auth";
import { recuperarFacturaAutorizadaPorClave }   from "@/lib/facturacion/almacenamiento/recuperar";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ claveAcceso: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  const { claveAcceso } = await params;

  if (!/^\d{49}$/.test(claveAcceso)) {
    return NextResponse.json(
      { success: false, error: "Clave de acceso inválida (debe ser 49 dígitos)" },
      { status: 400 }
    );
  }

  try {
    const resultado = await recuperarFacturaAutorizadaPorClave(claveAcceso);
    return NextResponse.json({ success: true, data: resultado });
  } catch (err) {
    console.error("[recuperar route]", err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
