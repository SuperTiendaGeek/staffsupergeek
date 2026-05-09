import { NextResponse } from "next/server";
import {
  createAbonoCotizacion,
  fetchAbonosCotizacion,
  fetchCotizacionById,
} from "@/lib/cotizaciones/airtable";
import { getSessionDisplayName, requireCotizacionesSession } from "@/lib/cotizaciones/auth";
import {
  normalizeCuentaDestinoAbonoCotizacion,
  normalizeMetodoPagoAbonoCotizacion,
} from "@/types/cotizaciones";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function GET(_request: Request, { params }: Params) {
  const { response } = await requireCotizacionesSession();
  if (response) return response;

  const { id } = await params;

  try {
    const cotizacion = await fetchCotizacionById(id);
    if (!cotizacion) {
      return NextResponse.json({ success: false, error: "Cotización no encontrada" }, { status: 404 });
    }

    const data = await fetchAbonosCotizacion(id, cotizacion.codigo);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error al cargar abonos de cotización:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireCotizacionesSession();
  if (response) return response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const monto = toNumber(body?.monto);
  const metodoPago = normalizeMetodoPagoAbonoCotizacion(body?.metodoPago);
  const cuentaDestino = normalizeCuentaDestinoAbonoCotizacion(body?.cuentaDestino);

  if (monto === null || monto <= 0) {
    return NextResponse.json(
      { success: false, error: "El monto debe ser mayor a 0." },
      { status: 400 }
    );
  }

  if (!metodoPago) {
    return NextResponse.json(
      { success: false, error: "Selecciona un método de pago válido." },
      { status: 400 }
    );
  }

  try {
    const cotizacion = await fetchCotizacionById(id);
    if (!cotizacion) {
      return NextResponse.json({ success: false, error: "Cotización no encontrada" }, { status: 404 });
    }

    const data = await createAbonoCotizacion({
      cotizacionId: id,
      itemPedidoId: cotizacion.itemPedidoId || null,
      clienteNombre: cotizacion.clienteNombre,
      fechaAbono: typeof body?.fechaAbono === "string" ? body.fechaAbono : null,
      monto,
      metodoPago,
      cuentaDestino: cuentaDestino || null,
      numeroTransaccion:
        typeof body?.numeroTransaccion === "string" ? body.numeroTransaccion : null,
      registradoPor: getSessionDisplayName(session),
      observacion: typeof body?.observacion === "string" ? body.observacion : null,
    });

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("Error al crear abono de cotización:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 500 }
    );
  }
}
