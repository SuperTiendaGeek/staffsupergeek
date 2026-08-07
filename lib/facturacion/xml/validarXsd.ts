import "server-only";

import { execFileSync } from "child_process";
import fs   from "fs";
import path from "path";

// Validación de un XML contra un XSD, con xmllint.
//
// process.cwd() en vez de __dirname: bajo el bundler de Next.js (Turbopack)
// __dirname de un route handler se reescribe a una ruta de tracing que no
// existe en disco (ver auditoría de Fase 16 — este archivo solo se había
// ejecutado antes vía tsx, nunca dentro del runtime real de Next.js). El
// resto del módulo ya usa process.cwd() para rutas de archivos en runtime
// (repositorio.ts, generarRide.ts) — mismo patrón aquí.
const XSD = path.join(process.cwd(), "lib/facturacion/xsd/factura_v2.1.0.xsd");

// ─── Por qué hay tres estados y no dos ───────────────────────────────────────
//
// La versión anterior devolvía solo válido/inválido. Si xmllint NO existe en el
// entorno —y no es un binario que Vercel garantice en su runtime— execFileSync
// lanza ENOENT, el stderr viene vacío, y el resultado era
// `{ valido: false, errores: [] }`. Es decir: TODA emisión se habría caído con
// el mensaje "El XML generado no pasa la validación XSD del SRI:" y nada
// después. Un problema de herramienta disfrazado de documento inválido, en el
// punto más caro del sistema.
//
// Ahora se distingue "no se pudo validar" de "es inválido". Ante un fallo de
// herramienta se deja pasar y se registra ruidosamente: el SRI sigue siendo el
// que valida de verdad, y es mucho peor dejar al taller sin facturar por una
// dependencia ausente que perder una red de seguridad secundaria.

export type ResultadoValidacionDetallado =
  | { estado: "valido" }
  | { estado: "invalido"; errores: string[] }
  | { estado: "no-verificable"; motivo: string };

export type ResultadoValidacion =
  | { valido: true }
  | { valido: false; errores: string[] };

function esHerramientaAusente(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === "ENOENT" || code === "EACCES" || code === "EPERM";
}

/**
 * Valida `xml` contra el XSD indicado. No lanza nunca.
 */
export function validarContraXsdArchivo(xml: string, xsdPath: string): ResultadoValidacionDetallado {
  if (!fs.existsSync(xsdPath)) {
    return { estado: "no-verificable", motivo: `No se encontró el esquema ${xsdPath}` };
  }

  try {
    execFileSync("xmllint", ["--schema", xsdPath, "--noout", "--nonet", "-"], {
      input: xml,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { estado: "valido" };
  } catch (err: unknown) {
    if (esHerramientaAusente(err)) {
      return {
        estado: "no-verificable",
        motivo: "xmllint no está disponible en este entorno",
      };
    }

    const stderr: string = (err as NodeJS.ErrnoException & { stderr?: string }).stderr ?? "";
    const errores = stderr
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.endsWith("validates"));

    // stderr vacío con un fallo que no es ENOENT: no hay nada que reportar como
    // error del documento, así que tampoco se puede afirmar que sea inválido.
    if (errores.length === 0) {
      return {
        estado: "no-verificable",
        motivo: "xmllint falló sin devolver ningún detalle",
      };
    }

    return { estado: "invalido", errores };
  }
}

/**
 * Valida un XML de factura contra el XSD oficial SRI v2.1.0.
 *
 * Mantiene la forma booleana de siempre para no tocar a sus llamadores. Un
 * entorno sin xmllint se considera "válido" (no verificable) y se registra en
 * los logs — ver la nota de arriba.
 */
export function validarContraXsd(xml: string): ResultadoValidacion {
  const r = validarContraXsdArchivo(xml, XSD);

  if (r.estado === "valido") return { valido: true };

  if (r.estado === "no-verificable") {
    console.error(
      `[validarContraXsd] AVISO: no se pudo validar el XML contra el XSD del SRI (${r.motivo}). ` +
      "La emisión continúa; la validación real la hace el SRI. Revisa que xmllint esté " +
      "disponible en el entorno de despliegue para recuperar esta red de seguridad."
    );
    return { valido: true };
  }

  return { valido: false, errores: r.errores };
}

/** ¿Está xmllint disponible aquí? Para diagnóstico desde scripts. */
export function xmllintDisponible(): boolean {
  try {
    execFileSync("xmllint", ["--version"], { stdio: ["ignore", "ignore", "ignore"] });
    return true;
  } catch {
    return false;
  }
}
