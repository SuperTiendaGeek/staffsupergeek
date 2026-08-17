import { type NextRequest, NextResponse } from "next/server";
import { requireOperacionesSession } from "@/lib/operaciones/auth";
import { crearAbono, uploadComprobanteAbono } from "@/lib/operaciones/airtable";
import { crearMovimientoParaAbono } from "@/lib/finanzas/puentes/abonos";
import { requiereNumeroTransaccion } from "@/types/abonos";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { session, response } = await requireOperacionesSession();
  if (response) return response;

  const { id: operacionId } = await params;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ success: false, error: "Cuerpo de solicitud inválido." }, { status: 400 });
  }

  // ── Validate required fields ───────────────────────────────────────────────
  const montoRaw = formData.get("monto");
  const monto = typeof montoRaw === "string" ? parseFloat(montoRaw) : NaN;
  if (!isFinite(monto) || monto <= 0) {
    return NextResponse.json({ success: false, error: "El monto debe ser mayor a 0." }, { status: 400 });
  }

  const metodoPago = (formData.get("metodoPago") as string | null)?.trim() ?? "";
  if (!metodoPago) {
    return NextResponse.json({ success: false, error: "Método de pago requerido." }, { status: 400 });
  }

  const fechaAbono = (formData.get("fechaAbono") as string | null)?.trim() ?? "";
  if (!fechaAbono) {
    return NextResponse.json({ success: false, error: "Fecha de abono requerida." }, { status: 400 });
  }

  const ordenId = (formData.get("ordenId") as string | null)?.trim() || null;
  const numeroTransaccion = (formData.get("numeroTransaccion") as string | null)?.trim() || undefined;

  // La validación de pantalla no basta: un request directo la salta. Mismo
  // criterio que assertConsumidorFinalPermitido() en facturación — la regla
  // vive también en el servidor.
  if (requiereNumeroTransaccion(metodoPago) && !numeroTransaccion) {
    return NextResponse.json(
      { success: false, error: `El número de transacción es obligatorio para el método de pago "${metodoPago}".` },
      { status: 400 }
    );
  }

  const observacion = (formData.get("observacion") as string | null)?.trim() || undefined;
  const comprobanteFile = formData.get("comprobante") instanceof File
    ? (formData.get("comprobante") as File)
    : null;

  const registradoPor =
    session!.user.nombre?.trim() || session!.user.email?.trim() || "Portal";

  try {
    const { id: newId } = await crearAbono({
      monto,
      metodoPago,
      fechaAbono,
      numeroTransaccion,
      observacion,
      registradoPor,
      operacionId,
      ordenId,
    });

    // Upload comprobante to Airtable content API if provided
    if (comprobanteFile && comprobanteFile.size > 0) {
      const buffer = await comprobanteFile.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      await uploadComprobanteAbono(newId, comprobanteFile.name, comprobanteFile.type || "application/octet-stream", base64);
    }

    // Puente 20.2 — nunca bloquea el registro del abono si falla (política
    // "el registro primario nunca se bloquea", ver docs/DISENO_FASE20_2_INGRESOS.md §4).
    let warning: string | null = null;
    const puente = await crearMovimientoParaAbono({
      abonoId: newId,
      monto,
      metodoPago,
      fecha: fechaAbono,
      registradoPor,
      numeroTransaccion,
      observacion,
    });
    if (!puente.ok) warning = "No se pudo registrar el movimiento financiero de este abono.";

    return NextResponse.json({ success: true, id: newId, warning });
  } catch (err) {
    console.error("[api/operaciones/[id]/abonos] POST error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error al registrar el abono." },
      { status: 500 }
    );
  }
}
