import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { obtenerFactura }            from "@/lib/facturacion/airtable/facturas";
import { totalAcreditadoDeFactura }  from "@/lib/facturacion/notaCredito/airtable";
import { evaluarNotaCreditoPermitida } from "@/lib/facturacion/notaCredito/calculos";
import { ahoraEnEcuador }            from "@/lib/facturacion/fechaEcuador";
import type { DetalleFactura }       from "@/lib/facturacion/types/factura";

export const dynamic = "force-dynamic";

// GET /api/facturacion/nota-credito/prefactura?facturaRecordId=recXXX
//
// Carga la factura original y devuelve lo necesario para armar la NC en la
// UI: sus líneas (con tarifa de IVA original — nunca se re-teclean), los
// datos del comprador y el resultado de las reglas. Si la factura no admite
// NC, devuelve bloqueado:true con el motivo, y la UI no muestra formulario.

type LineasJsonEnvoltorio = { version: number; detalles?: DetalleFactura[] };

export async function GET(request: Request) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  const facturaRecordId = new URL(request.url).searchParams.get("facturaRecordId")?.trim();
  if (!facturaRecordId) {
    return NextResponse.json({ success: false, error: "Falta facturaRecordId" }, { status: 400 });
  }

  const factura = await obtenerFactura(facturaRecordId);
  if (!factura) {
    return NextResponse.json({ success: false, error: "Factura no encontrada" }, { status: 404 });
  }

  // Las líneas viven en "Líneas JSON". Formato envoltorio {version, detalles}
  // desde v2; las facturas más viejas guardaban el array bare.
  let detalles: DetalleFactura[] = [];
  if (factura.lineasJson) {
    try {
      const raw: unknown = JSON.parse(factura.lineasJson);
      if (Array.isArray(raw)) detalles = raw as DetalleFactura[];
      else if (raw && typeof raw === "object") detalles = (raw as LineasJsonEnvoltorio).detalles ?? [];
    } catch {
      return NextResponse.json(
        { success: false, error: "Las líneas guardadas de esta factura no se pueden leer; no es posible armar la nota de crédito automáticamente." },
        { status: 400 }
      );
    }
  }
  if (detalles.length === 0) {
    return NextResponse.json(
      { success: false, error: "Esta factura no tiene líneas guardadas; no se puede armar una nota de crédito desde el sistema." },
      { status: 400 }
    );
  }

  // El tipo de identificación no se guarda como tal en la factura: se deriva
  // de la identificación, igual que en el gancho (13 dígitos terminados en
  // 001 = RUC, 10 = cédula, 9999999999999 = consumidor final).
  const ident = (factura.clienteIdentificacion ?? "").replace(/\D/g, "");
  const tipoIdentificacionComprador =
    ident === "9999999999999" ? "07" : ident.length === 13 && ident.endsWith("001") ? "04" : ident.length === 10 ? "05" : "07";

  const totalYaAcreditado = await totalAcreditadoDeFactura(factura.numeroFactura).catch(() => 0);

  const rechazo = evaluarNotaCreditoPermitida(
    {
      estado: factura.estado,
      tipoIdentificacionComprador,
      fechaEmision: new Date(`${factura.fechaEmision}T00:00:00`),
      importeTotal: factura.total,
      totalYaAcreditado,
    },
    // En esta etapa solo se valida la elegibilidad de la factura; el monto
    // real se revalida al emitir, cuando el usuario ya eligió las líneas.
    0.01,
    ahoraEnEcuador()
  );

  if (rechazo) {
    return NextResponse.json({ success: true, data: { bloqueado: true, motivo: rechazo.motivo } });
  }

  return NextResponse.json({
    success: true,
    data: {
      bloqueado: false,
      factura: {
        recordId:              factura.recordId,
        numeroFactura:         factura.numeroFactura,
        fechaEmision:          factura.fechaEmision,
        clienteNombre:         factura.clienteNombre,
        clienteIdentificacion: factura.clienteIdentificacion,
        clienteCorreo:         factura.clienteCorreo,
        tipoIdentificacionComprador,
        total:                 factura.total,
        totalYaAcreditado,
        disponibleAcreditar:   Math.round((factura.total - totalYaAcreditado + Number.EPSILON) * 100) / 100,
      },
      detalles,
    },
  });
}
