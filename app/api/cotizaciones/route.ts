import { NextResponse } from "next/server";
import { createCotizacion, fetchCotizaciones } from "@/lib/cotizaciones/airtable";
import { getSessionDisplayName, requireCotizacionesSession } from "@/lib/cotizaciones/auth";
import { normalizeCategoriaCotizacion } from "@/types/cotizaciones";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { response } = await requireCotizacionesSession();
  if (response) return response;

  const { searchParams } = new URL(request.url);

  try {
    const data = await fetchCotizaciones({
      estado: searchParams.get("estado"),
      q: searchParams.get("q"),
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error al cargar cotizaciones:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const { response, session } = await requireCotizacionesSession();
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const cliente = body?.cliente;
  const productoSolicitado = String(body?.productoSolicitado ?? "").trim();
  const categoria = normalizeCategoriaCotizacion(body?.categoria);

  if (!cliente?.recordId || !cliente?.nombre) {
    return NextResponse.json(
      { success: false, error: "Selecciona un cliente existente." },
      { status: 400 }
    );
  }

  if (!productoSolicitado) {
    return NextResponse.json(
      { success: false, error: "El producto solicitado es obligatorio." },
      { status: 400 }
    );
  }

  try {
    const created = await createCotizacion({
      cliente: {
        recordId: String(cliente.recordId),
        nombre: String(cliente.nombre),
        telefono: String(cliente.telefono ?? ""),
        email: String(cliente.email ?? cliente.correo ?? ""),
        cedula: String(cliente.cedula ?? ""),
      },
      productoSolicitado,
      categoria: categoria || null,
      descripcionRequerimiento:
        typeof body?.descripcionRequerimiento === "string" ? body.descripcionRequerimiento : null,
      requiereInstalacion: Boolean(body?.requiereInstalacion),
      equipoYaEstaEnTienda: Boolean(body?.equipoYaEstaEnTienda),
      observacionInterna: typeof body?.observacionInterna === "string" ? body.observacionInterna : null,
      registradoPor: getSessionDisplayName(session),
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("Error al crear cotización:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 500 }
    );
  }
}
