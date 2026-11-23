import { NextResponse } from "next/server";
import { CedulaEnUsoError, createOrdenReparacion, fetchOrdenesPage } from "@/lib/tecnicos/airtable";
import { fichaParaOrdenNueva } from "@/lib/tecnicos/equipos/servidor";
import { ErrorMotivo, camposDeMotivos } from "@/lib/tecnicos/motivos/servidor";
import { getSessionFromCookie } from "@/lib/session";

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
  // Rediseño R7: motivo de ingreso con chips (+ lo que dijo el cliente) y la contraseña del equipo.
  const motivoIds: unknown = body?.orden?.motivoIds;
  const clienteDice = typeof body?.orden?.clienteDice === "string" ? body.orden.clienteDice.trim().slice(0, 500) : "";
  const contrasena = typeof body?.orden?.contrasena === "string" ? body.orden.contrasena.trim().slice(0, 120) : "";

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

  let idsMotivos: string[] | undefined;
  if (motivoIds !== undefined) {
    try {
      const m = await camposDeMotivos(motivoIds, clienteDice);
      idsMotivos = m.fields["Motivos"] as string[];
      orden.ingresaPor = String(m.fields["Ingresa Por"]);
    } catch (e) {
      if (e instanceof ErrorMotivo) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
      throw e;
    }
  }

  if (!orden.ingresaPor) {
    return NextResponse.json(
      { success: false, error: "Elige al menos un motivo de ingreso" },
      { status: 400 }
    );
  }

  const session = await getSessionFromCookie();
  const usuario = { nombre: session?.user.nombre ?? null, email: session?.user.email ?? null, id: session?.user.userId ?? null };

  try {
    const created = await createOrdenReparacion({
      clienteId,
      nuevoCliente,
      orden,
      enlaces: idsMotivos ? { motivoIds: idsMotivos } : null,
    });
    // Rediseño R5: la ficha del equipo sale sola del texto (o se reusa la del
    // cliente si ya trajo ese equipo). Nunca frena el registro.
    if (created.clienteRecordId && orden?.equipo) {
      await fichaParaOrdenNueva({ ordenId: created.airtableRecordId, clienteId: created.clienteRecordId, equipoTexto: orden.equipo, creadoPor: "Registro de orden", contrasena, usuario })
        .catch((e) => console.error("[ordenes POST] ficha del equipo", e));
    }
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
