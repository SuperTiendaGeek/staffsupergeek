import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { obtenerFactura }            from "@/lib/facturacion/airtable/facturas";
import { postEmision }               from "@/lib/facturacion/gancho/postEmision";
import type { DetalleFactura }       from "@/lib/facturacion/types/factura";
import type { OrigenGancho }         from "@/lib/facturacion/emitirFactura";

export const dynamic    = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ recordId: string }> };

// lineasJson version >= 3 (emitirFactura.ts) es un OBJETO envoltorio
// {version, detalles, formaPago, infoAdicional, origen} — nunca un array
// bare. (El endpoint /reintentar tiene un bug preexistente que lo trata como
// array; ver docs/DISENO_FASE16_GANCHO_FACTURACION.md — no reproducido aquí.)
type LineasJsonEnvoltorio = {
  version:   number;
  detalles?: DetalleFactura[];
  origen?:   OrigenGancho;
};

// Reintentar sincronización solo tiene sentido para facturas ya AUTORIZADAS
// con origen (gancho) — mostrador nunca dispara postEmision.
export async function POST(_req: Request, { params }: Params) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  const { recordId } = await params;
  const factura = await obtenerFactura(recordId);

  if (!factura) {
    return NextResponse.json({ success: false, error: "Factura no encontrada" }, { status: 404 });
  }
  if (factura.estado !== "AUTORIZADO") {
    return NextResponse.json(
      { success: false, error: `Solo se puede sincronizar una factura AUTORIZADA (estado actual: ${factura.estado})` },
      { status: 400 }
    );
  }
  if (!factura.lineasJson) {
    return NextResponse.json(
      { success: false, error: "Esta factura no tiene líneas guardadas; no puede sincronizarse" },
      { status: 400 }
    );
  }

  let payload: LineasJsonEnvoltorio;
  try {
    const raw: unknown = JSON.parse(factura.lineasJson);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return NextResponse.json(
        { success: false, error: "Esta factura es de mostrador o de una versión anterior (sin origen) — nada que sincronizar" },
        { status: 400 }
      );
    }
    payload = raw as LineasJsonEnvoltorio;
  } catch {
    return NextResponse.json({ success: false, error: "Líneas JSON inválidas en el registro" }, { status: 400 });
  }

  if (!payload.origen) {
    return NextResponse.json(
      { success: false, error: "Esta factura es de mostrador (sin origen) — no dispara sincronización de inventario" },
      { status: 400 }
    );
  }
  if (!Array.isArray(payload.detalles)) {
    return NextResponse.json({ success: false, error: "Líneas JSON sin detalles" }, { status: 400 });
  }

  try {
    const resultado = await postEmision({
      facturaRecordId: recordId,
      detalles:        payload.detalles,
      ambiente:        factura.ambiente === "PRODUCCIÓN" ? "2" : "1",
    });
    return NextResponse.json({ success: true, data: resultado });
  } catch (e) {
    console.error("[/sincronizar POST]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error al sincronizar" },
      { status: 500 }
    );
  }
}
