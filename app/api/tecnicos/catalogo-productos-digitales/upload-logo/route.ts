import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";

export const dynamic = "force-dynamic";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];

export async function POST(request: Request) {
  const { response } = await requireTecnicosSession();
  if (response) return response;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "No se recibió archivo" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: "Formato no permitido. Solo JPG, PNG, WebP, GIF o SVG." },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: "El archivo no debe superar 5 MB." },
        { status: 400 }
      );
    }

    const ext = (file.name.split(".").pop() ?? "img").toLowerCase();
    const slug = Math.random().toString(36).slice(2, 8);
    const filename = `${Date.now()}-${slug}.${ext}`;

    const blob = await put(`tecnicos/catalogo-logos/${filename}`, file, {
      access: "public",
      contentType: file.type,
    });

    return NextResponse.json({ success: true, url: blob.url });
  } catch (error) {
    console.error("Error al subir logo de catálogo:", error);
    return NextResponse.json({ success: false, error: "Error al subir imagen" }, { status: 500 });
  }
}
