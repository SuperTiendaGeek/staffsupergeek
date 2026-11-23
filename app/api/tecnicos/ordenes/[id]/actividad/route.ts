import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { ErrorActividad, guardarNota, leerActividad } from "@/lib/tecnicos/actividad/servidor";

// Actividad de la orden (rediseño R3): una sola línea de tiempo.
//   GET  → entradas (historial + pagos + respuestas del cliente), más reciente arriba
//   POST → { texto, visibilidad: "Interna" | "Al cliente", enviado?: boolean }

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const fallo = (e: unknown, texto: string) => {
  if (e instanceof ErrorActividad) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
  console.error(`[actividad] ${texto}`, e);
  return NextResponse.json({ success: false, error: texto }, { status: 500 });
};

export async function GET(_request: Request, { params }: Params) {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  const { id } = await params;
  try {
    return NextResponse.json({ success: true, data: await leerActividad(id) });
  } catch (e) {
    return fallo(e, "No se pudo leer la actividad.");
  }
}

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { texto?: unknown; visibilidad?: unknown; enviado?: unknown };
  try {
    const entrada = await guardarNota({
      ordenId: id,
      texto: body.texto,
      visibilidad: body.visibilidad,
      enviado: body.enviado === true,
      usuario: { nombre: session.user.nombre ?? null, email: session.user.email ?? null, id: session.user.userId ?? null },
    });
    return NextResponse.json({ success: true, data: entrada }, { status: 201 });
  } catch (e) {
    return fallo(e, "No se pudo guardar la nota.");
  }
}
