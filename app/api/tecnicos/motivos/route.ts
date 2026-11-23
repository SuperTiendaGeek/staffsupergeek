import { NextResponse } from "next/server";
import { isAdministratorRole } from "@/lib/apps";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { ErrorMotivo, crearMotivo, leerCatalogo } from "@/lib/tecnicos/motivos/servidor";

// Motivos de ingreso (rediseño R7).
//   GET            → { motivos (activos), esAdmin }; ?todos=1 (admin) → también los desactivados.
//   POST { nombre, forzar?, grupo? } → existente · parecido («¿Es lo mismo que…?») · creado (queda «Nuevo»).

export const dynamic = "force-dynamic";

const usuarioDe = (s: { user: { nombre?: string | null; email?: string | null; userId?: string | null } }) => ({
  nombre: s.user.nombre ?? null, email: s.user.email ?? null, id: s.user.userId ?? null,
});

export async function GET(request: Request) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  const esAdmin = isAdministratorRole(session.user.rol);
  const todos = esAdmin && new URL(request.url).searchParams.get("todos") === "1";
  try {
    const catalogo = await leerCatalogo();
    return NextResponse.json(
      { success: true, data: { motivos: todos ? catalogo : catalogo.filter((m) => m.activo), esAdmin } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[motivos GET]", e);
    return NextResponse.json({ success: false, error: "No se pudo leer los motivos." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  const body = (await request.json().catch(() => ({}))) as { nombre?: unknown; forzar?: unknown; grupo?: unknown };
  try {
    const data = await crearMotivo({ nombre: body.nombre, forzar: body.forzar === true, grupo: body.grupo, usuario: usuarioDe(session) });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    if (e instanceof ErrorMotivo) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    console.error("[motivos POST]", e);
    return NextResponse.json({ success: false, error: "No se pudo crear el motivo." }, { status: 500 });
  }
}
