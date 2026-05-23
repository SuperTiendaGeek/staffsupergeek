import { NextResponse } from "next/server";
import { canAccessApp } from "@/lib/apps";
import { getSessionFromCookie, type StaffSession } from "@/lib/session";

export async function requireShippingV2Session(): Promise<{
  session: StaffSession | null;
  response: NextResponse | null;
}> {
  const session = await getSessionFromCookie();

  if (!session) {
    return {
      session: null,
      response: NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 }),
    };
  }

  if (!canAccessApp(session, "Shipping")) {
    return {
      session: null,
      response: NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 }),
    };
  }

  return { session, response: null };
}

export function getShippingV2SessionName(session: StaffSession | null) {
  return session?.user.nombre || session?.user.email || "Usuario";
}
