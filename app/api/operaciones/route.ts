import { NextResponse } from "next/server";
import { requireOperacionesSession } from "@/lib/operaciones/auth";
import { fetchOperaciones, crearOperacion } from "@/lib/operaciones/airtable";
import type { CrearOperacionInput } from "@/types/operaciones";

export async function GET() {
  const { response } = await requireOperacionesSession();
  if (response) return response;

  try {
    const data = await fetchOperaciones();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[api/operaciones] Error al cargar operaciones:", err);
    return NextResponse.json(
      { success: false, error: "No se pudieron cargar las operaciones." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const { response } = await requireOperacionesSession();
  if (response) return response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Cuerpo inválido." }, { status: 400 });
  }

  const clienteId = typeof body.clienteId === "string" ? body.clienteId.trim() : "";
  const productoSolicitado = typeof body.productoSolicitado === "string" ? body.productoSolicitado.trim() : "";

  if (!clienteId) return NextResponse.json({ success: false, error: "El cliente es obligatorio." }, { status: 400 });
  if (!productoSolicitado) return NextResponse.json({ success: false, error: "El producto solicitado es obligatorio." }, { status: 400 });

  const input: CrearOperacionInput = {
    clienteId,
    productoSolicitado,
    categoria: typeof body.categoria === "string" ? body.categoria.trim() || undefined : undefined,
    descripcionRequerimiento: typeof body.descripcionRequerimiento === "string" ? body.descripcionRequerimiento.trim() || undefined : undefined,
    requiereInstalacion: body.requiereInstalacion === true,
    equipoEnTienda: body.equipoEnTienda === true,
    ordenId: typeof body.ordenId === "string" && body.ordenId.trim() ? body.ordenId.trim() : null,
  };

  try {
    const { id } = await crearOperacion(input);
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (err) {
    console.error("[api/operaciones] POST error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error al crear la operación." },
      { status: 500 }
    );
  }
}
