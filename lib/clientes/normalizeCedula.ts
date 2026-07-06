// Normaliza una cédula para comparar duplicados entre módulos (técnicos, operaciones):
// quita espacios, puntos y guiones, y pasa a minúsculas.
export const normalizeCedula = (cedula: string): string =>
  cedula.trim().replace(/[\s.\-]/g, "").toLowerCase();
