// Leer y crear hojas de Excel (.xlsx) sin librerías pesadas (punto 9d,
// entrega 2 · 15-oct-2026).
//
// Un .xlsx es un .zip con archivos de texto (XML) adentro. fflate abre y arma
// el .zip; aquí solo se lee la primera hoja (texto, números, Sí/No) y se arma
// la plantilla SUPER GEEK con sus listas desplegables. Funciona igual en el
// navegador que en las pruebas.

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

function decodificarXml(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function escaparXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Todo el texto de los <t> de un trozo de XML (sin la guía fonética <rPh>). */
function textoDeT(xml: string): string {
  const sinFonetica = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  for (const m of sinFonetica.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += decodificarXml(m[1]);
  return out;
}

function columnaDeReferencia(ref: string): number {
  const letras = (ref.match(/^[A-Z]+/i)?.[0] ?? "").toUpperCase();
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function letraDeColumna(i: number): string {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** ¿Estos bytes son un .xlsx (un .zip)? */
export function esXlsx(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/** Texto de un CSV: UTF-8, o el formato de Excel en Windows si no es UTF-8. */
export function textoDeArchivo(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Filas de la PRIMERA hoja del libro, como texto. */
export function leerXlsx(bytes: Uint8Array): string[][] {
  let archivos: Record<string, Uint8Array>;
  try {
    archivos = unzipSync(bytes);
  } catch {
    throw new Error("El archivo no se pudo abrir. Guárdalo como .xlsx o .csv y vuelve a intentar.");
  }
  const leer = (ruta: string) => (archivos[ruta] ? strFromU8(archivos[ruta]) : "");

  // ¿Cuál es la primera hoja?
  let rutaHoja = "";
  const libro = leer("xl/workbook.xml");
  const primera = libro.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1] ?? libro.match(/<sheet\b[^>]*\bid="([^"]+)"/)?.[1];
  if (primera) {
    const rels = leer("xl/_rels/workbook.xml.rels");
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
      if (m[0].includes(`Id="${primera}"`)) {
        const destino = m[0].match(/Target="([^"]+)"/)?.[1] ?? "";
        rutaHoja = destino.startsWith("/") ? destino.slice(1) : `xl/${destino.replace(/^\.\//, "")}`;
      }
    }
  }
  if (!archivos[rutaHoja]) rutaHoja = Object.keys(archivos).filter((k) => /^xl\/worksheets\/[^/]+\.xml$/.test(k)).sort()[0] ?? "";
  const hoja = leer(rutaHoja);
  if (!hoja) throw new Error("El archivo no tiene hojas con datos.");

  const compartidos: string[] = [];
  for (const m of leer("xl/sharedStrings.xml").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) compartidos.push(textoDeT(m[1]));

  const filas: string[][] = [];
  for (const fila of hoja.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const numero = Number(fila[1].match(/\br="(\d+)"/)?.[1] ?? filas.length + 1);
    const celdas: string[] = [];
    let siguiente = 0;
    for (const c of (fila[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const ref = attrs.match(/\br="([A-Z]+\d*)"/i)?.[1];
      const col = ref ? columnaDeReferencia(ref) : siguiente;
      siguiente = col + 1;
      const tipo = attrs.match(/\bt="([^"]+)"/)?.[1] ?? "n";
      const cuerpo = c[2] ?? "";
      const v = cuerpo.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let texto = "";
      if (tipo === "s") texto = compartidos[Number(v)] ?? "";
      else if (tipo === "inlineStr") texto = textoDeT(cuerpo);
      else if (tipo === "b") texto = v === "1" ? "Sí" : "No";
      else if (tipo === "e") texto = "";
      else texto = v === undefined ? "" : decodificarXml(v);
      while (celdas.length < col) celdas.push("");
      celdas[col] = texto.trim();
    }
    while (filas.length < numero - 1) filas.push([]);
    filas[numero - 1] = celdas;
  }
  return filas.filter((f) => f.some((x) => x !== ""));
}

// ─── Plantilla SUPER GEEK ───────────────────────────────────────────────────

export type ColumnaPlantilla = {
  titulo: string;
  ancho: number;
  /** Lista desplegable (en la hoja oculta "Listas"), "Sí/No", número entero ≥ 1 o número ≥ 0. */
  validacion?: { lista: readonly string[]; nombre: string } | "si-no" | "entero" | "monto";
};

const FILAS_CON_VALIDACION = 500;

function celdaTexto(ref: string, texto: string, estilo = 0): string {
  return `<c r="${ref}" t="inlineStr"${estilo ? ` s="${estilo}"` : ""}><is><t xml:space="preserve">${escaparXml(texto)}</t></is></c>`;
}

/**
 * Libro con una hoja "Compra" (los títulos y, debajo, listas desplegables)
 * y una hoja oculta "Listas" con las opciones del portal.
 */
export function crearPlantillaXlsx(columnas: ColumnaPlantilla[]): Uint8Array {
  const listas = columnas.flatMap((c) => (c.validacion && typeof c.validacion === "object" ? [c.validacion] : []));
  const ultima = FILAS_CON_VALIDACION + 1;

  const titulos = columnas.map((c, i) => celdaTexto(`${letraDeColumna(i)}1`, c.titulo, 1)).join("");
  const anchos = columnas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.ancho}" customWidth="1"${c.validacion === "monto" ? ' style="2"' : ""}/>`).join("");
  const validaciones = columnas
    .map((c, i) => {
      const rango = `${letraDeColumna(i)}2:${letraDeColumna(i)}${ultima}`;
      const v = c.validacion;
      if (!v) return "";
      if (v === "si-no") return `<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Regalo" error="Escribe Sí o No." sqref="${rango}"><formula1>"Sí,No"</formula1></dataValidation>`;
      if (v === "entero") return `<dataValidation type="whole" operator="greaterThanOrEqual" allowBlank="1" showErrorMessage="1" errorTitle="${escaparXml(c.titulo)}" error="Debe ser un número entero desde 1." sqref="${rango}"><formula1>1</formula1></dataValidation>`;
      if (v === "monto") return `<dataValidation type="decimal" operator="greaterThanOrEqual" allowBlank="1" showErrorMessage="1" errorTitle="${escaparXml(c.titulo)}" error="Debe ser un número desde 0 (sin el signo $)." sqref="${rango}"><formula1>0</formula1></dataValidation>`;
      return `<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="${escaparXml(c.titulo)}" error="Elige una opción de la lista." sqref="${rango}"><formula1>${v.nombre}</formula1></dataValidation>`;
    })
    .filter(Boolean);

  const hojaCompra =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<dimension ref="A1:${letraDeColumna(columnas.length - 1)}1"/>` +
    `<sheetViews><sheetView workbookViewId="0" tabSelected="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    `<cols>${anchos}</cols>` +
    `<sheetData><row r="1">${titulos}</row></sheetData>` +
    (validaciones.length ? `<dataValidations count="${validaciones.length}">${validaciones.join("")}</dataValidations>` : "") +
    `<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>` +
    `</worksheet>`;

  const largo = Math.max(1, ...listas.map((l) => l.lista.length));
  const filasListas: string[] = [];
  filasListas.push(`<row r="1">${listas.map((l, i) => celdaTexto(`${letraDeColumna(i)}1`, l.nombre, 1)).join("")}</row>`);
  for (let r = 0; r < largo; r++) {
    const celdas = listas.map((l, i) => (l.lista[r] !== undefined ? celdaTexto(`${letraDeColumna(i)}${r + 2}`, l.lista[r]) : "")).join("");
    filasListas.push(`<row r="${r + 2}">${celdas}</row>`);
  }
  const hojaListas =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<cols>${listas.map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="26" customWidth="1"/>`).join("")}</cols>` +
    `<sheetData>${filasListas.join("")}</sheetData>` +
    `<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>` +
    `</worksheet>`;

  const nombres = listas
    .map((l, i) => `<definedName name="${l.nombre}">Listas!$${letraDeColumna(i)}$2:$${letraDeColumna(i)}$${l.lista.length + 1}</definedName>`)
    .join("");
  const libro =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<bookViews><workbookView activeTab="0"/></bookViews>` +
    `<sheets><sheet name="Compra" sheetId="1" r:id="rId1"/><sheet name="Listas" sheetId="2" state="hidden" r:id="rId2"/></sheets>` +
    (nombres ? `<definedNames>${nombres}</definedNames>` : "") +
    `</workbook>`;

  const estilos =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF101318"/><name val="Calibri"/></font></fonts>` +
    `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD7FF4F"/><bgColor indexed="64"/></patternFill></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`;

  return zipSync(
    {
      "[Content_Types].xml": strToU8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
          `<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
          `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
          `</Types>`
      ),
      "_rels/.rels": strToU8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
      ),
      "xl/workbook.xml": strToU8(libro),
      "xl/_rels/workbook.xml.rels": strToU8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
          `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>` +
          `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
          `</Relationships>`
      ),
      "xl/styles.xml": strToU8(estilos),
      "xl/worksheets/sheet1.xml": strToU8(hojaCompra),
      "xl/worksheets/sheet2.xml": strToU8(hojaListas),
    },
    { level: 6 }
  );
}
