import { NextResponse } from "next/server";
import { withLock } from "@/lib/concurrencia";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { createHistorialEntrada } from "@/lib/tecnicos/airtable";
import { actualizarLinea, leerLinea } from "@/lib/tecnicos/presupuesto/airtable";
import { entradaHistorial } from "@/lib/tecnicos/presupuesto/reglas";
import { revisarCambioTrabajo, textoActividadTrabajo } from "@/lib/tecnicos/presupuesto/trabajo";
import { esOrdenCerrada } from "@/lib/tecnicos/regreso/reglas";
import { leerOrdenBasica } from "@/lib/tecnicos/regreso/servidor";
import { tomarSiNoTieneResponsable } from "@/lib/tecnicos/responsable/servidor";

// Rediseño R2: el técnico marca el avance de un trabajo aprobado
// (Por hacer · En proceso · En espera ▸ motivo · Hecho). Queda en la línea,
// en la Actividad de la orden y el cliente lo ve en su enlace.
//   PATCH { estado, motivo?, novedad? }

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; lineaId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  const { id, lineaId } = await params;
  const body = (await request.json().catch(() => ({}))) as { estado?: unknown; motivo?: unknown; novedad?: unknown };
  const usuario = session.user.nombre || session.user.email || "Portal";

  try {
    const orden = await leerOrdenBasica(id);
    if (!orden) return NextResponse.json({ success: false, error: "Orden no encontrada" }, { status: 404 });
    if (esOrdenCerrada(orden.estado)) {
      return NextResponse.json({ success: false, error: "La orden está cerrada: ya no se marca avance." }, { status: 409 });
    }

    const resultado = await withLock(`presupuesto:${id}`, async () => {
      const linea = await leerLinea(lineaId);
      if (!linea || linea.ordenId !== id) return { error: "Línea no encontrada en esta orden.", status: 404 } as const;
      const r = revisarCambioTrabajo({ linea, estado: body.estado, motivo: body.motivo, novedad: body.novedad });
      if (!r.ok) return { error: r.error, status: 400 } as const;
      const texto = textoActividadTrabajo(linea.descripcion, r.cambio);
      const actualizada = await actualizarLinea(linea.id, {
        estadoTrabajo: r.cambio.estadoTrabajo,
        motivoEspera: r.cambio.motivoEspera,
        novedadCliente: r.cambio.novedadCliente,
        trabajoPor: usuario,
        trabajoEn: new Date().toISOString(),
        agregarHistorial: { anterior: linea.historial, entrada: entradaHistorial(`Avance: ${r.cambio.estadoTrabajo}${r.cambio.motivoEspera ? ` · ${r.cambio.motivoEspera}` : ""}`, usuario) },
      });
      return { linea: actualizada, cambio: r.cambio, texto } as const;
    });
    if ("error" in resultado) return NextResponse.json({ success: false, error: resultado.error }, { status: resultado.status });

    const autor = { creadoPorNombre: session.user.nombre ?? null, creadoPorEmail: session.user.email ?? null, creadoPorUsuarioId: session.user.userId ?? null };
    // La Actividad y el responsable nunca frenan el avance ya guardado.
    const [historial] = await Promise.allSettled([
      createHistorialEntrada({
        ordenRecordId: id,
        avanceTexto: resultado.texto,
        tipoActividad: "Trabajo",
        visibilidad: resultado.cambio.motivoEspera === "Novedad" ? "Al cliente" : "Interna",
        ...autor,
      }),
      resultado.cambio.estadoTrabajo === "En proceso"
        ? tomarSiNoTieneResponsable(id, { id: session.user.userId ?? null, nombre: session.user.nombre ?? null, email: session.user.email ?? null })
        : Promise.resolve(false),
    ]);
    if (historial.status === "rejected") console.error("[trabajo] actividad", historial.reason);

    return NextResponse.json({ success: true, data: { linea: resultado.linea } });
  } catch (e) {
    console.error("[trabajo]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "No se pudo guardar el avance." }, { status: 500 });
  }
}
