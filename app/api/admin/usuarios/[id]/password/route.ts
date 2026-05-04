import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { hashPassword } from "@/lib/auth";
import { updatePortalUserPassword } from "@/lib/airtable";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

type PasswordPayload = {
  password?: unknown;
};

export async function PATCH(request: Request, { params }: Params) {
  const { response } = await requireAdminSession();

  if (response) {
    return response;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null) as PasswordPayload | null;
  const password = typeof body?.password === "string" ? body.password : "";

  if (!id) {
    return NextResponse.json({ success: false, error: "Falta el id del usuario" }, { status: 400 });
  }

  if (!password.trim()) {
    return NextResponse.json({ success: false, error: "La nueva contraseña es obligatoria" }, { status: 400 });
  }

  try {
    const passwordHash = await hashPassword(password);
    await updatePortalUserPassword(id, passwordHash);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error al cambiar contraseña de usuario del portal:", error);
    return NextResponse.json({ success: false, error: "No se pudo cambiar la contraseña" }, { status: 500 });
  }
}
