import { NextResponse } from "next/server";
import {
  fetchAllProductosDigitales,
  fetchProductosDigitalesDisponibles,
  createProductoDigital,
} from "@/lib/tecnicos/airtable";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";

export const dynamic = "force-dynamic";

// GET /api/tecnicos/productos-digitales?estado=Disponible&q=texto
export async function GET(request: Request) {
  const { response } = await requireTecnicosSession();
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? undefined;
  const estado = searchParams.get("estado") ?? undefined;

  try {
    let productos;
    if (estado === "Disponible") {
      productos = await fetchProductosDigitalesDisponibles(q);
    } else {
      productos = await fetchAllProductosDigitales({ estado, query: q });
    }
    return NextResponse.json({ success: true, data: productos });
  } catch (error) {
    console.error("Error al obtener productos digitales:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener productos digitales" },
      { status: 500 }
    );
  }
}

// POST /api/tecnicos/productos-digitales
export async function POST(request: Request) {
  const { response } = await requireTecnicosSession();
  if (response) return response;

  let body: {
    catalogoId?: string;
    estado?: string;
    proveedor?: string | null;
    costoProveedor?: number | null;
    precioVenta?: number | null;
    claveActivacion?: string | null;
    usuarioCorreo?: string | null;
    contraseña?: string | null;
    duracion?: string | null;
    fechaCompra?: string | null;
    observacionesInternas?: string | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "JSON inválido" }, { status: 400 });
  }

  const catalogoId = body.catalogoId?.trim();
  if (!catalogoId) {
    return NextResponse.json(
      { success: false, error: "El campo Catálogo (catalogoId) es obligatorio." },
      { status: 400 }
    );
  }

  try {
    const producto = await createProductoDigital({
      catalogoId,
      estado: body.estado ?? "Disponible",
      proveedor: body.proveedor ?? null,
      costoProveedor: body.costoProveedor ?? null,
      precioVenta: body.precioVenta ?? null,
      claveActivacion: body.claveActivacion ?? null,
      usuarioCorreo: body.usuarioCorreo ?? null,
      contraseña: body.contraseña ?? null,
      duracion: body.duracion ?? null,
      fechaCompra: body.fechaCompra ?? null,
      observacionesInternas: body.observacionesInternas ?? null,
    });
    return NextResponse.json({ success: true, data: producto }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
