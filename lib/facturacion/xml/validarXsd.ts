import "server-only";

import { execFileSync } from "child_process";
import path from "path";

// process.cwd() en vez de __dirname: bajo el bundler de Next.js (Turbopack)
// __dirname de un route handler se reescribe a una ruta de tracing que no
// existe en disco (ver auditoría de Fase 16 — este archivo solo se había
// ejecutado antes vía tsx, nunca dentro del runtime real de Next.js). El
// resto del módulo ya usa process.cwd() para rutas de archivos en runtime
// (repositorio.ts, generarRide.ts) — mismo patrón aquí.
const XSD = path.join(process.cwd(), "lib/facturacion/xsd/factura_v2.1.0.xsd");

export type ResultadoValidacion =
  | { valido: true }
  | { valido: false; errores: string[] };

/**
 * Valida un XML de factura contra el XSD oficial SRI v2.1.0.
 * Usa xmllint (preinstalado en macOS y sistemas Linux estándar).
 * Solo para uso en servidor / tests — no en client bundles.
 */
export function validarContraXsd(xml: string): ResultadoValidacion {
  try {
    execFileSync("xmllint", ["--schema", XSD, "--noout", "--nonet", "-"], {
      input: xml,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { valido: true };
  } catch (err: unknown) {
    const stderr: string = (err as NodeJS.ErrnoException & { stderr?: string }).stderr ?? "";
    const errores = stderr
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.endsWith("validates"));
    return { valido: false, errores };
  }
}
