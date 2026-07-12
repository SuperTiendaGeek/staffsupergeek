import { NextResponse } from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { emitirFactura, FacturacionRechazoError } from "@/lib/facturacion/emitirFactura";
import type { DatosVenta } from "@/lib/facturacion/emitirFactura";
import { buscarFacturaBloqueante } from "@/lib/facturacion/gancho/idempotencia";
import { postEmision } from "@/lib/facturacion/gancho/postEmision";
import { procesarPuenteFacturacion } from "@/lib/finanzas/puentes/facturacion";

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

  try {
    const resultado = await emitirFactura({ ...body, vendedor: session.user.nombre });

    // Fase 16 PR3: post-emisión — SIEMPRE fuera de emitirFactura() (que se
    // mantiene puro) y SIEMPRE detrás de su propio try/catch: si esto falla,
    // la respuesta de la emisión no cambia — la factura ya es AUTORIZADA
    // ante el SRI. Se espera (no fire-and-forget) porque el runtime
    // serverless puede congelar la función apenas se envía la respuesta.
    if (resultado.estado === "AUTORIZADO" && body.origen && resultado.recordId) {
      try {
        await postEmision({ facturaRecordId: resultado.recordId, detalles: body.detalles });
      } catch (e) {
        console.error("[/api/facturacion/emitir POST] postEmision falló:", e);
      }
    }

    // Fase 20.2 — puente de ingresos, en paralelo/independiente de
    // postEmision (un fallo de inventario no debe bloquear el de finanzas
    // ni viceversa). Nunca lanza — ver lib/finanzas/puentes/facturacion.ts.
    await procesarPuenteFacturacion(resultado, body, session.user.nombre || session.user.email || "Portal");

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
