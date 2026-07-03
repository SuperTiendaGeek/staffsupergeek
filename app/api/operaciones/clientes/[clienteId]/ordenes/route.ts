import { NextResponse } from "next/server";
import { requireOperacionesSession } from "@/lib/operaciones/auth";
import { fetchOrdenesDeCliente } from "@/lib/operaciones/airtable";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ clienteId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { response } = await requireOperacionesSession();
  if (response) return response;

  const { clienteId } = await params;
  if (!clienteId?.trim()) {
    return NextResponse.json({ success: false, error: "clienteId requerido." }, { status: 400 });
  }

  try {
    const data = await fetchOrdenesDeCliente(clienteId);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[api/operaciones/clientes/[clienteId]/ordenes] GET error:", err);
    return NextResponse.json(
      { success: false, error: "Error al cargar las órdenes del cliente." },
      { status: 500 }
    );
  }
}
