import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { consumirCreditoNotaCredito } from "@/lib/facturacion/notaCredito/airtable";

export const dynamic = "force-dynamic";

// POST /api/facturacion/nota-credito/consumir
// Body: { notaCreditoRecordId, monto, facturaReemplazoRecordId }
//
// Descuenta `monto` del crédito de la NC y enlaza la factura de reemplazo. Lo
// llama el formulario DESPUÉS de que la factura de reemplazo quedó AUTORIZADA.
// Es best-effort desde la UI: si falla, la factura ya es válida — el aviso le
// dice al usuario que concilie el saldo de la NC a mano.
//
// No lleva guard de ambiente: el saldo es metadato de la propia NC (no toca
// inventario ni el libro contable compartidos), así que se rastrea igual en
// pruebas y en producción — y el flujo completo se puede probar en pruebas.

type Body = {
  notaCreditoRecordId:      string;
  monto:                    number;
  facturaReemplazoRecordId: string;
};

export async function POST(request: Request) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ success: false, error: "Body JSON inválido" }, { status: 400 });
  }

  if (!body.notaCreditoRecordId?.trim() || !body.facturaReemplazoRecordId?.trim() || !(body.monto > 0)) {
    return NextResponse.json({ success: false, error: "Faltan datos para aplicar el crédito" }, { status: 400 });
  }

  const r = await consumirCreditoNotaCredito(
    body.notaCreditoRecordId.trim(),
    body.monto,
    body.facturaReemplazoRecordId.trim()
  );

  if (!r.ok) {
    return NextResponse.json({ success: false, error: r.error }, { status: 400 });
  }
  return NextResponse.json({ success: true, data: { saldoRestante: r.saldoRestante, yaAplicada: r.yaAplicada ?? false } });
}
