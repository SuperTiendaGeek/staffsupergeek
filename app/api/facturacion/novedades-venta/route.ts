import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { getShippingV2SessionName } from "@/lib/shipping-v2/auth";
import { responderCierrePorVenta, responderNovedadesParaVenta } from "@/lib/shipping-v2/novedades-venta-route";

export const dynamic = "force-dynamic";

// Cartel al vender (auditoría Shipping V2, punto 8b): novedades abiertas del
// artículo que se agrega a una factura, recibo o reserva, y su cierre después
// de emitir con éxito.
export async function GET(request: Request) {
  const { response } = await requireFacturacionSession();
  if (response) return response;
  return responderNovedadesParaVenta(request);
}

export async function POST(request: Request) {
  const { response, session } = await requireFacturacionSession();
  if (response) return response;
  return responderCierrePorVenta(request, getShippingV2SessionName(session));
}
