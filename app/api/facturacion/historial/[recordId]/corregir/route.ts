import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { obtenerFactura, actualizarMensajesSri } from "@/lib/facturacion/airtable/facturas";
import { emitirFactura, FacturacionRechazoError } from "@/lib/facturacion/emitirFactura";
import type { DatosVenta }           from "@/lib/facturacion/emitirFactura";
import { evaluarCorreccion, describirCambios } from "@/lib/facturacion/reglas/correccion";
import { agregarIntento, recortarSiHaceFalta } from "@/lib/facturacion/historialIntentos";
import { explicarMensajesSri }       from "@/lib/facturacion/sri/errores";
import { ahoraEnEcuador }            from "@/lib/facturacion/fechaEcuador";
import { procesarPuenteFacturacion } from "@/lib/finanzas/puentes/facturacion";

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

  if (!Array.isArray(body.detalles) || body.detalles.length === 0) {
    return NextResponse.json({ success: false, error: "La factura debe tener al menos una línea." }, { status: 400 });
  }
  if (!body.identificacionComprador?.trim() || !body.razonSocialComprador?.trim()) {
    return NextResponse.json(
      { success: false, error: "Faltan los datos del comprador." },
      { status: 400 }
    );
  }

  // ── Rastro de lo que cambia ──────────────────────────────────────────────
  const cambios = describirCambios(
    {
      identificacionComprador: factura.clienteIdentificacion,
      razonSocialComprador:    factura.clienteNombre,
      correoComprador:         factura.clienteCorreo,
      importeTotal:            factura.total,
    },
    {
      identificacionComprador: body.identificacionComprador,
      razonSocialComprador:    body.razonSocialComprador,
      correoComprador:         body.correoComprador,
      importeTotal:            body.importeTotal,
    }
  );

  // El origen (orden / operación) se recupera de lo guardado, nunca del body:
  // cambiarlo sería reutilizar el número para otra venta.
  let origen: DatosVenta["origen"];
  try {
    const payload = JSON.parse(factura.lineasJson || "{}") as { origen?: DatosVenta["origen"] };
    origen = payload.origen;
  } catch { /* factura sin líneas guardadas: se sigue sin origen */ }

  const datosVenta: DatosVenta = {
    tipoIdentificacionComprador: body.tipoIdentificacionComprador ?? "05",
    razonSocialComprador:        body.razonSocialComprador.trim(),
    identificacionComprador:     body.identificacionComprador.trim(),
    correoComprador:             body.correoComprador?.trim() || undefined,
    detalles:                    body.detalles,
    totalSinImpuestos:           body.totalSinImpuestos ?? 0,
    totalDescuento:              body.totalDescuento ?? 0,
    totalConImpuestos:           body.totalConImpuestos ?? [],
    importeTotal:                body.importeTotal ?? 0,
    pagos:                       body.pagos ?? [{ formaPago: "01", total: body.importeTotal ?? 0 }],
    vendedor:                    session.user.nombre,
    origen,
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

    // El puente contable solo actúa sobre una emisión autorizada y en
    // producción; tiene sus propios guards.
    await procesarPuenteFacturacion(resultado, datosVenta, session.user.nombre || session.user.email || "Portal");

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
