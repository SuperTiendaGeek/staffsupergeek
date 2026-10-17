import { redirect } from "next/navigation";
import { getShippingV2AccessContextForSession, getShippingV2ItemById } from "@/lib/shipping-v2/airtable";
import { getSessionFromCookie } from "@/lib/session";
import { rutaUnidad } from "@/lib/shipping-v2/unidades-serie";

export const dynamic = "force-dynamic";

/**
 * Punto 10b-4 (17-oct-2026): la inspección técnica se mudó al artículo
 * (/shipping-v2/items/[sku]/u/[serie]/inspeccion). Esta dirección vieja solo
 * redirige, para no romper enlaces guardados.
 */
export default async function RedireccionUnidad({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const query = await searchParams;
  const session = await getSessionFromCookie();
  const access = await getShippingV2AccessContextForSession(session);
  const item = await getShippingV2ItemById(id, { includeAiName: false, access });
  redirect(rutaUnidad(item, "inspeccion", { desde: query.desde === "recepcion" ? "recepcion" : undefined }));
}
