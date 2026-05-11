import type { SessionUser, StaffSession } from "@/lib/session";

export type StaffRole = "admin" | "manager" | "staff" | "finance" | "technical";

export type AppStatus = "Disponible" | "Próximamente" | "En construcción";

export type AppIcon = "tools" | "finance" | "schedule" | "invoice" | "shipping" | "users";

export type AppPermissionName =
  | "Técnicos"
  | "Cotizaciones"
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
    requiredRoles: ["admin", "manager", "staff", "technical"]
  },
  {
    id: "pedidos",
    name: "Pedidos",
    permissionName: "Pedidos",
    route: "/pedidos",
    status: "Disponible",
    icon: "shipping",
    description: "Seguimiento de pedidos creados desde cotizaciones, tracking e instalación.",
    requiredRoles: ["admin", "manager", "staff", "technical"]
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
    status: "En construcción",
    icon: "invoice",
    description: "Módulo futuro para emisión y control de facturas.",
    requiredRoles: ["admin", "manager", "finance"]
  },
  {
    id: "shipping",
    name: "Shipping",
    permissionName: "Shipping",
    route: "/shipping",
    status: "En construcción",
    icon: "shipping",
    description: "Gestión futura de proveedores, paquetes, envíos e importaciones.",
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
  }
];

export const routePermissions: Record<string, AppPermissionName> = {
  "/tecnicos": "Técnicos",
  "/cotizaciones": "Cotizaciones",
  "/pedidos": "Pedidos",
  "/finanzas": "Finanzas",
  "/horarios": "Horarios",
  "/facturacion": "Facturación",
  "/shipping": "Shipping"
};

type PermissionSubject = StaffSession | SessionUser | null | undefined;

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

export function canAccessApp(subject: PermissionSubject, appName: AppPermissionName | string) {
  const user = getPermissionUser(subject);

  if (!user) {
    return false;
  }

  if (isAdministratorRole(user.rol)) {
    return true;
  }

  const requestedPermission = normalizePermissionValue(appName);

  return user.appsPermitidas.some((allowedApp) => normalizePermissionValue(allowedApp) === requestedPermission);
}

export function getRoutePermission(pathname: string) {
  if (pathname === "/api/tecnicos" || pathname.startsWith("/api/tecnicos/")) {
    return routePermissions["/tecnicos"];
  }

  if (pathname === "/api/cotizaciones" || pathname.startsWith("/api/cotizaciones/")) {
    return routePermissions["/cotizaciones"];
  }

  if (pathname === "/api/pedidos" || pathname.startsWith("/api/pedidos/")) {
    return routePermissions["/pedidos"];
  }

  if (pathname === "/api/horarios" || pathname.startsWith("/api/horarios/")) {
    return routePermissions["/horarios"];
  }

  const matchingRoute = Object.keys(routePermissions).find(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  return matchingRoute ? routePermissions[matchingRoute] : null;
}
