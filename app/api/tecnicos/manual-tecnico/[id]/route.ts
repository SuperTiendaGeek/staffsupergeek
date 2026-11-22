import { NextResponse } from "next/server";
import { isAdministratorRole } from "@/lib/apps";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { ErrorManual, accionDeAdministrador } from "@/lib/manual-tecnico/servidor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Verificar · Corregir · Archivar (solo administrador; nunca se borra).
// La regla de quién puede qué vive en lib/manual-tecnico/reglas.ts.
export async function PATCH(request: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { accion?: unknown; cambios?: unknown };
  const accion = body.accion === "verificar" || body.accion === "corregir" || body.accion === "archivar" ? body.accion : null;
  if (!accion) return NextResponse.json({ success: false, error: "Acción no válida." }, { status: 400 });
  try {
    const entrada = await accionDeAdministrador({
      entradaId: id,
      accion,
      cambios: body.cambios && typeof body.cambios === "object" ? (body.cambios as Record<string, unknown>) : {},
      usuario: session.user.nombre || session.user.email || "",
      esAdmin: isAdministratorRole(session.user.rol),
    });
    return NextResponse.json({ success: true, data: { entrada } });
  } catch (error) {
    const status = error instanceof ErrorManual ? error.status : 500;
    console.error("[manual-tecnico PATCH]", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status });
  }
}
