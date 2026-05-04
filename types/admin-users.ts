export type PortalUser = {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  appsPermitidas: string[];
  activo: boolean;
  requiere2FA: boolean;
};

export type PortalUserInput = {
  nombre: string;
  email: string;
  rol: string;
  appsPermitidas: string[];
  activo: boolean;
  requiere2FA?: boolean;
};
