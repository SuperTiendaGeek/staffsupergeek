import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { hashPassword } from "@/lib/auth";
import { createPortalUser, findPortalUserByEmail, listPortalUsers } from "@/lib/airtable";
import { parsePortalUserInput } from "@/lib/admin-users";

export const dynamic = "force-dynamic";

type CreateUserPayload = {
  password?: unknown;
};

export async function GET() {
  const { response } = await requireAdminSession();

  if (response) {
    return response;
  }

  try {
    const users = await listPortalUsers();
    return NextResponse.json({ success: true, users });
  } catch (error) {
    console.error("Error al listar usuarios del portal:", error);
    return NextResponse.json({ success: false, error: "No se pudieron cargar los usuarios" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { response } = await requireAdminSession();

  if (response) {
    return response;
  }

  const body = await request.json().catch(() => null) as (CreateUserPayload & Record<string, unknown>) | null;
  const { input, error } = parsePortalUserInput(body);
  const password = typeof body?.password === "string" ? body.password : "";

  if (error || !input) {
    return NextResponse.json({ success: false, error }, { status: 400 });
  }

  if (!password.trim()) {
    return NextResponse.json({ success: false, error: "La contraseña temporal es obligatoria" }, { status: 400 });
  }

  try {
    const existingUser = await findPortalUserByEmail(input.email);

    if (existingUser) {
      return NextResponse.json({ success: false, error: "Ya existe un usuario con ese correo" }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const user = await createPortalUser(input, passwordHash);

    return NextResponse.json({ success: true, user }, { status: 201 });
  } catch (error) {
    console.error("Error al crear usuario del portal:", error);
    return NextResponse.json({ success: false, error: "No se pudo crear el usuario" }, { status: 500 });
  }
}
