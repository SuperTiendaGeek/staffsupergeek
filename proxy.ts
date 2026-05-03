import { NextResponse, type NextRequest } from "next/server";
import { createAccessLog } from "@/lib/access-log";
import { canAccessApp, getRoutePermission } from "@/lib/apps";
import {
  SESSION_COOKIE_NAME,
  TWO_FACTOR_PENDING_COOKIE_NAME,
  verifySessionToken,
  verifyTwoFactorPendingToken
} from "@/lib/session";

const privateRoutes = ["/dashboard", "/acceso-denegado", "/finanzas", "/tecnicos", "/horarios", "/facturacion", "/shipping"];

function isPrivateRoute(pathname: string) {
  return privateRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (pathname === "/verificar-2fa") {
    if (session) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    const pendingToken = request.cookies.get(TWO_FACTOR_PENDING_COOKIE_NAME)?.value;
    const pendingSession = await verifyTwoFactorPendingToken(pendingToken);

    if (!pendingSession) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  if (isPrivateRoute(pathname) && !session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const routePermission = getRoutePermission(pathname);

  if (session && routePermission && !canAccessApp(session, routePermission)) {
    await createAccessLog({
      userId: session.user.userId,
      email: session.user.email,
      accion: "Acceso Bloqueado",
      app: routePermission,
      resultado: "Bloqueado",
      request
    });

    return NextResponse.redirect(new URL("/acceso-denegado", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/verificar-2fa",
    "/dashboard/:path*",
    "/acceso-denegado/:path*",
    "/finanzas/:path*",
    "/tecnicos/:path*",
    "/horarios/:path*",
    "/facturacion/:path*",
    "/shipping/:path*"
  ]
};
