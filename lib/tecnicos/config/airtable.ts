// Nombres oficiales de tablas en Airtable para mantener consistencia.
export const AIRTABLE_TABLES = {
  ordenes: "Órdenes de Reparación",
  clientes: "Clientes",
  tecnicos: "Técnicos",
  historial: "Historial de Estados",
  repuestos: "Repuestos Usados",
  servicios: "Servicios",
  catalogoRepuestos: "Catálogo Repuestos",
  repuestosPorOrden: "Repuestos por Orden",
  catalogoServicios: "Catálogo Servicios",
  serviciosPorOrden: "Servicios por Orden",
  abonosPorOrden: "Abonos por Orden",
} as const;

// Vars de entorno requeridas para conectarse desde el backend de Next.js.
export interface AirtableEnv {
  token: string;
  baseId: string;
}

// Obtiene y valida las variables de entorno necesarias.
export const loadAirtableEnv = (): AirtableEnv => {
  const token = process.env.AIRTABLE_TECNICOS_TOKEN;
  const baseId = process.env.AIRTABLE_TECNICOS_BASE_ID;

  if (!token) {
    throw new Error(
      "Falta AIRTABLE_TECNICOS_TOKEN. Definir en .env.local (no subir al repo)."
    );
  }

  if (!baseId) {
    throw new Error(
      "Falta AIRTABLE_TECNICOS_BASE_ID. Definir en .env.local (no subir al repo)."
    );
  }

  return { token, baseId };
};
