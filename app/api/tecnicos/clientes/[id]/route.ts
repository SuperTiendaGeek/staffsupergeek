import { NextResponse } from "next/server";
import { deleteClienteById, fetchClienteById, updateClienteById } from "@/lib/tecnicos/airtable";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const protectedDeleteMessage =
  "Este cliente tiene órdenes registradas. Para conservar el historial, no se puede eliminar.";

export async function GET(_: Request, { params }: Params) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { success: false, error: "Falta el id del cliente" },
      { status: 400 }
    );
  }

  try {
    const cliente = await fetchClienteById(id);
    if (!cliente) {
      return NextResponse.json(
        { success: false, error: "Cliente no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: cliente, record: cliente });
  } catch (error) {
    console.error("Error al obtener el cliente desde Airtable:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const input = {
    nombre: String(body?.nombre ?? "").trim(),
    cedula: String(body?.cedula ?? "").trim(),
    telefono: String(body?.telefono ?? "").trim(),
    correo: String(body?.correo ?? "").trim(),
    direccion: String(body?.direccion ?? "").trim(),
    notas: String(body?.notas ?? "").trim(),
  };

  if (!id) {
    return NextResponse.json(
      { success: false, error: "Falta el id del cliente" },
      { status: 400 }
    );
  }

  if (!input.nombre) {
    return NextResponse.json(
      { success: false, error: "El nombre del cliente es obligatorio" },
      { status: 400 }
    );
  }

  try {
    const cliente = await updateClienteById(id, input);
    return NextResponse.json({ success: true, data: cliente, record: cliente });
  } catch (error) {
    console.error("Error al actualizar cliente en Airtable:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: Params) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { success: false, error: "Falta el id del cliente" },
      { status: 400 }
    );
  }

  try {
    await deleteClienteById(id);
    return NextResponse.json({ success: true, deleted: true });
  } catch (error) {
    console.error("Error al eliminar cliente en Airtable:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    const status = message === protectedDeleteMessage ? 409 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
