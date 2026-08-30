import { NextResponse } from "next/server";
import { fetchMantenimientosProximos, registrarMantenimiento } from "@/lib/tecnicos/airtable";
import {
  requireTecnicosSession,
  requireTecnicosOMantenimientoDesdeFacturacionSession,
} from "@/lib/tecnicos/api-auth";

export const dynamic = "force-dynamic";

// GET: listado de seguimiento (/tecnicos/mantenimientos) — solo Técnicos.
export async function GET() {
  const { response } = await requireTecnicosSession();
  if (response) return response;

  try {
    const data = await fetchMantenimientosProximos();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error al listar mantenimientos próximos desde Airtable:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

const FECHA_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

// POST: registrar (o actualizar, si ya existía para el mismo origen) una
// etiqueta de mantenimiento impresa — llamado desde /tecnicos/ordenes/[id]
// (origen "orden") y desde el detalle de una factura emitida en
// /facturacion (origen "factura"), de ahí el guard combinado.
export async function POST(request: Request) {
  const { response, session } = await requireTecnicosOMantenimientoDesdeFacturacionSession();
  if (response) return response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "JSON inválido" }, { status: 400 });
  }

  const fecha = typeof body.fecha === "string" ? body.fecha.trim() : "";
  if (!FECHA_ISO_RE.test(fecha)) {
    return NextResponse.json(
      { success: false, error: "Fecha inválida (se espera AAAA-MM-DD)" },
      { status: 400 }
    );
  }

  const origen = body.origen === "factura" ? "factura" : body.origen === "orden" ? "orden" : null;
  if (!origen) {
    return NextResponse.json(
      { success: false, error: "Falta 'origen' ('orden' o 'factura')" },
      { status: 400 }
    );
  }

  const impresoPor = session?.user.nombre ?? session?.user.email ?? null;

  try {
    if (origen === "orden") {
      const ordenRecordId = typeof body.ordenRecordId === "string" ? body.ordenRecordId.trim() : "";
      if (!ordenRecordId) {
        return NextResponse.json({ success: false, error: "Falta 'ordenRecordId'" }, { status: 400 });
      }
      const equipo = typeof body.equipo === "string" ? body.equipo : undefined;
      const data = await registrarMantenimiento({ origen: "orden", ordenRecordId, fecha, equipo, impresoPor });
      return NextResponse.json({ success: true, data });
    }

    const facturaRecordId = typeof body.facturaRecordId === "string" ? body.facturaRecordId.trim() : "";
    const clienteNombre = typeof body.clienteNombre === "string" ? body.clienteNombre : "";
    const telefono = typeof body.telefono === "string" ? body.telefono : "";
    const equipo = typeof body.equipo === "string" ? body.equipo.trim() : "";
    if (!facturaRecordId) {
      return NextResponse.json({ success: false, error: "Falta 'facturaRecordId'" }, { status: 400 });
    }
    if (!equipo) {
      return NextResponse.json({ success: false, error: "Falta 'equipo'" }, { status: 400 });
    }
    const data = await registrarMantenimiento({
      origen: "factura",
      facturaRecordId,
      clienteNombre,
      telefono,
      equipo,
      fecha,
      impresoPor,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error al registrar mantenimiento en Airtable:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
