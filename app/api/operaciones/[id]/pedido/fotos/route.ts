import { type NextRequest, NextResponse } from "next/server";
import { requireOperacionesSession } from "@/lib/operaciones/auth";
import { quitarFotoOpcion, subirFotoOpcion } from "@/lib/pedidos-especiales/servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Fotos de una opción de la cotización (auditoría ops, 14-nov-2026).
//   POST   multipart { lineaId, foto }  → sube UNA foto (ya achicada en el navegador).
//   DELETE json { lineaId, fotoId }      → quita una foto.
// Devuelve las fotos que quedan en la opción.
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { response } = await requireOperacionesSession();
  if (response) return response;
  const { id } = await params;
  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ success: false, error: "Cuerpo inválido." }, { status: 400 }); }
  const lineaId = String(form.get("lineaId") ?? "");
  const foto = form.get("foto");
  if (!lineaId || !(foto instanceof File) || foto.size === 0) {
    return NextResponse.json({ success: false, error: "Falta la foto." }, { status: 400 });
  }
  try {
    const base64 = Buffer.from(await foto.arrayBuffer()).toString("base64");
    const data = await subirFotoOpcion(id, lineaId, { tipo: foto.type, nombre: foto.name, base64 });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "No se pudo subir la foto." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { response } = await requireOperacionesSession();
  if (response) return response;
  const { id } = await params;
  let b: { lineaId?: unknown; fotoId?: unknown };
  try { b = await request.json(); } catch { return NextResponse.json({ success: false, error: "Cuerpo inválido." }, { status: 400 }); }
  if (typeof b.lineaId !== "string" || typeof b.fotoId !== "string" || !b.lineaId || !b.fotoId) {
    return NextResponse.json({ success: false, error: "Faltan datos." }, { status: 400 });
  }
  try {
    return NextResponse.json({ success: true, data: await quitarFotoOpcion(id, b.lineaId, b.fotoId) });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "No se pudo quitar la foto." }, { status: 400 });
  }
}
