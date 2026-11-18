import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { requireOperacionesSession } from "@/lib/operaciones/auth";
import { datosCobroOrden, datosCobroPedido, SinEnlace } from "@/lib/pantalla-cliente/servidor";
import { configPantalla } from "@/lib/pantalla-cliente/config-servidor";
import { puedeUsarPantalla } from "@/lib/pantalla-cliente/config";
import { abrirPagoMostrador } from "@/lib/pagos-en-linea/servidor";
import { PARA_PAGO, type ParaPago } from "@/lib/pagos-en-linea/reglas";

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
  const { session, response } = origen === "orden" ? await requireTecnicosSession() : await requireOperacionesSession();
  if (response || !session) return response!;
  // 10E-C: solo los roles que Administrar permite (dueño: Administradores y Staff).
  if (!puedeUsarPantalla(session.user.rol, await configPantalla())) {
    return NextResponse.json({ success: false, error: "No tienes permiso para cobrar en el mostrador." }, { status: 403, headers: NO_CACHE });
  }
  try {
    const data = origen === "orden" ? await datosCobroOrden(id, url.origin) : await datosCobroPedido(id, url.origin);
    return NextResponse.json({ success: true, data }, { headers: NO_CACHE });
  } catch (e) {
    if (e instanceof SinEnlace) return NextResponse.json({ success: false, error: e.message }, { status: 409, headers: NO_CACHE });
    console.error("[pantalla cliente cobro]", e);
    return NextResponse.json({ success: false, error: "No se pudo leer la cuenta. Intenta de nuevo." }, { status: 500, headers: NO_CACHE });
  }
}

/**
 * Etapa D (maqueta 9): el empleado pide el QR de DeUna para mostrarlo en la
 * pantalla del cliente. Body: { origen, id, para }. El monto lo pone el servidor.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { origen?: unknown; id?: unknown; para?: unknown } | null;
  const origen = body?.origen;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const para = typeof body?.para === "string" && (PARA_PAGO as readonly string[]).includes(body.para) ? (body.para as ParaPago) : null;
  if ((origen !== "orden" && origen !== "pedido") || !/^rec[A-Za-z0-9]{14}$/.test(id) || !para) {
    return NextResponse.json({ success: false, error: "Solicitud inválida." }, { status: 400, headers: NO_CACHE });
  }
  const { session, response } = origen === "orden" ? await requireTecnicosSession() : await requireOperacionesSession();
  if (response || !session) return response!;
  if (!puedeUsarPantalla(session.user.rol, await configPantalla())) {
    return NextResponse.json({ success: false, error: "No tienes permiso para cobrar en el mostrador." }, { status: 403, headers: NO_CACHE });
  }
  try {
    const r = await abrirPagoMostrador({ origen: origen === "orden" ? "Orden" : "Pedido", id }, para, "DeUna");
    if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: r.status, headers: NO_CACHE });
    if (!r.deuna) return NextResponse.json({ success: false, error: "DeUna no devolvió el QR." }, { status: 502, headers: NO_CACHE });
    return NextResponse.json({ success: true, data: { codigo: r.codigo, monto: r.monto, qr: r.deuna.qr, venceEn: r.deuna.venceEn } }, { headers: NO_CACHE });
  } catch (e) {
    console.error("[pantalla cliente DeUna]", e instanceof Error ? e.message : "error");
    return NextResponse.json({ success: false, error: "No se pudo pedir el QR de DeUna. Intenta de nuevo." }, { status: 500, headers: NO_CACHE });
  }
}
