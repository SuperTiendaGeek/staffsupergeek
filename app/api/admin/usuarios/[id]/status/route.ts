import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { listPortalUsers, updatePortalUserStatus } from "@/lib/airtable";
import { getActiveAdminCount } from "@/lib/admin-users";
import { isAdministratorRole } from "@/lib/apps";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

type StatusPayload = {
  activo?: unknown;
};

export async function PATCH(request: Request, { params }: Params) {
  const { session, response } = await requireAdminSession();

  if (response) {
    return response;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null) as StatusPayload | null;

  if (!id) {
    return NextResponse.json({ success: false, error: "Falta el id del usuario" }, { status: 400 });
  }

  if (typeof body?.activo !== "boolean") {
    return NextResponse.json({ success: false, error: "El estado activo es obligatorio" }, { status: 400 });
  }

  try {
    const users = await listPortalUsers();
    const user = users.find((item) => item.id === id);

    if (!user) {
      return NextResponse.json({ success: false, error: "Usuario no encontrado" }, { status: 404 });
    }

    if (session.user.userId === id && body.activo === false) {
      return NextResponse.json(
        { success: false, error: "No puedes desactivar tu propio usuario" },
        { status: 400 }
      );
    }

    if (user.activo && isAdministratorRole(user.rol) && body.activo === false && getActiveAdminCount(users) <= 1) {
      return NextResponse.json(
        { success: false, error: "Debe quedar al menos un administrador activo" },
        { status: 400 }
      );
    }

    const updatedUser = await updatePortalUserStatus(id, body.activo);
    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("Error al actualizar estado de usuario del portal:", error);
    return NextResponse.json({ success: false, error: "No se pudo actualizar el estado" }, { status: 500 });
  }
}
