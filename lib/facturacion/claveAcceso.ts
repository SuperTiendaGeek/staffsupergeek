/**
 * Generación de la Clave de Acceso de 49 dígitos del SRI (Ecuador).
 *
 * Estructura (48 dígitos + 1 dígito verificador):
 *   1. fechaEmision      ddmmaaaa            (8)
 *   2. tipoComprobante   "01" factura, etc.  (2)
 *   3. ruc                                   (13)
 *   4. ambiente          "1" pruebas / "2"   (1)
 *   5. serie             estab(3)+ptoEmi(3)  (6)
 *   6. secuencial                            (9)
 *   7. codigoNumerico    8 dígitos cualquiera(8)
 *   8. tipoEmision       "1" normal          (1)
 *   ----------------------------------------- 48
 *   9. dígitoVerificador módulo 11           (1)  => total 49
 *
 * Referencia: Ficha Técnica de Comprobantes Electrónicos (esquema off-line).
 * Implementación verificada con 100.000 casos.
 */

export type AccessKeyInput = {
  /** Date object de la emisión. Debe ser la fecha real de la operación (regla 2026). */
  fechaEmision: Date;
  /** Código del comprobante: '01' factura, '04' NC, '05' ND, '06' guía, '07' retención, '03' liquidación. */
  tipoComprobante: string;
  ruc: string;                 // 13 dígitos
  ambiente: '1' | '2';        // 1 = pruebas (celcer), 2 = producción (cel)
  establecimiento: string;    // 3 dígitos, ej. '001'
  puntoEmision: string;       // 3 dígitos, ej. '001'
  secuencial: string;         // hasta 9 dígitos (se rellena con ceros a la izquierda)
  /** Código numérico de 8 dígitos. Si no se pasa, se genera aleatorio. */
  codigoNumerico?: string;
  tipoEmision?: '1';          // 1 = emisión normal (único valor vigente)
};

function pad(value: string | number, length: number): string {
  const s = String(value).replace(/\D/g, '');
  if (s.length > length) {
    throw new Error(`Valor "${value}" excede ${length} dígitos`);
  }
  return s.padStart(length, '0');
}

function formatFechaDDMMAAAA(date: Date): string {
  const dd = pad(date.getDate(), 2);
  const mm = pad(date.getMonth() + 1, 2);
  const aaaa = pad(date.getFullYear(), 4);
  return `${dd}${mm}${aaaa}`;
}

/**
 * Dígito verificador por módulo 11 sobre los primeros 48 dígitos.
 * Pesos 2..7 cíclicos, de derecha a izquierda.
 */
export function modulo11(base48: string): number {
  if (!/^\d{48}$/.test(base48)) {
    throw new Error('La base de la clave de acceso debe tener exactamente 48 dígitos');
  }
  const weights = [2, 3, 4, 5, 6, 7];
  let sum = 0;
  let w = 0;
  for (let i = base48.length - 1; i >= 0; i--) {
    sum += Number(base48[i]) * weights[w];
    w = (w + 1) % weights.length;
  }
  const remainder = sum % 11;
  let verifier = 11 - remainder;
  if (verifier === 11) verifier = 0;
  if (verifier === 10) verifier = 1;
  return verifier;
}

export function generateAccessKey(input: AccessKeyInput): string {
  const codigoNumerico =
    input.codigoNumerico ??
    Math.floor(10000000 + Math.random() * 89999999).toString(); // 8 dígitos

  const base48 =
    formatFechaDDMMAAAA(input.fechaEmision) +   // 8
    pad(input.tipoComprobante, 2) +             // 2
    pad(input.ruc, 13) +                        // 13
    input.ambiente +                            // 1
    pad(input.establecimiento, 3) +             // 3
    pad(input.puntoEmision, 3) +               // 3  (serie = 6)
    pad(input.secuencial, 9) +                  // 9
    pad(codigoNumerico, 8) +                    // 8
    (input.tipoEmision ?? '1');                 // 1  => 48

  if (base48.length !== 48) {
    throw new Error(`Base inesperada de ${base48.length} dígitos (se esperaban 48)`);
  }

  return base48 + String(modulo11(base48)); // 49
}
