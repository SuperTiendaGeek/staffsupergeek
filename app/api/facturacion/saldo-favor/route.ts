import { NextResponse } from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { saldoDeCliente } from "@/lib/saldo-favor/servidor";

export const dynamic = "force-dynamic";

// GET /api/facturacion/saldo-favor?clienteId=recXXX — saldo a favor del
// cliente elegido en la factura o el recibo de mostrador (auditoría ops,
// punto 13B-2). Solo lectura; el servidor de emisión vuelve a verificarlo.
export async function GET(request: Request) {
  const { response } = await requireFacturacionSession();
  if (response) return response;
  const clienteId = new URL(request.url).searchParams.get("clienteId")?.trim() ?? "";
  if (!/^rec[A-Za-z0-9]{14}$/.test(clienteId)) return NextResponse.json({ success: true, data: { disponible: 0, proximoVence: "" } });
  try {
    const s = await saldoDeCliente(clienteId);
    return NextResponse.json({ success: true, data: { disponible: s.disponible, proximoVence: s.proximoVence } });
  } catch (e) {
    console.error("[facturacion/saldo-favor] GET", e);
    return NextResponse.json({ success: false, error: "No se pudo leer el saldo a favor." }, { status: 503 });
  }
}
