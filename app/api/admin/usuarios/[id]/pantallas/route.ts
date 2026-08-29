import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { listPortalUsers, updatePortalUserPantallasRestringidas } from "@/lib/airtable";
import { PANTALLAS_POR_MODULO, type ModuloConPantallas } from "@/lib/permissions/pantallas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

type PantallasPayload = {
  modulo?: unknown;
  pantallasOcultas?: unknown;
};

function esModuloValido(value: unknown): value is ModuloConPantallas {
  return typeof value === "string" && value in PANTALLAS_POR_MODULO;
}

export async function PATCH(request: Request, { params }: Params) {
  const { response } = await requireAdminSession();

  if (response) {
    return response;
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as PantallasPayload | null;

  if (!id) {
    return NextResponse.json({ success: false, error: "Falta el id del usuario" }, { status: 400 });
  }

  if (!esModuloValido(body?.modulo)) {
    return NextResponse.json({ success: false, error: "Módulo inválido" }, { status: 400 });
  }

  if (!Array.isArray(body?.pantallasOcultas) || !body.pantallasOcultas.every((p) => typeof p === "string")) {
    return NextResponse.json({ success: false, error: "Lista de pantallas inválida" }, { status: 400 });
  }

  // Filtra a las pantallas REALES del módulo: un key viejo (pantalla
  // renombrada o retirada) no debe quedar colgado en el JSON para siempre.
  const clavesValidas = new Set(PANTALLAS_POR_MODULO[body.modulo].map((p) => p.key));
  const pantallasOcultas = body.pantallasOcultas.filter((p) => clavesValidas.has(p));

  try {
    const users = await listPortalUsers();
    const user = users.find((item) => item.id === id);

    if (!user) {
      return NextResponse.json({ success: false, error: "Usuario no encontrado" }, { status: 404 });
    }

    // Solo se toca el módulo que llegó en el payload; las restricciones de
    // otros módulos (cuando haya más de uno) quedan intactas.
    const restringidas = { ...user.pantallasRestringidas, [body.modulo]: pantallasOcultas };
    const updatedUser = await updatePortalUserPantallasRestringidas(id, restringidas);

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("Error al actualizar pantallas restringidas del usuario:", error);
    return NextResponse.json({ success: false, error: "No se pudo actualizar las pantallas" }, { status: 500 });
  }
}
