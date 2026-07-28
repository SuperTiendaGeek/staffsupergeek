import type { SessionUser, StaffSession } from "@/lib/session";

export type StaffRole = "admin" | "manager" | "staff" | "finance" | "technical" | "provider";

export type AppStatus = "Disponible" | "Próximamente" | "En construcción";

export type AppIcon = "tools" | "finance" | "schedule" | "invoice" | "shipping" | "users";

export type AppPermissionName =
  | "Técnicos"
  | "Cotizaciones"
  | "Operaciones"
  | "Pedidos"
  | "Finanzas"
  | "Horarios"
  | "Facturación"
  | "Shipping"
  | "Administración";

export type StaffApp = {
  id: string;
  name: string;
  permissionName: AppPermissionName;
  description: string;
  status: AppStatus;
  icon: AppIcon;
  route: string;
  requiredRoles: StaffRole[];
  hidden?: boolean;
};

export const staffApps: StaffApp[] = [
  {
    id: "tecnicos",
    name: "Técnicos",
    permissionName: "Técnicos",
    route: "/tecnicos",
    status: "Disponible",
    icon: "tools",
    description: "Gestión de órdenes de reparación, estados, repuestos, servicios y abonos.",
    requiredRoles: ["admin", "manager", "technical"]
  },
  {
    id: "cotizaciones",
    name: "Cotizaciones",
    permissionName: "Cotizaciones",
    route: "/cotizaciones",
    status: "Disponible",
    icon: "invoice",
    description: "Gestión inicial de cotizaciones, opciones para clientes y seguimiento de estados.",
    requiredRoles: ["admin", "manager", "staff", "technical"],
    hidden: true,
  },
  {
    id: "operaciones",
    name: "Operaciones Comerciales",
    permissionName: "Operaciones",
    route: "/operaciones",
    status: "Disponible",
    icon: "invoice",
    description: "Tablero de operaciones comerciales: requerimientos, cotizaciones, pedidos y entregas.",
    requiredRoles: ["admin", "manager", "staff", "technical"],
  },
  {
    id: "pedidos",
    name: "Pedidos",
    permissionName: "Pedidos",
    route: "/pedidos",
    status: "Disponible",
    icon: "shipping",
    description: "Seguimiento de pedidos creados desde cotizaciones, tracking e instalación.",
    requiredRoles: ["admin", "manager", "staff", "technical"],
    hidden: true,
  },
  {
    id: "finanzas",
    name: "Finanzas",
    permissionName: "Finanzas",
    route: "/finanzas",
    status: "Disponible",
    icon: "finance",
    description: "Control de ingresos, egresos, cuentas internas y movimientos financieros.",
    requiredRoles: ["admin", "manager", "finance"]
  },
  {
    id: "horarios",
    name: "Control de Horarios",
    permissionName: "Horarios",
    route: "/horarios",
    status: "Disponible",
    icon: "schedule",
    description: "Registro de entrada, salida al almuerzo, regreso y salida final.",
    requiredRoles: ["admin", "manager", "staff"]
  },
  {
    id: "facturacion",
    name: "Facturación",
    permissionName: "Facturación",
    route: "/facturacion",
    status: "Disponible",
    icon: "invoice",
    description: "Emisión de facturas electrónicas SRI — ambiente PRUEBAS (celcer).",
    requiredRoles: ["admin", "manager", "finance"]
  },
  {
    id: "shipping",
    name: "Shipping",
    permissionName: "Shipping",
    route: "/shipping-v2",
    status: "Disponible",
    icon: "shipping",
    description: "Control de inventario, pagos, packings, recepción y novedades.",
    requiredRoles: ["admin", "manager", "staff"]
  },
  {
    id: "usuarios",
    name: "Usuarios",
    permissionName: "Administración",
    route: "/admin/usuarios",
    status: "Disponible",
    icon: "users",
    description: "Gestión de usuarios, roles, accesos y estado de las cuentas del portal.",
    requiredRoles: ["admin"]
  },
  {
    id: "airtable-usage",
    name: "Uso de Airtable",
    permissionName: "Administración",
    route: "/admin/airtable-usage",
    status: "Disponible",
    icon: "finance",
    description: "Monitoreo de records acumulados por tabla para evitar límites del plan.",
    requiredRoles: ["admin"]
  }
];

export const routePermissions: Record<string, AppPermissionName> = {
  "/tecnicos": "Técnicos",
  "/cotizaciones": "Cotizaciones",
  "/operaciones": "Operaciones",
  "/pedidos": "Pedidos",
  "/finanzas": "Finanzas",
  "/horarios": "Horarios",
  "/facturacion": "Facturación",
  "/shipping": "Shipping",
  "/shipping-v2": "Shipping"
};

type PermissionSubject = StaffSession | SessionUser | null | undefined;

// Users who had Cotizaciones/Pedidos access can also access Operaciones.
const PERMISSION_ALIASES: Partial<Record<string, string[]>> = {
  operaciones: ["cotizaciones", "pedidos"],
};

function getPermissionUser(subject: PermissionSubject) {
  if (!subject) {
    return null;
  }

  if ("user" in subject) {
    return subject.user;
  }

  return subject;
}

function normalizePermissionValue(value: string) {
  return value.normalize("NFC").trim().toLowerCase();
}

export function isAdministratorRole(role?: string) {
  if (!role) {
    return false;
  }

  const normalizedRole = normalizePermissionValue(role);

  return normalizedRole === "administrador" || normalizedRole === "admin";
}

export function isProviderRole(role?: string) {
  if (!role) {
    return false;
  }

  const normalizedRole = normalizePermissionValue(role);

  return normalizedRole === "proveedor" ||
    normalizedRole === "provider" ||
    normalizedRole === "proveedor externo" ||
    normalizedRole === "external provider";
}

export function canAccessApp(subject: PermissionSubject, appName: AppPermissionName | string) {
  const user = getPermissionUser(subject);

  if (!user) {
    return false;
  }

  if (isAdministratorRole(user.rol)) {
    return true;
  }

  const requestedPermission = normalizePermissionValue(appName);
  const aliases = PERMISSION_ALIASES[requestedPermission] ?? [];

  return user.appsPermitidas.some((allowedApp) => {
    const normalized = normalizePermissionValue(allowedApp);
    return normalized === requestedPermission || aliases.includes(normalized);
  });
}

export function getVisibleStaffApps(subject: PermissionSubject) {
  return staffApps.filter((app) => {
    if (app.hidden) return false;

    if (app.permissionName === "Administración") {
      return isAdministratorRole(getPermissionUser(subject)?.rol);
    }

    return canAccessApp(subject, app.permissionName);
  });
}

export function getRoutePermission(pathname: string) {
  if (pathname === "/api/tecnicos" || pathname.startsWith("/api/tecnicos/")) {
    return routePermissions["/tecnicos"];
  }

  if (pathname === "/api/cotizaciones" || pathname.startsWith("/api/cotizaciones/")) {
    return routePermissions["/cotizaciones"];
  }

  if (pathname === "/api/operaciones" || pathname.startsWith("/api/operaciones/")) {
    return routePermissions["/operaciones"];
  }

  if (pathname === "/api/pedidos" || pathname.startsWith("/api/pedidos/")) {
    return routePermissions["/pedidos"];
  }

  if (pathname === "/api/shipping-v2" || pathname.startsWith("/api/shipping-v2/")) {
    return routePermissions["/shipping-v2"];
  }

  if (pathname === "/api/horarios" || pathname.startsWith("/api/horarios/")) {
    return routePermissions["/horarios"];
  }

  if (pathname === "/api/facturacion" || pathname.startsWith("/api/facturacion/")) {
    return routePermissions["/facturacion"];
  }

  const matchingRoute = Object.keys(routePermissions).find(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  return matchingRoute ? routePermissions[matchingRoute] : null;
}
