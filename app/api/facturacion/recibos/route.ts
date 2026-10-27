import { NextResponse }              from "next/server";
import { cerrarOperacionesDeLaCuenta } from "@/lib/facturacion/gancho/cierreCuenta";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { crearRecibo, adjuntarPdfRecibo, listarRecibos } from "@/lib/facturacion/recibos/airtable";
import { descontarInventarioRecibo, registrarIngresoRecibo, marcarProductosDigitalesRecibo } from "@/lib/facturacion/recibos/efectos";
import { actualizarEfectosRecibo } from "@/lib/facturacion/recibos/airtable";
import { buscarDocumentoBloqueante, etiquetaDondeEstaElDocumento } from "@/lib/facturacion/gancho/idempotencia";
import { getCuentaUnificada } from "@/lib/cuenta-unificada";
import { mensajeAprobadoSinArticulo, MENSAJE_NO_SE_PUDO_VERIFICAR } from "@/lib/facturacion/reglas/aprobadoSinArticulo";
import { procesarPuenteRecibo } from "@/lib/finanzas/puentes/recibo";
import { generarReciboPdf }          from "@/lib/facturacion/recibos/pdf";
import { verificarStockDisponible, mensajeFaltantes } from "@/lib/facturacion/reglas/stock";
import { verificarProductosDigitalesDisponibles, mensajeProductosDigitalesNoDisponibles } from "@/lib/facturacion/reglas/productosDigitalesDisponibles";
import { verificarArticulosEntregables, mensajeNoEntregables } from "@/lib/facturacion/reglas/entregables";
import { mensajePrecioShippingItemInvalido } from "@/lib/facturacion/reglas/preciosShippingItems";
import { getFacturacionConfig }      from "@/lib/facturacion/config";
import { ahoraEnEcuador }            from "@/lib/facturacion/fechaEcuador";
import type { CrearReciboInput }     from "@/lib/facturacion/recibos/types";
import type { DetalleFactura }       from "@/lib/facturacion/types/factura";
import { esLineaAdicional }          from "@/lib/facturacion/reglas/cobroDocumento";
import { validarEmisionDesdeOrigen } from "@/lib/facturacion/gancho/cobroOrigen";
import { totalLinea, round2 }        from "@/lib/facturacion/recibos/calculos";

/** Código SRI que se imprime en el recibo: el del cobro más grande. */
function formaPagoPrincipal(pagos: Array<{ formaPago: string; total: number }>): string {
  return [...pagos].sort((a, b) => b.total - a.total)[0]?.formaPago ?? "01";
}

export const dynamic     = "force-dynamic";
export const maxDuration = 60;

// GET — listado
export async function GET(request: Request) {
  const { response } = await requireFacturacionSession();
  if (response) return response;
  const q = new URL(request.url).searchParams;
  try {
    const data = await listarRecibos({ cliente: q.get("cliente")?.trim() || undefined, numero: q.get("numero")?.trim() || undefined, estado: q.get("estado")?.trim() || undefined });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Error al listar recibos" }, { status: 500 });
  }
}

// POST — crear (verifica stock, guarda, PDF, descuenta inventario, registra ingreso)
export async function POST(request: Request) {
  const { response, session } = await requireFacturacionSession();
  if (response || !session) return response ?? NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });

  let body: CrearReciboInput;
  try { body = (await request.json()) as CrearReciboInput; }
  catch { return NextResponse.json({ success: false, error: "Body JSON inválido" }, { status: 400 }); }

  if (!body.cliente?.razonSocial?.trim()) return NextResponse.json({ success: false, error: "Falta el nombre del cliente" }, { status: 400 });
  if (!Array.isArray(body.lineas) || body.lineas.length === 0) return NextResponse.json({ success: false, error: "Agrega al menos una línea" }, { status: 400 });
  if (body.lineas.some((l) => !l.descripcion?.trim())) return NextResponse.json({ success: false, error: "Todas las líneas deben tener descripción" }, { status: 400 });
  if (body.lineas.some((l) => !(l.cantidad > 0) || !Number.isInteger(l.cantidad) || l.precioUnitario < 0)) return NextResponse.json({ success: false, error: "Cantidad entera > 0 y precio ≥ 0 en todas las líneas" }, { status: 400 });
  const errorPrecioShipping = mensajePrecioShippingItemInvalido(body.lineas);
  if (errorPrecioShipping) return NextResponse.json({ success: false, error: errorPrecioShipping }, { status: 400 });
  // Con origen la forma de pago la deriva el servidor de los cobros reales.
  if (!body.origen && !body.formaPago?.trim()) return NextResponse.json({ success: false, error: "Elige una forma de pago" }, { status: 400 });

  // Gancho: recibo emitido desde una orden/operación. El origen decide tres
  // cosas — el vínculo del recibo, el bloqueo cruzado y el reparto contable.
  if (body.origen) {
    if (body.origen.tipo !== "orden" && body.origen.tipo !== "operacion" || !body.origen.recordId?.trim()) {
      return NextResponse.json({ success: false, error: "Origen inválido" }, { status: 400 });
    }
    // Re-verificación server-side: la UI ya bloqueó antes (vía
    // /api/facturacion/prefactura), pero la regla no puede ser saltable con
    // un request directo al API — mismo criterio que /api/facturacion/emitir.
    // Fail-closed, igual que /api/facturacion/emitir: sin confirmar que no
    // hay documento previo, no se crea el recibo.
    let bloqueante: Awaited<ReturnType<typeof buscarDocumentoBloqueante>>;
    try {
      bloqueante = await buscarDocumentoBloqueante(body.origen);
    } catch (e) {
      console.error("[recibos POST] error verificando idempotencia:", e);
      return NextResponse.json(
        { success: false, error: "No se pudo verificar si esta cuenta ya tiene una factura o un recibo. No se creó el recibo; intenta de nuevo." },
        { status: 503 }
      );
    }
    if (bloqueante) {
      const etiqueta = body.origen.tipo === "orden" ? "orden" : "operación";
      const detalle = bloqueante.tipo === "factura"
        ? `una factura ${bloqueante.factura.estado} (${bloqueante.factura.numeroFactura || bloqueante.factura.claveAcceso})${etiquetaDondeEstaElDocumento(bloqueante)}`
        : `un recibo ${bloqueante.recibo.estado} (${bloqueante.recibo.numero})${etiquetaDondeEstaElDocumento(bloqueante)}`;
      return NextResponse.json({ success: false, error: `Esta ${etiqueta} ya tiene ${detalle}.` }, { status: 409 });
    }
    // Fase 3b: el recibo espera a que exista el artículo de todo lo aprobado.
    const pendientesArticulo = await getCuentaUnificada(body.origen.tipo === "orden" ? { ordenId: body.origen.recordId } : { operacionId: body.origen.recordId })
      .then((c) => mensajeAprobadoSinArticulo(c.aprobadoSinArticulo, "recibo"))
      .catch((e) => {
        console.error("[recibos POST] error verificando aprobado sin artículo:", e);
        return MENSAJE_NO_SE_PUDO_VERIFICAR;
      });
    if (pendientesArticulo) {
      return NextResponse.json({ success: false, error: pendientesArticulo }, { status: 409 });
    }

    // Auditoría ops, punto 1 (27-oct-2026): misma puerta que la factura. La
    // cuenta llega pagada con abonos, sus líneas no cambian y la venta
    // adicional se cobra aquí con método y cuenta.
    const lineasAdicionales = body.lineas.filter(esLineaAdicional);
    const totalAdicional = round2(lineasAdicionales.reduce((s, l) => s + totalLinea(l), 0));
    const cobro = await validarEmisionDesdeOrigen({
      origen: body.origen,
      lineasCuenta: body.lineas.filter((l) => !esLineaAdicional(l)).map((l) => ({
        descripcion: l.descripcion, cantidad: l.cantidad, total: totalLinea(l),
        shippingItemId: l.shippingItemId, productoDigitalId: l.productoDigitalId,
      })),
      totalAdicional,
      pagosAdicionales: body.pagosAdicionales ?? [],
    });
    if (!cobro.ok) return NextResponse.json({ success: false, error: cobro.error }, { status: cobro.status });
    body.pagos = cobro.pagos;
    body.formaPago = formaPagoPrincipal(cobro.pagos);
  }

  // Verificar stock (como una factura) — bloquea antes de crear el recibo.
  const detallesParaStock: DetalleFactura[] = body.lineas
    .filter((l) => !!l.shippingItemId)
    .map((l) => ({ descripcion: l.descripcion, cantidad: l.cantidad, precioUnitario: l.precioUnitario, descuento: l.descuento, precioTotalSinImpuesto: 0, impuestos: [], tipo: "producto", shippingItemId: l.shippingItemId }));
  try {
    const faltantes = await verificarStockDisponible(detallesParaStock, { soloUnidadesLibres: !body.origen });
    if (faltantes.length > 0) return NextResponse.json({ success: false, error: mensajeFaltantes(faltantes) }, { status: 400 });
  } catch {
    return NextResponse.json({ success: false, error: "No se pudo verificar el stock. Intenta de nuevo." }, { status: 503 });
  }

  // Productos digitales — MISMA puerta que la factura (auditoría Shipping V2,
  // punto 6, 9-oct-2026). Antes el recibo no verificaba nada: una clave ya
  // vendida o vinculada a otra orden podía cobrarse otra vez por recibo.
  try {
    const detallesDigitales: DetalleFactura[] = body.lineas
      .filter((l) => !!l.productoDigitalId)
      .map((l) => ({ descripcion: l.descripcion, cantidad: l.cantidad, precioUnitario: l.precioUnitario, descuento: l.descuento, precioTotalSinImpuesto: 0, impuestos: [], tipo: "productoDigital", productoDigitalId: l.productoDigitalId }));
    const ordenOrigenId = body.origen?.tipo === "orden" ? body.origen.recordId : null;
    const noDisponibles = await verificarProductosDigitalesDisponibles(detallesDigitales, ordenOrigenId);
    if (noDisponibles.length > 0) {
      return NextResponse.json({ success: false, error: mensajeProductosDigitalesNoDisponibles(noDisponibles).replace("No se puede facturar", "No se puede emitir el recibo") }, { status: 400 });
    }
  } catch (e) {
    console.error("[recibos POST] error verificando productos digitales:", e);
    return NextResponse.json({ success: false, error: "No se pudo verificar los productos digitales. Intenta de nuevo." }, { status: 503 });
  }

  // Auditoría Shipping V2, punto 1 — igual que la factura: solo lo que ya
  // está en la tienda (Recibido + inspección firmada si la requiere).
  try {
    const noEntregables = await verificarArticulosEntregables(detallesParaStock);
    if (noEntregables.length > 0) return NextResponse.json({ success: false, error: mensajeNoEntregables(noEntregables) }, { status: 409 });
  } catch {
    return NextResponse.json({ success: false, error: "No se pudo verificar que los artículos ya estén en la tienda. Intenta de nuevo." }, { status: 503 });
  }

  try {
    const { recordId, numero, total } = await crearRecibo(body);
    const cfg = getFacturacionConfig();

    // PDF best-effort.
    try {
      const pdf = await generarReciboPdf({ numero, fecha: ahoraEnEcuador(), ruc: cfg.ruc, razonSocial: cfg.razonSocial, nombreComercial: cfg.nombreComercial, dirMatriz: cfg.dirMatriz, cliente: body.cliente, lineas: body.lineas, formaPago: body.formaPago, nota: body.nota });
      await adjuntarPdfRecibo(recordId, `${numero}.pdf`, Buffer.from(pdf).toString("base64"));
    } catch (e) { console.error("[recibos POST] PDF no generado:", e); }

    // Efectos (guardados a producción por su ambiente). Best-effort cada uno:
    // el recibo y su PDF ya existen, un fallo aquí no los deshace.
    try { await descontarInventarioRecibo({ reciboRecordId: recordId, numeroRecibo: numero, lineas: body.lineas, ambiente: cfg.ambiente, liberaReserva: !!body.origen }); }
    catch (e) { console.error("[recibos POST] inventario:", e); }

    // Punto 6 (9-oct) + auditoría ops punto 2 (27-oct): los pedidos de la
    // cuenta (la operación de origen o los de la orden) pasan juntos a
    // "Entregado" (mismo guardado de ambiente que el inventario).
    if (body.origen && cfg.ambiente === "2") {
      await cerrarOperacionesDeLaCuenta(body.origen);
    }

    // Productos digitales (solo aparecen en recibos con origen, hoy): se
    // marcan Usado y se enlazan, igual que hace postEmision() con la factura.
    try {
      const pd = await marcarProductosDigitalesRecibo({ reciboRecordId: recordId, lineas: body.lineas, ambiente: cfg.ambiente });
      if (pd.estado === "ERROR") console.error("[recibos POST] productos digitales:", pd.detalle);
    } catch (e) { console.error("[recibos POST] productos digitales:", e); }

    const registradoPor = session.user.nombre || session.user.email || "Portal";
    try {
      if (body.origen) {
        // Con origen NO se registra el total: la cuenta llegó pagada con
        // abonos (ya en /finanzas). Se marcan como documentados y solo la
        // venta adicional es ingreso nuevo (ver lib/finanzas/puentes/recibo.ts).
        await actualizarEfectosRecibo(recordId, "Movimiento Contable", "PENDIENTE").catch(() => {});
        const puente = await procesarPuenteRecibo({
          reciboRecordId: recordId, numeroRecibo: numero, origen: body.origen,
          pagosAdicionales: body.pagosAdicionales ?? [], clienteRecordId: body.cliente.airtableId,
          registradoPor, ambiente: cfg.ambiente,
        });
        await actualizarEfectosRecibo(
          recordId,
          "Movimiento Contable",
          puente.estado === "ERROR" ? "ERROR" : puente.estado === "OMITIDO" ? "N/A" : "OK",
          puente.detalle
        ).catch(() => {});
      } else {
        await registrarIngresoRecibo({ reciboRecordId: recordId, numeroRecibo: numero, total, formaPago: body.formaPago, clienteRecordId: body.cliente.airtableId, registradoPor, ambiente: cfg.ambiente });
      }
    }
    catch (e) { console.error("[recibos POST] contable:", e); }

    return NextResponse.json({ success: true, data: { recordId, numero, total } });
  } catch (e) {
    console.error("[recibos POST]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Error al crear el recibo" }, { status: 500 });
  }
}
