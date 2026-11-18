import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { requireOperacionesSession } from "@/lib/operaciones/auth";
import { datosCobroOrden, datosCobroPedido, SinEnlace } from "@/lib/pantalla-cliente/servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Pantalla del cliente (10E-B): datos de "Cobrar en el mostrador" de una
// orden (Técnicos) o un pedido especial (Operaciones). Con sesión del
// empleado; lo que vuelve es lo mismo que el cliente ve en su enlace, más el
// teléfono para WhatsApp. La ventana del monitor también la consulta para
// saber si el cliente ya pagó.

const NO_CACHE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origen = url.searchParams.get("origen");
  const id = (url.searchParams.get("id") ?? "").trim();
  if ((origen !== "orden" && origen !== "pedido") || !/^rec[A-Za-z0-9]{14}$/.test(id)) {
    return NextResponse.json({ success: false, error: "Solicitud inválida." }, { status: 400, headers: NO_CACHE });
  }
  const { response } = origen === "orden" ? await requireTecnicosSession() : await requireOperacionesSession();
  if (response) return response;
  try {
    const data = origen === "orden" ? await datosCobroOrden(id, url.origin) : await datosCobroPedido(id, url.origin);
    return NextResponse.json({ success: true, data }, { headers: NO_CACHE });
  } catch (e) {
    if (e instanceof SinEnlace) return NextResponse.json({ success: false, error: e.message }, { status: 409, headers: NO_CACHE });
    console.error("[pantalla cliente cobro]", e);
    return NextResponse.json({ success: false, error: "No se pudo leer la cuenta. Intenta de nuevo." }, { status: 500, headers: NO_CACHE });
  }
}
