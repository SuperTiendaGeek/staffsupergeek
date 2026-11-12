import { type NextRequest, NextResponse } from "next/server";
import { requireOperacionesSession } from "@/lib/operaciones/auth";
import {
  aceptarPedido, agregarAlternativa, cancelarPedido, editarAlternativa, enviarCotizacion, quitarAlternativa, vistaPedido,
  type AlternativaInput,
} from "@/lib/pedidos-especiales/servidor";
import { asegurarEnlacePedido, eleccionDelCliente, tokenDelPedido, urlEnlacePedido } from "@/lib/pedidos-especiales/enlace";
import { origenPublico } from "@/lib/tecnicos/presupuesto/origen";

// Punto 10A-2: cotización y aceptación de un PEDIDO ESPECIAL.
//   GET  → líneas, vigencia, anticipo, compras, plan de cancelación, enlace del
//          cliente y su elección (10A-3).
//   POST { accion: "agregar" | "editar" | "quitar" | "enviar" | "aceptar" | "cancelar", ... }

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

const num = (v: unknown): number => (typeof v === "number" ? v : Number(String(v ?? "").replace(",", ".")));
const str = (v: unknown): string => (typeof v === "string" ? v : "");

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { response } = await requireOperacionesSession();
  if (response) return response;
  const { id } = await params;
  try {
    const vista = await vistaPedido(id);
    const [token, eleccion] = await Promise.all([tokenDelPedido(id), eleccionDelCliente(id, vista.lineas)]);
    return NextResponse.json({
      success: true,
      data: { ...vista, enlace: token ? urlEnlacePedido(origenPublico(req), token) : "", eleccionCliente: eleccion },
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Error al leer el pedido." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { session, response } = await requireOperacionesSession();
  if (response || !session) return response ?? NextResponse.json({ success: false }, { status: 401 });
  const { id } = await params;
  const usuario = session.user.nombre?.trim() || session.user.email?.trim() || "Portal";

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Cuerpo inválido." }, { status: 400 });
  }

  try {
    switch (str(body.accion)) {
      case "agregar": {
        const a: AlternativaInput = {
          descripcion: str(body.descripcion),
          cantidad: Math.trunc(num(body.cantidad) || 1),
          precioUnitario: num(body.precioUnitario),
          proveedorId: str(body.proveedorId),
          categoria: str(body.categoria),
          costoProveedor: body.costoProveedor === null || body.costoProveedor === "" || body.costoProveedor === undefined ? null : num(body.costoProveedor),
          urlProveedor: str(body.urlProveedor),
          tiempoEstimado: str(body.tiempoEstimado),
          notaCliente: str(body.notaCliente),
          esAlternativa: body.esAlternativa !== false,
        };
        const linea = await agregarAlternativa(id, a, usuario);
        return NextResponse.json({ success: true, data: linea });
      }
      case "editar": {
        await editarAlternativa(id, str(body.lineaId), {
          ...(body.descripcion !== undefined ? { descripcion: str(body.descripcion) } : {}),
          ...(body.cantidad !== undefined ? { cantidad: Math.trunc(num(body.cantidad)) } : {}),
          ...(body.precioUnitario !== undefined ? { precioUnitario: num(body.precioUnitario) } : {}),
          ...(body.notaCliente !== undefined ? { notaCliente: str(body.notaCliente) } : {}),
          ...(typeof body.esAlternativa === "boolean" ? { esAlternativa: body.esAlternativa } : {}),
        }, usuario);
        return NextResponse.json({ success: true });
      }
      case "quitar":
        await quitarAlternativa(id, str(body.lineaId));
        return NextResponse.json({ success: true });
      case "enviar": {
        const dias = body.dias === undefined || body.dias === null || body.dias === "" ? null : Math.trunc(num(body.dias));
        const r = await enviarCotizacion(id, dias, usuario);
        // El enlace nace con el primer envío y no cambia nunca (es la página del pedido).
        const token = await asegurarEnlacePedido(id);
        return NextResponse.json({ success: true, data: { ...r, enlace: urlEnlacePedido(origenPublico(request), token) } });
      }
      case "aceptar": {
        const elegidas = Array.isArray(body.elegidas) ? body.elegidas.filter((x): x is string => typeof x === "string") : [];
        return NextResponse.json({ success: true, data: await aceptarPedido({ pedidoId: id, elegidas, usuario, via: "En tienda" }) });
      }
      case "cancelar":
        await cancelarPedido(id, str(body.motivo), usuario);
        return NextResponse.json({ success: true });
      default:
        return NextResponse.json({ success: false, error: "Acción inválida." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "No se pudo completar." }, { status: 409 });
  }
}
