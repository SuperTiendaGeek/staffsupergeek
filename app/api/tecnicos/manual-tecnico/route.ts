import { NextResponse } from "next/server";
import { isAdministratorRole } from "@/lib/apps";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { TIPOS_NOTA, type TipoManual } from "@/lib/manual-tecnico/reglas";
import { ErrorManual, crearNota, idsDeOrdenes, listarManual } from "@/lib/manual-tecnico/servidor";

export const dynamic = "force-dynamic";

// Técnicos → Manual técnico (punto 11B · 21-nov-2026).
//   GET:  todas las entradas + el enlace a cada orden de origen.
//   POST: + Nota (procedimiento, regla de la tienda o nota). Las soluciones
//         nacen solo desde una orden (al pasar a Completado).
export async function GET() {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  try {
    const entradas = await listarManual();
    const ordenes = await idsDeOrdenes(entradas.map((e) => e.ordenOrigen).filter(Boolean)).catch(() => ({}));
    return NextResponse.json({ success: true, data: { entradas, ordenes, esAdmin: isAdministratorRole(session.user.rol) } });
  } catch (error) {
    console.error("[manual-tecnico GET]", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  const body = (await request.json().catch(() => ({}))) as { tipo?: unknown; texto?: unknown; claves?: unknown };
  const tipo = (TIPOS_NOTA as readonly string[]).includes(String(body.tipo)) ? (String(body.tipo) as TipoManual) : ("" as TipoManual);
  try {
    const entrada = await crearNota({
      nota: { tipo, texto: typeof body.texto === "string" ? body.texto : "", claves: typeof body.claves === "string" ? body.claves : "" },
      usuario: session.user.nombre || session.user.email || "",
      esAdmin: isAdministratorRole(session.user.rol),
    });
    return NextResponse.json({ success: true, data: { entrada } });
  } catch (error) {
    const status = error instanceof ErrorManual ? error.status : 500;
    console.error("[manual-tecnico POST]", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status });
  }
}
