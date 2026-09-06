import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { obtenerFactura, actualizarEstadoFactura } from "@/lib/facturacion/airtable/facturas";
import { actualizarEstadoAnulacion } from "@/lib/facturacion/anulaciones/airtable";
import { dentroDelPlazoAnulacion }   from "@/lib/facturacion/anulaciones/fechas";
import { revertirInventarioFacturaAnulada, revertirContableFacturaAnulada } from "@/lib/facturacion/anulaciones/reverso";
import { getFacturacionConfig }      from "@/lib/facturacion/config";
import { ahoraEnEcuador }            from "@/lib/facturacion/fechaEcuador";
import type { DetalleFactura }        from "@/lib/facturacion/types/factura";

export const dynamic = "force-dynamic";

// POST /api/facturacion/anulaciones/[recordId]
// Body: { accion: "solicitar" | "confirmar" | "rechazar" }
//
// - solicitar: registra la intención de anular en el portal SRI (Estado
//   Anulación = Solicitada). La factura sigue AUTORIZADA. Bloquea consumidor
//   final y facturas fuera de plazo.
// - confirmar: el usuario confirmó que el SRI la anuló → Estado = ANULADA +
//   reverso de inventario + devolución del dinero (Egreso). Con guard de ambiente.
// - rechazar: el SRI/receptor rechazó la anulación → la factura sigue válida.

type Body = { accion: "solicitar" | "confirmar" | "rechazar" };

function tipoIdent(ident: string): string {
  const d = (ident ?? "").replace(/\D/g, "");
  return d === "9999999999999" ? "07" : d.length === 13 && d.endsWith("001") ? "04" : d.length === 10 ? "05" : "07";
}

type LineasEnvoltorio = { detalles?: DetalleFactura[] };

export async function POST(request: Request, { params }: { params: Promise<{ recordId: string }> }) {
  const { response, session } = await requireFacturacionSession();
  if (response || !session) return response ?? NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });

  const { recordId } = await params;
  let body: Body;
  try { body = (await request.json()) as Body; } catch { return NextResponse.json({ success: false, error: "Body JSON inválido" }, { status: 400 }); }

  const factura = await obtenerFactura(recordId);
  if (!factura) return NextResponse.json({ success: false, error: "Factura no encontrada" }, { status: 404 });

  // ── Solicitar ──────────────────────────────────────────────────────────────
  if (body.accion === "solicitar") {
    if (factura.estado !== "AUTORIZADO") return NextResponse.json({ success: false, error: `Solo se puede anular una factura AUTORIZADA (estado: ${factura.estado})` }, { status: 400 });
    if (tipoIdent(factura.clienteIdentificacion) === "07") {
      return NextResponse.json({ success: false, error: "Las facturas a CONSUMIDOR FINAL no se pueden anular (regla SRI 2026). Si el cliente devuelve el equipo, se maneja administrativamente." }, { status: 400 });
    }
    const emision = new Date(`${factura.fechaEmision}T00:00:00`);
    if (!dentroDelPlazoAnulacion(emision, ahoraEnEcuador())) {
      return NextResponse.json({ success: false, error: "El plazo de anulación (día 7 del mes siguiente) ya pasó. Usa una nota de crédito para corregir esta factura." }, { status: 400 });
    }
    await actualizarEstadoAnulacion(recordId, "Solicitada", { "Fecha Solicitud Anulación": ahoraEnEcuador().toISOString().slice(0, 10) });
    return NextResponse.json({ success: true, data: { estado: "Solicitada" } });
  }

  // ── Rechazar ───────────────────────────────────────────────────────────────
  if (body.accion === "rechazar") {
    await actualizarEstadoAnulacion(recordId, "Rechazada");
    return NextResponse.json({ success: true, data: { estado: "Rechazada" } });
  }

  // ── Confirmar (el SRI la anuló) ──────────────────────────────────────────────
  if (body.accion === "confirmar") {
    const cfg = getFacturacionConfig();

    let detalles: DetalleFactura[] = [];
    try {
      const raw: unknown = JSON.parse(factura.lineasJson || "{}");
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const posiblesDetalles = (raw as LineasEnvoltorio).detalles;
        detalles = Array.isArray(posiblesDetalles) ? posiblesDetalles : [];
      } else if (Array.isArray(raw)) {
        detalles = raw as DetalleFactura[];
      }
    } catch { /* sin líneas: se anula igual, sin reverso automático */ }

    // Estado de la factura → ANULADA (ya excluida de secuenciales/idempotencia).
    await actualizarEstadoFactura(recordId, "ANULADA");
    await actualizarEstadoAnulacion(recordId, "Anulada").catch(() => {});

    // Reversos best-effort (guardados a producción por su ambiente).
    const avisos: string[] = [];
    const resultadoInventario = await revertirInventarioFacturaAnulada({
      facturaRecordId: recordId,
      detalles,
      ambiente: cfg.ambiente,
    }).catch((e): { estado: "ERROR"; detalle: string } => {
      const detalle = e instanceof Error ? e.message : String(e);
      console.error("[anulación] inventario:", e);
      return { estado: "ERROR", detalle };
    });
    if (resultadoInventario.estado === "ERROR") {
      avisos.push(`Reverso de inventario pendiente: ${resultadoInventario.detalle ?? "falló sin detalle"}. La factura ya quedó ANULADA; revisa el inventario manualmente.`);
    }

    const resultadoContable = await revertirContableFacturaAnulada({
      numeroFactura: factura.numeroFactura,
      movimientosFinancierosIds: factura.movimientosFinancierosIds,
      clienteRecordId: undefined,
      registradoPor: session.user.nombre || session.user.email || "Portal",
      ambiente: cfg.ambiente,
    });
    if (resultadoContable.estado === "OMITIDO") {
      avisos.push(resultadoContable.detalle ?? "No se creó egreso contable porque no había ingreso real enlazado.");
    }
    if (resultadoContable.estado === "ERROR") {
      avisos.push(`${resultadoContable.detalle ?? "Reverso contable falló sin detalle"}. La factura ya quedó ANULADA; revisa Finanzas manualmente.`);
    }

    return NextResponse.json({
      success: true,
      data: {
        estado: "ANULADA",
        reversos: {
          inventario: resultadoInventario,
          contable: resultadoContable,
        },
        avisos,
      },
    });
  }

  return NextResponse.json({ success: false, error: "Acción inválida" }, { status: 400 });
}
