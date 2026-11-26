import { NextResponse } from "next/server";
import { isAdministratorRole } from "@/lib/apps";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { createHistorialEntrada } from "@/lib/tecnicos/airtable";
import { olvidarAlertas } from "@/lib/tecnicos/alertas/servidor";
import { revisarMarca, textoActividadMarca } from "@/lib/pruebas/reglas";
import { guardarMarcaPrueba } from "@/lib/pruebas/servidor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Punto 16: «Marcar como prueba» / «Quitar la marca» desde ⋯ de la cabecera.
// Solo administrador; queda en la Actividad de la orden.
export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  if (!isAdministratorRole(session.user.rol)) {
    return NextResponse.json({ success: false, error: "Solo un administrador marca una orden como prueba." }, { status: 403 });
  }
  const { id } = await params;
  if (!/^rec[A-Za-z0-9]{14}$/.test(id ?? "")) return NextResponse.json({ success: false, error: "Orden inválida." }, { status: 400 });
  let body: unknown = null;
  try { body = await request.json(); } catch { /* vacío */ }
  const r = revisarMarca(body);
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 });
  try {
    await guardarMarcaPrueba({ tipo: "orden", id }, r.esPrueba);
    const quien = session.user.nombre || session.user.email || "Administrador";
    await createHistorialEntrada({
      ordenRecordId: id,
      avanceTexto: textoActividadMarca(r.esPrueba, quien),
      tipoActividad: "Sistema",
      visibilidad: "Interna",
      creadoPorNombre: session.user.nombre ?? null,
      creadoPorEmail: session.user.email ?? null,
      creadoPorUsuarioId: session.user.userId ?? null,
    }).catch((e) => console.warn("[prueba] no se anotó en la Actividad:", e));
    olvidarAlertas();
    return NextResponse.json({ success: true, data: { esPrueba: r.esPrueba } });
  } catch (e) {
    console.error("[prueba POST]", e);
    return NextResponse.json({ success: false, error: "No se pudo guardar la marca. Intenta de nuevo." }, { status: 503 });
  }
}
