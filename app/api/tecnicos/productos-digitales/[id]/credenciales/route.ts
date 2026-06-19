import { NextResponse } from "next/server";
import { fetchCredencialesProductoDigital, fetchProductoDigitalById } from "@/lib/tecnicos/airtable";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  const { response } = await requireTecnicosSession();
  if (response) return response;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, error: "Falta el ID del producto" }, { status: 400 });
  }

  try {
    const producto = await fetchProductoDigitalById(id);
    if (!producto) {
      return NextResponse.json({ success: false, error: "Producto no encontrado" }, { status: 404 });
    }

    const credenciales = await fetchCredencialesProductoDigital(id);
    if (!credenciales) {
      return NextResponse.json({ success: false, error: "No se pudieron obtener las credenciales" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: credenciales });
  } catch (error) {
    console.error("Error al obtener credenciales:", error);
    return NextResponse.json(
      { success: false, error: "Error inesperado" },
      { status: 500 }
    );
  }
}
