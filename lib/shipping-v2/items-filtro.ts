// Filtros y búsqueda de la lista de Artículos (rediseño 15-oct-2026).
//
// Pedido del dueño: "no puedo buscar solo laptops disponibles, solo desktops
// vendidos, solo laptops HP o solo MacBooks". Antes los filtros solo miraban
// los 100 artículos de la página que estaba en pantalla. Ahora:
//
//   1. Los filtros (categoría, estado, operación, proveedor) y el texto
//      buscado viajan en la dirección (?categoria=Laptop&estado=Disponible&q=hp)
//      y se aplican EN AIRTABLE, sobre todo el inventario; el paginado recorre
//      solo lo que coincide.
//   2. El buscador entiende palabras de categoría y de estado: escribir
//      "laptops hp disponibles" y Enter pone Categoría = Laptop, Estado =
//      Disponible y busca "hp" en nombre, marca, modelo, SKU, serie,
//      proveedor, packing y rastreos.
//   3. Cada palabra busca el COMIENZO de una palabra ("mac" encuentra
//      "MacBook"; "hp" no encuentra "chip"), sin importar mayúsculas ni tildes.
//      Si lleva números ("i5", "16gb", parte de un rastreo) se busca en
//      cualquier parte.
//
// Este archivo es puro (sin Airtable ni React): lo usan la página (servidor),
// la lista de Artículos y la de Recepción, y sus pruebas.

import { SHIPPING_V2_ITEM_FIELDS, SHIPPING_V2_ITEM_SELECT_OPTIONS } from "./schema.generated";

export type FiltroArticulos = {
  /** Texto libre que queda después de reconocer categoría y estado. */
  q: string;
  categoria: string;
  estado: string;
  operacion: string;
  /** Record ID del proveedor de compra. */
  proveedor: string;
  /** Punto 18: "pendiente" = ya llegó, pide inspección y nadie la firmó (la lista de trabajo del técnico). */
  inspeccion: "" | "pendiente";
};

export const FILTRO_ARTICULOS_VACIO: FiltroArticulos = { q: "", categoria: "", estado: "", operacion: "", proveedor: "", inspeccion: "" };

export const CATEGORIAS_ARTICULO: readonly string[] = SHIPPING_V2_ITEM_SELECT_OPTIONS.categoria;
export const ESTADOS_ARTICULO: readonly string[] = SHIPPING_V2_ITEM_SELECT_OPTIONS.estadoItem;
export const OPERACIONES_ARTICULO: readonly string[] = SHIPPING_V2_ITEM_SELECT_OPTIONS.tipoOperacion;

// Los de uso diario van primero en el selector; el resto (estados viejos que
// aún tienen algunos artículos) va en un grupo "Otros".
const ESTADOS_DE_USO_DIARIO = ["Disponible", "Reservado", "Registrado", "En tránsito", "Recibido", "En revisión", "Con novedad", "Vendido", "Agotado", "Dado de baja"];
export const ESTADOS_PRINCIPALES = ESTADOS_DE_USO_DIARIO.filter((estado) => ESTADOS_ARTICULO.includes(estado));
export const ESTADOS_OTROS = ESTADOS_ARTICULO.filter((estado) => !ESTADOS_DE_USO_DIARIO.includes(estado));

const OPERACIONES_RETIRADAS = ["Compra ya pagada", "Parte / componente", "Repuesto", "Uso local", "Migración histórica", "Corrección administrativa"];
export const OPERACIONES_PRINCIPALES = OPERACIONES_ARTICULO.filter((operacion) => !OPERACIONES_RETIRADAS.includes(operacion));
export const OPERACIONES_OTRAS = OPERACIONES_ARTICULO.filter((operacion) => OPERACIONES_RETIRADAS.includes(operacion));

export function normalizarBusqueda(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Leer y escribir el filtro en la dirección ──────────────────────────────

type Parametros = URLSearchParams | Record<string, string | string[] | undefined>;

function primerValor(params: Parametros, clave: string) {
  const valor = params instanceof URLSearchParams ? params.get(clave) : params[clave];
  const texto = Array.isArray(valor) ? valor[0] : valor;
  return typeof texto === "string" ? texto.trim() : "";
}

function deLaLista(lista: readonly string[], valor: string) {
  return lista.includes(valor) ? valor : "";
}

/** Lee el filtro de la dirección. Lo que no es válido se ignora (no rompe la página). */
export function leerFiltroArticulos(params: Parametros): FiltroArticulos {
  const proveedor = primerValor(params, "proveedor");
  return {
    q: primerValor(params, "q").replace(/\s+/g, " ").slice(0, 120),
    categoria: deLaLista(CATEGORIAS_ARTICULO, primerValor(params, "categoria")),
    estado: deLaLista(ESTADOS_ARTICULO, primerValor(params, "estado")),
    operacion: deLaLista(OPERACIONES_ARTICULO, primerValor(params, "operacion")),
    proveedor: /^rec[A-Za-z0-9]{14}$/.test(proveedor) ? proveedor : "",
    inspeccion: primerValor(params, "inspeccion") === "pendiente" ? "pendiente" : "",
  };
}

export function hayFiltroArticulos(filtro: FiltroArticulos) {
  return Boolean(filtro.q || filtro.categoria || filtro.estado || filtro.operacion || filtro.proveedor || filtro.inspeccion);
}

/** Dirección de la lista con este filtro (y, si se pasa, el orden y la página). */
export function hrefArticulos(
  filtro: FiltroArticulos,
  opciones: { sort?: string; cursor?: string; prev?: string } = {}
) {
  const params = new URLSearchParams();
  if (filtro.q) params.set("q", filtro.q);
  if (filtro.categoria) params.set("categoria", filtro.categoria);
  if (filtro.estado) params.set("estado", filtro.estado);
  if (filtro.operacion) params.set("operacion", filtro.operacion);
  if (filtro.proveedor) params.set("proveedor", filtro.proveedor);
  if (filtro.inspeccion) params.set("inspeccion", filtro.inspeccion);
  if (opciones.cursor) params.set("cursor", opciones.cursor);
  if (opciones.prev) params.set("prev", opciones.prev);
  if (opciones.sort && opciones.sort !== "newest") params.set("sort", opciones.sort);
  const query = params.toString();
  return `/shipping-v2/items${query ? `?${query}` : ""}`;
}

// ─── Búsqueda que entiende categorías y estados ─────────────────────────────

// Además del nombre de la categoría y su plural. Solo palabras que en la
// tienda casi siempre significan la categoría (no "pc", "wifi" ni "audio",
// que aparecen dentro de nombres de otros artículos).
const SINONIMOS_CATEGORIA: Record<string, string[]> = {
  Laptop: ["portatil", "portatiles", "notebook", "notebooks"],
  Desktop: ["pc de escritorio", "computadora de escritorio", "computador de escritorio"],
  "All in One": ["all in one", "aio"],
  RAM: ["memoria ram", "memorias ram"],
  HDD: ["disco duro", "discos duros"],
  Mainboard: ["placa madre", "placas madre", "motherboard", "motherboards"],
  "Tarjeta gráfica": ["tarjeta grafica", "tarjetas graficas", "gpu", "gpus"],
  "Fuente de poder": ["fuentes de poder"],
  "Disco externo": ["discos externos"],
  "Cámara / Seguridad": ["camara", "camaras"],
  Celular: ["celulares", "telefono", "telefonos"],
};
// Categorías que NO se reconocen por su nombre (palabras demasiado comunes).
const CATEGORIAS_SIN_PALABRA = new Set(["Otro", "Audio", "Red / Wi-Fi", "Smart Home", "Energía / Protección", "Adaptador / Dock / Lector", "Cámara / Seguridad"]);

const SINONIMOS_ESTADO: Record<string, string[]> = {
  Disponible: ["disponible", "disponibles"],
  Reservado: ["reservado", "reservados", "reservada", "reservadas"],
  Vendido: ["vendido", "vendidos", "vendida", "vendidas"],
  "En tránsito": ["en transito", "transito", "en camino"],
  Registrado: ["registrado", "registrados"],
  Recibido: ["recibido", "recibidos"],
  "En revisión": ["en revision"],
  "Con novedad": ["con novedad", "con novedades"],
  Agotado: ["agotado", "agotados", "agotada", "agotadas"],
  "Dado de baja": ["dado de baja", "dados de baja", "de baja"],
};

type Frase = { frase: string; valor: string };

/** Singular y plurales ("laptop", "laptops"; "monitor", "monitores"). */
function conPlurales(palabra: string) {
  return /[aeiou]$/.test(palabra) ? [palabra, `${palabra}s`] : [palabra, `${palabra}s`, `${palabra}es`];
}

const FRASES_CATEGORIA: Frase[] = CATEGORIAS_ARTICULO.flatMap((categoria) => {
  const propias = CATEGORIAS_SIN_PALABRA.has(categoria) ? [] : conPlurales(normalizarBusqueda(categoria));
  return [...propias, ...(SINONIMOS_CATEGORIA[categoria] ?? []).map(normalizarBusqueda)].map((frase) => ({ frase, valor: categoria }));
}).sort((a, b) => b.frase.length - a.frase.length);

const FRASES_ESTADO: Frase[] = Object.entries(SINONIMOS_ESTADO)
  .filter(([estado]) => ESTADOS_ARTICULO.includes(estado))
  .flatMap(([estado, frases]) => frases.map((frase) => ({ frase: normalizarBusqueda(frase), valor: estado })))
  .sort((a, b) => b.frase.length - a.frase.length);

export type BusquedaInterpretada = { categoria?: string; estado?: string; resto: string };

function extraer(texto: string, frases: Frase[]): { valor?: string; texto: string } {
  for (const { frase, valor } of frases) {
    const conEspacios = ` ${frase} `;
    if (texto.includes(conEspacios)) return { valor, texto: texto.replace(conEspacios, " ") };
  }
  return { texto };
}

/**
 * "laptops hp disponibles" → { categoria: "Laptop", estado: "Disponible", resto: "hp" }.
 * Reconoce como mucho una categoría y un estado; lo demás queda como texto.
 */
export function interpretarBusqueda(texto: string): BusquedaInterpretada {
  const conEstado = extraer(` ${normalizarBusqueda(texto)} `, FRASES_ESTADO);
  const conCategoria = extraer(conEstado.texto, FRASES_CATEGORIA);
  return {
    ...(conCategoria.valor ? { categoria: conCategoria.valor } : {}),
    ...(conEstado.valor ? { estado: conEstado.valor } : {}),
    resto: conCategoria.texto.replace(/\s+/g, " ").trim(),
  };
}

/** Palabras a buscar (sin tildes, en minúscula). Se ignoran las de una sola letra. */
export function terminosBusqueda(texto: string): string[] {
  return normalizarBusqueda(texto)
    .split(" ")
    .filter((termino) => termino.length >= 2 || /\d/.test(termino))
    .slice(0, 8)
    .map((termino) => termino.slice(0, 40));
}

function escaparRegex(texto: string) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const tieneNumero = (termino: string) => /\d/.test(termino);

/**
 * ¿El texto (ya normalizado) tiene cada término? Las palabras deben EMPEZAR
 * igual; los términos con números se buscan en cualquier parte.
 */
export function coincidenTerminos(textoNormalizado: string, terminos: string[]) {
  return terminos.every((termino) => tieneNumero(termino)
    ? textoNormalizado.includes(termino)
    : new RegExp(`(^|[^a-z0-9])${escaparRegex(termino)}`).test(textoNormalizado));
}

// ─── Fórmula de Airtable ────────────────────────────────────────────────────

const F = SHIPPING_V2_ITEM_FIELDS;

const CAMPOS_DE_TEXTO = [
  F.nombre,
  F.sku,
  F.skuProveedor,
  F.marca,
  F.modelo,
  F.numeroSerie,
  F.categoria,
  F.packingRelacionado,
  F.trackingDirecto,
  F.trackingHaciaIntermediario,
  F.trackingDesdeIntermediario,
];

function literal(texto: string) {
  return `'${texto.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function sinTildes(expresion: string) {
  return [["á", "a"], ["é", "e"], ["í", "i"], ["ó", "o"], ["ú", "u"], ["ü", "u"], ["ñ", "n"]]
    .reduce((acumulado, [con, sin]) => `SUBSTITUTE(${acumulado},'${con}','${sin}')`, expresion);
}

const TEXTO_BUSCABLE = sinTildes(
  `LOWER(${[...CAMPOS_DE_TEXTO.map((campo) => `{${campo}}`), `ARRAYJOIN({${F.proveedorCompra}},' ')`].join("&' '&")})`
);

/**
 * Condición de Airtable para el filtro (vacía si no hay filtro). El proveedor
 * se compara por su etiqueta ("eBay"; "Proveedor ID" = el nombre desde el punto 11), que es lo que Airtable ve en
 * el vínculo; si no se conoce, no devuelve nada en vez de devolver todo.
 */
export function formulaFiltroArticulos(filtro: FiltroArticulos, opciones: { proveedorEtiqueta?: string } = {}) {
  const partes: string[] = [];
  if (filtro.categoria) partes.push(`{${F.categoria}}=${literal(filtro.categoria)}`);
  if (filtro.estado) partes.push(`{${F.estadoItem}}=${literal(filtro.estado)}`);
  if (filtro.operacion) partes.push(`{${F.tipoOperacion}}=${literal(filtro.operacion)}`);
  if (filtro.proveedor) {
    partes.push(opciones.proveedorEtiqueta
      ? `FIND(${literal(`|${opciones.proveedorEtiqueta}|`)},'|'&ARRAYJOIN({${F.proveedorCompra}},'|')&'|')>0`
      : "FALSE()");
  }
  if (filtro.inspeccion === "pendiente") {
    // Ya llegó, pide inspección, nadie la firmó y sigue en el inventario.
    partes.push(`{${F.recibido}}`, `{${F.requiereInspeccion}}`, `NOT({Revisado física/técnicamente})`);
    partes.push(`NOT(OR({${F.estadoItem}}='Vendido',{${F.estadoItem}}='Agotado',{${F.estadoItem}}='Dado de baja'))`);
  }
  for (const termino of terminosBusqueda(filtro.q)) {
    partes.push(tieneNumero(termino)
      ? `FIND(${literal(termino)},${TEXTO_BUSCABLE})>0`
      : `REGEX_MATCH(${TEXTO_BUSCABLE},${literal(`(^|[^a-z0-9])${escaparRegex(termino)}`)})`);
  }
  return partes.length ? `AND(${partes.join(",")})` : "";
}
