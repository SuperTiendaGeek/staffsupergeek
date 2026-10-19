import { NextResponse } from "next/server";
import { cambiarEstadoConteoShippingV2, getShippingV2Conteo, getShippingV2ItemsParaConteo, revisarConteoShippingV2, type ShippingV2Conteo } from "@/lib/shipping-v2/airtable";
import { indiceCiego } from "@/lib/shipping-v2/conteo";
import { accesoControl, errorJson } from "../../acceso";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

/** La foto inicial tiene las cantidades del sistema: no sale del servidor. */
function sinFoto(conteo: ShippingV2Conteo): ShippingV2Conteo {
  return { ...conteo, foto: null };
}

/** El conteo y sus lecturas; si ya terminó, también la comparación con el sistema. */
export async function GET(_request: Request, { params }: Params) {
  const a = await accesoControl();
  if (a.response) return a.response;
  const { id } = await params;
  try {
    const { conteo, lineas } = await getShippingV2Conteo(id);
    if (conteo.estado === "Contando") {
      // Conteo ciego: el índice reconoce los códigos pero no dice cuánto hay.
      const indice = indiceCiego(await getShippingV2ItemsParaConteo());
      return NextResponse.json({ success: true, data: { conteo: sinFoto(conteo), lineas, indice } });
    }
    const revision = await revisarConteoShippingV2(id);
    return NextResponse.json({ success: true, data: { ...revision, conteo: sinFoto(revision.conteo) } });
  } catch (error) {
    return errorJson(error, "Error al leer el conteo:");
  }
}

/** terminar | recontar (skus) | cancelar */
export async function POST(request: Request, { params }: Params) {
  const a = await accesoControl();
  if (a.response) return a.response;
  const { id } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const accion = body.accion === "terminar" || body.accion === "recontar" || body.accion === "cancelar" ? body.accion : null;
    if (!accion) throw new Error("Acción no válida.");
    const conteo = await cambiarEstadoConteoShippingV2(
      id,
      { accion, skus: Array.isArray(body.skus) ? body.skus.map(String).slice(0, 200) : [] },
      { actor: a.actor, esAdministrador: a.esAdministrador }
    );
    return NextResponse.json({ success: true, data: sinFoto(conteo) });
  } catch (error) {
    return errorJson(error, "Error al cambiar el conteo:");
  }
}
