import { NextResponse } from "next/server";
import { isAdministratorRole } from "@/lib/apps";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { ErrorMotivo, actualizarMotivo, agregarPalabraParecida } from "@/lib/tecnicos/motivos/servidor";

// Un motivo (rediseño R7).
//   PATCH { agregarPalabra }  → cualquiera del taller («Usar «No enciende»» guarda lo escrito como palabra parecida).
//   PATCH { nombre | grupo | palabras | activo | nuevo } → solo administrador (catálogo).

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    if ("agregarPalabra" in body) {
      await agregarPalabraParecida(id, body.agregarPalabra);
      return NextResponse.json({ success: true });
    }
    if (!isAdministratorRole(session.user.rol)) {
      return NextResponse.json({ success: false, error: "Solo un administrador cambia el catálogo de motivos." }, { status: 403 });
    }
    const permitidos = ["nombre", "grupo", "palabras", "activo", "nuevo"];
    const cambios = Object.fromEntries(Object.entries(body).filter(([k]) => permitidos.includes(k)));
    const data = await actualizarMotivo(id, cambios);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    if (e instanceof ErrorMotivo) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    console.error("[motivo PATCH]", e);
    return NextResponse.json({ success: false, error: "No se pudo guardar el motivo." }, { status: 500 });
  }
}
