import "server-only";

import forge from "node-forge";

// Lectura de los datos que trae dentro un certificado .p12, para poder
// mostrarlos en pantalla y validar la carga ANTES de guardar nada:
//   · titular y entidad emisora
//   · identificación del titular (cédula/RUC) — se compara contra SRI_RUC
//   · vigencia (válido desde / válido hasta) — alimenta la alerta de caducidad
//
// Todo se lee del propio certificado. Nada se teclea a mano: si el usuario
// sube el .p12 de otra persona, lo detectamos aquí y no en el momento de
// emitir una factura real.

export class FirmaInvalidaError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "FirmaInvalidaError";
  }
}

export type MetadatosFirma = {
  /** Nombre común del titular tal como viene en el certificado. */
  titular: string;
  /** Entidad certificadora que lo emitió (Security Data, UANATACA, ANF…). */
  emisor: string;
  /** Cédula o RUC del titular, solo dígitos. Cadena vacía si no se pudo leer. */
  identificacion: string;
  validoDesde: Date;
  validoHasta: Date;
};

// ─── Helpers de lectura del certificado ──────────────────────────────────────

type CampoNombre = { value?: unknown } | undefined;

function valorCampo(campo: CampoNombre): string {
  const v = campo?.value;
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Extrae la primera cédula (10 dígitos) o RUC (13 dígitos) que aparezca en el
 * texto. Las entidades certificadoras ecuatorianas la ponen en distintos
 * campos según el emisor: `serialNumber` en Security Data, a veces dentro del
 * CN, a veces con prefijos tipo "CI-" o sufijos de serie del dispositivo.
 * Buscar el patrón es más robusto que apostar por un campo concreto.
 */
export function extraerIdentificacion(...textos: string[]): string {
  for (const texto of textos) {
    if (!texto) continue;
    // Se prueba primero 13 (RUC) y luego 10 (cédula) para no partir un RUC.
    const ruc = texto.match(/(?<!\d)(\d{13})(?!\d)/);
    if (ruc) return ruc[1];
    const cedula = texto.match(/(?<!\d)(\d{10})(?!\d)/);
    if (cedula) return cedula[1];
  }
  return "";
}

/**
 * ¿La identificación del certificado corresponde al RUC del emisor?
 *
 * En Ecuador el RUC de una persona natural es su cédula + "001", y el
 * certificado suele traer la cédula sola. Por eso se comparan los 10 primeros
 * dígitos de ambos, no las cadenas completas.
 */
export function identificacionCoincideConRuc(identificacion: string, ruc: string): boolean {
  const a = (identificacion ?? "").replace(/\D/g, "");
  const b = (ruc ?? "").replace(/\D/g, "");
  if (a.length < 10 || b.length < 10) return false;
  return a.slice(0, 10) === b.slice(0, 10);
}

/**
 * De todos los certificados que trae el .p12 (suele incluir la cadena de la
 * entidad certificadora), devuelve el del titular: el que NO es autoridad
 * certificadora. Si no se puede distinguir, se queda con el primero.
 */
function certificadoDelTitular(certs: forge.pki.Certificate[]): forge.pki.Certificate {
  const hojas = certs.filter((c) => {
    const bc = c.getExtension("basicConstraints") as { cA?: boolean } | undefined;
    return bc?.cA !== true;
  });
  return hojas[0] ?? certs[0];
}

// ─── API ─────────────────────────────────────────────────────────────────────

/**
 * Abre el .p12 con su contraseña y devuelve sus metadatos.
 *
 * Lanza `FirmaInvalidaError` con un mensaje entendible en los dos casos que
 * ocurren de verdad: contraseña equivocada y archivo que no es un .p12.
 */
export function inspeccionarP12(contenido: Buffer, password: string): MetadatosFirma {
  let asn1: forge.asn1.Asn1;
  try {
    asn1 = forge.asn1.fromDer(contenido.toString("binary"));
  } catch {
    throw new FirmaInvalidaError(
      "El archivo no es un certificado .p12/.pfx válido. Revisa que sea el archivo " +
      "que te entregó la entidad certificadora y no un comprobante o un ZIP."
    );
  }

  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password);
  } catch {
    throw new FirmaInvalidaError(
      "La contraseña no abre este certificado. Es la contraseña que definiste al " +
      "descargar la firma, no la de tu cuenta del SRI."
    );
  }

  const bolsas = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certs  = (bolsas[forge.pki.oids.certBag] ?? [])
    .map((b) => b.cert)
    .filter((c): c is forge.pki.Certificate => !!c);

  if (certs.length === 0) {
    throw new FirmaInvalidaError(
      "El archivo se abrió, pero no contiene ningún certificado. Está incompleto o corrupto."
    );
  }

  const cert = certificadoDelTitular(certs);

  const titularCn     = valorCampo(cert.subject.getField("CN") as CampoNombre);
  const titularSerial = valorCampo(cert.subject.getField({ type: "2.5.4.5" }) as CampoNombre);
  const emisorCn      = valorCampo(cert.issuer.getField("CN") as CampoNombre);
  const emisorO       = valorCampo(cert.issuer.getField("O")  as CampoNombre);

  return {
    titular:        titularCn || "(sin nombre en el certificado)",
    emisor:         emisorO || emisorCn || "(emisor desconocido)",
    identificacion: extraerIdentificacion(titularSerial, titularCn),
    validoDesde:    cert.validity.notBefore,
    validoHasta:    cert.validity.notAfter,
  };
}
