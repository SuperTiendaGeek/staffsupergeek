/**
 * Reglas que decide si un .p12 se puede aceptar como firma activa.
 *
 * Separado del endpoint y sin "server-only" a propósito: son funciones puras
 * (sin red, sin Airtable, sin variables de entorno) para poder probarlas sin
 * montar nada — mismo criterio que `notaCredito/calculos.ts`.
 *
 * Fail closed: cualquier duda rechaza. Cargar una firma equivocada no es un
 * error recuperable — el sistema empezaría a firmar documentos tributarios
 * con la identidad de otra persona, o con un certificado que el SRI rechaza.
 */

import type { MetadatosFirma } from "./inspeccionar";
import { identificacionCoincideConRuc } from "./inspeccionar";
import { diasRestantes, UMBRAL_CRITICO } from "./vigencia";

export type RechazoCarga = { motivo: string };

export type EntradaValidacion = {
  metadatos: MetadatosFirma;
  /** SRI_RUC — el RUC con el que emite el negocio. */
  ruc: string;
  ahora: Date;
  /** ¿Ya hay una firma cargada con este mismo archivo? */
  huellaYaExiste: boolean;
};

/**
 * Devuelve null si el certificado se puede activar, o el motivo del rechazo.
 * El orden importa: primero lo que no tiene arreglo, después lo que sí.
 */
export function evaluarCargaFirma(e: EntradaValidacion): RechazoCarga | null {
  const { metadatos: m, ruc, ahora } = e;

  // 1. ¿Es de este negocio? El error más caro de todos: firmar con la
  //    identidad de otro contribuyente.
  if (!identificacionCoincideConRuc(m.identificacion, ruc)) {
    return {
      motivo:
        `Este certificado está a nombre de ${m.titular} ` +
        `(identificación ${m.identificacion || "no legible"}), que no corresponde al RUC ` +
        `configurado del negocio (${ruc || "no configurado"}). Revisa que sea el archivo correcto.`,
    };
  }

  // 2. ¿Ya venció?
  if (diasRestantes(m.validoHasta, ahora) < 0) {
    return {
      motivo:
        `Este certificado venció el ${m.validoHasta.toLocaleDateString("es-EC")}. ` +
        `El SRI rechaza cualquier comprobante firmado con él. Carga el certificado renovado.`,
    };
  }

  // 3. ¿Todavía no empieza a ser válido? Pasa cuando se descarga la firma
  //    renovada antes de que arranque su vigencia.
  if (m.validoDesde.getTime() > ahora.getTime()) {
    return {
      motivo:
        `Este certificado todavía no está vigente: empieza el ` +
        `${m.validoDesde.toLocaleDateString("es-EC")}. Cárgalo a partir de esa fecha.`,
    };
  }

  // 4. ¿Es el mismo que ya está cargado?
  if (e.huellaYaExiste) {
    return {
      motivo:
        "Este certificado ya está cargado en el sistema. Si querías reemplazarlo por uno " +
        "renovado, revisa que estés subiendo el archivo nuevo.",
    };
  }

  return null;
}

/**
 * Aviso NO bloqueante: el certificado sirve, pero le queda poco. Se muestra
 * junto al mensaje de éxito para que nadie cargue una firma que ya nace corta
 * creyendo que resolvió el problema por un año.
 */
export function avisoAlCargar(m: MetadatosFirma, ahora: Date): string | null {
  const dias = diasRestantes(m.validoHasta, ahora);
  if (dias > UMBRAL_CRITICO) return null;
  return (
    `Atención: este certificado vence en ${dias} ${dias === 1 ? "día" : "días"} ` +
    `(${m.validoHasta.toLocaleDateString("es-EC")}). Sirve, pero conviene renovarlo pronto.`
  );
}
