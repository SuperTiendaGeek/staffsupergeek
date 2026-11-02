import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { historialDeCliente } from "@/lib/clientes/historial-servidor";
import { opcionesDeDevolucion } from "@/lib/saldo-favor/ruta";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Ficha del cliente (auditoría ops, punto 13C): su saldo a favor, cuánto debe
// y toda su historia en una sola lista. Al administrador, además, de dónde
// puede devolverle dinero.
export async function GET(_: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response || !session) return response ?? NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });
  const { id } = await params;
  if (!/^rec[A-Za-z0-9]{14}$/.test(id ?? "")) return NextResponse.json({ success: false, error: "Id inválido." }, { status: 400 });
  try {
    const [historial, devolucion] = await Promise.all([historialDeCliente(id), opcionesDeDevolucion(session)]);
    if (!historial) return NextResponse.json({ success: false, error: "Cliente no encontrado" }, { status: 404 });
    return NextResponse.json({ success: true, data: { ...historial, devolucion } });
  } catch (e) {
    console.error("[clientes] historial", id, e);
    return NextResponse.json({ success: false, error: "No se pudo leer la historia del cliente." }, { status: 503 });
  }
}
