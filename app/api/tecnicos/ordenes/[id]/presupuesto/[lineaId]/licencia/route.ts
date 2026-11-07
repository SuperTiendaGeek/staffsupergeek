import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { leerLinea } from "@/lib/tecnicos/presupuesto/airtable";
import { aUnidadLicencia, cargarLicenciaEnLinea, reemplazarLicenciaEnLinea } from "@/lib/tecnicos/presupuesto/cargar";
import { fetchAllProductosDigitales } from "@/lib/tecnicos/airtable";
import { candidatasParaLinea } from "@/lib/productos-digitales/entrega";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; lineaId: string }> };

// Entregar licencia (auditoría ops, punto 5B). La licencia se elige al
// ENTREGAR, no al aprobar (caso OR000517).
// GET: las licencias libres del mismo producto, la comprada hace más tiempo primero.
export async function GET(_: Request, { params }: Params) {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  const { lineaId } = await params;
  try {
    const linea = await leerLinea(lineaId);
    if (!linea || linea.tipo !== "Producto digital") return NextResponse.json({ success: false, error: "Línea no encontrada." }, { status: 404 });
    const todas = await fetchAllProductosDigitales();
    const libres = candidatasParaLinea(linea, todas.map(aUnidadLicencia));
    const porId = new Map(todas.map((p) => [p.id, p]));
    return NextResponse.json({
      success: true,
      data: libres.map((u) => {
        const p = porId.get(u.id)!;
        return { id: u.id, sku: u.sku, fechaCompra: u.fechaCompra, proveedor: p.proveedor, pista: p.usuarioCorreo || p.claveTruncada || "" };
      }),
    });
  } catch (e) {
    console.error("[licencia GET]", e);
    return NextResponse.json({ success: false, error: "No se pudieron leer las licencias." }, { status: 503 });
  }
}

// POST { accion: "elegir", productoId } | { accion: "reemplazar", productoId, motivo }
export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  const { id, lineaId } = await params;
  let body: { accion?: string; productoId?: string; motivo?: string } = {};
  try { body = await request.json(); } catch { /* vacío */ }
  const productoId = (body.productoId ?? "").trim();
  if (!productoId) return NextResponse.json({ success: false, error: "Elige la licencia." }, { status: 400 });
  const usuario = { nombre: session.user.nombre || session.user.email || "Portal", id: session.user.userId ?? null };
  try {
    if (body.accion === "reemplazar") {
      const r = await reemplazarLicenciaEnLinea({ ordenId: id, lineaId, nuevoProductoId: productoId, motivo: body.motivo ?? "", usuario });
      return NextResponse.json({ success: true, data: r });
    }
    const r = await cargarLicenciaEnLinea({ ordenId: id, lineaId, productoId, usuario });
    return NextResponse.json({ success: true, data: r });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo entregar la licencia.";
    console.error("[licencia POST]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 409 });
  }
}
