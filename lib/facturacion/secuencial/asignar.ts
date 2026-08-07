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
 * ningún registro previo EN ESE AMBIENTE. Una vez que existe aunque sea un
 * registro del mismo ambiente, Airtable es la única fuente de verdad.
 *
 * Hallazgo M-1: el ambiente forma parte de la consulta. Las facturas de prueba
 * no consumen numeración de producción ni al revés.
 *
 * SERIALIZADO: llamadas concurrentes esperan su turno antes de leer Airtable,
 * evitando que dos emisiones tomen el mismo número.
 */
export async function siguienteSecuencial(
  estab:    string,
  ptoEmi:   string,
  ambiente: "1" | "2"
): Promise<{ secuencial: string; numeroFactura: string }> {
  // El lock incluye el ambiente: son dos cuentas independientes y no tienen
  // por qué esperarse la una a la otra.
  const key = `${estab}-${ptoEmi}-${ambiente}`;

  return withLock(key, async () => {
    const maxEnAirtable = await maxSecuencialUsado(estab, ptoEmi, ambiente);

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
