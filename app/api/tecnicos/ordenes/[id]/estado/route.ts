import { NextResponse } from "next/server";
import { ESTADOS_ORDEN, EstadoOrden } from "@/types/tecnicos";
import { updateOrdenEstado } from "@/lib/tecnicos/airtable";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { sincronizarGarantiasDeLaOrden } from "@/lib/garantias/servidor";
import { ESTADO_ENTREGADA } from "@/lib/entrega/reglas";
import { isAdministratorRole } from "@/lib/apps";
import { createHistorialEntrada } from "@/lib/tecnicos/airtable";
import { revisarCambioDeEstado, textoReapertura } from "@/lib/tecnicos/regreso/reglas";
import { leerOrdenBasica } from "@/lib/tecnicos/regreso/servidor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id: ordenRecordId } = await params;

  const { response, session } = await requireTecnicosSession();
  if (response) return response;

  if (!ordenRecordId) {
    return NextResponse.json(
      { success: false, error: "Falta el id de la orden" },
      { status: 400 }
    );
  }

  let body: { estado?: string; motivo?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "JSON inválido" },
      { status: 400 }
    );
  }

  const estado = (body.estado ?? "").trim();
  if (!estado) {
    return NextResponse.json(
      { success: false, error: "Falta el estado a guardar" },
      { status: 400 }
    );
  }

  const estadoNormalizado = estado as EstadoOrden;
  if (!ESTADOS_ORDEN.includes(estadoNormalizado)) {
    return NextResponse.json(
      { success: false, error: "Estado no permitido" },
      { status: 400 }
    );
  }

  // Auditoría ops, punto 6: a "Finalizado Entregado" solo se llega con
  // "Entregar al cliente" (revisa pendientes, cobro y documento). Sin excepciones.
  if (estadoNormalizado === ESTADO_ENTREGADA) {
    return NextResponse.json(
      { success: false, error: "Para entregar usa «Entregar al cliente»: revisa el cobro y el documento." },
      { status: 409 }
    );
  }

  // Rediseño R6: una orden entregada o en reciclaje está cerrada. Solo un
  // administrador la reabre, con motivo (queda en la Actividad). Si el equipo
  // volvió, el camino es «Regresó el equipo» (orden nueva enlazada).
  const actual = await leerOrdenBasica(ordenRecordId).catch(() => null);
  if (!actual) {
    return NextResponse.json({ success: false, error: "Orden no encontrada" }, { status: 404 });
  }
  const revision = revisarCambioDeEstado({
    estadoActual: actual.estado,
    nuevoEstado: estadoNormalizado,
    esAdmin: isAdministratorRole(session.user.rol),
    motivo: body.motivo,
  });
  if (!revision.ok) {
    return NextResponse.json({ success: false, error: revision.error }, { status: revision.status });
  }

  try {
    const result = await updateOrdenEstado({
      ordenRecordId,
      nuevoEstado: estadoNormalizado,
      creadoPorNombre: session.user.nombre ?? null,
      creadoPorEmail: session.user.email ?? null,
      creadoPorUsuarioId: session.user.userId ?? null,
    });

    // Garantía SUPER GEEK (auditoría ops, punto 20): al entregar, las piezas
    // en garantía salen del inventario; si la orden se reabre, vuelven
    // apartadas. Nunca frena el cambio de estado: lo que falle vuelve como aviso.
    const garantias = await sincronizarGarantiasDeLaOrden({
      ordenId: ordenRecordId,
      nuevoEstado: estadoNormalizado,
      marca: result.historial?.id || new Date().toISOString(),
      hechoPor: session.user.nombre || session.user.email || "Portal",
    });

    let reapertura = null;
    if (revision.reapertura) {
      reapertura = await createHistorialEntrada({
        ordenRecordId,
        avanceTexto: textoReapertura({
          estadoActual: actual.estado,
          nuevoEstado: estadoNormalizado,
          motivo: body.motivo ?? "",
          admin: session.user.nombre || session.user.email || "",
        }),
        tipoActividad: "Reapertura",
        visibilidad: "Interna",
        creadoPorNombre: session.user.nombre ?? null,
        creadoPorEmail: session.user.email ?? null,
        creadoPorUsuarioId: session.user.userId ?? null,
      }).catch((e) => {
        console.error("[estado] constancia de reapertura", e);
        return null;
      });
    }

    return NextResponse.json({ success: true, data: { ...result, garantias, reapertura } });
  } catch (error) {
    console.error("Error al actualizar estado en Airtable:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
