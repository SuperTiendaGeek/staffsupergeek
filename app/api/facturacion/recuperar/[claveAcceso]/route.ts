import "server-only";

import { NextResponse } from "next/server";
import { requireFacturacionSession }            from "@/lib/facturacion/api-auth";
import { recuperarFacturaAutorizadaPorClave }   from "@/lib/facturacion/almacenamiento/recuperar";
import { completarFacturaAutorizada }           from "@/lib/facturacion/gancho/efectosPostAutorizacion";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ claveAcceso: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { response, session } = await requireFacturacionSession();
  if (response || !session) return response ?? NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });

  const { claveAcceso } = await params;

  if (!/^\d{49}$/.test(claveAcceso)) {
    return NextResponse.json(
      { success: false, error: "Clave de acceso inválida (debe ser 49 dígitos)" },
      { status: 400 }
    );
  }

  try {
    const resultado = await recuperarFacturaAutorizadaPorClave(claveAcceso);
    // Mismo cierre que "Consultar estado": descargo, Finanzas, vínculos.
    const completado = await completarFacturaAutorizada(
      resultado.recordId,
      session.user.nombre || session.user.email || "Portal"
    ).catch((e) => {
      console.error("[recuperar route] completar factura falló:", e);
      return null;
    });
    return NextResponse.json({ success: true, data: { ...resultado, completado } });
  } catch (err) {
    console.error("[recuperar route]", err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
