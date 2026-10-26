import { NextResponse } from "next/server";
import { canShippingV2, getShippingV2AccessContextForSession } from "@/lib/shipping-v2/airtable";
import { esTecnicoShippingV2 } from "@/lib/shipping-v2/access";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";
import { getKardexMovimientos, getKardexProducto, getKardexResumen, resolverSkuKardex } from "@/lib/shipping-v2/kardex-lectura";
import { kardexConciliar } from "@/lib/shipping-v2/kardex-registro";
import { claveKardex } from "@/lib/shipping-v2/kardex";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Kardex del inventario (punto 12). Lo ve todo el personal de la tienda con
// acceso a Artículos; costos, valores y el Resumen solo el Administrador.
async function acceso() {
  const { response, session } = await requireShippingV2Session();
  if (response) return { response } as const;
  const access = await getShippingV2AccessContextForSession(session);
  if (!access.isAdmin || !canShippingV2(access, "canViewItems") || esTecnicoShippingV2(access)) {
    return { response: NextResponse.json({ success: false, error: "No tienes permiso para ver el Kardex." }, { status: 403 }) } as const;
  }
  return { response: null, access, actor: getShippingV2SessionName(session), verCostos: access.isSiteAdmin === true } as const;
}

function fecha(v: string | null): string | undefined {
  if (!v) return undefined;
  const d = new Date(v.length === 10 ? `${v}T00:00:00-05:00` : v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export async function GET(request: Request) {
  const a = await acceso();
  if (a.response) return a.response;
  const url = new URL(request.url);
  const vista = url.searchParams.get("vista") ?? "producto";
  try {
    if (vista === "producto") {
      const q = url.searchParams.get("q") ?? "";
      const sku = await resolverSkuKardex(q);
      if (!sku) return NextResponse.json({ success: true, data: null });
      return NextResponse.json({ success: true, data: await getKardexProducto(sku, { verCostos: a.verCostos }) });
    }
    if (vista === "movimientos" || vista === "bajas") {
      return NextResponse.json({
        success: true,
        data: await getKardexMovimientos({
          desde: fecha(url.searchParams.get("desde")),
          hasta: fecha(url.searchParams.get("hasta")),
          soloBajas: vista === "bajas",
          verCostos: a.verCostos,
        }),
      });
    }
    if (vista === "resumen") {
      if (!a.verCostos) return NextResponse.json({ success: false, error: "El resumen valorizado es solo del Administrador." }, { status: 403 });
      const desde = fecha(url.searchParams.get("desde"));
      const hasta = fecha(url.searchParams.get("hasta"));
      if (!desde || !hasta) return NextResponse.json({ success: false, error: "Elige el periodo." }, { status: 400 });
      return NextResponse.json({
        success: true,
        data: await getKardexResumen({
          desde,
          hasta,
          agrupar: url.searchParams.get("agrupar") === "sku" ? "sku" : "categoria",
          ambito: url.searchParams.get("ambito") === "Activo" ? "Activo" : "Mercadería",
        }),
      });
    }
    return NextResponse.json({ success: false, error: "Vista no válida." }, { status: 400 });
  } catch (error) {
    console.error("Error al leer el Kardex:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}

/** "Cuadrar Kardex": el Administrador deja el libro igual al inventario, con motivo. */
export async function POST(request: Request) {
  const a = await acceso();
  if (a.response) return a.response;
  if (!a.verCostos) return NextResponse.json({ success: false, error: "Solo el Administrador cuadra el Kardex." }, { status: 403 });
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const itemId = String(body.itemId ?? "");
    const motivo = String(body.motivo ?? "").trim();
    if (!/^rec[A-Za-z0-9]{14}$/.test(itemId)) return NextResponse.json({ success: false, error: "Artículo no válido." }, { status: 400 });
    if (motivo.length < 5) return NextResponse.json({ success: false, error: "Escribe el motivo (mínimo 5 caracteres)." }, { status: 400 });
    const creados = await kardexConciliar({
      itemId,
      motivoSube: "Ajuste del Kardex",
      motivoBaja: "Ajuste del Kardex",
      clave: claveKardex("ajuste-kardex", itemId, new Date().toISOString()),
      contexto: { documentoTipo: "Revisión", hechoPor: a.actor, nota: motivo },
    });
    return NextResponse.json({ success: true, data: { creados } });
  } catch (error) {
    console.error("Error al cuadrar el Kardex:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}
