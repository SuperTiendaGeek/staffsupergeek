import { NextResponse } from "next/server";
import { createOpcionCotizacion } from "@/lib/cotizaciones/airtable";
import { requireCotizacionesSession } from "@/lib/cotizaciones/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function POST(request: Request, { params }: Params) {
  const { response } = await requireCotizacionesSession();
  if (response) return response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const nombre = String(body?.nombre ?? "").trim();

  if (!nombre) {
    return NextResponse.json(
      { success: false, error: "El nombre de la opción es obligatorio." },
      { status: 400 }
    );
  }

  try {
    const data = await createOpcionCotizacion({
      cotizacionId: id,
      nombre,
      descripcion: typeof body?.descripcion === "string" ? body.descripcion : null,
      proveedor: typeof body?.proveedor === "string" ? body.proveedor : null,
      urlProveedor: typeof body?.urlProveedor === "string" ? body.urlProveedor : null,
      costoProveedor: toNumber(body?.costoProveedor),
      fleteEstimado: toNumber(body?.fleteEstimado),
      arancelImpuestos: toNumber(body?.arancelImpuestos),
      otrosCostos: toNumber(body?.otrosCostos),
      precioVentaCliente: toNumber(body?.precioVentaCliente),
      notaInterna: typeof body?.notaInterna === "string" ? body.notaInterna : null,
      notaParaCliente: typeof body?.notaParaCliente === "string" ? body.notaParaCliente : null,
    });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("Error al crear opción de cotización:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 500 }
    );
  }
}
