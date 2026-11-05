import { solicitudesDeOrden } from "@/lib/compras/servidor";
import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { isAdministratorRole } from "@/lib/apps";
import { aplicarGarantiaALinea, ErrorGarantia } from "@/lib/garantias/servidor";
import {
  listarLineas, crearLinea, actualizarLinea, cargarInfoPedidos, nombresProveedores,
} from "@/lib/tecnicos/presupuesto/airtable";
import { sincronizarConLasTarjetas } from "@/lib/tecnicos/presupuesto/cargar";
import {
  normalizarPrioridad, nuevoGrupoAlternativas,
  validarLinea, estadoPresupuesto, totalesPresupuesto, sincronizarConPedido, reversasDisponibles,
  type NuevaLineaInput, type InfoPedido, type ReversasLinea,
} from "@/lib/tecnicos/presupuesto/reglas";

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
  const { response, session } = await requireTecnicosSession();
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

    // El cargo pudo quitarse desde su tarjeta (Servicios, Repuestos, Productos
    // digitales): entonces la línea vuelve a "Aprobada". También se cuenta lo
    // que se agregó directo a la orden sin pasar por el presupuesto.
    const sinc = await sincronizarConLasTarjetas(id, lineas, session?.user.nombre || "Portal");
    lineas = sinc.hubo ? await listarLineas(id) : sinc.lineas;

    const pedidosObj: Record<string, InfoPedido> = Object.fromEntries(pedidos);
    // Fase 2: situación de la compra de cada repuesto bajo pedido (chip).
    const solicitudes = lineas.some((l) => l.solicitudId)
      ? await solicitudesDeOrden(id).catch((e) => { console.warn("[presupuesto GET] compras", e); return []; })
      : [];
    const compras: Record<string, { codigo: string; sku: string | null; texto: string; tono: string; clave: string }> = {};
    for (const s of solicitudes) {
      if (s.lineaId) compras[s.lineaId] = { codigo: s.codigo, sku: s.sku, texto: s.situacion.texto, tono: s.situacion.tono, clave: s.situacion.clave };
    }
    // Qué se puede deshacer en cada línea y por qué no, calculado aquí con
    // datos frescos (pagos al proveedor, recepción) — la tarjeta solo lo pinta.
    const reversas: Record<string, ReversasLinea> = Object.fromEntries(
      lineas.map((l) => {
        const c = compras[l.id];
        const articulo = c ? { sku: c.sku ?? "", estado: c.clave === "entregado" ? "Vendido" : "" } : null;
        return [l.id, reversasDisponibles(l, l.operacionId ? pedidos.get(l.operacionId) : undefined, articulo)];
      })
    );
    const proveedores = await nombresProveedores(lineas.map((l) => l.proveedorId).filter((x): x is string => !!x));
    return NextResponse.json({
      success: true,
      data: {
        lineas, pedidos: pedidosObj, reversas, proveedores, compras,
        estado: estadoPresupuesto(lineas), totales: totalesPresupuesto(lineas),
        cargosSinPresupuesto: sinc.cargosSinPresupuesto,
      },
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

  type Cuerpo = Omit<NuevaLineaInput, "garantia"> & { alternativaDe?: string | null; garantia?: { motivo?: string; origenClave?: string | null } | null };
  let body: Cuerpo;
  try { body = (await request.json()) as Cuerpo; }
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
    prioridad: body.prioridad ? normalizarPrioridad(body.prioridad) : "Recomendada",
    notaCliente: typeof body.notaCliente === "string" ? body.notaCliente : "",
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
  // Garantía SUPER GEEK (punto 20): la línea nace a $0 y se propone (o, si la
  // pide un administrador, nace confirmada y se carga sin pasar por el cliente).
  const garantia = body.garantia
    ? { motivo: String(body.garantia.motivo ?? ""), origenClave: typeof body.garantia.origenClave === "string" ? body.garantia.origenClave : null }
    : null;
  if (garantia) {
    if (body.alternativaDe) return NextResponse.json({ success: false, error: "Una línea en garantía no va como alternativa." }, { status: 400 });
    input.precioUnitario = 0;
    input.garantia = true;
  }
  const error = validarLinea(input);
  if (error) return NextResponse.json({ success: false, error }, { status: 400 });

  const creadoPor = session.user.nombre || session.user.email || "Portal";

  // Repuesto bajo pedido: por ahora es SOLO presupuesto. Sus datos
  // (proveedor, URL, costo, tiempo) quedan en la línea; la Operación
  // Comercial se crea recién cuando el cliente aprueba (ver cargar.ts). Así
  // una cotización que el cliente nunca acepta no consume el código de
  // operación ni llena el tablero de Operaciones.
  try {
    // Alternativa de otra línea: comparten grupo (y prioridad, la del grupo).
    let grupoAlternativas: string | undefined;
    if (body.alternativaDe) {
      const todas = await listarLineas(id);
      const base = todas.find((l) => l.id === body.alternativaDe);
      if (!base || base.estado !== "Propuesta") {
        return NextResponse.json({ success: false, error: "Solo se agrega una alternativa a una línea Propuesta de esta orden." }, { status: 409 });
      }
      grupoAlternativas = base.grupoAlternativas || nuevoGrupoAlternativas();
      if (!base.grupoAlternativas) await actualizarLinea(base.id, { grupoAlternativas });
      input.prioridad = normalizarPrioridad(base.prioridad);
    }
    const linea = await crearLinea(id, input, creadoPor, { grupoAlternativas });
    if (garantia) {
      try {
        const r = await aplicarGarantiaALinea({
          ordenId: id, lineaId: linea.id, accion: "proponer", motivo: garantia.motivo, origenClave: garantia.origenClave,
          esAdmin: isAdministratorRole(session.user.rol),
          usuario: { nombre: creadoPor, id: session.user.userId ?? null },
        });
        return NextResponse.json({ success: true, data: r.linea ?? linea, resultados: r.resultados ?? null }, { status: 201 });
      } catch (e) {
        // La línea quedó creada como propuesta normal ($0): se avisa para corregirla.
        const msg = e instanceof ErrorGarantia ? e.message : "No se pudo marcar la garantía";
        return NextResponse.json({ success: false, error: `Se agregó la línea, pero sin garantía: ${msg}` }, { status: 409 });
      }
    }
    return NextResponse.json({ success: true, data: linea }, { status: 201 });
  } catch (e) {
    console.error("[presupuesto POST]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "No se pudo agregar la línea" }, { status: 500 });
  }
}
