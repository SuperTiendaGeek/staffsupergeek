import { NextResponse } from "next/server";
import { agregarLecturaConteoShippingV2, anularLecturaConteoShippingV2, getShippingV2LineasConteo } from "@/lib/shipping-v2/airtable";
import { accesoControl, errorJson } from "../../../acceso";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const TIPOS = new Set(["Unidad", "Sin identificar", "Lote", "Sin registro"]);

/** Las lecturas del conteo (para ver lo que cuentan los demás). */
export async function GET(_request: Request, { params }: Params) {
  const a = await accesoControl();
  if (a.response) return a.response;
  const { id } = await params;
  try {
    return NextResponse.json({ success: true, data: await getShippingV2LineasConteo(id) });
  } catch (error) {
    return errorJson(error, "Error al leer las lecturas:");
  }
}

/** Una lectura nueva (escaneo o manual). */
export async function POST(request: Request, { params }: Params) {
  const a = await accesoControl();
  if (a.response) return a.response;
  const { id } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const tipo = String(body.tipo ?? "");
    if (!TIPOS.has(tipo)) throw new Error("Lectura no válida.");
    const lineas = await agregarLecturaConteoShippingV2(
      id,
      {
        codigo: String(body.codigo ?? ""),
        itemId: body.itemId ? String(body.itemId) : undefined,
        sku: String(body.sku ?? ""),
        serie: String(body.serie ?? ""),
        cantidad: Number(body.cantidad ?? 1),
        tipo: tipo as "Unidad" | "Sin identificar" | "Lote" | "Sin registro",
      },
      { actor: a.actor }
    );
    return NextResponse.json({ success: true, data: lineas });
  } catch (error) {
    return errorJson(error, "Error al guardar la lectura:");
  }
}

/** Quitar una lectura (queda anulada). */
export async function PATCH(request: Request, { params }: Params) {
  const a = await accesoControl();
  if (a.response) return a.response;
  const { id } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json({ success: true, data: await anularLecturaConteoShippingV2(id, String(body.lineaId ?? "")) });
  } catch (error) {
    return errorJson(error, "Error al quitar la lectura:");
  }
}
