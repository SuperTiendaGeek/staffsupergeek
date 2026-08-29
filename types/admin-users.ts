import type { PantallasRestringidas } from "@/lib/permissions/pantallas";
import type { CamposRestringidos } from "@/lib/permissions/campos";

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
  /** Campos ocultos/solo-lectura por pantalla — ver lib/permissions/campos.ts. */
  camposRestringidos: CamposRestringidos;
};

export type PortalUserInput = {
  nombre: string;
  email: string;
  rol: string;
  appsPermitidas: string[];
  activo: boolean;
  requiere2FA?: boolean;
};
