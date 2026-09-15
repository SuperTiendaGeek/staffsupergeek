import { NextResponse } from "next/server";
import { getShippingV2AccessContextForSession, transitionShippingV2Novedad } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function parseMonto(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseValores(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, raw]) => typeof raw === "string")
      .map(([key, raw]) => [key, String(raw).trim()])
  );
}

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const access = await getShippingV2AccessContextForSession(session);

    // La validación real (qué transición vale desde qué estado, qué campos
    // exige, qué es solo de admin) vive en lib/shipping-v2/novedades.ts y la
    // aplica transitionShippingV2Novedad. Aquí solo se limpia la entrada.
    const resultado = await transitionShippingV2Novedad(id, {
      accion: String(body.accion ?? ""),
      valores: parseValores(body.valores),
      solucion: typeof body.solucion === "string" ? body.solucion : undefined,
      cerrarDirecto: body.cerrarDirecto === true,
      montoReclamado: parseMonto(body.montoReclamado),
      montoRecuperado: parseMonto(body.montoRecuperado),
      actor: getShippingV2SessionName(session),
      access,
      isSiteAdmin: access.isSiteAdmin,
    });

    return NextResponse.json({ success: true, data: resultado });
  } catch (error) {
    console.error("Error al cambiar estado de novedad Shipping V2:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 400 }
    );
  }
}
