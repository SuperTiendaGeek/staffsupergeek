import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { listPortalUsers, updatePortalUserCamposRestringidos } from "@/lib/airtable";
import { PANTALLAS_POR_MODULO, type ModuloConPantallas } from "@/lib/permissions/pantallas";
import { camposConfigurables, type EstadoCampoPersonalizado } from "@/lib/permissions/campos";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

type CamposPayload = {
  modulo?: unknown;
  pantalla?: unknown;
  campos?: unknown;
};

function esModuloValido(value: unknown): value is ModuloConPantallas {
  return typeof value === "string" && value in PANTALLAS_POR_MODULO;
}

function esEstadoValido(value: unknown): value is EstadoCampoPersonalizado {
  return value === "oculto" || value === "solo-lectura";
}

export async function PATCH(request: Request, { params }: Params) {
  const { response } = await requireAdminSession();

  if (response) {
    return response;
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as CamposPayload | null;

  if (!id) {
    return NextResponse.json({ success: false, error: "Falta el id del usuario" }, { status: 400 });
  }

  if (!esModuloValido(body?.modulo)) {
    return NextResponse.json({ success: false, error: "Módulo inválido" }, { status: 400 });
  }

  if (typeof body?.pantalla !== "string") {
    return NextResponse.json({ success: false, error: "Pantalla inválida" }, { status: 400 });
  }

  if (!body?.campos || typeof body.campos !== "object" || Array.isArray(body.campos)) {
    return NextResponse.json({ success: false, error: "Campos inválidos" }, { status: 400 });
  }

  // Filtra a los campos REALMENTE configurables de esa pantalla (excluye
  // adminOnly y cualquier key vieja/inventada) y a estados válidos.
  const clavesValidas = new Set(camposConfigurables(body.modulo, body.pantalla).map((c) => c.key));
  const campos: Record<string, EstadoCampoPersonalizado> = {};
  for (const [campo, estado] of Object.entries(body.campos as Record<string, unknown>)) {
    if (clavesValidas.has(campo) && esEstadoValido(estado)) campos[campo] = estado;
  }

  try {
    const users = await listPortalUsers();
    const user = users.find((item) => item.id === id);

    if (!user) {
      return NextResponse.json({ success: false, error: "Usuario no encontrado" }, { status: 404 });
    }

    // Solo se toca la pantalla que llegó en el payload; el resto de
    // módulos/pantallas del usuario quedan intactos.
    const restringidos = {
      ...user.camposRestringidos,
      [body.modulo]: { ...user.camposRestringidos[body.modulo], [body.pantalla]: campos },
    };
    const updatedUser = await updatePortalUserCamposRestringidos(id, restringidos);

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("Error al actualizar campos restringidos del usuario:", error);
    return NextResponse.json({ success: false, error: "No se pudo actualizar los campos" }, { status: 500 });
  }
}
