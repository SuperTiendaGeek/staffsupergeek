import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { getShippingV2SessionName } from "@/lib/shipping-v2/auth";
import { responderCierrePorVenta, responderNovedadesParaVenta } from "@/lib/shipping-v2/novedades-venta-route";

export const dynamic = "force-dynamic";

// Cartel al vender (auditoría Shipping V2, punto 8b), lado Técnicos: novedades
// abiertas del repuesto que se agrega al presupuesto de una orden, y su cierre
// después de guardar la línea con éxito.
export async function GET(request: Request) {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  return responderNovedadesParaVenta(request);
}

export async function POST(request: Request) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  return responderCierrePorVenta(request, getShippingV2SessionName(session));
}
