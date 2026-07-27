import { NextResponse } from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { emitirFactura, FacturacionRechazoError } from "@/lib/facturacion/emitirFactura";
import type { DatosVenta } from "@/lib/facturacion/emitirFactura";
import { buscarFacturaBloqueante } from "@/lib/facturacion/gancho/idempotencia";
import { postEmision } from "@/lib/facturacion/gancho/postEmision";
import { verificarStockDisponible, mensajeFaltantes } from "@/lib/facturacion/reglas/stock";
import { procesarPuenteFacturacion } from "@/lib/finanzas/puentes/facturacion";
import { marcarReservaFacturada } from "@/lib/facturacion/reservas/airtable";

const AMBIENTE_PRODUCCION = "2";

export const dynamic = "force-dynamic";
// La autorización puede tardar hasta 60 s; extendemos el timeout del route.
export const maxDuration = 90;

export async function POST(request: Request) {
  const { response, session } = await requireFacturacionSession();
  if (response || !session) return response ?? NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });

  let body: DatosVenta;
  try {
    body = (await request.json()) as DatosVenta;
  } catch {
    return NextResponse.json({ success: false, error: "Body JSON inválido" }, { status: 400 });
  }

  // Validaciones mínimas de servidor
  if (!body.razonSocialComprador?.trim() || !body.identificacionComprador?.trim()) {
    return NextResponse.json({ success: false, error: "Datos del comprador incompletos" }, { status: 400 });
  }
  if (!Array.isArray(body.detalles) || body.detalles.length === 0) {
    return NextResponse.json({ success: false, error: "Al menos un detalle requerido" }, { status: 400 });
  }
  if (!Array.isArray(body.pagos) || body.pagos.length === 0) {
    return NextResponse.json({ success: false, error: "Al menos una forma de pago requerida" }, { status: 400 });
  }

  // Fase 16 PR2: si viene de una orden/operación, re-verificar idempotencia
  // server-side justo antes de emitir — la UI ya lo habrá bloqueado antes
  // (en /api/facturacion/prefactura), pero la regla no puede ser saltable
  // con un request directo al API.
  if (body.origen) {
    const bloqueante = await buscarFacturaBloqueante(body.origen).catch((e) => {
      console.error("[/api/facturacion/emitir POST] error verificando idempotencia:", e);
      return null;
    });
    if (bloqueante) {
      return NextResponse.json(
        {
          success: false,
          error: `Esta ${body.origen.tipo === "orden" ? "orden" : "operación"} ya tiene una factura ` +
                 `${bloqueante.estado} (${bloqueante.numeroFactura || bloqueante.claveAcceso}).`,
        },
        { status: 409 }
      );
    }
  }

  // Fase 17.b — verificación de stock ANTES de emitir. Después de la
  // autorización del SRI la venta ya no se puede rechazar, así que esta es
  // la única puerta válida. Falla cerrado también ante un error de lectura:
  // si no se puede confirmar el stock, no se emite (una factura real sobre
  // stock no verificado es peor que pedir reintentar).
  try {
    const faltantes = await verificarStockDisponible(body.detalles);
    if (faltantes.length > 0) {
      return NextResponse.json({ success: false, error: mensajeFaltantes(faltantes) }, { status: 400 });
    }
  } catch (e) {
    console.error("[/api/facturacion/emitir POST] error verificando stock:", e);
    return NextResponse.json(
      { success: false, error: "No se pudo verificar el stock disponible. Intente de nuevo." },
      { status: 503 }
    );
  }

  try {
    const resultado = await emitirFactura({ ...body, vendedor: session.user.nombre });

    // Fase 16 PR3: post-emisión — SIEMPRE fuera de emitirFactura() (que se
    // mantiene puro) y SIEMPRE detrás de su propio try/catch: si esto falla,
    // la respuesta de la emisión no cambia — la factura ya es AUTORIZADA
    // ante el SRI. Se espera (no fire-and-forget) porque el runtime
    // serverless puede congelar la función apenas se envía la respuesta.
    if (resultado.estado === "AUTORIZADO" && body.origen && resultado.recordId) {
      try {
        await postEmision({ facturaRecordId: resultado.recordId, detalles: body.detalles, ambiente: resultado.ambiente });
      } catch (e) {
        console.error("[/api/facturacion/emitir POST] postEmision falló:", e);
      }
    }

    // Fase 20.2 — puente de ingresos, en paralelo/independiente de
    // postEmision (un fallo de inventario no debe bloquear el de finanzas
    // ni viceversa). Nunca lanza — ver lib/finanzas/puentes/facturacion.ts.
    await procesarPuenteFacturacion(resultado, body, session.user.nombre || session.user.email || "Portal");

    // Reservas — cerrar la reserva (Estado Facturada + link a la factura) solo
    // tras una emisión AUTORIZADA real (ambiente producción). En pruebas la
    // reserva NO se toca: nunca cerrar una reserva real con una factura de
    // prueba. Best-effort: un fallo aquí no altera la emisión ya autorizada.
    if (
      resultado.estado === "AUTORIZADO" &&
      resultado.recordId &&
      resultado.ambiente === AMBIENTE_PRODUCCION &&
      body.origen?.tipo === "reserva"
    ) {
      try {
        await marcarReservaFacturada(body.origen.recordId, resultado.recordId);
      } catch (e) {
        console.error("[/api/facturacion/emitir POST] marcar reserva facturada falló:", e);
      }
    }

    return NextResponse.json({ success: true, data: resultado });
  } catch (e) {
    console.error("[/api/facturacion/emitir POST]", e);
    if (e instanceof FacturacionRechazoError) {
      return NextResponse.json({ success: false, error: e.message }, { status: 400 });
    }
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error interno al emitir" },
      { status: 500 }
    );
  }
}
