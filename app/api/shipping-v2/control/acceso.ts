import { NextResponse } from "next/server";
import { canShippingV2, getShippingV2AccessContextForSession } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";

/** Pestaña Control: personal de la tienda con Recepción o edición de artículos. */
export async function accesoControl() {
  const { response, session } = await requireShippingV2Session();
  if (response) return { response } as const;
  const access = await getShippingV2AccessContextForSession(session);
  if (!access.isAdmin || !(canShippingV2(access, "canUseRecepcion") || canShippingV2(access, "canEditItems"))) {
    return { response: NextResponse.json({ success: false, error: "No tienes permiso para el control de inventario." }, { status: 403 }) } as const;
  }
  return { response: null, access, actor: getShippingV2SessionName(session), esAdministrador: access.isSiteAdmin === true } as const;
}

export function errorJson(error: unknown, contexto: string) {
  console.error(contexto, error);
  return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
}
