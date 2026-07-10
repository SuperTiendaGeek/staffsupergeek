import { NextResponse, type NextRequest } from "next/server";
import { createAccessLog } from "@/lib/access-log";
import { logAuthFlow } from "@/lib/auth-flow-log";
import { canAccessApp, getRoutePermission, isAdministratorRole } from "@/lib/apps";
import {
  SESSION_COOKIE_NAME,
  TWO_FACTOR_PENDING_COOKIE_NAME,
  verifySessionToken,
  verifyTwoFactorPendingToken
} from "@/lib/session";

const privateRoutes = [
  "/dashboard",
  "/acceso-denegado",
  "/finanzas",
  "/cotizaciones",
  "/api/cotizaciones",
  "/operaciones",
  "/api/operaciones",
  "/pedidos",
  "/api/pedidos",
  "/tecnicos",
  "/api/tecnicos",
  "/api/horarios",
  "/admin",
  "/api/admin",
  "/horarios",
  "/facturacion",
  "/api/facturacion",
  "/api/items",
  "/api/notificaciones",
  "/shipping",
  "/shipping-v2",
  "/api/shipping-v2"
];

function isPrivateRoute(pathname: string) {
  return privateRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function isHorariosAdminRoute(pathname: string) {
  return (
    pathname === "/horarios/admin" ||
    pathname.startsWith("/horarios/admin/") ||
    pathname === "/api/horarios/admin" ||
    pathname.startsWith("/api/horarios/admin/")
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith("/api/");
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
      logAuthFlow("proxy redirected /verificar-2fa to /login", {
        pendingCookiePresent: Boolean(pendingToken)
      });
      return NextResponse.redirect(new URL("/login", request.url));
    }

    logAuthFlow("proxy allowed /verificar-2fa", {
      pendingCookiePresent: true,
      userId: pendingSession.user.userId
    });
  }

  if (isPrivateRoute(pathname) && !session) {
    if (isApiRoute) {
      return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
    }

    return NextResponse.redirect(new URL("/login", request.url));
  }

  const routePermission = getRoutePermission(pathname);

  if (session && (pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin/"))) {
    if (!isAdministratorRole(session.user.rol)) {
      if (isApiRoute) {
        return NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 });
      }

      return NextResponse.redirect(new URL("/acceso-denegado", request.url));
    }
  }

  if (session && isHorariosAdminRoute(pathname) && !isAdministratorRole(session.user.rol)) {
    if (isApiRoute) {
      return NextResponse.json({ success: false, error: "Acceso denegado: solo Administrador puede administrar horarios y pagos" }, { status: 403 });
    }

    return NextResponse.redirect(new URL("/acceso-denegado", request.url));
  }

  if (session && routePermission && !canAccessApp(session, routePermission)) {
    await createAccessLog({
      userId: session.user.userId,
      email: session.user.email,
      accion: "Acceso Bloqueado",
      app: routePermission,
      resultado: "Bloqueado",
      request
    });

    if (isApiRoute) {
      return NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 });
    }

    return NextResponse.redirect(new URL("/acceso-denegado", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/verificar-2fa",
    "/dashboard/:path*",
    "/admin",
    "/api/admin",
    "/api/cotizaciones",
    "/api/pedidos",
    "/api/tecnicos/:path*",
    "/api/cotizaciones/:path*",
    "/api/pedidos/:path*",
    "/api/horarios/:path*",
    "/api/admin/:path*",
    "/api/shipping-v2/:path*",
    "/admin/:path*",
    "/acceso-denegado/:path*",
    "/finanzas/:path*",
    "/cotizaciones/:path*",
    "/operaciones/:path*",
    "/api/operaciones/:path*",
    "/pedidos/:path*",
    "/tecnicos/:path*",
    "/horarios/:path*",
    "/facturacion/:path*",
    "/api/facturacion",
    "/api/facturacion/:path*",
    "/api/items",
    "/api/items/:path*",
    "/api/notificaciones",
    "/api/notificaciones/:path*",
    "/shipping",
    "/shipping-v2/:path*"
  ]
};
