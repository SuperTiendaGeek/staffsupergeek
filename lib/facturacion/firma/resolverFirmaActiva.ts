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

import fs     from "fs";
import os     from "os";
import path   from "path";

import { leerFirmaActivaDescifrada } from "./almacen";
import { resolverRutaP12 }           from "./resolverP12";
import { inspeccionarP12 }           from "./inspeccionar";
import { huellaSha256 }              from "./cripto";
import { diasRestantes }             from "./vigencia";
import { FacturacionRechazoError }   from "../errores";
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

// Caché por instancia, con dos motivos distintos:
//
//   · Materializar el .p12 y parsearlo en cada emisión sería trabajo repetido.
//   · Desde el PR3, el banner de vencimiento consulta esto en cada carga de
//     pantalla de facturación. Sin un TTL, cada visita sería una lectura a
//     Airtable + un descifrado + un parseo de certificado.
//
// El TTL es corto a propósito: un minuto después de cargar una firma nueva,
// cualquier instancia que no haya pasado por el POST también la ve. Y el POST
// llama a _resetCacheFirmaActiva() para que la instancia que atendió la carga
// la use de inmediato.
const TTL_MS = 60_000;

let cache: { huella: string; firma: FirmaResuelta; leidoEn: number } | undefined;

/** Solo para pruebas y para invalidar tras cargar una firma nueva. */
export function _resetCacheFirmaActiva(): void {
  cache = undefined;
}

/** Expuesto para tests: ¿la caché sigue fresca? */
export function _cacheFresca(ahora = Date.now()): boolean {
  return !!cache && ahora - cache.leidoEn < TTL_MS;
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
  // ── 0. Caché fresca: ni Airtable, ni descifrado, ni parseo ────────────────
  if (cache && Date.now() - cache.leidoEn < TTL_MS) return cache.firma;

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

    // Mismo certificado que el cacheado: se refresca la marca de tiempo y se
    // evita volver a parsear, aunque el TTL ya hubiera expirado.
    if (cache?.huella === huella) {
      cache.leidoEn = Date.now();
      return cache.firma;
    }

    const firma: FirmaResuelta = {
      p12Path:  materializar(desdeAirtable.p12, huella),
      password: desdeAirtable.password,
      origen:   "airtable",
      metadatos: inspeccionarP12(desdeAirtable.p12, desdeAirtable.password),
    };
    cache = { huella, firma, leidoEn: Date.now() };
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

// ─── Bloqueo por certificado vencido ─────────────────────────────────────────

/**
 * Aborta la emisión si la firma ya venció.
 *
 * Sin esto, el intento sigue su curso: se arma el XML, se firma, se manda al
 * SRI y vuelve con "[39] FIRMA INVALIDA" — un error críptico que no dice que
 * el problema es la fecha del certificado. Peor: en producción ese intento
 * fallido queda registrado y se salta un número de la serie.
 *
 * Se lanza FacturacionRechazoError porque los endpoints de emisión ya lo
 * traducen a un 400 con el mensaje visible para el usuario, en vez de un 500.
 *
 * Si no se pudieron leer los metadatos del certificado NO se bloquea: preferir
 * que el SRI rechace a dejar al taller sin facturar por no poder parsear un
 * archivo que quizá esté perfectamente bien.
 */
export function assertFirmaVigente(firma: FirmaResuelta, ahora: Date = new Date()): void {
  if (!firma.metadatos) return;

  const dias = diasRestantes(firma.metadatos.validoHasta, ahora);
  if (dias >= 0) return;

  const fecha = firma.metadatos.validoHasta.toLocaleDateString("es-EC", {
    day: "numeric", month: "long", year: "numeric",
  });

  throw new FacturacionRechazoError(
    `La firma electrónica venció el ${fecha}. El SRI rechaza cualquier comprobante ` +
    `firmado con ella. Carga el certificado renovado en Facturación → Firma electrónica ` +
    `y vuelve a intentarlo.`
  );
}
