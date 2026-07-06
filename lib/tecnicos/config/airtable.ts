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
  abonosPorOrden: "Abonos por Orden", // legacy, no se escribe más desde técnicos
  abonos: "Abonos",
  productosDigitales: "Productos Digitales",
  catalogoProductosDigitales: "Catálogo Productos Digitales",
} as const;

// Vars de entorno requeridas para conectarse desde el backend de Next.js.
export interface AirtableEnv {
  token: string;
  baseId: string;
}

// Obtiene y valida las variables de entorno necesarias.
// Tras la migración a SUPER GEEK ADM, el módulo de técnicos lee/escribe en
// AIRTABLE_BASE_ID (ADM) usando AIRTABLE_API_KEY.
export const loadAirtableEnv = (): AirtableEnv => {
  const token = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!token) {
    throw new Error(
      "Falta AIRTABLE_API_KEY. Definir en .env.local (no subir al repo)."
    );
  }

  if (!baseId) {
    throw new Error(
      "Falta AIRTABLE_BASE_ID. Definir en .env.local (no subir al repo)."
    );
  }

  return { token, baseId };
};
