import { NextResponse } from "next/server";
import { fetchOrdenesByClienteId } from "@/lib/tecnicos/airtable";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { success: false, error: "Falta el id del cliente" },
      { status: 400 }
    );
  }

  try {
    const ordenes = await fetchOrdenesByClienteId(id);
    return NextResponse.json({
      success: true,
      records: ordenes,
      data: ordenes,
      total: ordenes.length,
    });
  } catch (error) {
    console.error("Error al obtener órdenes del cliente desde Airtable:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    const status = message === "Cliente no encontrado" ? 404 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
