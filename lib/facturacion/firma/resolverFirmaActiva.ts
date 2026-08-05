import "server-only";

// De dónde sale el .p12 con el que se firma cada comprobante.
//
// Dos orígenes, en este orden:
//
//   1. AIRTABLE — la firma que el administrador cargó desde
//      Facturación → Firma electrónica. Es el camino nuevo y el que debería
//      ganar siempre una vez que se suba la primera.
//
//   2. VARIABLES DE ENTORNO — SRI_FIRMA_P12_BASE64 / SRI_FIRMA_PATH +
//      SRI_FIRMA_PASSWORD. Es exactamente el comportamiento anterior a este
//      módulo, intacto.
//
// El fallback no es una concesión: es lo que hace que este cambio se pueda
// desplegar sin un instante de riesgo. Mientras no exista ninguna firma activa
// en Airtable, el sistema firma igual que ayer. Cuando se cargue la primera,
// pasa a usarla sin tocar ninguna variable ni volver a desplegar.
//
// NOTA (PR1): aquí NO se bloquea la emisión con un certificado vencido. El
// bloqueo y las alertas van en el PR de avisos, junto con el banner y las
// notificaciones. Este módulo ya devuelve las fechas de vigencia para que ese
// PR no tenga que volver a leer el certificado.

import fs     from "fs";
import os     from "os";
import path   from "path";

import { leerFirmaActivaDescifrada } from "./almacen";
import { resolverRutaP12 }           from "./resolverP12";
import { inspeccionarP12 }           from "./inspeccionar";
import { huellaSha256 }              from "./cripto";
import type { MetadatosFirma }       from "./inspeccionar";

export type OrigenFirma = "airtable" | "entorno";

export type FirmaResuelta = {
  /** Ruta en disco del .p12, lista para pasar a firmarXml(). */
  p12Path:  string;
  password: string;
  origen:   OrigenFirma;
  /** Presente siempre que se haya podido leer el certificado. */
  metadatos?: MetadatosFirma;
};

// Caché por instancia: materializar el .p12 y parsearlo en cada emisión sería
// trabajo repetido. La clave es la huella del contenido, así que si se carga
// una firma distinta la caché no aplica y se vuelve a materializar sola.
let cache: { huella: string; firma: FirmaResuelta } | undefined;

/** Solo para pruebas: limpia la caché entre casos. */
export function _resetCacheFirmaActiva(): void {
  cache = undefined;
}

/**
 * Escribe el .p12 en el único directorio escribible en serverless (/tmp), con
 * un nombre derivado del contenido: si el certificado cambia, cambia el
 * archivo, y nunca queda uno viejo confundiendo.
 */
function materializar(p12: Buffer, huella: string): string {
  const destino = path.join(os.tmpdir(), `sri-firma-${huella.slice(0, 16)}.p12`);
  if (!fs.existsSync(destino)) {
    fs.writeFileSync(destino, p12, { mode: 0o600 });
  }
  return destino;
}

export async function obtenerFirmaActiva(): Promise<FirmaResuelta> {
  // ── 1. Airtable ────────────────────────────────────────────────────────────
  let desdeAirtable: Awaited<ReturnType<typeof leerFirmaActivaDescifrada>> = null;
  try {
    desdeAirtable = await leerFirmaActivaDescifrada();
  } catch (e) {
    // Un fallo leyendo Airtable (red, permisos, llave maestra cambiada) no
    // debe dejar al taller sin poder facturar si las variables de entorno
    // siguen configuradas. Se registra y se cae al fallback.
    console.error("[obtenerFirmaActiva] no se pudo leer la firma de Airtable:", e);
  }

  if (desdeAirtable) {
    const huella = huellaSha256(desdeAirtable.p12);
    if (cache?.huella === huella) return cache.firma;

    const firma: FirmaResuelta = {
      p12Path:  materializar(desdeAirtable.p12, huella),
      password: desdeAirtable.password,
      origen:   "airtable",
      metadatos: inspeccionarP12(desdeAirtable.p12, desdeAirtable.password),
    };
    cache = { huella, firma };
    return firma;
  }

  // ── 2. Variables de entorno (comportamiento anterior, sin cambios) ────────
  const password = process.env.SRI_FIRMA_PASSWORD?.trim();
  if (!password) {
    throw new Error(
      "No hay ninguna firma electrónica configurada. Carga una en " +
      "Facturación → Firma electrónica, o define SRI_FIRMA_PASSWORD junto con " +
      "SRI_FIRMA_P12_BASE64 (o SRI_FIRMA_PATH)."
    );
  }

  const p12Path = resolverRutaP12({
    firmaPathLocal: process.env.SRI_FIRMA_PATH?.trim() || undefined,
    p12Base64:      process.env.SRI_FIRMA_P12_BASE64?.trim() || undefined,
    password,
  });

  // Los metadatos son informativos: si el archivo no se puede leer aquí, la
  // firma en sí ya fallaría más adelante con su propio error. No se rompe la
  // emisión por no poder mostrar una fecha.
  let metadatos: MetadatosFirma | undefined;
  try {
    metadatos = inspeccionarP12(fs.readFileSync(p12Path), password);
  } catch (e) {
    console.error("[obtenerFirmaActiva] no se pudieron leer los metadatos del .p12:", e);
  }

  return { p12Path, password, origen: "entorno", metadatos };
}
