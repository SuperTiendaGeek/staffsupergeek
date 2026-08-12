/**
 * Lee un export del sistema viejo, sea .csv o .xlsx, y devuelve filas de texto.
 *
 * ─── Por qué existe este archivo ─────────────────────────────────────────────
 *
 * El export real del sistema viejo llegó como .xlsx y con dos filas de adorno
 * antes de la cabecera:
 *
 *     fila 1   SUPER TIENDA GEEK
 *     fila 2   Productos
 *     fila 3   Código │ Nombre │ Descripción │ Stock Actual │ Precio de Venta │ …
 *     fila 4   ACC-000001 │ Kensington Combination Lock │ …
 *
 * Un lector que asuma "la cabecera es la primera fila" toma "SUPER TIENDA GEEK"
 * como cabecera y no encuentra ni una columna. Por eso aquí se BUSCA la fila de
 * cabecera en vez de suponerla.
 *
 * No se añadió ninguna dependencia de Excel al proyecto: esto es una
 * herramienta de un solo uso y no vale la pena cargar el package.json para
 * siempre por ella. El .xlsx se abre con zlib, que ya viene con Node.
 */

import fs   from "fs";
import zlib from "zlib";

// ═══════════════════════════════════════════════════════════════════════════
// ZIP — un .xlsx es un zip con XML adentro
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Saca los archivos de un zip leyendo el directorio central.
 *
 * Se lee el directorio central y no las cabeceras locales porque estas últimas
 * pueden traer el tamaño en cero y remitirlo a un descriptor posterior, cosa
 * que Excel hace a veces. El directorio central siempre tiene los tamaños.
 */
function descomprimirZip(buf: Buffer): Map<string, Buffer> {
  const archivos = new Map<string, Buffer>();

  // El EOCD está al final; puede llevar comentario, así que se busca hacia atrás.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66_000; i--) {
    if (buf.readUInt32LE(i) === 0x0605_4b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("El archivo .xlsx no parece un zip válido");

  const total    = buf.readUInt16LE(eocd + 10);
  let   posicion = buf.readUInt32LE(eocd + 16);

  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(posicion) !== 0x0201_4b50) break;

    const metodo      = buf.readUInt16LE(posicion + 10);
    const tamComprim  = buf.readUInt32LE(posicion + 20);
    const largoNombre = buf.readUInt16LE(posicion + 28);
    const largoExtra  = buf.readUInt16LE(posicion + 30);
    const largoComent = buf.readUInt16LE(posicion + 32);
    const offsetLocal = buf.readUInt32LE(posicion + 42);
    const nombre      = buf.toString("utf8", posicion + 46, posicion + 46 + largoNombre);

    // La cabecera local repite nombre y extra, y sus largos pueden diferir.
    const lNombre = buf.readUInt16LE(offsetLocal + 26);
    const lExtra  = buf.readUInt16LE(offsetLocal + 28);
    const inicio  = offsetLocal + 30 + lNombre + lExtra;
    const crudo   = buf.subarray(inicio, inicio + tamComprim);

    archivos.set(nombre, metodo === 8 ? zlib.inflateRawSync(crudo) : Buffer.from(crudo));
    posicion += 46 + largoNombre + largoExtra + largoComent;
  }

  return archivos;
}

// ═══════════════════════════════════════════════════════════════════════════
// XLSX
// ═══════════════════════════════════════════════════════════════════════════

function desescapar(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");   // al final, si no se re-escapan los anteriores
}

/** "BC12" → 54 (índice de columna, base 0) */
function columnaDeReferencia(ref: string): number {
  const letras = /^([A-Z]+)/.exec(ref)?.[1] ?? "A";
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function leerXlsx(ruta: string): string[][] {
  const zip = descomprimirZip(fs.readFileSync(ruta));

  // Textos compartidos: Excel guarda las cadenas una sola vez y las referencia.
  const compartidos: string[] = [];
  const ss = zip.get("xl/sharedStrings.xml")?.toString("utf8");
  if (ss) {
    for (const [, si] of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      // Un <si> puede venir partido en varios <t> si tiene formato mezclado.
      let texto = "";
      for (const [, t] of si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) texto += t;
      compartidos.push(desescapar(texto));
    }
  }

  // La primera hoja. Los nombres reales van en workbook.xml, pero para un
  // export de una sola hoja alcanza con tomar la de número más bajo.
  const nombreHoja = [...zip.keys()]
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort()[0];
  if (!nombreHoja) throw new Error("El .xlsx no tiene ninguna hoja legible");

  const hoja  = zip.get(nombreHoja)!.toString("utf8");
  const filas: string[][] = [];

  for (const [, filaXml] of hoja.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const fila: string[] = [];

    for (const [, attrs, cuerpo] of filaXml.matchAll(/<c([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref  = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const tipo = /t="([^"]+)"/.exec(attrs)?.[1];
      const i    = ref ? columnaDeReferencia(ref) : fila.length;

      let valor = "";
      if (cuerpo) {
        if (tipo === "s") {
          const idx = Number(/<v>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1] ?? "-1");
          valor = compartidos[idx] ?? "";
        } else if (tipo === "inlineStr") {
          for (const [, t] of cuerpo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) valor += t;
          valor = desescapar(valor);
        } else {
          valor = desescapar(/<v>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1] ?? "");
        }
      }

      while (fila.length < i) fila.push("");
      fila[i] = valor;
    }

    filas.push(fila);
  }

  return filas;
}

// ═══════════════════════════════════════════════════════════════════════════
// CSV
// ═══════════════════════════════════════════════════════════════════════════

/** Parser de CSV que respeta comillas y comas dentro de un campo. */
export function parsearCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let enComillas = false;

  const limpio = texto.replace(/^﻿/, "");   // BOM de Excel

  // El separador puede ser coma o punto y coma; se decide por la primera línea.
  const primera = limpio.split(/\r?\n/, 1)[0] ?? "";
  const sep = (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ";" : ",";

  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (enComillas) {
      if (c === '"' && limpio[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') enComillas = false;
      else campo += c;
    } else if (c === '"') enComillas = true;
    else if (c === sep) { fila.push(campo); campo = ""; }
    else if (c === "\n") { fila.push(campo); filas.push(fila); fila = []; campo = ""; }
    else if (c !== "\r") campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

// ═══════════════════════════════════════════════════════════════════════════
// Cabecera
// ═══════════════════════════════════════════════════════════════════════════

export function normalizarCabecera(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Palabras que delatan una fila de cabecera de verdad. */
const SENALES = [
  "nombre", "descripcion", "titulo", "articulo", "item", "producto",
  "codigo", "sku", "referencia",
  "cantidad", "stock", "existencia",
  "costo", "precio", "pvp", "proveedor",
];

/**
 * Encuentra la fila de cabecera puntuando las primeras filas.
 *
 * El export real trae "SUPER TIENDA GEEK" y "Productos" antes de la cabecera
 * de verdad. Gana la fila con más señales; con empate, la primera.
 */
export function encontrarCabecera(filas: string[][]): number {
  let mejor = 0;
  let mejorPuntaje = -1;

  for (let i = 0; i < Math.min(filas.length, 15); i++) {
    const celdas = filas[i].map(normalizarCabecera).filter(Boolean);
    if (celdas.length < 2) continue;   // "SUPER TIENDA GEEK" sola no es cabecera

    const puntaje = celdas.filter((c) => SENALES.some((s) => c.includes(s))).length;
    if (puntaje > mejorPuntaje) { mejorPuntaje = puntaje; mejor = i; }
  }

  return mejorPuntaje > 0 ? mejor : 0;
}

// ═══════════════════════════════════════════════════════════════════════════

export interface TablaLeida {
  cabeceras: string[];
  filas:     string[][];
  formato:   "csv" | "xlsx";
  filaCabecera: number;
  descartadas:  number;
}

/** Lee .csv o .xlsx y separa la cabecera de los datos. */
export function leerTabla(ruta: string): TablaLeida {
  const esXlsx = /\.xlsx$/i.test(ruta);
  if (/\.xls$/i.test(ruta)) {
    throw new Error(
      "El formato .xls antiguo no se puede leer. Vuelve a guardarlo como .xlsx o .csv."
    );
  }

  const todas = (esXlsx ? leerXlsx(ruta) : parsearCsv(fs.readFileSync(ruta, "utf8")))
    .filter((f) => f.some((c) => String(c ?? "").trim() !== ""));

  if (!todas.length) throw new Error("El archivo está vacío");

  const filaCabecera = encontrarCabecera(todas);

  return {
    cabeceras:    todas[filaCabecera].map((c) => String(c ?? "")),
    filas:        todas.slice(filaCabecera + 1),
    formato:      esXlsx ? "xlsx" : "csv",
    filaCabecera,
    descartadas:  filaCabecera,
  };
}
