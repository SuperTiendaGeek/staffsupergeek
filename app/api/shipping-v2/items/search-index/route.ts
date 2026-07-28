import { NextResponse } from "next/server";
import { getShippingV2AccessContextForSession, getShippingV2ItemSearchIndex } from "@/lib/shipping-v2/airtable";
import { requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;

  try {
    const access = await getShippingV2AccessContextForSession(session);
    const index = await getShippingV2ItemSearchIndex(access);
    return NextResponse.json(
      {
        items: index.items,
        total: index.items.length,
        generatedAt: index.generatedAt,
      },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=60",
        },
      }
    );
  } catch (error) {
    console.error("Error al obtener índice de búsqueda Shipping V2:", error);
    return NextResponse.json(
      { items: [], total: 0, generatedAt: new Date().toISOString(), error: "No se pudo cargar la búsqueda global." },
      { status: 500, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}
