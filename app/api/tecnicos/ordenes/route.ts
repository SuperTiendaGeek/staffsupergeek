import { NextResponse } from "next/server";
import { CedulaEnUsoError, createOrdenReparacion, fetchOrdenesPage } from "@/lib/tecnicos/airtable";

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
    const estado = searchParams.get("estado");
    const riskParam = searchParams.get("risk");
    const risk = riskParam === "warning" || riskParam === "critical" ? riskParam : null;

    const result = await fetchOrdenesPage({
      pageSize,
      offset,
      q,
      estado,
      risk,
    });

    return NextResponse.json({
      success: true,
      records: result.records,
      data: result.records,
      nextOffset: result.nextOffset,
      pageSize: result.pageSize,
      hasNext: result.hasNext,
      riskSummary: result.riskSummary,
      statusCounts: result.statusCounts,
    });
  } catch (error) {
    console.error("Error al obtener ordenes desde Airtable:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const clienteId =
    typeof body?.clienteId === "string" ? body.clienteId.trim() : undefined;
  const nuevoCliente =
    body?.nuevoCliente && typeof body.nuevoCliente === "object"
      ? {
          nombre: String(body.nuevoCliente.nombre ?? "").trim(),
          cedula: String(body.nuevoCliente.cedula ?? "").trim(),
          telefono: String(body.nuevoCliente.telefono ?? "").trim(),
          correo: String(body.nuevoCliente.correo ?? "").trim(),
          direccion: String(body.nuevoCliente.direccion ?? "").trim(),
          notas: String(body.nuevoCliente.notas ?? "").trim(),
        }
      : null;
  const orden =
    body?.orden && typeof body.orden === "object"
      ? {
          equipo: String(body.orden.equipo ?? "").trim(),
          accesorios: String(body.orden.accesorios ?? "").trim(),
          ingresaPor: String(body.orden.ingresaPor ?? "").trim(),
        }
      : null;

  if (!clienteId && !nuevoCliente?.nombre) {
    return NextResponse.json(
      { success: false, error: "Selecciona un cliente o registra uno nuevo" },
      { status: 400 }
    );
  }

  if (!orden?.equipo) {
    return NextResponse.json(
      { success: false, error: "El equipo es obligatorio" },
      { status: 400 }
    );
  }

  if (!orden.ingresaPor) {
    return NextResponse.json(
      { success: false, error: "Ingresa Por es obligatorio" },
      { status: 400 }
    );
  }

  try {
    const created = await createOrdenReparacion({
      clienteId,
      nuevoCliente,
      orden,
    });
    return NextResponse.json({ success: true, ...created }, { status: 201 });
  } catch (error) {
    if (error instanceof CedulaEnUsoError) {
      return NextResponse.json({ success: false, error: error.message, data: error.clienteExistente }, { status: 409 });
    }
    console.error("Error al crear orden en Airtable:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
