import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { borrarAlertaGeneral, guardarAlertaGeneral, listarAlertasGenerales } from "@/lib/tecnicos/carteles/airtable";

export const dynamic = "force-dynamic";

// Avisos que el cliente acepta una sola vez por orden (retiro del equipo, etc.).
// GET lista todos; POST crea o actualiza (con id); DELETE borra uno.
export async function GET() {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  try {
    return NextResponse.json({ success: true, data: await listarAlertasGenerales() });
  } catch (e) {
    console.error("[alertas generales GET]", e);
    return NextResponse.json({ success: false, error: "No se pudieron leer los avisos" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const titulo = String(b.titulo ?? "").trim();
  const contenido = String(b.contenido ?? "").trim();
  if (titulo.length < 3) return NextResponse.json({ success: false, error: "El aviso necesita un título." }, { status: 400 });
  if (contenido.length < 20) return NextResponse.json({ success: false, error: "Escribe el texto del aviso." }, { status: 400 });
  try {
    const data = await guardarAlertaGeneral({
      id: typeof b.id === "string" && b.id ? b.id : undefined,
      titulo: titulo.slice(0, 120),
      contenido: contenido.slice(0, 3000),
      textoCasilla: String(b.textoCasilla ?? "").trim().slice(0, 300),
      activa: b.activa === true,
      orden: Number.isFinite(Number(b.orden)) ? Number(b.orden) : 0,
    });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error("[alertas generales POST]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "No se pudo guardar el aviso" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ success: false, error: "Falta el aviso a borrar." }, { status: 400 });
  try {
    await borrarAlertaGeneral(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[alertas generales DELETE]", e);
    return NextResponse.json({ success: false, error: "No se pudo borrar el aviso" }, { status: 500 });
  }
}
