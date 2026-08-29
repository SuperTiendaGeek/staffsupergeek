import type { PantallasRestringidas } from "@/lib/permissions/pantallas";

export type PortalUser = {
  id: string;
  nombre: string;
  cedula?: string;
  email: string;
  rol: string;
  appsPermitidas: string[];
  activo: boolean;
  activoDesde?: string;
  ultimoLogin?: string;
  requiere2FA: boolean;
  /** Pantallas ocultas por módulo — ver lib/permissions/pantallas.ts. */
  pantallasRestringidas: PantallasRestringidas;
};

export type PortalUserInput = {
  nombre: string;
  email: string;
  rol: string;
  appsPermitidas: string[];
  activo: boolean;
  requiere2FA?: boolean;
};
