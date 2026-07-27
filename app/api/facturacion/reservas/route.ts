import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { buscarReservaActivaPorItem, crearReserva, listarReservas } from "@/lib/facturacion/reservas/airtable";
import { apartarItemParaReserva, liberarItem, registrarAbonoReserva } from "@/lib/facturacion/reservas/efectos";
import { abonoMinimo, fechaLimiteReserva, PLAZOS_VALIDOS, validarAbono } from "@/lib/facturacion/reservas/reglas";
import { ahoraEnEcuador }            from "@/lib/facturacion/fechaEcuador";
import { fetchRecordsByIds }         from "@/lib/facturacion/gancho/airtableGancho";
import { resolverClienteDocumento }  from "@/lib/facturacion/clientesResolver";
import type { PlazoReserva }         from "@/lib/facturacion/reservas/types";

export const dynamic     = "force-dynamic";
export const maxDuration = 60;

// GET — listado de reservas.
export async function GET(request: Request) {
  const { response } = await requireFacturacionSession();
  if (response) return response;
  const q = new URL(request.url).searchParams;
  try {
    const data = await listarReservas({ cliente: q.get("cliente")?.trim() || undefined, numero: q.get("numero")?.trim() || undefined, estado: q.get("estado")?.trim() || undefined });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Error al listar reservas" }, { status: 500 });
  }
}

type CrearBody = {
  cliente?: { identificacion?: string; razonSocial?: string; correo?: string; telefono?: string; airtableId?: string };
  shippingItemId?: string;
  descripcionItem?: string;
  precioVenta?: number;
  plazoDias?: number;
  abonoInicial?: { monto?: number; formaPago?: string };
  actualizarFicha?: boolean;
};

// POST — crear una reserva con su abono inicial.
export async function POST(request: Request) {
  const { response, session } = await requireFacturacionSession();
  if (response || !session) return response ?? NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });

  let body: CrearBody;
  try { body = (await request.json()) as CrearBody; }
  catch { return NextResponse.json({ success: false, error: "Body JSON inválido" }, { status: 400 }); }

  const razonSocial = body.cliente?.razonSocial?.trim();
  const shippingItemId = body.shippingItemId?.trim();
  const precioVenta = Number(body.precioVenta);
  const plazoDias = Number(body.plazoDias);
  const montoAbono = Number(body.abonoInicial?.monto);
  const formaPago = body.abonoInicial?.formaPago?.trim();

  if (!razonSocial) return NextResponse.json({ success: false, error: "Falta el nombre del cliente" }, { status: 400 });
  if (!shippingItemId) return NextResponse.json({ success: false, error: "Falta el ítem a reservar" }, { status: 400 });
  if (!(precioVenta > 0)) return NextResponse.json({ success: false, error: "El precio del ítem debe ser mayor a 0" }, { status: 400 });
  if (!PLAZOS_VALIDOS.includes(plazoDias as PlazoReserva)) return NextResponse.json({ success: false, error: "El plazo debe ser 7, 15 o 30 días" }, { status: 400 });
  if (!formaPago) return NextResponse.json({ success: false, error: "Elige una forma de pago para el abono" }, { status: 400 });
  const errAbono = validarAbono(montoAbono, precioVenta, 0);
  if (errAbono) return NextResponse.json({ success: false, error: `${errAbono} (mínimo $${abonoMinimo(precioVenta).toFixed(2)})` }, { status: 400 });

  // El ítem debe estar disponible para venta y sin otra reserva activa encima.
  // Esto es solo el aviso temprano con buen mensaje: la barrera dura es
  // apartarItemParaReserva(), más abajo, que falla si el ítem ya está apartado.
  try {
    const [rec] = await fetchRecordsByIds("Shipping Items", [shippingItemId]);
    if (!rec) return NextResponse.json({ success: false, error: "El ítem no existe" }, { status: 404 });
    if (rec.fields["Disponible para venta"] !== true) {
      return NextResponse.json({ success: false, error: "El ítem ya no está disponible (vendido o reservado)" }, { status: 400 });
    }
    const reservaActiva = await buscarReservaActivaPorItem(shippingItemId);
    if (reservaActiva) {
      return NextResponse.json(
        { success: false, error: `Este ítem ya está apartado en la reserva ${reservaActiva}.` },
        { status: 409 }
      );
    }
  } catch {
    return NextResponse.json({ success: false, error: "No se pudo verificar el ítem. Intenta de nuevo." }, { status: 503 });
  }

  // Resolver el cliente contra la tabla Clientes (la reserva DEBE quedar
  // vinculada a un cliente real). Ver lib/facturacion/clientesResolver.
  let resol;
  try {
    resol = await resolverClienteDocumento(
      { razonSocial: razonSocial!, identificacion: body.cliente?.identificacion?.trim() || undefined, correo: body.cliente?.correo?.trim() || undefined, telefono: body.cliente?.telefono?.trim() || undefined, airtableId: body.cliente?.airtableId },
      body.actualizarFicha === true,
    );
  } catch (e) {
    return NextResponse.json({ success: false, error: `No se pudo registrar/verificar el cliente: ${e instanceof Error ? e.message : "error"}` }, { status: 400 });
  }

  const ahora = ahoraEnEcuador();
  const fechaLimite = fechaLimiteReserva(ahora, plazoDias).toISOString().slice(0, 10);
  const registradoPor = session.user.nombre || "Portal";
  const abonoInicial = { monto: montoAbono, fecha: ahora.toISOString(), formaPago: formaPago!, registradoPor };

  // Se aparta el ítem ANTES de crear la reserva: es la operación que puede
  // fallar por concurrencia (dos personas reservando la misma unidad a la vez)
  // y la que no debe quedar a medias. Si falla, no se crea nada.
  try {
    await apartarItemParaReserva(shippingItemId!);
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "No se pudo apartar el ítem." },
      { status: 409 }
    );
  }

  let creada;
  try {
    creada = await crearReserva({
      cliente: { identificacion: resol.datos.identificacion, razonSocial: resol.datos.razonSocial, correo: resol.datos.correo, telefono: resol.datos.telefono, airtableId: resol.clienteId },
      shippingItemId: shippingItemId!,
      descripcionItem: body.descripcionItem?.trim() || "Ítem reservado",
      precioVenta, plazoDias, fechaLimite, abonoInicial, registradoPor,
    });
  } catch (e) {
    // Compensar: el ítem quedó apartado para una reserva que no existe.
    try { await liberarItem(shippingItemId!); }
    catch (revertError) { console.error("[reservas POST] no se pudo revertir el apartado:", revertError); }
    console.error("[reservas POST]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Error al crear la reserva" }, { status: 500 });
  }

  // El abono a /finanzas es best-effort: si falla, la reserva y el apartado
  // siguen siendo válidos, pero hay que avisar para que alguien lo registre.
  const abono = await registrarAbonoReserva({
    reservaRecordId: creada.recordId,
    numeroReserva: creada.numero,
    monto: montoAbono,
    formaPago: formaPago!,
    registradoPor,
    fecha: abonoInicial.fecha,
  });

  return NextResponse.json({
    success: true,
    data: {
      ...creada,
      clienteExistente: resol.clienteExistente,
      fichaActualizada: resol.fichaActualizada,
      advertencia: abono.estado === "ERROR"
        ? `La reserva se registró, pero el abono no llegó a Finanzas (${abono.detalle ?? "error desconocido"}). Regístralo a mano.`
        : null,
    },
  });
}
