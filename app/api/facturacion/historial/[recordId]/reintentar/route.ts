import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { obtenerFactura }            from "@/lib/facturacion/airtable/facturas";
import { emitirFactura, FacturacionRechazoError } from "@/lib/facturacion/emitirFactura";
import type { DatosVenta, OrigenGancho } from "@/lib/facturacion/emitirFactura";
import type { DetalleFactura, Pago } from "@/lib/facturacion/types/factura";
import { procesarPuenteFacturacion } from "@/lib/finanzas/puentes/facturacion";

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

  // Fase 20.2 — fix del bug preexistente: "Líneas JSON" es el objeto
  // envoltorio { version, detalles, formaPago, pagos, infoAdicional, origen }
  // (ver emitirFactura.ts), nunca un array de DetalleFactura directo. Leerlo
  // como si fuera el array (el comportamiento viejo) rompía en tiempo de
  // ejecución en cuanto alguien reintentaba de verdad. De paso, se recupera
  // `pagos` (el array completo, si la factura se emitió después de este fix)
  // y `origen` (para que un reintento exitoso de una factura del gancho
  // todavía dispare el Puente 2 de Fase 20.2).
  let payload: { detalles: DetalleFactura[]; pagos?: Pago[]; origen?: OrigenGancho };
  try {
    const parsed = JSON.parse(factura.lineasJson) as {
      detalles?: DetalleFactura[];
      pagos?: Pago[];
      origen?: OrigenGancho;
    };
    if (!Array.isArray(parsed.detalles)) throw new Error("sin detalles");
    payload = { detalles: parsed.detalles, pagos: parsed.pagos, origen: parsed.origen };
  } catch {
    return NextResponse.json(
      { success: false, error: "Líneas JSON inválidas en el registro" },
      { status: 400 }
    );
  }
  const { detalles, origen } = payload;

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
    // `pagos` completo si la factura ya se emitió con el fix de 20.2; fallback
    // al hardcode legacy solo para facturas emitidas antes de este fix, que
    // nunca guardaron el array completo (perdían la forma de pago real de
    // todas formas — este fallback no empeora nada, documenta el límite).
    pagos: payload.pagos && payload.pagos.length > 0 ? payload.pagos : [{ formaPago: "01", total: importeTotal }],
    vendedor: session.user.nombre,
    origen,
  };

  try {
    const resultado = await emitirFactura(datosVenta);
    // Fase 20.2 — mismo puente que /api/facturacion/emitir; sin esto, un
    // reintento exitoso de una factura con abonos nunca los marcaría como
    // facturados (el `origen` reconstruido arriba es justamente para esto).
    await procesarPuenteFacturacion(resultado, datosVenta, session.user.nombre || session.user.email || "Portal");
    return NextResponse.json({ success: true, data: resultado });
  } catch (e) {
    console.error("[reintentar POST]", e);
    if (e instanceof FacturacionRechazoError) {
      return NextResponse.json({ success: false, error: e.message }, { status: 400 });
    }
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error al reintentar" },
      { status: 500 }
    );
  }
}
