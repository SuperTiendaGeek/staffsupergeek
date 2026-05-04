import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { findPortalUserByEmail, listPortalUsers, updatePortalUser } from "@/lib/airtable";
import { getActiveAdminCount, parsePortalUserInput, wouldRemoveAdminAccess } from "@/lib/admin-users";
import { isAdministratorRole } from "@/lib/apps";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { session, response } = await requireAdminSession();

  if (response) {
    return response;
  }

  const { id } = await params;

  if (!id) {
    return NextResponse.json({ success: false, error: "Falta el id del usuario" }, { status: 400 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const { input, error } = parsePortalUserInput(body);

  if (error || !input) {
    return NextResponse.json({ success: false, error }, { status: 400 });
  }

  try {
    const users = await listPortalUsers();
    const currentUser = users.find((user) => user.id === id);

    if (!currentUser) {
      return NextResponse.json({ success: false, error: "Usuario no encontrado" }, { status: 404 });
    }

    const duplicatedUser = await findPortalUserByEmail(input.email);

    if (duplicatedUser && duplicatedUser.id !== id) {
      return NextResponse.json({ success: false, error: "Ya existe un usuario con ese correo" }, { status: 409 });
    }

    if (session.user.userId === id && (!input.activo || !isAdministratorRole(input.rol))) {
      return NextResponse.json(
        { success: false, error: "No puedes quitarte tu propio acceso de administrador" },
        { status: 400 }
      );
    }

    if (wouldRemoveAdminAccess(currentUser, input) && getActiveAdminCount(users) <= 1) {
      return NextResponse.json(
        { success: false, error: "Debe quedar al menos un administrador activo" },
        { status: 400 }
      );
    }

    const user = await updatePortalUser(id, input);
    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error("Error al actualizar usuario del portal:", error);
    return NextResponse.json({ success: false, error: "No se pudo actualizar el usuario" }, { status: 500 });
  }
}
