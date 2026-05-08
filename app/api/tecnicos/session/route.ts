import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;

  return NextResponse.json({
    success: true,
    user: {
      nombre: session?.user.nombre || "",
      email: session?.user.email || "",
      rol: session?.user.rol || "",
    },
  });
}
