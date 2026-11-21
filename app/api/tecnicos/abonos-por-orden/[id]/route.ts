import { NextResponse } from "next/server";
import { anularAbonoPorOrden, createHistorialEntrada } from "@/lib/tecnicos/airtable";
import { anularMovimientoDeAbono } from "@/lib/finanzas/puentes/abonos";
import { prepararAnulacionDeAbono } from "@/lib/saldo-favor/servidor";
import { prepararAnulacionParteDePago } from "@/lib/parte-pago/servidor";
import { airtableMutation, fetchRecordById, tableUrl } from "@/lib/finanzas/airtable-client";
import { documentoDeLaCuenta } from "@/lib/cuenta-unificada/documento";
import { canAccessApp, isAdministratorRole } from "@/lib/apps";
import { getSessionFromCookie } from "@/lib/session";
import {
  esPagoEnLinea, revisarAnulacion, textoHistorialAnulacion, textoMotivoAnulacion, validarMotivoAnulacion,
} from "@/lib/cobros/anular";
import { entradaHistorial } from "@/lib/compras/reglas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const texto = (v: unknown) => (typeof v === "string" ? v : "");
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

// Anula el abono (Estado del Abono = "Anulado") en vez de borrarlo, para
// conservar constancia. Se mantiene el verbo DELETE para no romper el cliente.
//
// Auditoría ops, punto 11 (decisión del dueño, 21-nov-2026): solo un
// administrador, con motivo; nunca con factura o recibo vigente en la cuenta;
// un pago en línea se devuelve desde Pagos en línea; un traspaso no se anula
// suelto. La regla vive en lib/cobros/anular.ts. Lo llaman la tarjeta Cuenta
// de la orden y la del pedido especial (por eso acepta las dos sesiones).
export async function DELETE(request: Request, { params }: Params) {
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
  if (!canAccessApp(session, "Técnicos") && !canAccessApp(session, "Operaciones")) {
    return NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, error: "Falta id del abono" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { motivo?: string; detalle?: string };
  const errorMotivo = validarMotivoAnulacion(body.motivo, body.detalle);
  if (errorMotivo) return NextResponse.json({ success: false, error: errorMotivo }, { status: 400 });
  const motivo = textoMotivoAnulacion(String(body.motivo), body.detalle);

  try {
    const actual = await fetchRecordById("Abonos", id);
    if (!actual) return NextResponse.json({ success: false, error: "Pago no encontrado." }, { status: 404 });
    const f = actual.fields;
    const ordenId = ids(f["Aplicado a: Orden"])[0] ?? null;
    const operacionId = ids(f["Aplicado a: Operación"])[0] ?? null;

    // El documento vigente de la CUENTA completa (orden + sus pedidos), la misma
    // búsqueda que bloquea emitir dos veces. Si Airtable falla, lanza: no se anula.
    const origen = ordenId ? { tipo: "orden" as const, recordId: ordenId } : operacionId ? { tipo: "operacion" as const, recordId: operacionId } : null;
    const documento = origen ? await documentoDeLaCuenta(origen) : null;

    const metodoPago = texto(f["Método de Pago"]) || null;
    const revision = revisarAnulacion({
      esAdmin: isAdministratorRole(session.user.rol),
      pago: {
        estado: texto(f["Estado del Abono"]) || "Registrado",
        metodoPago,
        observacion: texto(f["Observación"]) || null,
        enLinea: esPagoEnLinea({ metodoPago, conPagoEnLinea: ids(f["Pagos en línea"]).length > 0 }),
      },
      documento,
    });
    if (!revision.ok) {
      const status = revision.bloqueo === "no_admin" ? 403 : 409;
      return NextResponse.json({ success: false, error: revision.mensaje }, { status });
    }

    // Auditoría ops, punto 13B: si el abono mueve el saldo a favor del
    // cliente, se revisa primero que se pueda deshacer y luego se anula
    // también su movimiento de saldo.
    const saldo = await prepararAnulacionDeAbono(id);
    if (saldo && !saldo.ok) {
      return NextResponse.json({ success: false, error: saldo.error }, { status: saldo.status });
    }
    // Parte de pago (2-nov-2026): solo un administrador, y solo si el
    // artículo sigue libre en la tienda; después se da de baja.
    const parte = await prepararAnulacionParteDePago(id, session);
    if (parte && !parte.ok) {
      return NextResponse.json({ success: false, error: parte.error }, { status: parte.status });
    }
    const usuario = session.user.nombre || session.user.email || "Administrador";
    const result = await anularAbonoPorOrden({ abonoRecordId: id, motivo, anuladoPor: usuario });
    if (saldo?.ok) await saldo.despues();
    const avisoParte = parte?.ok ? await parte.despues() : null;
    // Puente 20.2 (§1.5, Corrección 1) — anula también el movimiento
    // vinculado; si ya estaba facturado, la anulación procede igual pero
    // vuelve con un warning explícito en vez de bloquear.
    const { warning } = await anularMovimientoDeAbono(id);

    // Constancia en el historial de la orden o del pedido. Si falla, el pago
    // ya quedó anulado (con quién y por qué en el propio abono): se avisa.
    const lineaHistorial = textoHistorialAnulacion({
      id, idAbono: typeof f["ID Abono"] === "number" ? String(f["ID Abono"]) : null, monto: Number(f["Monto"]) || 0, motivo,
    });
    let avisoHistorial: string | null = null;
    try {
      if (ordenId) {
        await createHistorialEntrada({
          ordenRecordId: ordenId,
          avanceTexto: lineaHistorial,
          creadoPorNombre: session.user.nombre ?? null,
          creadoPorEmail: session.user.email ?? null,
          creadoPorUsuarioId: session.user.userId ?? null,
        });
      } else if (operacionId) {
        const op = await fetchRecordById("Operación Comercial", operacionId);
        const obs = texto(op?.fields["Observación Interna"]).trim();
        await airtableMutation(tableUrl("Operación Comercial"), {
          method: "PATCH",
          body: JSON.stringify({ records: [{ id: operacionId, fields: { "Observación Interna": [obs, entradaHistorial(lineaHistorial, usuario)].filter(Boolean).join("\n") } }] }),
        });
      }
    } catch (e) {
      console.error("No se pudo anotar la anulación en el historial", e);
      avisoHistorial = "No se pudo anotar en el historial.";
    }

    return NextResponse.json({
      success: true,
      data: result.abono,
      warning: [warning, avisoParte, avisoHistorial].filter(Boolean).join(" ") || null,
    });
  } catch (error) {
    console.error("Error al anular abono", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
