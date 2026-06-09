import { NextResponse } from "next/server";
import { listCpuCatalogEntries } from "@/lib/shipping-v2/airtable";
import { requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { response } = await requireShippingV2Session();
  if (response) return response;

  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("query") || "";
    const entries = await listCpuCatalogEntries({ query, maxResults: 10 });

    return NextResponse.json({
      success: true,
      data: entries.map((entry) => ({
        id: entry.id,
        cpuModel: entry.cpuModel,
        cpuBrand: entry.cpuBrand,
        baseFrequency: entry.baseFrequency,
        turboFrequency: entry.turboFrequency,
        suggestedRamType: entry.suggestedRamType,
        integratedGpu: entry.integratedGpu,
        verified: entry.verified,
        sourceName: entry.sourceName,
      })),
    });
  } catch (error) {
    console.error("Error al buscar Catálogo CPUs Shipping V2:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}
