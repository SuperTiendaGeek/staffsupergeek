import "server-only";

// Asignación segura del próximo número de secuencial, serializada por proceso.
// No puede ser atómica (Airtable no tiene transacciones), pero el lock por proceso
// impide que dos emisiones concurrentes tomen el mismo número.

import { maxSecuencialAutorizado } from "../airtable/facturas";
import { getFacturacionConfig }    from "../config";

// ─── Lock por proceso (una cola por combinación estab+ptoEmi) ─────────────────

const locks = new Map<string, Promise<void>>();

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => { release = r; });
  locks.set(key, next);
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

// ─── Siguiente secuencial ─────────────────────────────────────────────────────

function padSecuencial(n: number): string {
  return String(n).padStart(9, "0");
}

/**
 * Lee el máximo secuencial AUTORIZADO de Airtable y devuelve el siguiente.
 * Si no hay registros previos usa SRI_SECUENCIAL del entorno como semilla.
 *
 * SERIALIZADO: llamas concurrentes esperan su turno antes de leer Airtable,
 * evitando que dos emisiones tomen el mismo número.
 */
export async function siguienteSecuencial(
  estab:    string,
  ptoEmi:   string
): Promise<{ secuencial: string; numeroFactura: string }> {
  const key = `${estab}-${ptoEmi}`;

  return withLock(key, async () => {
    const maxEnAirtable = await maxSecuencialAutorizado(estab, ptoEmi);

    let siguiente: number;
    if (maxEnAirtable !== null) {
      siguiente = maxEnAirtable + 1;
    } else {
      // Semilla: SRI_SECUENCIAL del entorno, si existe; si no, 1
      const cfg  = getFacturacionConfig();
      const seed = parseInt(cfg.secuencial.replace(/\D/g, ""), 10);
      siguiente  = Number.isFinite(seed) && seed > 0 ? seed : 1;
    }

    const secuencial    = padSecuencial(siguiente);
    const numeroFactura = `${estab}-${ptoEmi}-${secuencial}`;
    return { secuencial, numeroFactura };
  });
}
