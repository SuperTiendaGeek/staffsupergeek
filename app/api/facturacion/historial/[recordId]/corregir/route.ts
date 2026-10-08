import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { obtenerFactura, actualizarMensajesSri } from "@/lib/facturacion/airtable/facturas";
import { emitirFactura, FacturacionRechazoError } from "@/lib/facturacion/emitirFactura";
import type { DatosVenta }           from "@/lib/facturacion/emitirFactura";
import { evaluarCorreccion, describirCambios } from "@/lib/facturacion/reglas/correccion";
import { agregarIntento, recortarSiHaceFalta } from "@/lib/facturacion/historialIntentos";
import { explicarMensajesSri }       from "@/lib/facturacion/sri/errores";
import { ahoraEnEcuador }            from "@/lib/facturacion/fechaEcuador";
import { ejecutarEfectosPostAutorizacion } from "@/lib/facturacion/gancho/efectosPostAutorizacion";
import { leerLineasFactura } from "@/lib/facturacion/reglas/lineasFactura";
import { totalesDesdeDetalles } from "@/lib/facturacion/reglas/totales";

export const dynamic     = "force-dynamic";
export const maxDuration = 90;

type Params = { params: Promise<{ recordId: string }> };

// POST /api/facturacion/historial/[recordId]/corregir
//
// Corrige una factura que el SRI rechazó y la vuelve a enviar CONSERVANDO su
// número y su clave de acceso.
//
// ─── La regla que implementa ─────────────────────────────────────────────────
//
//   Factura 123 → NO AUTORIZADA → corregir cédula → regenerar XML →
//   firmar otra vez → reenviar la MISMA 123 → AUTORIZADA
//
// y nunca:
//
//   Factura 123 rechazada → quemar 123 → crear 124 como reemplazo
//
// El secuencial queda reservado para esa operación comercial para siempre. Se
// puede intentar tantas veces como haga falta; el número no cambia.
//
// ─── Lo que NO se puede tocar ────────────────────────────────────────────────
//
// Establecimiento, punto de emisión, secuencial, número, clave de acceso,
// fecha y el vínculo a la orden u operación de origen: son la identidad del
// comprobante. Cambiarlos convertiría la factura de un cliente en la venta de
// otro. El servidor los toma SIEMPRE del registro guardado y descarta lo que
// venga en el body.
//
// Sí se pueden corregir los datos del comprador y las líneas. Si al corregir
// cambia el importe total, queda anotado en el historial con el antes y el
// después.

type Body = {
  tipoIdentificacionComprador?: string;
  razonSocialComprador?:        string;
  identificacionComprador?:     string;
  correoComprador?:             string;
  detalles?:                    DatosVenta["detalles"];
  totalSinImpuestos?:           number;
  totalDescuento?:              number;
  totalConImpuestos?:           DatosVenta["totalConImpuestos"];
  importeTotal?:                number;
  pagos?:                       DatosVenta["pagos"];
};

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireFacturacionSession();
  if (response || !session) {
    return response ?? NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });
  }

  const { recordId } = await params;
  const factura = await obtenerFactura(recordId);

  if (!factura) {
    return NextResponse.json({ success: false, error: "Factura no encontrada" }, { status: 404 });
  }

  // ── ¿Se puede corregir esta factura, y de qué forma? ──────────────────────
  const ahora = ahoraEnEcuador();
  const evaluacion = evaluarCorreccion({
    estado:       factura.estado,
    fechaEmision: new Date(`${factura.fechaEmision}T00:00:00`),
    ahora,
  });

  if (evaluacion.modo !== "reenviar-misma") {
    return NextResponse.json(
      { success: false, error: evaluacion.motivo, modo: evaluacion.modo },
      { status: 409 }
    );
  }

  if (!factura.claveAcceso || !factura.numeroFactura) {
    return NextResponse.json(
      { success: false, error: "Esta factura no tiene número ni clave asignados; no hay nada que reenviar." },
      { status: 400 }
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ success: false, error: "Body JSON inválido" }, { status: 400 });
  }

  if (!body.identificacionComprador?.trim() || !body.razonSocialComprador?.trim()) {
    return NextResponse.json(
      { success: false, error: "Faltan los datos del comprador." },
      { status: 400 }
    );
  }

  // ── Rastro de lo que cambia (se completa con el total tras recalcularlo) ──
  const cambiosCliente = describirCambios(
    {
      identificacionComprador: factura.clienteIdentificacion,
      razonSocialComprador:    factura.clienteNombre,
      correoComprador:         factura.clienteCorreo,
    },
    {
      identificacionComprador: body.identificacionComprador,
      razonSocialComprador:    body.razonSocialComprador,
      correoComprador:         body.correoComprador,
    }
  );

  // El origen (orden / operación) se recupera de lo guardado, nunca del body:
  // cambiarlo sería reutilizar el número para otra venta.
  //
  // Las LÍNEAS también salen de lo guardado si el body no las manda. Ese es el
  // caso normal: la pantalla de corrección solo toca los datos del comprador,
  // que es de donde vienen casi todos los rechazos del SRI. Poder mandarlas
  // sigue siendo posible (a veces el error es una tarifa de IVA), pero no
  // hace falta reenviar toda la factura para arreglar una cédula.
  let origen: DatosVenta["origen"];
  let detallesGuardados: DatosVenta["detalles"] = [];
  try {
    const payload = JSON.parse(factura.lineasJson || "{}") as {
      origen?: DatosVenta["origen"];
      detalles?: DatosVenta["detalles"];
    };
    origen = payload.origen;
    if (Array.isArray(payload.detalles)) detallesGuardados = payload.detalles;
  } catch { /* factura sin líneas guardadas: se detecta abajo */ }

  const detalles = Array.isArray(body.detalles) && body.detalles.length > 0
    ? body.detalles
    : detallesGuardados;

  // Pagos y cliente guardados (desde el arreglo de la factura 755 también en
  // las filas RECIBIDA/NO AUTORIZADO). Antes, si la pantalla no mandaba pagos,
  // se reenviaba TODO como efectivo ("01"): una venta con tarjeta quedaba en
  // el XML y en Finanzas como efectivo.
  const lineasGuardadas = leerLineasFactura(factura.lineasJson);

  if (detalles.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Esta factura no tiene sus líneas guardadas, así que no se puede reconstruir para " +
          "reenviarla. Emite una nueva; este número queda registrado como no emitido.",
      },
      { status: 400 }
    );
  }

  // Los totales se RECALCULAN desde las líneas, no se copian del body: así el
  // XML siempre cuadra consigo mismo aunque la pantalla mande otra cosa.
  const totalesRecalculados = totalesDesdeDetalles(detalles);

  const datosVenta: DatosVenta = {
    // Se puede corregir el tipo (a veces ESE es el error), pero nunca se
    // asume "05" por descarte: si no viene, manda el guardado.
    tipoIdentificacionComprador:
      body.tipoIdentificacionComprador ?? factura.clienteTipoIdentificacion ?? "",
    razonSocialComprador:        body.razonSocialComprador.trim(),
    identificacionComprador:     body.identificacionComprador.trim(),
    correoComprador:             body.correoComprador?.trim() || undefined,
    detalles,
    totalSinImpuestos:           totalesRecalculados.totalSinImpuestos,
    totalDescuento:              totalesRecalculados.totalDescuento,
    totalConImpuestos:           totalesRecalculados.totalConImpuestos,
    importeTotal:                totalesRecalculados.importeTotal,
    pagos:                       body.pagos ?? pagosGuardadosSiCuadran(lineasGuardadas?.pagos, totalesRecalculados.importeTotal)
                                   ?? [{ formaPago: "01", total: totalesRecalculados.importeTotal }],
    vendedor:                    session.user.nombre,
    origen,
    clienteRecordId:             lineasGuardadas?.clienteRecordId,
  };

  try {
    const resultado = await emitirFactura(datosVenta, {
      recordId:      factura.recordId,
      // El secuencial sale del propio número guardado (001-002-000000687), no
      // de un cálculo: es el que ya le pertenece a esta factura.
      secuencial:    factura.numeroFactura.split("-")[2] ?? "",
      numeroFactura: factura.numeroFactura,
      claveAcceso:   factura.claveAcceso,
      fechaEmision:  new Date(`${factura.fechaEmision}T00:00:00`),
    });

    // El cambio de IMPORTE TOTAL se anota aparte, ya con el total recalculado:
    // es la señal de que la corrección dejó de ser un arreglo de datos y tocó
    // la operación comercial. No se prohíbe, pero nunca pasa desapercibido.
    const cambios = [...cambiosCliente];
    if (Math.abs((factura.total ?? 0) - totalesRecalculados.importeTotal) > 0.001) {
      cambios.push(
        `⚠ IMPORTE TOTAL: $${(factura.total ?? 0).toFixed(2)} → $${totalesRecalculados.importeTotal.toFixed(2)}`
      );
    }

    // ── Historial: se acumula, nunca se sobreescribe ────────────────────────
    const mensajesTexto = (resultado.mensajes ?? []).map(
      (m) => `[${m.identificador}] ${m.tipo}: ${m.mensaje}`
    );
    const historial = recortarSiHaceFalta(
      agregarIntento(factura.mensajesSri ?? "", {
        fecha:              new Date(),
        estado:             resultado.estado,
        mensajes:           mensajesTexto,
        cambios,
        usuario:            session.user.nombre || session.user.email,
        numeroAutorizacion: resultado.numeroAutorizacion,
      })
    );
    await actualizarMensajesSri(recordId, historial).catch((e) => {
      console.error("[corregir] no se pudo guardar el historial de intentos:", e);
    });

    // Mismos efectos que una emisión normal (inventario, Finanzas, reserva).
    // Antes aquí solo corría el puente contable: una factura corregida que
    // quedaba AUTORIZADA no descargaba inventario. Cada efecto tiene sus
    // propios guards (solo AUTORIZADO y producción).
    await ejecutarEfectosPostAutorizacion({
      resultado,
      datos:         datosVenta,
      registradoPor: session.user.nombre || session.user.email || "Portal",
    });

    return NextResponse.json({
      success: true,
      data: {
        ...resultado,
        cambios,
        motivos: resultado.estado === "AUTORIZADO" ? [] : explicarMensajesSri(resultado.mensajes ?? []),
      },
    });
  } catch (e) {
    console.error("[corregir]", e);
    if (e instanceof FacturacionRechazoError) {
      return NextResponse.json({ success: false, error: e.message }, { status: 400 });
    }
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error al reenviar la factura corregida" },
      { status: 500 }
    );
  }
}

/** Los pagos guardados solo se reutilizan si siguen sumando el total recalculado. */
function pagosGuardadosSiCuadran(
  pagos: DatosVenta["pagos"] | undefined,
  total: number
): DatosVenta["pagos"] | undefined {
  if (!pagos || pagos.length === 0) return undefined;
  const suma = pagos.reduce((acc, p) => acc + (Number.isFinite(p.total) ? p.total : 0), 0);
  return Math.abs(suma - total) < 0.01 ? pagos : undefined;
}
