import { NextResponse } from "next/server";
import { listComputerCatalogEntries } from "@/lib/shipping-v2/airtable";
import { requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { response } = await requireShippingV2Session();
  if (response) return response;

  try {
    const url = new URL(request.url);
    const brand = url.searchParams.get("brand") || "";
    const model = url.searchParams.get("model") || "";
    const entries = await listComputerCatalogEntries({ brand, model, maxResults: 10 });

    return NextResponse.json({
      success: true,
      data: entries.map((entry) => ({
        id: entry.id,
        computerModel: entry.computerModel,
        brand: entry.brand,
        suggestedScreenSize: entry.suggestedScreenSize,
        suggestedScreenResolution: entry.suggestedScreenResolution,
        suggestedOperatingSystem: entry.suggestedOperatingSystem,
        suggestedConnectivityV2Ids: entry.suggestedConnectivityV2Ids,
        suggestedPortV2Ids: entry.suggestedPortV2Ids,
        suggestedExtraFeatureV2Ids: entry.suggestedExtraFeatureV2Ids,
        batteryApplies: entry.batteryApplies,
        suggestedGpu: entry.suggestedGpu,
        verified: entry.verified,
        sourceName: entry.sourceName,
      })),
    });
  } catch (error) {
    console.error("Error al buscar Catálogo Computadores Shipping V2:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}
