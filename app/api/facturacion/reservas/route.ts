import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { crearReserva, listarReservas } from "@/lib/facturacion/reservas/airtable";
import { reservarItem, registrarAbonoReserva } from "@/lib/facturacion/reservas/efectos";
import { abonoMinimo, fechaLimiteReserva, PLAZOS_VALIDOS, validarAbono } from "@/lib/facturacion/reservas/reglas";
import { getFacturacionConfig }      from "@/lib/facturacion/config";
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

  // El ítem debe estar disponible para venta (lectura, segura en cualquier ambiente).
  try {
    const [rec] = await fetchRecordsByIds("Shipping Items", [shippingItemId]);
    if (!rec) return NextResponse.json({ success: false, error: "El ítem no existe" }, { status: 404 });
    if (rec.fields["Disponible para venta"] !== true) {
      return NextResponse.json({ success: false, error: "El ítem ya no está disponible (vendido o reservado)" }, { status: 400 });
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

  const cfg = getFacturacionConfig();
  const ahora = ahoraEnEcuador();
  const fechaLimite = fechaLimiteReserva(ahora, plazoDias).toISOString().slice(0, 10);
  const registradoPor = session.user.nombre || "Portal";
  const abonoInicial = { monto: montoAbono, fecha: ahora.toISOString(), formaPago: formaPago!, registradoPor };

  try {
    const creada = await crearReserva({
      cliente: { identificacion: resol.datos.identificacion, razonSocial: resol.datos.razonSocial, correo: resol.datos.correo, telefono: resol.datos.telefono, airtableId: resol.clienteId },
      shippingItemId: shippingItemId!,
      descripcionItem: body.descripcionItem?.trim() || "Ítem reservado",
      precioVenta, plazoDias, fechaLimite, abonoInicial, registradoPor,
    });

    // Efectos (guardados a producción). Best-effort cada uno.
    try { await reservarItem(shippingItemId!, cfg.ambiente); }
    catch (e) { console.error("[reservas POST] reservarItem:", e); }
    try { await registrarAbonoReserva({ reservaRecordId: creada.recordId, numeroReserva: creada.numero, monto: montoAbono, formaPago: formaPago!, registradoPor, fecha: abonoInicial.fecha, ambiente: cfg.ambiente }); }
    catch (e) { console.error("[reservas POST] abono:", e); }

    return NextResponse.json({ success: true, data: { ...creada, clienteExistente: resol.clienteExistente, fichaActualizada: resol.fichaActualizada } });
  } catch (e) {
    console.error("[reservas POST]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Error al crear la reserva" }, { status: 500 });
  }
}
