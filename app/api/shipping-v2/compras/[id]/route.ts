import { NextResponse } from "next/server";
import { getShippingV2AccessContextForSession } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";
import { perfilShippingV2 } from "@/lib/shipping-v2/access";
import { airtableRequest, escapeFormulaString, tableUrl, type AirtableRecord } from "@/lib/finanzas/airtable-client";
import { puedeComprar } from "@/lib/compras/reglas";
import { asignarArticuloExistente, cancelarSolicitud } from "@/lib/compras/servidor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Acciones de la bandeja sobre UNA solicitud:
 *   { accion: "cancelar", motivo }   — lo que todavía no se compró.
 *   { accion: "asignar", sku }       — "Ya la tenemos": aparta un artículo que ya existe.
 * "Comprar" no pasa por aquí: abre Registrar compra con las filas cargadas.
 */
export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  const access = await getShippingV2AccessContextForSession(session);
  if (!puedeComprar(perfilShippingV2(access))) {
    return NextResponse.json({ success: false, error: "Las compras las gestionan Staff o un Administrador." }, { status: 403 });
  }
  const { id } = await params;
  if (!/^rec[A-Za-z0-9]{14}$/.test(id ?? "")) return NextResponse.json({ success: false, error: "Id inválido." }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const usuario = getShippingV2SessionName(session);
  try {
    if (body.accion === "cancelar") {
      await cancelarSolicitud({ solicitudId: id, motivo: String(body.motivo ?? ""), usuario });
      return NextResponse.json({ success: true });
    }
    if (body.accion === "asignar") {
      const sku = String(body.sku ?? "").trim().toUpperCase();
      if (!sku) return NextResponse.json({ success: false, error: "Escribe el SKU del artículo." }, { status: 400 });
      const u = new URL(tableUrl("Shipping Items"));
      u.searchParams.set("pageSize", "2");
      u.searchParams.set("filterByFormula", `UPPER({SKU})='${escapeFormulaString(sku)}'`);
      const data = await airtableRequest<{ records?: AirtableRecord[] }>(u.toString());
      const items = data.records ?? [];
      if (items.length === 0) return NextResponse.json({ success: false, error: `No existe el artículo ${sku}.` }, { status: 404 });
      if (items.length > 1) return NextResponse.json({ success: false, error: `Hay varios registros con ${sku}: ábrelo en Artículos y apártalo desde ahí.` }, { status: 409 });
      const r = await asignarArticuloExistente({ solicitudId: id, itemId: items[0].id, usuario });
      return NextResponse.json({ success: true, data: r });
    }
    return NextResponse.json({ success: false, error: "Acción no válida." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Error inesperado." }, { status: 409 });
  }
}
