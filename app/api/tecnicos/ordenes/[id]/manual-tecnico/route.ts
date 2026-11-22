import { NextResponse } from "next/server";
import { isAdministratorRole } from "@/lib/apps";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { leerOrdenParaTarjeta } from "@/lib/asistente/servidor";
import { notasDelHistorial, ultimoCompletado } from "@/lib/asistente/contexto";
import { DIAS_PARA_PROPONER, hayMaterialParaFicha, normalizarFicha } from "@/lib/manual-tecnico/reglas";
import { ErrorManual, coincidenciasParaOrden, guardarSolucionDeOrden, solucionDeLaOrden } from "@/lib/manual-tecnico/servidor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Manual técnico desde la orden (punto 11B · 21-nov-2026).
//   GET:  lo probado para este equipo + si ya se guardó la solución de la orden
//         + si corresponde proponer guardarla (pasó a Completado hace poco).
//   POST: guardar la ficha que el técnico revisó (Probada; admin → Verificada).
export async function GET(_request: Request, { params }: Params) {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  const { id: ordenId } = await params;
  try {
    const o = await leerOrdenParaTarjeta(ordenId);
    const [guardada, coincidencias] = await Promise.all([
      solucionDeLaOrden(o.codigo),
      coincidenciasParaOrden({ equipo: o.equipo, sintoma: `${o.ingresaPor} ${o.diagnostico}` }),
    ]);
    const completado = ultimoCompletado(o.historial);
    const reciente = completado ? Date.now() - Date.parse(completado) <= DIAS_PARA_PROPONER * 86_400_000 : false;
    const proponer = o.estado === "Completado" && !guardada && reciente
      && hayMaterialParaFicha({ diagnostico: o.diagnostico, notas: notasDelHistorial(o.historial).map((n) => n.texto) });
    return NextResponse.json({
      success: true,
      data: {
        codigo: o.codigo,
        guardada: guardada ? { id: guardada.id, codigo: guardada.codigo, estado: guardada.estado } : null,
        coincidencias,
        proponer,
      },
    });
  } catch (error) {
    console.error("[manual-tecnico/orden GET]", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  const { id: ordenId } = await params;
  const body = (await request.json().catch(() => ({}))) as { ficha?: unknown };
  try {
    const { entrada, yaExistia } = await guardarSolucionDeOrden({
      ordenId,
      ficha: normalizarFicha(body.ficha),
      usuario: session.user.nombre || session.user.email || "",
      esAdmin: isAdministratorRole(session.user.rol),
    });
    return NextResponse.json({ success: true, data: { id: entrada.id, codigo: entrada.codigo, estado: entrada.estado, yaExistia } });
  } catch (error) {
    const status = error instanceof ErrorManual ? error.status : 500;
    console.error("[manual-tecnico/orden POST]", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status });
  }
}
