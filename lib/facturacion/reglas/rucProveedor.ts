/**
 * RUC del proveedor del sistema de facturación en <infoAdicional>.
 *
 * Norma: Resolución NAC-DGERCGC26-00000027 (R.O. 5.º Supl. 335, 28-jul-2026),
 * art. 5, y Ficha Técnica de Comprobantes Electrónicos Offline v2.34,
 * Anexo 26 (texto oficial, verificado el 24-sep-2026):
 *
 *   Nodo: <infoAdicional> · Tag: <campoAdicional> · Formato: alfanumérico,
 *   máx. 300 · Atributo nombre: "RUC Proveedor" · Contenido: RUC del proveedor.
 *   Plazo: 60 días calendario desde la publicación → 26-sep-2026.
 *
 * SUPER GEEK usa un sistema PROPIO, no comercializado: no es "proveedor" en
 * el sentido del art. 2 (no debe registrar el CIIU J62021002/3) y el Anexo 26
 * habla de quien usa sistemas "de terceros". Aun así se incluye el campo con
 * el RUC del dueño del sistema: el art. 5 habla de "los sujetos pasivos
 * emisores" sin excepción, el campo no cuesta nada y cierra la duda ante una
 * fiscalización.
 *
 * Configuración:
 *   SRI_PROVEEDOR_SISTEMA_RUC     RUC que va en el campo (13 dígitos).
 *   SRI_PROVEEDOR_SISTEMA_NOMBRE  Solo referencia interna. NUNCA va al XML ni
 *                                 al RIDE: la ficha pide únicamente el RUC.
 *
 * Si SRI_PROVEEDOR_SISTEMA_RUC falta se usa el RUC del emisor (SRI_RUC) y se
 * avisa en los logs: para un sistema propio es exactamente el valor correcto,
 * y así una variable olvidada en Vercel nunca produce comprobantes sin el
 * campo. Si está PRESENTE pero mal escrita, se bloquea la emisión ANTES de
 * pedir secuencial y antes de firmar: mejor un error visible que cientos de
 * comprobantes con un RUC equivocado.
 *
 * Sin "server-only": funciones puras, se prueban sin levantar Next.js.
 */

import type { CampoAdicional } from "../types/factura";
import { revisarIdentificacion } from "./identificacion";
import { FacturacionRechazoError } from "../errores";

/** Nombre EXACTO que exige el Anexo 26 — no traducir ni cambiar mayúsculas. */
export const NOMBRE_CAMPO_RUC_PROVEEDOR = "RUC Proveedor";

/** Tope del XSD del SRI (factura v2.1.0 y notaCredito v1.1.0). */
export const MAX_CAMPOS_INFO_ADICIONAL_SRI = 15;

/**
 * Tipos de comprobante (codDoc de la ficha técnica) a los que se aplica.
 * Hoy el sistema emite 01 y 04. Los demás quedan listados para que, el día
 * que se agregue su emisor, baste con llamar a infoAdicionalConRucProveedor()
 * — la regla ya los cubre.
 */
export const COMPROBANTES_CON_RUC_PROVEEDOR = {
  "01": "Factura",
  "03": "Liquidación de compra",
  "04": "Nota de crédito",
  "05": "Nota de débito",
  "06": "Guía de remisión",
  "07": "Comprobante de retención",
} as const;

// ─── Nombre normalizado ──────────────────────────────────────────────────────

/**
 * "RUC Proveedor", "ruc  proveedor", "Ruc_Proveedor", "RUC-PROVEEDOR" y
 * "RÚC Proveedor" son el mismo campo: sin tildes, minúsculas, separadores
 * colapsados a un espacio.
 */
export function normalizarNombreCampo(nombre: string): string {
  return String(nombre ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s_\-.:]+/g, " ")
    .trim();
}

const NOMBRE_NORMALIZADO = normalizarNombreCampo(NOMBRE_CAMPO_RUC_PROVEEDOR);

export function esCampoRucProveedor(nombre: string): boolean {
  return normalizarNombreCampo(nombre) === NOMBRE_NORMALIZADO;
}

// ─── Configuración ───────────────────────────────────────────────────────────

export type ConfigRucProveedor = {
  ruc: string;
  /** "variable" = SRI_PROVEEDOR_SISTEMA_RUC · "emisor" = respaldo con SRI_RUC. */
  origen: "variable" | "emisor";
  nombre?: string;
  /** Aviso no bloqueante (variable ausente, dígito verificador dudoso). */
  aviso?: string;
};

type Entorno = Record<string, string | undefined>;

/**
 * Lee y valida la configuración. Lanza FacturacionRechazoError si el RUC
 * configurado no tiene estructura de RUC. El dígito verificador solo
 * ADVIERTE — mismo criterio que la identificación del comprador: el SRI
 * emite RUCs reales que no cumplen su propio algoritmo (caso 1091797592001).
 */
export function resolverRucProveedor(rucEmisor: string, env: Entorno = process.env): ConfigRucProveedor {
  const crudo  = env.SRI_PROVEEDOR_SISTEMA_RUC?.trim() ?? "";
  const nombre = env.SRI_PROVEEDOR_SISTEMA_NOMBRE?.trim() || undefined;

  const origen: ConfigRucProveedor["origen"] = crudo ? "variable" : "emisor";
  const ruc = crudo || (rucEmisor ?? "").trim();

  const revision = revisarIdentificacion("04", ruc);
  if (revision.error) {
    throw new FacturacionRechazoError(
      origen === "variable"
        ? `SRI_PROVEEDOR_SISTEMA_RUC no es un RUC válido ("${ruc}"): ${revision.error} ` +
          "Corrige la variable de entorno; no se emitió nada."
        : `No hay SRI_PROVEEDOR_SISTEMA_RUC y el RUC del emisor no sirve como respaldo ("${ruc}"): ${revision.error}`
    );
  }

  const avisos: string[] = [];
  if (origen === "emisor") {
    avisos.push("SRI_PROVEEDOR_SISTEMA_RUC no está configurada: se usa el RUC del emisor (SRI_RUC) como RUC Proveedor.");
  }
  if (revision.advertencia) avisos.push(revision.advertencia);

  return { ruc, origen, nombre, ...(avisos.length ? { aviso: avisos.join(" ") } : {}) };
}

// ─── Aplicación sobre infoAdicional ──────────────────────────────────────────

/**
 * Devuelve una copia de `campos` con UN solo campoAdicional "RUC Proveedor":
 *   · si ya existe (con cualquier variante de escritura), se actualiza su
 *     valor en su misma posición, con el nombre exacto del Anexo 26, y se
 *     eliminan las repeticiones;
 *   · si no existe, se agrega al final.
 * Nunca toca los demás campos ni su orden. No muta la entrada.
 *
 * Lanza si el resultado supera los 15 campos del XSD: los constructores de
 * XML recortan en silencio con slice(0, 15) y el RUC Proveedor, que va al
 * final, sería justo el que se perdería.
 */
export function aplicarRucProveedor(
  campos: CampoAdicional[] | undefined,
  ruc: string,
  maxCampos: number = MAX_CAMPOS_INFO_ADICIONAL_SRI
): CampoAdicional[] {
  const valor = (ruc ?? "").trim();
  if (!valor) throw new FacturacionRechazoError("Falta el RUC del proveedor del sistema de facturación.");

  const resultado: CampoAdicional[] = [];
  let colocado = false;
  for (const c of campos ?? []) {
    if (esCampoRucProveedor(c.nombre)) {
      if (!colocado) {
        resultado.push({ nombre: NOMBRE_CAMPO_RUC_PROVEEDOR, valor });
        colocado = true;
      }
      continue; // duplicado: se descarta
    }
    resultado.push(c);
  }
  if (!colocado) resultado.push({ nombre: NOMBRE_CAMPO_RUC_PROVEEDOR, valor });

  if (resultado.length > maxCampos) {
    throw new FacturacionRechazoError(
      `La información adicional tendría ${resultado.length} campos y el SRI admite máximo ${maxCampos}; ` +
      `no hay espacio para "${NOMBRE_CAMPO_RUC_PROVEEDOR}". No se emitió nada.`
    );
  }
  return resultado;
}

/** Quita cualquier "RUC Proveedor" (útil para reservarle su espacio antes de componer). */
export function sinRucProveedor(campos: CampoAdicional[] | undefined): CampoAdicional[] {
  return (campos ?? []).filter((c) => !esCampoRucProveedor(c.nombre));
}

/**
 * Punto único para cualquier emisor de comprobantes: resuelve la config,
 * avisa en logs si hace falta y aplica el campo. Cualquier tipo de
 * comprobante nuevo (ver COMPROBANTES_CON_RUC_PROVEEDOR) debe pasar su
 * infoAdicional por aquí justo antes de construir el XML que se firma.
 */
export function infoAdicionalConRucProveedor(
  campos: CampoAdicional[] | undefined,
  rucEmisor: string,
  env: Entorno = process.env
): CampoAdicional[] {
  const cfg = resolverRucProveedor(rucEmisor, env);
  if (cfg.aviso) console.warn(`[facturacion] RUC Proveedor: ${cfg.aviso}`);
  return aplicarRucProveedor(campos, cfg.ruc);
}
