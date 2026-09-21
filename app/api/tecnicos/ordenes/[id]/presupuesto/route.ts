import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import {
  listarLineas, crearLinea, actualizarLinea, cargarInfoPedidos, clienteDeOrden,
} from "@/lib/tecnicos/presupuesto/airtable";
import {
  validarLinea, estadoPresupuesto, totalesPresupuesto, sincronizarConPedido,
  type NuevaLineaInput, type InfoPedido,
} from "@/lib/tecnicos/presupuesto/reglas";
import {
  crearOperacion, crearOpcion, setOpcionElegida, actualizarEstadoOperacion, eliminarOperacionConOpciones,
} from "@/lib/operaciones/airtable";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// GET  /api/tecnicos/ordenes/[id]/presupuesto — líneas + estado + totales
//      (+ el estado real de la operación de cada repuesto bajo pedido)
// POST /api/tecnicos/ordenes/[id]/presupuesto — agrega una línea Propuesta
//
// Armar el presupuesto NO toca inventario ni la cuenta de la orden: las
// líneas son solo una propuesta hasta que se aprueban y cargan (ver
// lib/tecnicos/presupuesto/cargar.ts).
export async function GET(_req: Request, { params }: Params) {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  const { id } = await params;
  try {
    let lineas = await listarLineas(id);
    const pedidos = await cargarInfoPedidos(lineas.map((l) => l.operacionId).filter((x): x is string => !!x));

    // Poner al día las líneas bajo pedido con su operación (pudo avanzar
    // desde el tablero de Operaciones). Idempotente: solo escribe si cambió.
    let cambio = false;
    for (const l of lineas) {
      const c = sincronizarConPedido(l, l.operacionId ? pedidos.get(l.operacionId) : undefined);
      if (!c) continue;
      await actualizarLinea(l.id, {
        ...(c.estado ? { estado: c.estado } : {}),
        ...(c.itemId ? { itemId: c.itemId } : {}),
        ...(c.notaCarga !== undefined ? { notaCarga: c.notaCarga } : {}),
        ...(c.aprobadoPor ? { aprobadoPor: c.aprobadoPor, fechaAprobacion: new Date().toISOString() } : {}),
      });
      cambio = true;
    }
    if (cambio) lineas = await listarLineas(id);

    const pedidosObj: Record<string, InfoPedido> = Object.fromEntries(pedidos);
    return NextResponse.json({
      success: true,
      data: { lineas, pedidos: pedidosObj, estado: estadoPresupuesto(lineas), totales: totalesPresupuesto(lineas) },
    });
  } catch (e) {
    console.error("[presupuesto GET]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "No se pudo leer el presupuesto" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response || !session) return response ?? NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });
  const { id } = await params;

  let body: NuevaLineaInput;
  try { body = (await request.json()) as NuevaLineaInput; }
  catch { return NextResponse.json({ success: false, error: "JSON inválido" }, { status: 400 }); }

  const bp = body.bajoPedido;
  const input: NuevaLineaInput = {
    tipo: body.tipo,
    descripcion: String(body.descripcion ?? ""),
    cantidad: Number(body.cantidad),
    precioUnitario: Number(body.precioUnitario),
    servicioCatalogoId: body.servicioCatalogoId || null,
    itemId: body.itemId || null,
    productoCatalogoId: body.productoCatalogoId || null,
    bajoPedido: bp
      ? {
          proveedorId: String(bp.proveedorId ?? ""),
          categoria: String(bp.categoria ?? ""),
          costoProveedor: bp.costoProveedor === null || bp.costoProveedor === undefined || (bp.costoProveedor as unknown) === "" ? null : Number(bp.costoProveedor),
          urlProveedor: bp.urlProveedor ? String(bp.urlProveedor) : "",
          tiempoEstimado: bp.tiempoEstimado ? String(bp.tiempoEstimado) : "",
        }
      : null,
  };
  const error = validarLinea(input);
  if (error) return NextResponse.json({ success: false, error }, { status: 400 });

  const creadoPor = session.user.nombre || session.user.email || "Portal";

  // Repuesto bajo pedido → Operación Comercial vinculada a la orden, con su
  // opción ya elegida y en "Cotizado". Aparece así en el tablero de
  // Operaciones para quien hace las compras.
  if (input.bajoPedido) {
    const { clienteId, idVisible } = await clienteDeOrden(id);
    if (!clienteId) {
      return NextResponse.json({ success: false, error: "La orden no tiene cliente vinculado: no se puede cotizar un pedido." }, { status: 400 });
    }
    let operacionId: string | null = null;
    try {
      operacionId = (await crearOperacion({
        clienteId,
        productoSolicitado: input.descripcion.trim(),
        categoria: input.bajoPedido.categoria,
        descripcionRequerimiento: `Repuesto bajo pedido para la orden ${idVisible} (cotizado desde el presupuesto).`,
        equipoEnTienda: true,
        ordenId: id,
      })).id;
      const opcion = await crearOpcion(operacionId, {
        productoDescripcion: input.descripcion.trim(),
        proveedorId: input.bajoPedido.proveedorId,
        tiempoEstimado: input.bajoPedido.tiempoEstimado || undefined,
        costoProveedor: input.bajoPedido.costoProveedor ?? null,
        precioVentaCliente: input.precioUnitario,
        urlProveedor: input.bajoPedido.urlProveedor || undefined,
        notaInterna: `Cotizado por ${creadoPor} desde el presupuesto de ${idVisible}.`,
      });
      await setOpcionElegida(operacionId, opcion.id);
      await actualizarEstadoOperacion(operacionId, "Cotizado");
      const linea = await crearLinea(id, input, creadoPor, { operacionId });
      return NextResponse.json({ success: true, data: linea }, { status: 201 });
    } catch (e) {
      // No dejar una operación huérfana si falló a mitad de camino.
      if (operacionId) await eliminarOperacionConOpciones(operacionId).catch((err) => console.error("[presupuesto POST] limpieza:", err));
      console.error("[presupuesto POST bajo pedido]", e);
      return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "No se pudo cotizar el repuesto" }, { status: 500 });
    }
  }

  try {
    const linea = await crearLinea(id, input, creadoPor);
    return NextResponse.json({ success: true, data: linea }, { status: 201 });
  } catch (e) {
    console.error("[presupuesto POST]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "No se pudo agregar la línea" }, { status: 500 });
  }
}
