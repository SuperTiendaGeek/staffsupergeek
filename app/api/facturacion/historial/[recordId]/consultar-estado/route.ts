import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { obtenerFactura, actualizarEstadoFactura } from "@/lib/facturacion/airtable/facturas";
import { getFacturacionConfig }      from "@/lib/facturacion/config";
import { consultarAutorizacion }     from "@/lib/facturacion/sri/autorizacion";
import { recuperarFacturaAutorizadaPorClave } from "@/lib/facturacion/almacenamiento/recuperar";
import { explicarMensajesSri }       from "@/lib/facturacion/sri/errores";

export const dynamic     = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ recordId: string }> };

// POST /api/facturacion/historial/[recordId]/consultar-estado
//
// Vuelve a PREGUNTARLE al SRI por una factura que quedó sin resolver. No
// reenvía nada, no vuelve a firmar y no toca el número.
//
// ─── Por qué existe ──────────────────────────────────────────────────────────
//
// Cuando el SRI tarda más de 60 segundos, el comprobante YA está allá con su
// número y su clave. Reenviarlo crearía un duplicado. Lo correcto es esperar y
// volver a consultar la misma clave hasta que haya una respuesta definitiva —
// que es justo lo que hace este endpoint, y lo que el usuario dispara desde el
// historial con el botón "Consultar estado".
//
// Estados desde los que tiene sentido consultar: los que no son definitivos.

const CONSULTABLES = new Set(["PENDIENTE", "RECIBIDA", "EN PROCESAMIENTO"]);

export async function POST(_req: Request, { params }: Params) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  const { recordId } = await params;
  const factura = await obtenerFactura(recordId);

  if (!factura) {
    return NextResponse.json({ success: false, error: "Factura no encontrada" }, { status: 404 });
  }

  if (factura.estado === "AUTORIZADO") {
    return NextResponse.json({
      success: true,
      data: { estado: "AUTORIZADO", cambio: false, mensaje: "Esta factura ya está autorizada." },
    });
  }

  if (!CONSULTABLES.has(factura.estado)) {
    return NextResponse.json(
      {
        success: false,
        error:
          `Esta factura está en estado ${factura.estado}, que ya es una respuesta definitiva del SRI. ` +
          `Consultar de nuevo no la va a cambiar.`,
      },
      { status: 400 }
    );
  }

  if (!factura.claveAcceso) {
    return NextResponse.json(
      { success: false, error: "Esta factura no tiene clave de acceso; no se puede consultar al SRI." },
      { status: 400 }
    );
  }

  try {
    const cfg = getFacturacionConfig();
    const autorizacion = await consultarAutorizacion(factura.claveAcceso, cfg);

    // ── Sigue en proceso ─────────────────────────────────────────────────────
    if (autorizacion.estado === "EN PROCESAMIENTO") {
      return NextResponse.json({
        success: true,
        data: {
          estado: "EN PROCESAMIENTO",
          cambio: false,
          mensaje:
            "El SRI todavía la está procesando. No se ha perdido nada: vuelve a consultar en unos " +
            "minutos. No emitas otra factura por esta venta — duplicarías el documento.",
        },
      });
    }

    // ── Autorizada ───────────────────────────────────────────────────────────
    if (autorizacion.estado === "AUTORIZADO") {
      // recuperarFacturaAutorizadaPorClave hace el trabajo completo a partir
      // del XML que devuelve el propio SRI: guarda el comprobante, genera el
      // RIDE y deja el registro al día. Es el mismo camino de recuperación que
      // ya existía para facturas perdidas.
      const recuperacion = await recuperarFacturaAutorizadaPorClave(factura.claveAcceso);
      return NextResponse.json({
        success: true,
        data: {
          estado:        "AUTORIZADO",
          cambio:        true,
          numeroFactura: recuperacion.numeroFactura,
          mensaje:       "El SRI autorizó la factura. Ya está completa en el historial, con su RIDE.",
        },
      });
    }

    // ── No autorizada — respuesta definitiva ────────────────────────────────
    const mensajes   = "mensajes" in autorizacion ? autorizacion.mensajes ?? [] : [];
    const explicacion = explicarMensajesSri(mensajes);

    await actualizarEstadoFactura(recordId, "NO AUTORIZADO").catch((e) => {
      console.error("[consultar-estado] no se pudo actualizar el estado:", e);
    });

    return NextResponse.json({
      success: true,
      data: {
        estado:  "NO AUTORIZADO",
        cambio:  true,
        mensaje: "El SRI no autorizó la factura.",
        motivos: explicacion,
      },
    });
  } catch (e) {
    console.error("[consultar-estado]", e);
    return NextResponse.json(
      {
        success: false,
        error:
          "No se pudo consultar al SRI en este momento. La factura sigue guardada con su número y " +
          "su clave; vuelve a intentarlo en unos minutos.",
      },
      { status: 503 }
    );
  }
}
