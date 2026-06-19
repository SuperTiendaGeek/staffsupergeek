import { NextResponse } from "next/server";
import { requireCotizacionesSession } from "@/lib/cotizaciones/auth";
import { CedulaEnUsoError, buscarClienteDuplicado, createCliente } from "@/lib/tecnicos/airtable";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { response } = await requireCotizacionesSession();
  if (response) return response;

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
      { success: false, error: "El nombre del cliente es obligatorio." },
      { status: 400 }
    );
  }

  try {
    const duplicado = await buscarClienteDuplicado({
      cedula: input.cedula,
      telefono: input.telefono,
    });

    if (duplicado) {
      return NextResponse.json(
        {
          success: false,
          error: "Ya existe un cliente con estos datos. Puedes seleccionarlo.",
          data: duplicado,
        },
        { status: 409 }
      );
    }

    const cliente = await createCliente(input);
    return NextResponse.json({ success: true, data: cliente }, { status: 201 });
  } catch (error) {
    if (error instanceof CedulaEnUsoError) {
      return NextResponse.json({ success: false, error: error.message, data: error.clienteExistente }, { status: 409 });
    }
    console.error("Error al crear cliente para cotizaciones:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 500 }
    );
  }
}
