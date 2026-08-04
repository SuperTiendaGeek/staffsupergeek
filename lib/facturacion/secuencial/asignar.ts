import "server-only";

// Asignación segura del próximo número de secuencial, serializada por proceso.
// No puede ser atómica (Airtable no tiene transacciones), pero el lock por proceso
// impide que dos emisiones concurrentes tomen el mismo número.

import { maxSecuencialUsado } from "../airtable/facturas";
import { getFacturacionConfig }    from "../config";
import { withLock } from "@/lib/concurrencia";

// ─── Lock por proceso (una cola por combinación estab+ptoEmi) ─────────────────


// ─── Siguiente secuencial ─────────────────────────────────────────────────────

function padSecuencial(n: number): string {
  return String(n).padStart(9, "0");
}

/**
 * Fuente única de secuenciales: MAX(Secuencial) sobre todos los registros
 * que tuvieron un número real asignado (AUTORIZADO, DEVUELTA, NO AUTORIZADO,
 * PENDIENTE, RECIBIDA). Excluye BORRADOR y ANULADA.
 *
 * SRI_SECUENCIAL solo actúa como semilla de arranque cuando Airtable no tiene
 * ningún registro previo (primer uso o tabla vacía). Una vez que existe aunque
 * sea un registro, Airtable es la única fuente de verdad.
 *
 * SERIALIZADO: llamadas concurrentes esperan su turno antes de leer Airtable,
 * evitando que dos emisiones tomen el mismo número.
 */
export async function siguienteSecuencial(
  estab:    string,
  ptoEmi:   string
): Promise<{ secuencial: string; numeroFactura: string }> {
  const key = `${estab}-${ptoEmi}`;

  return withLock(key, async () => {
    const maxEnAirtable = await maxSecuencialUsado(estab, ptoEmi);

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
