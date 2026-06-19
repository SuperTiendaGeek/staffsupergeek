import { NextResponse } from "next/server";
import { CedulaEnUsoError, createCliente, fetchClientesPage } from "@/lib/tecnicos/airtable";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pageSizeParam = Number(searchParams.get("pageSize") ?? "30");
    const pageSize =
      Number.isFinite(pageSizeParam) && pageSizeParam > 0
        ? Math.min(100, Math.floor(pageSizeParam))
        : 30;
    const offset = searchParams.get("offset");
    const q = searchParams.get("q");

    const result = await fetchClientesPage({
      pageSize,
      offset,
      q,
    });

    return NextResponse.json({
      success: true,
      records: result.records,
      data: result.records,
      nextOffset: result.nextOffset,
      hasNext: result.hasNext,
      pageSize: result.pageSize,
    });
  } catch (error) {
    console.error("Error al obtener clientes desde Airtable:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const input = {
    nombre: String(body?.nombre ?? "").trim(),
    cedula: String(body?.cedula ?? "").trim(),
    telefono: String(body?.telefono ?? "").trim(),
    correo: String(body?.correo ?? "").trim(),
    direccion: String(body?.direccion ?? "").trim(),
    notas: String(body?.notas ?? "").trim(),
  };

  if (!input.nombre) {
    return NextResponse.json(
      { success: false, error: "El nombre del cliente es obligatorio" },
      { status: 400 }
    );
  }

  try {
    const cliente = await createCliente(input);
    return NextResponse.json({ success: true, record: cliente, data: cliente }, { status: 201 });
  } catch (error) {
    if (error instanceof CedulaEnUsoError) {
      return NextResponse.json({ success: false, error: error.message, data: error.clienteExistente }, { status: 409 });
    }
    console.error("Error al crear cliente en Airtable:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
