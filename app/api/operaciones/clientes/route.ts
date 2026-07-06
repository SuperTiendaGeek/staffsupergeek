import { NextResponse } from "next/server";
import { requireOperacionesSession } from "@/lib/operaciones/auth";
import { CedulaEnUsoError, crearClienteOp } from "@/lib/operaciones/airtable";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { response } = await requireOperacionesSession();
  if (response) return response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Cuerpo inválido." }, { status: 400 });
  }

  const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
  if (!nombre) {
    return NextResponse.json({ success: false, error: "El nombre es obligatorio." }, { status: 400 });
  }

  const cedula = typeof body.cedula === "string" ? body.cedula.trim() : "";
  const telefono = typeof body.telefono === "string" ? body.telefono.trim() : "";
  const correo = typeof body.correo === "string" ? body.correo.trim() : "";

  try {
    const cliente = await crearClienteOp({
      nombre,
      cedula: cedula || undefined,
      telefono: telefono || undefined,
      correo: correo || undefined,
    });
    return NextResponse.json({ success: true, data: cliente }, { status: 201 });
  } catch (err) {
    if (err instanceof CedulaEnUsoError) {
      return NextResponse.json(
        { success: false, error: err.message, data: err.clienteExistente },
        { status: 409 }
      );
    }
    console.error("[api/operaciones/clientes] POST error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error al crear el cliente." },
      { status: 500 }
    );
  }
}
