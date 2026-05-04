import { NextResponse } from "next/server";
import { buscarClientes } from "@/lib/tecnicos/airtable";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();

    if (q.length < 2) {
      return NextResponse.json({ success: true, data: [] });
    }

    const clientes = await buscarClientes({ q, pageSize: 8 });
    return NextResponse.json({ success: true, data: clientes });
  } catch (error) {
    console.error("Error al buscar clientes en Airtable:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
