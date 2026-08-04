// Utilidades de concurrencia compartidas.
//
// ─── Qué protege esto y qué NO ───────────────────────────────────────────────
//
// `withLock` es un turno EN MEMORIA del proceso actual. Sirve para el caso
// frecuente de verdad: el mismo empleado haciendo doble clic, o dos pestañas
// del mismo navegador, atendidas por la misma instancia del servidor.
//
// NO protege entre instancias. La aplicación corre en Vercel, que levanta
// varias instancias en paralelo: dos empleados en computadoras distintas
// pueden caer en procesos distintos, cada uno con su propio Map, y el candado
// no los ve. Airtable no ofrece transacciones ni escrituras condicionales, así
// que no existe forma de cerrar esa puerta del todo desde aquí.
//
// Por eso el candado es solo la primera capa. La segunda es verificar DESPUÉS
// de escribir (`verificarEscrituraUnica`): se relee el registro y se comprueba
// que el valor escrito siga siendo el esperado. Si otro proceso escribió en
// medio, se detecta y se avisa, en vez de dejar dos reservas silenciosas sobre
// la misma unidad — que es exactamente lo que pasó con DES-000005.

const locks = new Map<string, Promise<void>>();

/**
 * Serializa las llamadas que compartan la misma `key` dentro de este proceso.
 * Las de claves distintas siguen corriendo en paralelo.
 */
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => { release = r; });
  locks.set(key, next);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    // Limpieza: si nadie más se encoló detrás, se quita la entrada para que el
    // Map no crezca sin límite con un proceso de larga vida.
    if (locks.get(key) === next) locks.delete(key);
  }
}

export class EscrituraConcurrenteError extends Error {
  constructor(public readonly detalle: string) {
    super(
      `Otra persona modificó este artículo al mismo tiempo. No se completó la operación para no reservar dos veces la misma unidad. Vuelve a intentarlo. (${detalle})`
    );
    this.name = "EscrituraConcurrenteError";
  }
}

/**
 * Comprueba, releyendo, que el valor que acabamos de escribir siga siendo el
 * que esperábamos. Si no coincide, otro proceso escribió sobre lo mismo entre
 * nuestra lectura y nuestra escritura, y nuestro incremento se perdió.
 *
 * No intenta reparar automáticamente: deshacer también sería una carrera. Lo
 * correcto es fallar de forma visible para que la persona reintente, en lugar
 * de dejar el inventario descuadrado en silencio.
 */
export function verificarEscrituraUnica(
  valorReleido: number | null | undefined,
  valorEsperado: number,
  contexto: string
): void {
  const real = typeof valorReleido === "number" ? valorReleido : 0;
  if (real !== valorEsperado) {
    throw new EscrituraConcurrenteError(`${contexto}: se esperaba ${valorEsperado} y quedó ${real}`);
  }
}
