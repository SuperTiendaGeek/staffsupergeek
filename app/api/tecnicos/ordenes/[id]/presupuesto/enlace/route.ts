import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { asegurarEnlace, infoEnlace, urlEnlace } from "@/lib/tecnicos/presupuesto/enlace";
import { leerOrdenEnlace } from "@/lib/tecnicos/presupuesto/airtable";
import { primerNombre } from "@/lib/tecnicos/presupuesto/enlace-reglas";
import { origenPublico } from "@/lib/tecnicos/presupuesto/origen";
import { buildWhatsAppUrl } from "@/lib/tecnicos/whatsapp";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// GET  → estado del enlace de aprobación de la orden (no lo crea).
// POST → lo crea si no existe; { renovar: true } le da 7 días más (mismo enlace).
async function responder(request: Request, ordenId: string, info: { token: string; vence: string; estado: string }) {
  if (!info.token) return NextResponse.json({ success: true, data: { ...info, url: "", whatsapp: null } });
  const url = urlEnlace(origenPublico(request), info.token);
  const o = await leerOrdenEnlace(ordenId);
  const nombre = primerNombre(o.clienteNombre);
  const mensaje = `Hola${nombre ? ` ${nombre}` : ""}, te saluda SUPER GEEK. El presupuesto de tu orden ${o.idVisible} está listo. Puedes revisarlo y aprobarlo aquí: ${url}`;
  return NextResponse.json({ success: true, data: { ...info, url, whatsapp: buildWhatsAppUrl(o.telefono, mensaje), mensaje } });
}

export async function GET(request: Request, { params }: Params) {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  const { id } = await params;
  try {
    return await responder(request, id, await infoEnlace(id));
  } catch (e) {
    console.error("[presupuesto enlace GET]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "No se pudo leer el enlace" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { renovar?: boolean };
  try {
    return await responder(request, id, await asegurarEnlace(id, { renovar: body.renovar === true }));
  } catch (e) {
    console.error("[presupuesto enlace POST]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "No se pudo crear el enlace" }, { status: 500 });
  }
}
