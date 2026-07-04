import { NextResponse } from "next/server";
import { requireOperacionesSession } from "@/lib/operaciones/auth";
import { crearClienteOp, verificarCedulaExistente } from "@/lib/operaciones/airtable";

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

  // Check for duplicate cédula before creating
  if (cedula) {
    const existing = await verificarCedulaExistente(cedula).catch(() => null);
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Ya existe un cliente con esta cédula.", data: existing },
        { status: 409 }
      );
    }
  }

  try {
    const cliente = await crearClienteOp({
      nombre,
      cedula: cedula || undefined,
      telefono: telefono || undefined,
      correo: correo || undefined,
    });
    return NextResponse.json({ success: true, data: cliente }, { status: 201 });
  } catch (err) {
    console.error("[api/operaciones/clientes] POST error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error al crear el cliente." },
      { status: 500 }
    );
  }
}
