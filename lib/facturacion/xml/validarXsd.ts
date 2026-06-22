import "server-only";

import { execFileSync } from "child_process";
import path from "path";

const XSD = path.join(__dirname, "../xsd/factura_v2.1.0.xsd");

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
