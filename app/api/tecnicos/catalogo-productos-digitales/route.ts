import { NextResponse } from "next/server";
import { fetchCatalogoProductosDigitales, createCatalogoProductoDigital } from "@/lib/tecnicos/airtable";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";

export const dynamic = "force-dynamic";

// GET /api/tecnicos/catalogo-productos-digitales?q=texto&activo=true
export async function GET(request: Request) {
  const { response } = await requireTecnicosSession();
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? undefined;
  const activoParam = searchParams.get("activo");
  const activoOnly = activoParam !== "false";

  try {
    const data = await fetchCatalogoProductosDigitales({ query: q, activoOnly });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error al obtener catálogo de productos digitales:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener catálogo" },
      { status: 500 }
    );
  }
}

// POST /api/tecnicos/catalogo-productos-digitales
export async function POST(request: Request) {
  const { response } = await requireTecnicosSession();
  if (response) return response;

  try {
    const body = await request.json() as Record<string, unknown>;
    const productoBase = typeof body.productoBase === "string" ? body.productoBase.trim() : "";
    if (!productoBase) {
      return NextResponse.json({ success: false, error: "Nombre del producto es requerido" }, { status: 400 });
    }

    const data = await createCatalogoProductoDigital({
      productoBase,
      marca:               typeof body.marca === "string" ? body.marca || null : null,
      tipo:                typeof body.tipo === "string" ? body.tipo || null : null,
      portalActivacion:    typeof body.portalActivacion === "string" ? body.portalActivacion || null : null,
      instruccionesPdf:    typeof body.instruccionesPdf === "string" ? body.instruccionesPdf || null : null,
      notasParaCliente:    typeof body.notasParaCliente === "string" ? body.notasParaCliente || null : null,
      precioVentaCatalogo: typeof body.precioVentaCatalogo === "number" ? body.precioVentaCatalogo : null,
      colorPrincipal:      typeof body.colorPrincipal === "string" ? body.colorPrincipal || null : null,
      activo:              body.activo !== false,
      logoUrl:             typeof body.logoUrl === "string" ? body.logoUrl || null : null,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error al crear producto en catálogo:", error);
    return NextResponse.json({ success: false, error: "Error al crear producto en catálogo" }, { status: 500 });
  }
}
