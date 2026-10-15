// Cargar la lista de una compra desde una hoja (auditoría Shipping V2, punto
// 9d, entrega 2 · 15-oct-2026).
//
// Lo que hacen Zoho Inventory u Odoo al importar: se pegan las filas copiadas
// de Excel o Google Sheets (o se sube el archivo), las columnas se reconocen
// por su título, se pregunta solo lo que no se reconoce (y se recuerda por
// proveedor) y todo se muestra antes de crear nada. Aquí las filas entran a
// la tabla de "Registrar compra": nada se guarda hasta "Registrar compra".
//
// Reglas del dueño (15-oct):
// · Plantilla SUPER GEEK: Nombre, Categoría, Condición, Cantidad, Costo
//   unitario, Precio de venta, SKU proveedor, Regalo (Sí/No), Notas internas.
// · Hoja de 3R: Item, SKU proveedor, Precio unidad, Precio total línea (la
//   cantidad sale de total ÷ precio unidad).
// · Se ignoran filas vacías y las de TOTAL / SUBTOTAL.
// · Un regalo no lleva costo (los regalos no suman al pago).
//
// Módulo puro: sin red ni navegador. Lo usan la pantalla y las pruebas.

import type { ColumnaPlantilla } from "@/lib/shipping-v2/hoja-xlsx";
import type { LineaCompra } from "@/lib/shipping-v2/ordenes-compra";

export type CampoImportable =
  | "nombre"
  | "categoria"
  | "condicion"
  | "cantidad"
  | "costoUnitario"
  | "totalLinea"
  | "precioVenta"
  | "skuProveedor"
  | "regalo"
  | "notas"
  | "marca"
  | "modelo"
  | "numeroSerie"
  | "descripcion";

/** "" = la columna se ignora. */
export type MapeoColumnas = Array<CampoImportable | "">;

export const ETIQUETA_CAMPO: Record<CampoImportable, string> = {
  nombre: "Nombre",
  categoria: "Categoría",
  condicion: "Condición",
  cantidad: "Cantidad",
  costoUnitario: "Costo unitario",
  totalLinea: "Total de la línea",
  precioVenta: "Precio de venta",
  skuProveedor: "SKU proveedor",
  regalo: "Regalo (Sí/No)",
  notas: "Notas internas",
  marca: "Marca",
  modelo: "Modelo",
  numeroSerie: "Nº de serie",
  descripcion: "Descripción",
};

export const CAMPOS_IMPORTABLES = Object.keys(ETIQUETA_CAMPO) as CampoImportable[];

export function normalizarTexto(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9#]+/g, " ")
    .trim();
}

/** Títulos conocidos (ya normalizados) de cada campo. */
const SINONIMOS: Record<CampoImportable, string[]> = {
  nombre: ["nombre", "item", "items", "articulo", "producto", "nombre del item", "nombre del articulo", "descripcion del producto", "equipo", "product", "product name", "name", "title"],
  categoria: ["categoria", "category", "tipo de articulo"],
  condicion: ["condicion", "condition", "estado del articulo"],
  cantidad: ["cantidad", "cant", "qty", "quantity", "unidades", "uds"],
  costoUnitario: ["costo unitario", "costo", "costo u", "costo unidad", "precio unidad", "precio unitario", "precio por unidad", "valor unitario", "unit price", "unit cost", "price", "precio"],
  totalLinea: ["precio total linea", "precio total de linea", "total linea", "total de linea", "precio total", "costo total", "valor total", "total", "subtotal", "line total", "importe", "amount"],
  precioVenta: ["precio de venta", "precio venta", "venta", "pvp", "precio final", "sale price"],
  skuProveedor: ["sku proveedor", "sku del proveedor", "sku", "codigo", "codigo proveedor", "item #", "item number", "part number", "ref", "referencia"],
  regalo: ["regalo", "regalo si no", "es regalo", "gift"],
  notas: ["notas internas", "notas", "nota", "observaciones", "observaciones internas", "notes"],
  marca: ["marca", "brand"],
  modelo: ["modelo", "model"],
  numeroSerie: ["numero de serie", "n de serie", "no de serie", "serie", "serial", "s n", "serial number"],
  descripcion: ["descripcion", "description", "detalle"],
};

function distancia(a: string, b: string): number {
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let previo = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const actual = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, previo + (a[i - 1] === b[j - 1] ? 0 : 1));
      previo = actual;
    }
  }
  return fila[b.length];
}

/**
 * ¿Qué campo es este título? Primero lo que se recordó para el proveedor,
 * luego los títulos conocidos (también sin lo que va entre paréntesis), y al
 * final uno muy parecido (letras cambiadas: "Catergoria" → Categoría).
 */
export function campoDeEncabezado(titulo: string, recordado: Record<string, string> = {}): CampoImportable | "" {
  const n = normalizarTexto(titulo);
  if (!n) return "";
  const r = recordado[n];
  if (r !== undefined) return (CAMPOS_IMPORTABLES as string[]).includes(r) ? (r as CampoImportable) : "";
  const sinParentesis = normalizarTexto(String(titulo).replace(/\(.*?\)/g, " "));
  for (const candidato of [n, sinParentesis]) {
    for (const campo of CAMPOS_IMPORTABLES) if (SINONIMOS[campo].includes(candidato)) return campo;
  }
  if (n.length >= 5) {
    let mejor: { campo: CampoImportable; d: number } | null = null;
    for (const campo of CAMPOS_IMPORTABLES) {
      for (const s of SINONIMOS[campo]) {
        if (s.length < 5) continue;
        const d = distancia(n, s);
        if (d <= (s.length >= 9 ? 2 : 1) && (!mejor || d < mejor.d)) mejor = { campo, d };
      }
    }
    if (mejor) return mejor.campo;
  }
  return "";
}

// ─── Texto pegado o CSV → filas ─────────────────────────────────────────────

/** Separa un texto en filas y celdas. Excel y Sheets pegan con tabuladores; un CSV usa comas o punto y coma. */
export function parsearTextoTabla(texto: string): string[][] {
  const limpio = String(texto ?? "").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (!limpio.trim()) return [];
  const primera = limpio.split("\n").find((l) => l.trim()) ?? "";
  const separador = primera.includes("\t") ? "\t" : (primera.split(";").length > primera.split(",").length ? ";" : ",");
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let entreComillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (entreComillas) {
      if (c === '"') {
        if (limpio[i + 1] === '"') { celda += '"'; i++; } else entreComillas = false;
      } else celda += c;
      continue;
    }
    if (c === '"' && celda === "") { entreComillas = true; continue; }
    if (c === separador) { fila.push(celda); celda = ""; continue; }
    if (c === "\n") { fila.push(celda); filas.push(fila); fila = []; celda = ""; continue; }
    celda += c;
  }
  fila.push(celda);
  filas.push(fila);
  return filas.map((f) => f.map((x) => x.trim())).filter((f) => f.some((x) => x !== ""));
}

/** "$1,234.50", "1.234,50", "12,50", "175" → número; null si no es un número. */
export function numeroDeCelda(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let t = String(value ?? "").trim().replace(/[\s$€£]|USD|US\$/gi, "");
  if (!t) return null;
  const negativo = /^\(.*\)$/.test(t) || t.startsWith("-");
  t = t.replace(/^\((.*)\)$/, "$1").replace(/^[+-]/, "");
  const coma = t.lastIndexOf(",");
  const punto = t.lastIndexOf(".");
  if (coma >= 0 && punto >= 0) {
    t = coma > punto ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (coma >= 0) {
    t = /^\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, "") : t.replace(",", ".");
  }
  if (!/^\d*\.?\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? (negativo ? -n : n) : null;
}

function textoDeNumero(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function esSi(value: unknown): boolean {
  return ["si", "s", "yes", "y", "x", "1", "true", "verdadero", "regalo"].includes(normalizarTexto(value));
}

/** Otras formas comunes de escribir una opción del portal (solo se usan si la opción existe). */
const ALIAS_OPCION: Record<string, string> = {
  notebook: "Laptop", portatil: "Laptop", "computadora portatil": "Laptop",
  pc: "Desktop", cpu: "Desktop", computadora: "Desktop", "computadora de escritorio": "Desktop",
  "memoria ram": "RAM", memoria: "RAM", "disco duro": "HDD", "disco solido": "SSD",
  telefono: "Celular", smartphone: "Celular", movil: "Celular",
  parlante: "Audio", bocina: "Audio", audifonos: "Audio",
  gpu: "Tarjeta gráfica", "tarjeta de video": "Tarjeta gráfica", fuente: "Fuente de poder",
  "placa madre": "Mainboard", motherboard: "Mainboard", bateria: "Batería",
  used: "Usado", usada: "Usado", new: "Nuevo", nueva: "Nuevo", openbox: "Open Box",
  refurbished: "Reacondicionado", "for parts": "Para partes", "para repuestos": "Para partes",
  danada: "Dañado", "not tested": "No probado",
};

function opcionDe(value: string, opciones: readonly string[]): string | null {
  const n = normalizarTexto(value);
  if (!n) return null;
  const buscar = (t: string) => opciones.find((o) => normalizarTexto(o) === t) ?? null;
  // Plural simple: "Laptops" → Laptop, "Cargadores" → Cargador.
  const candidatos = [n, n.replace(/s$/, ""), n.replace(/es$/, "")];
  for (const t of candidatos) {
    const o = buscar(t) ?? (ALIAS_OPCION[t] ? buscar(normalizarTexto(ALIAS_OPCION[t])) : null);
    if (o) return o;
  }
  return null;
}

// ─── Encabezado y mapeo ─────────────────────────────────────────────────────

export type TablaLeida = {
  /** Títulos de las columnas (o "Columna 1", "Columna 2"… si no hay fila de títulos). */
  encabezados: string[];
  /** Filas de datos (sin la de títulos). */
  filas: string[][];
  conTitulos: boolean;
};

/** La primera fila son títulos si al menos dos celdas se reconocen como campos. */
export function separarEncabezado(filas: string[][], recordado: Record<string, string> = {}): TablaLeida {
  if (!filas.length) return { encabezados: [], filas: [], conTitulos: false };
  const ancho = Math.max(...filas.map((f) => f.length));
  const primera = filas[0];
  const reconocidas = primera.filter((c) => campoDeEncabezado(c, recordado)).length;
  if (reconocidas >= 2) {
    return { encabezados: Array.from({ length: ancho }, (_, i) => primera[i] ?? ""), filas: filas.slice(1), conTitulos: true };
  }
  return { encabezados: Array.from({ length: ancho }, (_, i) => `Columna ${i + 1}`), filas, conTitulos: false };
}

/**
 * Sin fila de títulos (se copiaron solo los datos): la primera columna con
 * texto se propone como Nombre; lo demás se elige a mano.
 */
export function mapeoSinTitulos(tabla: TablaLeida): MapeoColumnas {
  const mapeo: MapeoColumnas = tabla.encabezados.map(() => "");
  for (let i = 0; i < mapeo.length; i++) {
    const valores = tabla.filas.map((f) => String(f[i] ?? "").trim()).filter(Boolean);
    if (valores.length && valores.filter((v) => numeroDeCelda(v) === null).length > valores.length / 2) {
      mapeo[i] = "nombre";
      break;
    }
  }
  return mapeo;
}

/** Mapeo propuesto: cada campo se usa una sola vez (la primera columna que lo pida). */
export function mapeoInicial(encabezados: string[], recordado: Record<string, string> = {}): MapeoColumnas {
  const usados = new Set<string>();
  return encabezados.map((t) => {
    const campo = campoDeEncabezado(t, recordado);
    if (!campo || usados.has(campo)) return "";
    usados.add(campo);
    return campo;
  });
}

/** Lo que conviene recordar para el proveedor: solo lo que se eligió distinto de lo que se reconoce solo. */
export function mapeoParaRecordar(encabezados: string[], mapeo: MapeoColumnas, recordadoAntes: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = { ...recordadoAntes };
  encabezados.forEach((t, i) => {
    const n = normalizarTexto(t);
    if (!n || /^columna \d+$/.test(n)) return;
    const automatico = campoDeEncabezado(t);
    const elegido = mapeo[i] ?? "";
    if (elegido !== automatico) out[n] = elegido;
    else delete out[n];
  });
  return out;
}

/** Nombre del campo en Shipping Proveedores donde se guarda lo recordado (JSON). */
export const CAMPO_COLUMNAS_IMPORTACION = "Columnas de importación";

/**
 * Lo recordado de un proveedor, limpio: solo títulos razonables y campos que
 * existen ("" = ignorar). Acepta el texto JSON guardado o el objeto.
 */
export function limpiarColumnasRecordadas(value: unknown): Record<string, string> {
  let obj: unknown = value;
  if (typeof value === "string") {
    try { obj = value.trim() ? JSON.parse(value) : {}; } catch { return {}; }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const titulo = normalizarTexto(k);
    if (!titulo || titulo.length > 80 || typeof v !== "string") continue;
    if (v !== "" && !(CAMPOS_IMPORTABLES as string[]).includes(v)) continue;
    out[titulo] = v;
    if (Object.keys(out).length >= 60) break;
  }
  return out;
}

// ─── Filas → artículos de la tabla ──────────────────────────────────────────

export type ResultadoImportacion = {
  lineas: Array<Partial<LineaCompra>>;
  /** Filas que no son artículos (vacías, TOTAL…). */
  ignoradas: number;
  /** Avisos cortos para mostrar antes de agregar. */
  avisos: string[];
};

const MAXIMO_FILAS = 200;

/**
 * Convierte las filas en artículos (campos de la tabla, en texto). Lo que no
 * se puede leer queda vacío para que la fila salga en amarillo.
 */
export function filasALineas(
  filas: string[][],
  mapeo: MapeoColumnas,
  ctx: { categorias: readonly string[]; condiciones: readonly string[]; condicionPorDefecto?: string }
): ResultadoImportacion {
  const col = (campo: CampoImportable) => mapeo.indexOf(campo);
  const iNombre = col("nombre");
  const valor = (f: string[], campo: CampoImportable) => {
    const i = col(campo);
    return i >= 0 ? String(f[i] ?? "").trim() : "";
  };
  const lineas: Array<Partial<LineaCompra>> = [];
  let ignoradas = 0;
  const categoriasDesconocidas = new Map<string, number>();
  const condicionesDesconocidas = new Map<string, number>();
  let regalosConCosto = 0;
  let cantidadesCalculadas = 0;
  let costosCalculados = 0;
  let cantidadesRaras = 0;

  for (const f of filas) {
    if (lineas.length >= MAXIMO_FILAS) { ignoradas++; continue; }
    const nombre = valor(f, "nombre");
    const todo = normalizarTexto(f.join(" "));
    // Filas de total/subtotal y filas sin nombre no son artículos.
    if (!todo || /^(sub ?)?total(es)?\b/.test(normalizarTexto(nombre)) || (!nombre && /\b(sub ?)?total(es)?\b/.test(todo))) { ignoradas++; continue; }
    if (iNombre >= 0 && !nombre) { ignoradas++; continue; }

    const regalo = esSi(valor(f, "regalo"));
    const total = numeroDeCelda(valor(f, "totalLinea"));
    let costo = numeroDeCelda(valor(f, "costoUnitario"));
    let cantidad = numeroDeCelda(valor(f, "cantidad"));
    if (cantidad === null && total !== null && costo) {
      cantidad = Math.round((total / costo) * 1000) / 1000;
      cantidadesCalculadas++;
    }
    // Como en la tabla, una fila sin cantidad es 1 unidad (si trae algo que no es un número, queda vacía).
    if (cantidad === null && !valor(f, "cantidad")) cantidad = 1;
    if (costo === null && total !== null && cantidad) {
      costo = Math.round((total / cantidad) * 100) / 100;
      costosCalculados++;
    }
    if (cantidad !== null && !Number.isInteger(cantidad)) cantidadesRaras++;

    const categoriaTexto = valor(f, "categoria");
    const categoria = opcionDe(categoriaTexto, ctx.categorias) ?? "";
    if (categoriaTexto && !categoria) categoriasDesconocidas.set(categoriaTexto, (categoriasDesconocidas.get(categoriaTexto) ?? 0) + 1);
    const condicionTexto = valor(f, "condicion");
    const condicion = opcionDe(condicionTexto, ctx.condiciones) ?? "";
    if (condicionTexto && !condicion) condicionesDesconocidas.set(condicionTexto, (condicionesDesconocidas.get(condicionTexto) ?? 0) + 1);
    if (regalo && costo) regalosConCosto++;
    const precio = numeroDeCelda(valor(f, "precioVenta"));

    lineas.push({
      nombre: nombre || valor(f, "descripcion"),
      categoria,
      condicion: condicion || ctx.condicionPorDefecto || "",
      cantidad: cantidad === null ? "" : textoDeNumero(cantidad),
      costoProveedor: regalo || costo === null ? "" : textoDeNumero(costo),
      precioVentaFinal: precio === null ? "" : textoDeNumero(precio),
      skuProveedor: valor(f, "skuProveedor"),
      regalo,
      observacionesInternas: valor(f, "notas"),
      marca: valor(f, "marca"),
      modelo: valor(f, "modelo"),
      numeroSerie: valor(f, "numeroSerie"),
      descripcion: iNombre >= 0 ? valor(f, "descripcion") : "",
    });
  }

  const avisos: string[] = [];
  if (iNombre < 0 && col("descripcion") < 0) avisos.push("Ninguna columna es el Nombre: elige cuál es.");
  if (col("costoUnitario") < 0 && col("totalLinea") < 0) avisos.push("Ninguna columna es el Costo unitario: el costo queda vacío.");
  const lista = (m: Map<string, number>) => Array.from(m.entries()).map(([t, n]) => `${t} (${n})`).join(", ");
  if (categoriasDesconocidas.size) avisos.push(`Categoría que no existe en el portal: ${lista(categoriasDesconocidas)}. Elígela en la tabla.`);
  if (condicionesDesconocidas.size) avisos.push(`Condición que no existe en el portal: ${lista(condicionesDesconocidas)}. Se puso "${ctx.condicionPorDefecto || "—"}".`);
  if (regalosConCosto) avisos.push(`${regalosConCosto} regalo(s) traían costo: quedan sin costo (los regalos no suman al pago).`);
  if (cantidadesCalculadas) avisos.push(`Cantidad calculada con total ÷ precio unidad en ${cantidadesCalculadas} fila(s).`);
  if (costosCalculados) avisos.push(`Costo unitario calculado con total ÷ cantidad en ${costosCalculados} fila(s).`);
  if (cantidadesRaras) avisos.push(`${cantidadesRaras} fila(s) con cantidad no entera: revísalas.`);
  if (lineas.length >= MAXIMO_FILAS) avisos.push(`Se toman las primeras ${MAXIMO_FILAS} filas.`);
  return { lineas, ignoradas, avisos };
}

// ─── Plantilla ──────────────────────────────────────────────────────────────

/** Columnas de la plantilla SUPER GEEK con sus listas desplegables. */
export function columnasPlantilla(categorias: readonly string[], condiciones: readonly string[]): ColumnaPlantilla[] {
  return [
    { titulo: "Nombre", ancho: 44 },
    { titulo: "Categoría", ancho: 24, validacion: { lista: categorias, nombre: "Categorias" } },
    { titulo: "Condición", ancho: 16, validacion: { lista: condiciones, nombre: "Condiciones" } },
    { titulo: "Cantidad", ancho: 10, validacion: "entero" },
    { titulo: "Costo unitario", ancho: 15, validacion: "monto" },
    { titulo: "Precio de venta", ancho: 16, validacion: "monto" },
    { titulo: "SKU proveedor", ancho: 18 },
    { titulo: "Regalo (Sí/No)", ancho: 15, validacion: "si-no" },
    { titulo: "Notas internas", ancho: 44 },
  ];
}
