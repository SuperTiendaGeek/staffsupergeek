import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { obtenerFactura }            from "@/lib/facturacion/airtable/facturas";
import { totalAcreditadoDeFactura }  from "@/lib/facturacion/notaCredito/airtable";
import {
  construirLineaNotaCredito,
  calcularTotalesNotaCredito,
  evaluarNotaCreditoPermitida,
  validarMotivo,
} from "@/lib/facturacion/notaCredito/calculos";
import { emitirNotaCredito }         from "@/lib/facturacion/notaCredito/emitirNotaCredito";
import { ahoraEnEcuador }            from "@/lib/facturacion/fechaEcuador";
import type { DetalleFactura }       from "@/lib/facturacion/types/factura";
import type { SeleccionLinea }       from "@/lib/facturacion/notaCredito/calculos";

export const dynamic     = "force-dynamic";
export const maxDuration = 90;   // igual que la emisión de factura

// POST /api/facturacion/nota-credito/emitir
//
// Body: { facturaRecordId, motivo, lineas: SeleccionLinea[] }
//
// TODAS las reglas se revalidan aquí, server-side, aunque la UI ya las haya
// aplicado: la pantalla no es la fuente de verdad y un request directo al
// API no puede saltarse la regla de consumidor final ni el tope acreditable.
//
// Nota: los efectos internos (reverso de inventario, movimiento contable,
// abono a favor) NO están en este endpoint todavía — son el PR2 de la Fase
// 18. Hoy la NC se emite, se autoriza y se registra; el inventario y el
// libro se ajustan a mano hasta que ese PR entre.

type Body = {
  facturaRecordId: string;
  motivo:          string;
  lineas:          SeleccionLinea[];
};

type LineasJsonEnvoltorio = { version: number; detalles?: DetalleFactura[] };

export async function POST(request: Request) {
  const { response, session } = await requireFacturacionSession();
  if (response || !session) return response ?? NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ success: false, error: "Body JSON inválido" }, { status: 400 });
  }

  if (!body.facturaRecordId?.trim()) {
    return NextResponse.json({ success: false, error: "Falta la factura de origen" }, { status: 400 });
  }
  if (!Array.isArray(body.lineas) || body.lineas.length === 0) {
    return NextResponse.json({ success: false, error: "Selecciona al menos una línea a acreditar" }, { status: 400 });
  }

  const errMotivo = validarMotivo(body.motivo ?? "");
  if (errMotivo) return NextResponse.json({ success: false, error: errMotivo.motivo }, { status: 400 });

  const factura = await obtenerFactura(body.facturaRecordId);
  if (!factura) return NextResponse.json({ success: false, error: "Factura no encontrada" }, { status: 404 });

  // ── Líneas originales ──────────────────────────────────────────────────────
  let detallesOriginales: DetalleFactura[] = [];
  try {
    const raw: unknown = JSON.parse(factura.lineasJson || "[]");
    if (Array.isArray(raw)) detallesOriginales = raw as DetalleFactura[];
    else if (raw && typeof raw === "object") detallesOriginales = (raw as LineasJsonEnvoltorio).detalles ?? [];
  } catch {
    return NextResponse.json({ success: false, error: "Las líneas guardadas de la factura no se pueden leer" }, { status: 400 });
  }

  const detallesNC = [];
  for (const sel of body.lineas) {
    const original = detallesOriginales[sel.indice];
    if (!original) {
      return NextResponse.json({ success: false, error: `La línea ${sel.indice} no existe en la factura original` }, { status: 400 });
    }
    if (!(sel.cantidadAcreditada > 0) || sel.cantidadAcreditada > original.cantidad) {
      return NextResponse.json(
        { success: false, error: `Cantidad inválida para "${original.descripcion}": la factura tiene ${original.cantidad} unidad(es).` },
        { status: 400 }
      );
    }
    detallesNC.push(construirLineaNotaCredito(original, sel.cantidadAcreditada, !!sel.devolucionFisica));
  }

  const totales = calcularTotalesNotaCredito(detallesNC);

  // ── Reglas (revalidación server-side, con el monto real) ──────────────────
  const ident = (factura.clienteIdentificacion ?? "").replace(/\D/g, "");
  const tipoIdentificacionComprador =
    ident === "9999999999999" ? "07" : ident.length === 13 && ident.endsWith("001") ? "04" : ident.length === 10 ? "05" : "07";

  const totalYaAcreditado = await totalAcreditadoDeFactura(factura.numeroFactura).catch(() => {
    throw new Error("No se pudo verificar cuánto se ha acreditado ya de esta factura");
  });

  const rechazo = evaluarNotaCreditoPermitida(
    {
      estado: factura.estado,
      tipoIdentificacionComprador,
      fechaEmision: new Date(`${factura.fechaEmision}T00:00:00`),
      importeTotal: factura.total,
      totalYaAcreditado,
    },
    totales.valorModificacion,
    ahoraEnEcuador()
  );
  if (rechazo) return NextResponse.json({ success: false, error: rechazo.motivo }, { status: 400 });

  // ── Emitir ────────────────────────────────────────────────────────────────
  try {
    const resultado = await emitirNotaCredito({
      tipoIdentificacionComprador,
      razonSocialComprador:    factura.clienteNombre,
      identificacionComprador: factura.clienteIdentificacion,
      correoComprador:         factura.clienteCorreo || undefined,
      numeroFacturaModificada: factura.numeroFactura,
      fechaEmisionFactura:     new Date(`${factura.fechaEmision}T00:00:00`),
      facturaRecordId:         factura.recordId,
      motivo:                  body.motivo.trim(),
      detalles:                detallesNC,
    });

    return NextResponse.json({ success: true, data: resultado });
  } catch (e) {
    console.error("[/api/facturacion/nota-credito/emitir]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error interno al emitir la nota de crédito" },
      { status: 500 }
    );
  }
}
