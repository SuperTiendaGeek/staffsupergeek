import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { obtenerNotaCreditoPorId }   from "@/lib/facturacion/notaCredito/airtable";

export const dynamic = "force-dynamic";

// GET /api/facturacion/nota-credito/reemplazo?notaCreditoRecordId=recXXX
//
// Devuelve los datos para precargar la factura de reemplazo: el cliente de la
// NC y el crédito disponible. La factura nueva se emite por el flujo normal
// (con "Compensación de deudas" por el crédito + efectivo por la diferencia);
// el descuento del crédito lo hace /nota-credito/consumir tras autorizar.

export async function GET(request: Request) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  const recordId = new URL(request.url).searchParams.get("notaCreditoRecordId")?.trim();
  if (!recordId) {
    return NextResponse.json({ success: false, error: "Falta notaCreditoRecordId" }, { status: 400 });
  }

  try {
    const nc = await obtenerNotaCreditoPorId(recordId);
    if (!nc) {
      return NextResponse.json({ success: false, error: "Nota de crédito no encontrada" }, { status: 404 });
    }
    if (nc.estado !== "AUTORIZADO") {
      return NextResponse.json({ success: false, error: "Solo una nota de crédito AUTORIZADA tiene crédito aplicable" }, { status: 400 });
    }
    if (!(nc.saldoDisponible > 0)) {
      return NextResponse.json({ success: false, error: "Esta nota de crédito ya no tiene crédito disponible" }, { status: 400 });
    }

    // Derivar tipo de identificación del comprador (igual que en el resto del módulo).
    const ident = (nc.clienteIdentificacion ?? "").replace(/\D/g, "");
    const tipoIdentificacionComprador =
      ident === "9999999999999" ? "07" : ident.length === 13 && ident.endsWith("001") ? "04" : ident.length === 10 ? "05" : "07";

    return NextResponse.json({
      success: true,
      data: {
        notaCreditoRecordId: nc.recordId,
        numeroNotaCredito:   nc.numeroNotaCredito,
        creditoDisponible:   nc.saldoDisponible,
        cliente: {
          tipoIdentificacion: tipoIdentificacionComprador,
          identificacion:     nc.clienteIdentificacion,
          razonSocial:        nc.clienteNombre,
          correo:             nc.clienteCorreo,
          airtableId:         nc.clienteRecordId,
        },
      },
    });
  } catch (e) {
    console.error("[/api/facturacion/nota-credito/reemplazo]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error al cargar el reemplazo" },
      { status: 500 }
    );
  }
}
