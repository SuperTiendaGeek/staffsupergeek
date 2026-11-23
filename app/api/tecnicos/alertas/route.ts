import { NextResponse } from "next/server";
import { isAdministratorRole } from "@/lib/apps";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { resumenParaBarra } from "@/lib/tecnicos/alertas/servidor";
import { opciones } from "@/lib/tecnicos/responsable/servidor";

// Alertas de atención (rediseño R10): barra superior, panel del día y filtros de la lista.
//   GET → { resumen {atencion, porVencer, mias, sinResponsable}, filas, responsables, yo, esAdmin }

export const dynamic = "force-dynamic";

export async function GET() {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  const yo = session.user.userId ?? null;
  try {
    const [{ resumen, filas }, personas] = await Promise.all([resumenParaBarra(yo), opciones().catch(() => [])]);
    const responsables = Object.fromEntries(personas.map((p) => [p.id, { nombre: p.nombre, iniciales: p.iniciales }]));
    return NextResponse.json(
      { success: true, data: { resumen, filas, responsables, yo, esAdmin: isAdministratorRole(session.user.rol) } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[alertas GET]", e);
    return NextResponse.json({ success: false, error: "No se pudo leer las alertas." }, { status: 500 });
  }
}
