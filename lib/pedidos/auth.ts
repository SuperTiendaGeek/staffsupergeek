import { NextResponse } from "next/server";
import { getSessionFromCookie, type StaffSession } from "@/lib/session";

export async function requirePedidosSession(): Promise<{
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

  return { session, response: null };
}
