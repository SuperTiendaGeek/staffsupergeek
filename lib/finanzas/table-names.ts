// Resolución del nombre de la tabla de movimientos, con fallback y reintento
// por invalidación de caché. Ver docs/DISENO_FASE20_1_FUNDACION.md §4.
//
// Mientras el checklist de Airtable no haya renombrado la tabla, el código
// nuevo la encuentra igual por su nombre viejo — el rename y el deploy son
// independientes entre sí, en cualquier orden.

export const TABLA_CUENTAS_FINANCIERAS = "Cuentas Financieras";

const NOMBRES_TABLA_MOVIMIENTOS = ["Movimientos Financieros", "Shipping Finanzas Movimientos"] as const;

type ClienteAirtable = { baseUrl: string; headers: HeadersInit };

let nombreTablaMovimientosResuelto: string | null = null;

export function esErrorTablaNoEncontrada(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /\b404\b|TABLE_NOT_FOUND|NOT_FOUND/i.test(error.message);
}

async function existeTabla(nombre: string, client: ClienteAirtable): Promise<boolean> {
  const url = new URL(`${client.baseUrl}/${encodeURIComponent(nombre)}`);
  url.searchParams.set("pageSize", "1");
  try {
    const response = await fetch(url.toString(), { headers: client.headers, cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

export async function resolverNombreTablaMovimientos(client: ClienteAirtable): Promise<string> {
  if (nombreTablaMovimientosResuelto) return nombreTablaMovimientosResuelto;
  for (const nombre of NOMBRES_TABLA_MOVIMIENTOS) {
    if (await existeTabla(nombre, client)) {
      nombreTablaMovimientosResuelto = nombre;
      return nombre;
    }
  }
  throw new Error(
    "Ninguna de las tablas de Movimientos Financieros existe todavía (ni \"Movimientos Financieros\" ni \"Shipping Finanzas Movimientos\")."
  );
}

/** Solo para pruebas — reinicia el caché de nombre resuelto entre casos. */
export function __resetCacheNombreTablaParaPruebas(): void {
  nombreTablaMovimientosResuelto = null;
}

/**
 * Ejecuta `operacion` contra el nombre de tabla resuelto. Si falla por tabla
 * no encontrada (una instancia caliente cacheó el nombre viejo justo después
 * de un rename real en Airtable), invalida el caché, re-resuelve una vez, y
 * reintenta la misma operación una única vez antes de propagar el error.
 */
export async function conResolucionDeTablaMovimientos<T>(
  client: ClienteAirtable,
  operacion: (nombreTabla: string) => Promise<T>
): Promise<T> {
  const nombre = await resolverNombreTablaMovimientos(client);
  try {
    return await operacion(nombre);
  } catch (error) {
    if (!esErrorTablaNoEncontrada(error)) throw error;
    nombreTablaMovimientosResuelto = null;
    const nombreReintentado = await resolverNombreTablaMovimientos(client);
    return await operacion(nombreReintentado);
  }
}
