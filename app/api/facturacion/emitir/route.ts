import { NextResponse } from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { emitirFactura, FacturacionRechazoError } from "@/lib/facturacion/emitirFactura";
import type { DatosVenta } from "@/lib/facturacion/emitirFactura";
import { buscarDocumentoBloqueante } from "@/lib/facturacion/gancho/idempotencia";
import { getCuentaUnificada } from "@/lib/cuenta-unificada";
import { mensajeAprobadoSinArticulo, MENSAJE_NO_SE_PUDO_VERIFICAR } from "@/lib/facturacion/reglas/aprobadoSinArticulo";
import { ejecutarEfectosPostAutorizacion } from "@/lib/facturacion/gancho/efectosPostAutorizacion";
import {
  agregarNotaAuditoriaFactura,
  assertBorradorDisponibleParaEmision,
  BorradorConsumidoError,
  BorradorNoDisponibleError,
  buscarFacturaDuplicadaReciente,
  debeBloquearFacturaDuplicadaReciente,
  marcarBorradorConsumido,
  obtenerBorradorParaEmision,
  VENTANA_DUPLICADO_FACTURA_MINUTOS,
} from "@/lib/facturacion/airtable/facturas";
import { verificarStockDisponible, mensajeFaltantes } from "@/lib/facturacion/reglas/stock";
import { verificarArticulosEntregables, mensajeNoEntregables } from "@/lib/facturacion/reglas/entregables";
import { verificarProductosDigitalesDisponibles, mensajeProductosDigitalesNoDisponibles } from "@/lib/facturacion/reglas/productosDigitalesDisponibles";
import { mensajePrecioShippingItemInvalido } from "@/lib/facturacion/reglas/preciosShippingItems";
import { mensajeReferenciaPagoFaltante } from "@/lib/facturacion/reglas/referenciaPago";

const CODIGO_DUPLICADO_RECIENTE = "POSIBLE_FACTURA_DUPLICADA_RECIENTE";

type BodyEmitirFactura = DatosVenta & {
  borradorOrigenId?: unknown;
  confirmadoNoEsDuplicado?: unknown;
};

function textoRecordId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function minutosDesde(iso: string, ahora = new Date()): number {
  const diff = ahora.getTime() - new Date(iso).getTime();
  return Math.max(0, Math.floor(diff / 60_000));
}

function etiquetaMinutos(minutos: number): string {
  return minutos <= 0 ? "menos de 1 minuto" : `${minutos} minuto${minutos === 1 ? "" : "s"}`;
}

function horaEcuador(iso: string): string {
  return new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function emisionConsumeBorrador(estado: string): boolean {
  return estado === "AUTORIZADO" || estado === "EN PROCESAMIENTO";
}

export const dynamic = "force-dynamic";
// La autorización puede tardar hasta 60 s; extendemos el timeout del route.
export const maxDuration = 90;

export async function POST(request: Request) {
  const { response, session } = await requireFacturacionSession();
  if (response || !session) return response ?? NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });

  let body: BodyEmitirFactura;
  try {
    body = (await request.json()) as BodyEmitirFactura;
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
  const errorPrecioShipping = mensajePrecioShippingItemInvalido(body.detalles);
  if (errorPrecioShipping) {
    return NextResponse.json({ success: false, error: errorPrecioShipping }, { status: 400 });
  }
  // La validación de pantalla no basta: un request directo la salta. Mismo
  // criterio que assertConsumidorFinalPermitido() en facturación — la
  // regla vive también en el servidor.
  const errorReferenciaPago = mensajeReferenciaPagoFaltante(body.pagos);
  if (errorReferenciaPago) {
    return NextResponse.json({ success: false, error: errorReferenciaPago }, { status: 400 });
  }

  const borradorOrigenId = textoRecordId(body.borradorOrigenId);
  if (borradorOrigenId) {
    try {
      const borrador = await obtenerBorradorParaEmision(borradorOrigenId);
      assertBorradorDisponibleParaEmision(borrador);
    } catch (e) {
      console.error("[/api/facturacion/emitir POST] borrador de origen no disponible:", e);
      if (e instanceof BorradorConsumidoError) {
        return NextResponse.json({ success: false, error: e.message }, { status: 409 });
      }
      if (e instanceof BorradorNoDisponibleError) {
        return NextResponse.json({ success: false, error: e.message }, { status: 409 });
      }
      return NextResponse.json(
        { success: false, error: "No se pudo leer el borrador de origen. No se emitió la factura." },
        { status: 503 }
      );
    }
  }

  // Fase 16 PR2: si viene de una orden/operación, re-verificar idempotencia
  // server-side justo antes de emitir — la UI ya lo habrá bloqueado antes
  // (en /api/facturacion/prefactura), pero la regla no puede ser saltable
  // con un request directo al API.
  if (body.origen) {
    // Fail-closed: si no se puede confirmar que la orden NO tiene ya una
    // factura o recibo, no se emite. Antes el error se tomaba como "no hay"
    // y un 503 de Airtable en este instante podía producir una segunda
    // factura real ante el SRI.
    let bloqueante: Awaited<ReturnType<typeof buscarDocumentoBloqueante>>;
    try {
      bloqueante = await buscarDocumentoBloqueante(body.origen);
    } catch (e) {
      console.error("[/api/facturacion/emitir POST] error verificando idempotencia:", e);
      return NextResponse.json(
        { success: false, error: "No se pudo verificar si esta cuenta ya tiene una factura o un recibo. No se emitió nada; intenta de nuevo." },
        { status: 503 }
      );
    }
    if (bloqueante) {
      const etiquetaOrigen = body.origen.tipo === "orden" ? "orden" : "operación";
      // El recibo interno bloquea igual que una factura: cierra la cuenta y
      // ya descontó inventario y registró el ingreso.
      const detalle =
        bloqueante.tipo === "factura"
          ? `una factura ${bloqueante.factura.estado} (${bloqueante.factura.numeroFactura || bloqueante.factura.claveAcceso})`
          : `un recibo ${bloqueante.recibo.estado} (${bloqueante.recibo.numero})`;
      return NextResponse.json(
        { success: false, error: `Esta ${etiquetaOrigen} ya tiene ${detalle}.` },
        { status: 409 }
      );
    }
    // Fase 3b: la factura espera a que exista el artículo de todo lo aprobado.
    const pendientesArticulo = await getCuentaUnificada(body.origen.tipo === "orden" ? { ordenId: body.origen.recordId } : { operacionId: body.origen.recordId })
      .then((c) => mensajeAprobadoSinArticulo(c.aprobadoSinArticulo, "factura"))
      .catch((e) => {
        console.error("[/api/facturacion/emitir POST] error verificando aprobado sin artículo:", e);
        return MENSAJE_NO_SE_PUDO_VERIFICAR;
      });
    if (pendientesArticulo) {
      return NextResponse.json({ success: false, error: pendientesArticulo }, { status: 409 });
    }
  }

  let duplicadoConfirmado = null as Awaited<ReturnType<typeof buscarFacturaDuplicadaReciente>>;
  try {
    duplicadoConfirmado = await buscarFacturaDuplicadaReciente({
      clienteIdentificacion: body.identificacionComprador,
      total: body.importeTotal,
    });
  } catch (e) {
    console.error("[/api/facturacion/emitir POST] error verificando duplicados recientes:", e);
    return NextResponse.json(
      { success: false, error: "No se pudo verificar si ya existe una factura reciente para este cliente y monto. Intente de nuevo." },
      { status: 503 }
    );
  }
  if (duplicadoConfirmado && debeBloquearFacturaDuplicadaReciente(duplicadoConfirmado, body.confirmadoNoEsDuplicado === true)) {
    const minutos = minutosDesde(duplicadoConfirmado.creadaIso);
    const numero = duplicadoConfirmado.numeroFactura || duplicadoConfirmado.recordId;
    return NextResponse.json(
      {
        success: false,
        code: CODIGO_DUPLICADO_RECIENTE,
        error:
          `Hace ${etiquetaMinutos(minutos)} emitiste la factura ${numero} a este mismo cliente por el mismo monto ` +
          `(${duplicadoConfirmado.estado}, ${horaEcuador(duplicadoConfirmado.creadaIso)}). ¿Es una venta distinta?`,
        data: {
          numeroFactura: numero,
          estado: duplicadoConfirmado.estado,
          hora: horaEcuador(duplicadoConfirmado.creadaIso),
          minutosDesdeEmision: minutos,
          clienteIdentificacion: duplicadoConfirmado.clienteIdentificacion,
          clienteNombre: duplicadoConfirmado.clienteNombre,
          total: duplicadoConfirmado.total,
          recordId: duplicadoConfirmado.recordId,
          ventanaMinutos: VENTANA_DUPLICADO_FACTURA_MINUTOS,
        },
      },
      { status: 409 }
    );
  }

  // Fase 17.b — verificación de stock ANTES de emitir. Después de la
  // autorización del SRI la venta ya no se puede rechazar, así que esta es
  // la única puerta válida. Falla cerrado también ante un error de lectura:
  // si no se puede confirmar el stock, no se emite (una factura real sobre
  // stock no verificado es peor que pedir reintentar).
  try {
    const faltantes = await verificarStockDisponible(body.detalles, { soloUnidadesLibres: !body.origen });
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

  // Auditoría Shipping V2, punto 1 — solo se factura lo que ya está en la
  // tienda (Recibido + inspección firmada si la requiere), venga de donde
  // venga la factura. Reservar algo en camino sí se puede; facturarlo no.
  // Misma puerta y mismo fail-closed que el stock de arriba.
  try {
    const noEntregables = await verificarArticulosEntregables(body.detalles);
    if (noEntregables.length > 0) {
      return NextResponse.json({ success: false, error: mensajeNoEntregables(noEntregables) }, { status: 409 });
    }
  } catch (e) {
    console.error("[/api/facturacion/emitir POST] error verificando que los artículos estén en tienda:", e);
    return NextResponse.json(
      { success: false, error: "No se pudo verificar que los artículos ya estén en la tienda. Intente de nuevo." },
      { status: 503 }
    );
  }

  // Productos digitales — misma puerta, mismo espíritu que el stock de
  // arriba, pero por Estado/vinculación a orden en vez de cantidad (ver
  // lib/facturacion/reglas/productosDigitalesDisponibles.ts). El filtro del
  // buscador es cosmético; esta es la verificación que de verdad puede
  // bloquear la emisión.
  //
  // ordenOrigenId: solo cuando la factura viene de una orden — para
  // cualquier otro origen (operación, reserva) o mostrador (sin origen),
  // los productos digitales solo cuelgan de órdenes, así que se trata igual
  // que mostrador (null): cualquier vinculación a una orden bloquea.
  try {
    const ordenOrigenId = body.origen?.tipo === "orden" ? body.origen.recordId : null;
    const noDisponibles = await verificarProductosDigitalesDisponibles(body.detalles, ordenOrigenId);
    if (noDisponibles.length > 0) {
      return NextResponse.json({ success: false, error: mensajeProductosDigitalesNoDisponibles(noDisponibles) }, { status: 400 });
    }
  } catch (e) {
    console.error("[/api/facturacion/emitir POST] error verificando productos digitales:", e);
    return NextResponse.json(
      { success: false, error: "No se pudo verificar la disponibilidad de los productos digitales. Intente de nuevo." },
      { status: 503 }
    );
  }

  try {
    const resultado = await emitirFactura({ ...body, vendedor: session.user.nombre });

    if (borradorOrigenId && emisionConsumeBorrador(resultado.estado)) {
      try {
        await marcarBorradorConsumido(borradorOrigenId, resultado.numeroFactura);
      } catch (e) {
        console.error("[/api/facturacion/emitir POST] marcar borrador consumido falló:", e);
      }
    }

    if (body.confirmadoNoEsDuplicado === true && duplicadoConfirmado && resultado.recordId && emisionConsumeBorrador(resultado.estado)) {
      try {
        const numeroDuplicado = duplicadoConfirmado.numeroFactura || duplicadoConfirmado.recordId;
        await agregarNotaAuditoriaFactura(
          resultado.recordId,
          `[AUDITORIA] ${new Date().toISOString()} — Se confirmó manualmente que la factura ${resultado.numeroFactura} ` +
          `era una venta distinta de ${numeroDuplicado}, emitida hace ${etiquetaMinutos(minutosDesde(duplicadoConfirmado.creadaIso))} ` +
          `al mismo cliente por el mismo monto.`
        );
      } catch (e) {
        console.error("[/api/facturacion/emitir POST] auditoría de confirmación de duplicado falló:", e);
      }
    }

    // Efectos posteriores a la autorización (inventario, Finanzas, reserva).
    // SIEMPRE fuera de emitirFactura() (que se mantiene puro) y nunca lanzan:
    // la factura ya es AUTORIZADA ante el SRI aunque esto falle. Se espera
    // (no fire-and-forget) porque el runtime serverless puede congelar la
    // función apenas se envía la respuesta. Es el MISMO punto de entrada que
    // usan "Consultar estado", recuperar y reintentar (ver
    // lib/facturacion/gancho/efectosPostAutorizacion.ts): antes estos pasos
    // vivían solo aquí y una factura autorizada por otro camino quedaba sin
    // descargar inventario (factura 001-002-000000755).
    await ejecutarEfectosPostAutorizacion({
      resultado,
      datos:         body,
      registradoPor: session.user.nombre || session.user.email || "Portal",
    });

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
