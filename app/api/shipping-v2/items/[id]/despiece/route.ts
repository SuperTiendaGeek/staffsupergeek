import { NextResponse } from "next/server";
import {
  borrarPiezaDespiece,
  cancelarDespiece,
  canShippingV2,
  completarDespiece,
  crearPiezaDespiece,
  editarPiezaDespiece,
  getResumenDespiece,
  getShippingV2AccessContextForSession,
} from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";
import { isAdministratorRole } from "@/lib/apps";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Despiece de un equipo: crear piezas, quitarlas, completar o cancelar.
// Las reglas viven en lib/shipping-v2/despiece.ts. Ver docs/DISENO_DESPIECE.md.
//
// El despiece es operación de taller: se exige `canEditItems`, que un
// proveedor externo no tiene. Cada función del servidor lo vuelve a comprobar
// por su cuenta; esto es solo la primera puerta.

function error(e: unknown, status = 400) {
  return NextResponse.json(
    { success: false, error: e instanceof Error ? e.message : "Error inesperado" },
    { status }
  );
}

export async function GET(_request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  const { id } = await params;
  try {
    const access = await getShippingV2AccessContextForSession(session);
    if (!canShippingV2(access, "canViewItems")) {
      return NextResponse.json({ success: false, error: "No tienes acceso a este item." }, { status: 403 });
    }
    return NextResponse.json({ success: true, data: await getResumenDespiece(id, access) });
  } catch (e) {
    console.error("Error al leer el despiece:", e);
    return error(e);
  }
}

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  const { id } = await params;

  try {
    const access = await getShippingV2AccessContextForSession(session);
    if (!canShippingV2(access, "canEditItems")) {
      return NextResponse.json({ success: false, error: "No tienes permiso para despiezar artículos." }, { status: 403 });
    }
    const registradoPor = getShippingV2SessionName(session);
    const body = await request.json().catch(() => ({}));
    const accion = String(body.accion ?? "crear-pieza");

    if (accion === "crear-pieza") {
      const data = await crearPiezaDespiece(
        {
          padreId: id,
          nombre: String(body.nombre ?? ""),
          categoria: String(body.categoria ?? ""),
          cantidad: Number(body.cantidad ?? 1),
          condicion: body.condicion ? String(body.condicion) : undefined,
          // Un precio vacío es válido: significa "sin precio asignado" y la
          // pieza simplemente no entra a facturación hasta tenerlo.
          precioVenta: body.precioVenta === "" || body.precioVenta === null || body.precioVenta === undefined
            ? null
            : Number(body.precioVenta),
          observaciones: body.observaciones ? String(body.observaciones) : undefined,
          numeroSerie: body.numeroSerie ? String(body.numeroSerie) : undefined,
        },
        { registradoPor, access }
      );
      return NextResponse.json({ success: true, data });
    }

    if (accion === "borrar-pieza") {
      const data = await borrarPiezaDespiece(
        { padreId: id, piezaId: String(body.piezaId ?? "") },
        { registradoPor, access }
      );
      return NextResponse.json({ success: true, data });
    }

    if (accion === "editar-pieza") {
      const data = await editarPiezaDespiece(
        {
          padreId: id,
          piezaId: String(body.piezaId ?? ""),
          nombre: body.nombre !== undefined ? String(body.nombre) : undefined,
          categoria: body.categoria !== undefined ? String(body.categoria) : undefined,
          cantidad: body.cantidad !== undefined ? Number(body.cantidad) : undefined,
          condicion: body.condicion !== undefined ? String(body.condicion) : undefined,
          precioVenta: body.precioVenta === undefined
            ? undefined
            : body.precioVenta === "" || body.precioVenta === null
              ? null
              : Number(body.precioVenta),
          observaciones: body.observaciones !== undefined ? String(body.observaciones) : undefined,
        },
        { registradoPor, access, esAdmin: isAdministratorRole(session?.user.rol) }
      );
      return NextResponse.json({ success: true, data });
    }

    if (accion === "completar") {
      const data = await completarDespiece(
        { padreId: id, completo: body.completo !== false, motivo: body.motivo ? String(body.motivo) : undefined },
        { registradoPor, access }
      );
      return NextResponse.json({ success: true, data });
    }

    if (accion === "cancelar") {
      const data = await cancelarDespiece({ padreId: id }, { registradoPor, access });
      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json({ success: false, error: `Acción de despiece desconocida: ${accion}` }, { status: 400 });
  } catch (e) {
    console.error("Error en el despiece:", e);
    return error(e);
  }
}
