import { NextResponse } from "next/server";
import { createAccessLog } from "@/lib/access-log";
import { logAuthFlow } from "@/lib/auth-flow-log";
import {
  getExpiredSessionCookieOptions,
  getExpiredTwoFactorPendingCookieOptions,
  SESSION_COOKIE_NAME,
  TWO_FACTOR_PENDING_COOKIE_NAME,
  verifySessionToken
} from "@/lib/session";

function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, "", getExpiredSessionCookieOptions());
  response.cookies.set(TWO_FACTOR_PENDING_COOKIE_NAME, "", getExpiredTwoFactorPendingCookieOptions());
  logAuthFlow("logout cleared session and 2FA pending cookies", {
    sessionCookieName: SESSION_COOKIE_NAME,
    pendingCookieName: TWO_FACTOR_PENDING_COOKIE_NAME
  });
  return response;
}

function getCookieValue(request: Request, name: string) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

async function logLogout(request: Request) {
  const token = getCookieValue(request, SESSION_COOKIE_NAME);
  const session = await verifySessionToken(token);

  if (!session) {
    return;
  }

  await createAccessLog({
    userId: session.user.userId,
    email: session.user.email,
    accion: "Logout",
    app: "Sistema",
    resultado: "Permitido",
    request
  });
}

export async function POST(request: Request) {
  const acceptsJson = request.headers.get("accept")?.includes("application/json") ?? false;

  await logLogout(request);

  if (acceptsJson) {
    return clearSessionCookie(NextResponse.json({ success: true }));
  }

  return clearSessionCookie(NextResponse.redirect(new URL("/login", request.url), { status: 303 }));
}

export async function GET(request: Request) {
  logAuthFlow("logout GET ignored cookie clearing", {
    reason: "Only POST logout clears cookies to avoid prefetch races"
  });

  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
