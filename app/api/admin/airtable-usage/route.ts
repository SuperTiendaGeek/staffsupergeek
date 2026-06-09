import { NextResponse } from "next/server";
import { getAirtableUsageReport } from "@/lib/admin/airtable-usage";
import { requireAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const { response } = await requireAdminSession();
  if (response) return response;

  try {
    const report = await getAirtableUsageReport();
    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    console.error("Error al calcular uso de Airtable:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "No se pudo calcular el uso de Airtable" },
      { status: 500 }
    );
  }
}
