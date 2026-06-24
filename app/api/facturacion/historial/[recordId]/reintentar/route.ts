import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { obtenerFactura }            from "@/lib/facturacion/airtable/facturas";
import { emitirFactura }             from "@/lib/facturacion/emitirFactura";
import type { DatosVenta }           from "@/lib/facturacion/emitirFactura";
import type { DetalleFactura }       from "@/lib/facturacion/types/factura";

export const dynamic    = "force-dynamic";
export const maxDuration = 90;

type Params = { params: Promise<{ recordId: string }> };

// Reintentar solo está permitido para facturas PENDIENTE, RECIBIDA o DEVUELTA.
// Para AUTORIZADO no tiene sentido y podría crear duplicados.
const ESTADOS_REINTENTABLES = new Set(["PENDIENTE", "RECIBIDA", "DEVUELTA"]);

export async function POST(req: Request, { params }: Params) {
  const { response, session } = await requireFacturacionSession();
  if (response || !session) return response ?? NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });

  const { recordId } = await params;
  const factura = await obtenerFactura(recordId);

  if (!factura) {
    return NextResponse.json({ success: false, error: "Factura no encontrada" }, { status: 404 });
  }
  if (!ESTADOS_REINTENTABLES.has(factura.estado)) {
    return NextResponse.json(
      { success: false, error: `No se puede reintentar una factura en estado ${factura.estado}` },
      { status: 400 }
    );
  }
  if (!factura.lineasJson) {
    return NextResponse.json(
      { success: false, error: "Esta factura no tiene líneas guardadas; no puede reintentarse automáticamente" },
      { status: 400 }
    );
  }

  let detalles: DetalleFactura[];
  try {
    detalles = JSON.parse(factura.lineasJson) as DetalleFactura[];
  } catch {
    return NextResponse.json(
      { success: false, error: "Líneas JSON inválidas en el registro" },
      { status: 400 }
    );
  }

  // Reconstituir totales desde las líneas almacenadas
  const totalSinImpuestos = detalles.reduce((s, d) => s + d.precioTotalSinImpuesto, 0);
  const ivaTotal          = detalles.reduce((s, d) =>
    s + d.impuestos.filter(i => i.codigo === "2").reduce((a, i) => a + i.valor, 0), 0);
  const importeTotal      = parseFloat((totalSinImpuestos + ivaTotal).toFixed(2));

  // Reconstituyendo totalConImpuestos agrupado por codigoPorcentaje
  const ivaMap = new Map<string, { base: number; valor: number; tarifa: number }>();
  for (const d of detalles) {
    for (const imp of d.impuestos.filter(i => i.codigo === "2")) {
      const key = imp.codigoPorcentaje;
      const prev = ivaMap.get(key) ?? { base: 0, valor: 0, tarifa: imp.tarifa };
      ivaMap.set(key, {
        base:   prev.base  + imp.baseImponible,
        valor:  prev.valor + imp.valor,
        tarifa: imp.tarifa,
      });
    }
  }

  const datosVenta: DatosVenta = {
    tipoIdentificacionComprador: factura.clienteIdentificacion.length === 13 ? "04" : "05",
    razonSocialComprador:        factura.clienteNombre,
    identificacionComprador:     factura.clienteIdentificacion,
    correoComprador:             factura.clienteCorreo || undefined,
    detalles,
    totalSinImpuestos,
    totalDescuento:              0,
    totalConImpuestos: [...ivaMap.entries()].map(([cp, v]) => ({
      codigo:           "2",
      codigoPorcentaje: cp,
      baseImponible:    parseFloat(v.base.toFixed(2)),
      tarifa:           v.tarifa,
      valor:            parseFloat(v.valor.toFixed(2)),
    })),
    importeTotal,
    pagos: [{ formaPago: "01", total: importeTotal }],
    vendedor: session.user.nombre,
  };

  try {
    const resultado = await emitirFactura(datosVenta);
    return NextResponse.json({ success: true, data: resultado });
  } catch (e) {
    console.error("[reintentar POST]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error al reintentar" },
      { status: 500 }
    );
  }
}
