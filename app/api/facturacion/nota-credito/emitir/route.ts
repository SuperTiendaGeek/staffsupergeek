import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { obtenerFactura }            from "@/lib/facturacion/airtable/facturas";
import { totalAcreditadoDeFactura }  from "@/lib/facturacion/notaCredito/airtable";
import {
  construirLineaNotaCredito,
  calcularTotalesNotaCredito,
  evaluarNotaCreditoPermitida,
  validarMotivo,
  validarDescuentoLinea,
} from "@/lib/facturacion/notaCredito/calculos";
import { emitirNotaCredito }         from "@/lib/facturacion/notaCredito/emitirNotaCredito";
import { procesarPuenteNotaCredito } from "@/lib/finanzas/puentes/notaCredito";
import { revertirInventarioNotaCredito } from "@/lib/facturacion/notaCredito/revertirInventario";
import { ahoraEnEcuador }            from "@/lib/facturacion/fechaEcuador";
import type { DetalleFactura }       from "@/lib/facturacion/types/factura";
import type { SeleccionLinea }       from "@/lib/facturacion/notaCredito/calculos";
import type { DestinoNotaCredito }   from "@/lib/facturacion/notaCredito/types";
import { inferirTipoSugerido }       from "@/lib/facturacion/reglas/identificacion";
import { validarSolicitudReembolso, type DatosReembolso, type SolicitudReembolso } from "@/lib/facturacion/notaCredito/reembolso";
import { fetchCuentaById }           from "@/lib/finanzas/cuentas";
import { canAccessApp }              from "@/lib/apps";

export const dynamic     = "force-dynamic";
export const maxDuration = 90;   // igual que la emisión de factura

// POST /api/facturacion/nota-credito/emitir
//
// Body: { facturaRecordId, motivo, lineas, destino }
//
// TODAS las reglas se revalidan aquí, server-side, aunque la UI ya las haya
// aplicado: la pantalla no es la fuente de verdad y un request directo al
// API no puede saltarse la regla de consumidor final ni el tope acreditable.
//
// La NC NO genera egreso de caja (decisión operativa del dueño 2026-07-22):
// solo revierte inventario si hubo devolución física, y queda como crédito
// interno que el cliente usará en una factura de reemplazo. El único efecto
// interno automático hoy es el reverso de inventario (PR2a), guardado a
// producción por su propio guard de ambiente.
// PENDIENTE (etapa siguiente): registrar el crédito/saldo y su aplicación en
// la factura de reemplazo (formas de pago "Nota de crédito / Compensación").
//
// Destino "reembolso" (26-oct-2026): la única excepción a "no mueve caja". El
// XML que va al SRI es el mismo; lo que cambia es que el asiento de reversa
// sale de la cuenta elegida y el crédito queda en 0. Como mueve dinero, solo
// lo puede usar quien tiene acceso a Finanzas, y la cuenta se valida ANTES de
// emitir: una NC autorizada ya no se puede deshacer.

const DESTINOS_VALIDOS: DestinoNotaCredito[] = ["cambio", "saldo", "reembolso"];

type Body = {
  facturaRecordId: string;
  motivo:          string;
  lineas:          SeleccionLinea[];
  destino:         DestinoNotaCredito;
  /** Solo con destino "reembolso". */
  reembolso?:      SolicitudReembolso;
};

type LineasJsonEnvoltorio = { version: number; detalles?: DetalleFactura[] };

export async function POST(request: Request) {
  const { response, session } = await requireFacturacionSession();
  if (response || !session) return response ?? NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ success: false, error: "Body JSON inválido" }, { status: 400 });
  }

  if (!body.facturaRecordId?.trim()) {
    return NextResponse.json({ success: false, error: "Falta la factura de origen" }, { status: 400 });
  }
  if (!Array.isArray(body.lineas) || body.lineas.length === 0) {
    return NextResponse.json({ success: false, error: "Selecciona al menos una línea a acreditar" }, { status: 400 });
  }

  const errMotivo = validarMotivo(body.motivo ?? "");
  if (errMotivo) return NextResponse.json({ success: false, error: errMotivo.motivo }, { status: 400 });

  if (!DESTINOS_VALIDOS.includes(body.destino)) {
    return NextResponse.json({ success: false, error: "Indica si la nota de crédito es por cambio de equipo, saldo a favor o reembolso" }, { status: 400 });
  }

  // ── Reembolso: permiso y cuenta, antes de tocar el SRI ────────────────────
  let reembolso: DatosReembolso | undefined;
  if (body.destino === "reembolso") {
    if (!canAccessApp(session, "Finanzas")) {
      return NextResponse.json(
        { success: false, error: "Solo quien tiene acceso a Finanzas puede registrar un reembolso de dinero. Pídeselo a un administrador." },
        { status: 403 }
      );
    }
    const cuentaId = typeof body.reembolso?.cuentaOrigenId === "string" ? body.reembolso.cuentaOrigenId.trim() : "";
    let cuenta: Awaited<ReturnType<typeof fetchCuentaById>> = null;
    if (cuentaId) {
      try {
        cuenta = await fetchCuentaById(cuentaId);
      } catch (e) {
        console.error("[/api/facturacion/nota-credito/emitir] no se pudo leer la cuenta del reembolso:", e);
        return NextResponse.json({ success: false, error: "No se pudo verificar la cuenta del reembolso. Intenta de nuevo." }, { status: 502 });
      }
    }
    const v = validarSolicitudReembolso(body.reembolso, cuenta);
    if (!v.ok) return NextResponse.json({ success: false, error: v.motivo }, { status: 400 });
    reembolso = v.datos;
  }

  const factura = await obtenerFactura(body.facturaRecordId);
  if (!factura) return NextResponse.json({ success: false, error: "Factura no encontrada" }, { status: 404 });

  // ── Líneas originales ──────────────────────────────────────────────────────
  let detallesOriginales: DetalleFactura[] = [];
  try {
    const raw: unknown = JSON.parse(factura.lineasJson || "[]");
    if (Array.isArray(raw)) detallesOriginales = raw as DetalleFactura[];
    else if (raw && typeof raw === "object") detallesOriginales = (raw as LineasJsonEnvoltorio).detalles ?? [];
  } catch {
    return NextResponse.json({ success: false, error: "Las líneas guardadas de la factura no se pueden leer" }, { status: 400 });
  }

  const detallesNC = [];
  for (const sel of body.lineas) {
    const original = detallesOriginales[sel.indice];
    if (!original) {
      return NextResponse.json({ success: false, error: `La línea ${sel.indice} no existe en la factura original` }, { status: 400 });
    }
    if (!(sel.cantidadAcreditada > 0) || sel.cantidadAcreditada > original.cantidad) {
      return NextResponse.json(
        { success: false, error: `Cantidad inválida para "${original.descripcion}": la factura tiene ${original.cantidad} unidad(es).` },
        { status: 400 }
      );
    }
    if (sel.devolucionFisica && sel.condicion !== "buena" && sel.condicion !== "falla" && original.tipo === "producto") {
      return NextResponse.json({ success: false, error: `Indica si "${original.descripcion}" vuelve en buen estado o con falla.` }, { status: 400 });
    }
    // Faltante descontado (ej. cargador no devuelto): se valida contra la
    // línea real, no contra lo que calculó la pantalla.
    const rechazoDescuento = validarDescuentoLinea(original, sel.cantidadAcreditada, sel.descontar, sel.conceptoDescuento);
    if (rechazoDescuento) return NextResponse.json({ success: false, error: rechazoDescuento.motivo }, { status: 400 });
    const descontar = typeof sel.descontar === "number" && sel.descontar > 0 ? sel.descontar : 0;
    detallesNC.push(construirLineaNotaCredito(original, sel.cantidadAcreditada, !!sel.devolucionFisica, {
      condicion: sel.condicion === "falla" ? "falla" : sel.condicion === "buena" ? "buena" : undefined,
      notaFalla: typeof sel.notaFalla === "string" ? sel.notaFalla : undefined,
    }, descontar > 0 ? { descontar, concepto: String(sel.conceptoDescuento) } : undefined));
  }

  const totales = calcularTotalesNotaCredito(detallesNC);

  // ── Reglas (revalidación server-side, con el monto real) ──────────────────
  // El tipo de la FACTURA ORIGINAL manda: una nota de crédito no puede
  // cambiar la identidad del comprador. Antes se deducía por la longitud, así
  // que un pasaporte podía acabar declarado como cédula ante el SRI.
  const tipoIdentificacionComprador =
    factura.clienteTipoIdentificacion ??
    inferirTipoSugerido(factura.clienteIdentificacion ?? "") ??
    "07";

  const totalYaAcreditado = await totalAcreditadoDeFactura(factura.numeroFactura).catch(() => {
    throw new Error("No se pudo verificar cuánto se ha acreditado ya de esta factura");
  });

  const rechazo = evaluarNotaCreditoPermitida(
    {
      estado: factura.estado,
      tipoIdentificacionComprador,
      fechaEmision: new Date(`${factura.fechaEmision}T00:00:00`),
      importeTotal: factura.total,
      totalYaAcreditado,
    },
    totales.valorModificacion,
    ahoraEnEcuador()
  );
  if (rechazo) return NextResponse.json({ success: false, error: rechazo.motivo }, { status: 400 });

  // ── Emitir ────────────────────────────────────────────────────────────────
  try {
    const resultado = await emitirNotaCredito({
      tipoIdentificacionComprador,
      razonSocialComprador:    factura.clienteNombre,
      identificacionComprador: factura.clienteIdentificacion,
      correoComprador:         factura.clienteCorreo || undefined,
      numeroFacturaModificada: factura.numeroFactura,
      fechaEmisionFactura:     new Date(`${factura.fechaEmision}T00:00:00`),
      facturaRecordId:         factura.recordId,
      motivo:                  body.motivo.trim(),
      detalles:                detallesNC,
      destino:                 body.destino,
      reembolso,
    });

    // Efectos internos tras AUTORIZADO. Los dos son best-effort, cada uno en su
    // propio try/catch y con guardián de ambiente propio: una nota de crédito
    // ya autorizada ante el SRI es un documento real y ningún fallo interno
    // puede alterarla ni impedir que se devuelva al usuario.
    if (resultado.estado === "AUTORIZADO" && resultado.recordId) {
      // (a) Devolver el stock al inventario.
      try {
        await revertirInventarioNotaCredito({
          notaCreditoRecordId: resultado.recordId,
          detalles:            detallesNC,
          ambiente:            resultado.ambiente,
        });
      } catch (e) {
        console.error("[/api/facturacion/nota-credito/emitir] reverso de inventario falló:", e);
      }

      // (b) Revertir el ingreso: crédito interno con caducidad o, para un
      // reembolso, egreso desde la cuenta elegida y saldo disponible cero.
      const puente = await procesarPuenteNotaCredito({
        notaCreditoRecordId: resultado.recordId,
        ambiente:            resultado.ambiente,
        registradoPor:       session.user.nombre || session.user.email || "Portal",
      });
      if (puente.estado === "ERROR") {
        console.error("[/api/facturacion/nota-credito/emitir] puente contable falló:", puente.motivo);
      }
      // Solo el reembolso necesita que la pantalla sepa cómo terminó Finanzas:
      // si el egreso no se registró, el usuario tiene que saberlo antes de
      // entregar el dinero o justo después.
      if (body.destino === "reembolso") {
        return NextResponse.json({
          success: true,
          data: {
            ...resultado,
            contabilidad: {
              estado:  puente.estado,
              motivo:  "motivo" in puente ? puente.motivo : undefined,
              reembolso: puente.estado === "OK" ? puente.reembolso : undefined,
              movimientoId: "movimientoId" in puente ? puente.movimientoId : undefined,
            },
          },
        });
      }
    }

    return NextResponse.json({ success: true, data: resultado });
  } catch (e) {
    console.error("[/api/facturacion/nota-credito/emitir]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error interno al emitir la nota de crédito" },
      { status: 500 }
    );
  }
}
