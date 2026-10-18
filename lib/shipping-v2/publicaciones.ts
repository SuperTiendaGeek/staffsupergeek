// Gestor de publicaciones (punto 10d de la auditoría Shipping V2, decisiones
// del dueño del 17 y 18-oct-2026). Solo reglas, sin red.
//
// - Un anuncio por producto (SKU) en cada canal; una unidad con un detalle
//   importante puede tener su anuncio APARTE en ese canal.
// - El texto sale de una PLANTILLA por categoría y canal con "metacampos"
//   ({{procesador}}, {{tienda_contacto}}…) que se llenan con la ficha del equipo
//   y los datos fijos de la tienda. Una línea cuyos metacampos están todos
//   vacíos desaparece (si el equipo no tiene gráficos dedicados, no sale
//   "Gráficos:").
// - En el anuncio compartido la batería va sin porcentaje y los accesorios son
//   los que traen TODAS las unidades; en el anuncio aparte, los de esa unidad.

import type { ShippingV2Item, ShippingV2RecepcionChecklistAction } from "@/types/shipping-v2";
import { normalizarSerie } from "./unidades-serie";

// ─── Canales ─────────────────────────────────────────────────────────────────

export const CANALES_PUBLICACION = ["Marketplace", "Mercado Libre", "Shopify", "Grupos Facebook"] as const;
export type CanalPublicacion = (typeof CANALES_PUBLICACION)[number];
export type AlcancePublicacion = "Producto" | "Unidad";

/** Canales que ya se gestionan desde el gestor (10d-1). Los demás siguen con su casilla. */
export const CANALES_EN_GESTOR: readonly CanalPublicacion[] = ["Marketplace", "Mercado Libre", "Shopify", "Grupos Facebook"];

/** Shopify usa una descripción en HTML. */
export function canalUsaHtml(canal: CanalPublicacion) {
  return canal === "Shopify";
}

/** Largo máximo del título en cada canal. */
export const TITULO_MAX: Record<CanalPublicacion, number> = {
  Marketplace: 100,
  "Mercado Libre": 60,
  Shopify: 255,
  "Grupos Facebook": 100,
};

/** La casilla de Recepción que corresponde a cada canal. */
export const ACCION_CHECKLIST_CANAL: Record<CanalPublicacion, ShippingV2RecepcionChecklistAction> = {
  Marketplace: "published-marketplace",
  "Mercado Libre": "published-mercado-libre",
  Shopify: "published-shopify",
  "Grupos Facebook": "published-facebook",
};

export function canalDeAccion(accion: string): CanalPublicacion | null {
  const par = Object.entries(ACCION_CHECKLIST_CANAL).find(([, a]) => a === accion);
  return par ? (par[0] as CanalPublicacion) : null;
}

// ─── Datos ───────────────────────────────────────────────────────────────────

export type DatosTienda = {
  id?: string;
  direccion: string;
  horarioSemana: string;
  horarioSabado: string;
  whatsapp: string;
  telefonoFijo: string;
  web: string;
  metodosPago: string;
  garantiaCorta: string;
  garantiaLarga: string;
  hashtagsFijos: string;
  version: number;
  editadoPor?: string;
  fechaEdicion?: string;
};

export type PlantillaPublicacion = {
  id: string;
  nombre: string;
  categoria: string;
  canal: CanalPublicacion;
  titulo: string;
  descripcion: string;
  activa: boolean;
  editadaPor?: string;
  fechaEdicion?: string;
};

export type EstadoPublicacion = "Borrador" | "Publicado" | "Por retirar" | "Retirado";

export type Publicacion = {
  id: string;
  sku: string;
  canal: CanalPublicacion;
  alcance: AlcancePublicacion;
  unidadId?: string;
  plantillaId?: string;
  titulo: string;
  presentacion: string;
  descripcion: string;
  precio: number | null;
  enlace: string;
  estado: EstadoPublicacion;
  publicadoPor?: string;
  fechaPublicado?: string;
  versionTienda?: number | null;
  retiradoPor?: string;
  fechaRetirado?: string;
};

/** Lo que un anuncio necesita de cada unidad (se arma en el servidor desde la ficha). */
export type DatosUnidadAnuncio = {
  id: string;
  sku: string;
  numeroSerie?: string;
  estado: string;
  recibido: boolean;
  nombre: string;
  categoria: string;
  condicion: string;
  marca: string;
  modelo: string;
  precio: number | null;
  pantalla: string;
  pantallaTitulo: string;
  procesador: string;
  procesadorTitulo: string;
  graficos: string;
  ram: string;
  ramTitulo: string;
  disco: string;
  discoTitulo: string;
  conectividad: string;
  caracteristicas: string;
  sistema: string;
  bateriaSalud: number | null;
  bateriaEstado: string;
  /** null = accesorios sin revisar; [] = revisado, no trae nada. */
  accesorios: string[] | null;
  especificaciones: string;
};

const ESTADOS_FUERA = new Set(["vendido", "agotado", "dado de baja", "cancelado", "devuelto a proveedor", "desarmado completamente"]);

function txt(valor?: string | number | null) {
  return String(valor ?? "").trim();
}

function util(valor?: string | null) {
  const t = txt(valor);
  return t && t !== "-" && t.toLowerCase() !== "no aplica" ? t : "";
}

function normal(valor?: string | null) {
  return txt(valor).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function unidadViva(u: { estado?: string | null }) {
  return !ESTADOS_FUERA.has(normal(u.estado));
}

/** "Accesorios incluidos" del registro → lista (null = sin revisar). */
export function leerAccesorios(valor?: string | null): string[] | null {
  const lineas = String(valor ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lineas.length) return null;
  if (lineas.some((l) => normal(l) === "sin accesorios")) return [];
  return lineas;
}

/** Lista → texto del campo ("Sin accesorios" si se revisó y no trae nada). */
export function escribirAccesorios(lista: string[] | null): string {
  if (lista === null) return "";
  const limpios = Array.from(new Set(lista.map((l) => l.trim()).filter(Boolean)));
  return limpios.length ? limpios.join("\n") : "Sin accesorios";
}

/** Accesorios rápidos según la categoría (pantalla de inspección). */
export function accesoriosRapidos(categoria?: string | null): string[] {
  const c = normal(categoria);
  if (c === "laptop" || c === "tablet" || c === "all in one") return ["Cargador original", "Cargador genérico", "Adaptador USB-C a HDMI", "Mouse", "Estuche"];
  if (c === "desktop") return ["Cable de poder", "USB Wi-Fi", "Adaptador DP a HDMI", "Teclado", "Mouse"];
  if (c === "monitor") return ["Cable de poder", "Cable HDMI", "Cable DisplayPort", "Base"];
  if (c === "consola") return ["Control", "Cable HDMI", "Fuente de poder"];
  if (c === "celular") return ["Cargador", "Cable", "Funda"];
  if (c === "impresora") return ["Cable de poder", "Cable USB", "Cartuchos"];
  return ["Cable", "Caja original"];
}

function tituloResolucion(resolucion: string) {
  const dentro = /\(([^)]+)\)/.exec(resolucion)?.[1] ?? "";
  return dentro.split(/[\s/]+/)[0] ?? "";
}

/** Lo que el anuncio necesita de un registro de Shipping Items. */
export function datosUnidadDeItem(item: ShippingV2Item, especificaciones = ""): DatosUnidadAnuncio {
  const h = item.technicalSheet;
  const tamano = util(h.pantallaTamano);
  const resolucion = util(h.pantallaResolucion);
  const cpuModelo = util(h.cpuModelo);
  const base = util(h.cpuFrecuenciaBase).replace(/\s*ghz\s*$/i, "");
  const turbo = util(h.cpuFrecuenciaTurbo).replace(/\s*ghz\s*$/i, "");
  const frecuencias = base && turbo ? `${base}-${turbo}GHz` : base || turbo ? `${base || turbo}GHz` : "";
  const ramCap = util(h.ramCapacidad);
  const ramTipo = util(h.ramTipo);
  const disco1 = [util(h.almacenamientoPrincipal), util(h.almacenamientoTipo)].filter(Boolean).join(" ");
  const disco2 = [util(h.almacenamiento2), util(h.almacenamiento2Tipo)].filter(Boolean).join(" ");
  const gpu = util(h.gpu);
  const gpuIntegrada = util(h.gpuIntegrada);
  return {
    id: item.id,
    sku: item.sku,
    numeroSerie: normalizarSerie(item.numeroSerie) || undefined,
    estado: txt(item.estado),
    recibido: item.recibido === true,
    nombre: txt(item.nombre),
    categoria: txt(item.categoria),
    condicion: txt(item.condicion),
    marca: util(h.marcaFicha) || util(item.marca),
    modelo: util(h.modeloFicha) || util(item.modelo),
    precio: typeof item.precioVenta === "number" && item.precioVenta > 0 ? item.precioVenta : null,
    pantalla: [tamano, resolucion].filter(Boolean).join(" "),
    pantallaTitulo: [tamano, tituloResolucion(resolucion)].filter(Boolean).join(" "),
    procesador: [[util(h.cpuMarca), cpuModelo].filter(Boolean).join(" "), frecuencias].filter(Boolean).join(" "),
    procesadorTitulo: cpuModelo.replace(/^(intel\s+)?core\s+/i, "").replace(/^amd\s+/i, ""),
    graficos: gpu || (gpuIntegrada ? `${gpuIntegrada} integrados` : ""),
    ram: ramCap ? [`${ramCap} RAM`, ramTipo].filter(Boolean).join(" ") : "",
    ramTitulo: [ramCap, ramTipo].filter(Boolean).join(" "),
    disco: [disco1, disco2].filter(Boolean).join(" + "),
    discoTitulo: disco1,
    conectividad: [...h.connectivityV2Names, ...h.portV2Names].filter(Boolean).join(", "),
    caracteristicas: h.extraFeatureV2Names.filter(Boolean).join(", "),
    sistema: util(h.sistemaOperativo).toLocaleUpperCase("es"),
    bateriaSalud: typeof h.bateriaSalud === "number" && Number.isFinite(h.bateriaSalud) ? h.bateriaSalud : null,
    bateriaEstado: util(h.bateriaEstado),
    accesorios: leerAccesorios(item.accesoriosIncluidos),
    especificaciones,
  };
}

/** Lo que el gestor recibe del servidor para un SKU. */
export type GestorPublicacionesDatos = {
  sku: string;
  nombre: string;
  categoria: string;
  tienda: DatosTienda;
  plantillas: PlantillaPublicacion[];
  publicaciones: Publicacion[];
  unidades: DatosUnidadAnuncio[];
  /** ✨ Sugerir: hay clave de IA configurada. */
  iaDisponible?: boolean;
};

// ─── Qué unidades cubre un anuncio ───────────────────────────────────────────

/**
 * Unidades que muestra un anuncio. Producto: las vivas del SKU menos las que
 * tienen su anuncio aparte (no retirado) en ese canal. Unidad: solo esa.
 */
export function unidadesCubiertas(
  unidades: DatosUnidadAnuncio[],
  publicaciones: Pick<Publicacion, "canal" | "alcance" | "unidadId" | "estado">[],
  canal: CanalPublicacion,
  alcance: AlcancePublicacion,
  unidadId?: string
): DatosUnidadAnuncio[] {
  if (alcance === "Unidad") return unidades.filter((u) => u.id === unidadId);
  const aparte = new Set(
    publicaciones
      .filter((p) => p.canal === canal && p.alcance === "Unidad" && p.estado !== "Retirado" && p.unidadId)
      .map((p) => p.unidadId as string)
  );
  return unidades.filter((u) => unidadViva(u) && !aparte.has(u.id));
}

// ─── Metacampos ──────────────────────────────────────────────────────────────

export type GrupoMetacampo = "articulo" | "tienda" | "automatico";

/** Los metacampos que entiende una plantilla, con su grupo y nombre corto (para el editor). */
export const METACAMPOS: ReadonlyArray<{ clave: string; grupo: GrupoMetacampo; etiqueta: string }> = [
  { clave: "categoria", grupo: "articulo", etiqueta: "categoría" },
  { clave: "nombre", grupo: "articulo", etiqueta: "nombre" },
  { clave: "marca", grupo: "articulo", etiqueta: "marca" },
  { clave: "modelo", grupo: "articulo", etiqueta: "modelo" },
  { clave: "condicion", grupo: "articulo", etiqueta: "condición" },
  { clave: "condicion_titulo", grupo: "articulo", etiqueta: "CONDICIÓN" },
  { clave: "pantalla", grupo: "articulo", etiqueta: "pantalla" },
  { clave: "pantalla_titulo", grupo: "articulo", etiqueta: "pantalla corta" },
  { clave: "pantalla_pulgadas", grupo: "articulo", etiqueta: "pulgadas" },
  { clave: "procesador", grupo: "articulo", etiqueta: "procesador" },
  { clave: "procesador_titulo", grupo: "articulo", etiqueta: "procesador corto" },
  { clave: "graficos", grupo: "articulo", etiqueta: "gráficos" },
  { clave: "ram", grupo: "articulo", etiqueta: "ram" },
  { clave: "ram_titulo", grupo: "articulo", etiqueta: "ram corta" },
  { clave: "ram_capacidad", grupo: "articulo", etiqueta: "ram GB" },
  { clave: "disco", grupo: "articulo", etiqueta: "disco" },
  { clave: "disco_titulo", grupo: "articulo", etiqueta: "disco corto" },
  { clave: "disco_capacidad", grupo: "articulo", etiqueta: "disco GB" },
  { clave: "conectividad", grupo: "articulo", etiqueta: "conectividad" },
  { clave: "caracteristicas", grupo: "articulo", etiqueta: "características" },
  { clave: "sistema", grupo: "articulo", etiqueta: "SISTEMA" },
  { clave: "sistema_texto", grupo: "articulo", etiqueta: "sistema" },
  { clave: "especificaciones", grupo: "articulo", etiqueta: "detalles" },
  { clave: "bateria", grupo: "articulo", etiqueta: "batería" },
  { clave: "accesorios", grupo: "articulo", etiqueta: "ACCESORIOS" },
  { clave: "accesorios_texto", grupo: "articulo", etiqueta: "accesorios" },
  { clave: "con_cargador", grupo: "articulo", etiqueta: "c/ cargador" },
  { clave: "precio", grupo: "articulo", etiqueta: "precio" },
  { clave: "sku", grupo: "articulo", etiqueta: "sku" },
  { clave: "tienda_direccion", grupo: "tienda", etiqueta: "dirección" },
  { clave: "tienda_horario_semana", grupo: "tienda", etiqueta: "horario L-V" },
  { clave: "tienda_horario_sabado", grupo: "tienda", etiqueta: "horario sábado" },
  { clave: "tienda_whatsapp", grupo: "tienda", etiqueta: "WhatsApp" },
  { clave: "tienda_telefono", grupo: "tienda", etiqueta: "teléfono fijo" },
  { clave: "tienda_web", grupo: "tienda", etiqueta: "web" },
  { clave: "tienda_pagos", grupo: "tienda", etiqueta: "métodos de pago" },
  { clave: "tienda_garantia_corta", grupo: "tienda", etiqueta: "garantía corta" },
  { clave: "tienda_garantia_larga", grupo: "tienda", etiqueta: "garantía larga" },
  { clave: "presentacion", grupo: "automatico", etiqueta: "presentación" },
  { clave: "hashtags", grupo: "automatico", etiqueta: "hashtags" },
];

/** De dónde sale el dato de un metacampo (se muestra al pasar el mouse en el editor). */
export function origenMetacampo(clave: string): string {
  if (clave === "presentacion") return "Se escribe en el gestor de cada producto (✨ Sugerir)";
  if (clave === "precio") return "Precio del gestor (el de venta del artículo)";
  if (clave === "hashtags") return "Automático: marca, modelo, categoría y hashtags fijos de la tienda";
  if (clave === "con_cargador") return "Automático: \"c/ cargador\" si los accesorios incluyen un cargador";
  if (clave === "accesorios" || clave === "accesorios_texto") return "Inspección: Accesorios incluidos";
  if (clave === "bateria") return "Inspección / ficha técnica: salud y estado de la batería";
  if (clave === "condicion_titulo") return "Condición del artículo, en mayúsculas (USADA / USADO)";
  if (clave === "categoria" || clave === "nombre" || clave === "condicion" || clave === "sku") return "Datos del artículo";
  if (clave.startsWith("tienda_")) return "Anuncios → Datos de la tienda";
  return "Ficha técnica del artículo";
}

const FEMENINO = new Set(["laptop", "tablet", "consola", "impresora", "tarjeta grafica", "pantalla", "bateria", "ram", "fuente de poder", "camara / seguridad"]);

/** "USADA", "NUEVO", "OPEN BOX"… según la categoría (para títulos y encabezados). */
export function condicionTitulo(condicion: string, categoria: string): string {
  const c = normal(condicion);
  const fem = FEMENINO.has(normal(categoria));
  if (c === "usado") return fem ? "USADA" : "USADO";
  if (c === "nuevo") return fem ? "NUEVA" : "NUEVO";
  if (c === "reacondicionado") return fem ? "REACONDICIONADA" : "REACONDICIONADO";
  return txt(condicion).toLocaleUpperCase("es");
}

function estadoBateriaTexto(estado: string): string {
  const e = normal(estado);
  if (!e) return "";
  if (e.startsWith("excelente")) return "en excelente estado";
  if (e.startsWith("muy buena")) return "en muy buen estado";
  if (e.startsWith("buena")) return "en buen estado";
  if (e.startsWith("regular")) return "mantiene la carga";
  if (e.startsWith("mala")) return "requiere cambio";
  return estado.toLowerCase();
}

/** Batería del anuncio: compartido sin % ("en muy buen estado", la de menor salud); aparte con su % ("86% salud, batería en muy buen estado"). */
export function bateriaAnuncio(unidades: DatosUnidadAnuncio[], alcance: AlcancePublicacion): string {
  const con = unidades.filter((u) => u.bateriaEstado || u.bateriaSalud !== null);
  if (!con.length) return "";
  if (alcance === "Unidad") {
    const u = con[0];
    const estado = estadoBateriaTexto(u.bateriaEstado);
    return u.bateriaSalud !== null ? `${u.bateriaSalud}% salud${estado ? `, batería ${estado}` : ""}` : estado ? `batería ${estado}` : "";
  }
  const peor = con.reduce((a, b) => ((b.bateriaSalud ?? 101) < (a.bateriaSalud ?? 101) ? b : a));
  return estadoBateriaTexto(peor.bateriaEstado);
}

/** Accesorios del anuncio: compartido = los que traen todas las unidades revisadas. */
export function accesoriosAnuncio(unidades: DatosUnidadAnuncio[]): string[] {
  const revisadas = unidades.map((u) => u.accesorios).filter((a): a is string[] => a !== null);
  if (!revisadas.length) return [];
  const [primera, ...resto] = revisadas;
  return primera.filter((acc) => resto.every((lista) => lista.some((x) => normal(x) === normal(acc))));
}

/** ¿Alguna unidad trae accesorios distintos de los del anuncio compartido? */
export function accesoriosDistintos(unidades: DatosUnidadAnuncio[]): boolean {
  const revisadas = unidades.map((u) => u.accesorios).filter((a): a is string[] => a !== null);
  const comunes = accesoriosAnuncio(unidades).length;
  return revisadas.some((lista) => lista.length !== comunes);
}

const PLURAL: Record<string, string> = {
  laptop: "Laptops", desktop: "Desktops", "all in one": "AllInOne", monitor: "Monitores", consola: "Consolas",
  tablet: "Tablets", celular: "Celulares", impresora: "Impresoras", "tarjeta grafica": "TarjetasGraficas",
};

function hashtag(texto: string) {
  const limpio = texto.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, " ").trim();
  if (!limpio) return "";
  return `#${limpio.split(" ").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("")}`;
}

/** #SUPERGEEK #DellLatitude #TecnologíaUsada #Laptops #Otavalo #Garantía */
export function hashtagsAnuncio(u: Pick<DatosUnidadAnuncio, "marca" | "modelo" | "categoria" | "condicion">, fijos: string): string {
  const lista = fijos.split(/\s+/).map((h) => h.trim()).filter((h) => h.startsWith("#"));
  const marcaModelo = hashtag(`${u.marca} ${u.modelo.split(/\s+/)[0] ?? ""}`);
  const plural = PLURAL[normal(u.categoria)] ? `#${PLURAL[normal(u.categoria)]}` : hashtag(u.categoria);
  const usada = normal(u.condicion) && normal(u.condicion) !== "nuevo" ? "#TecnologíaUsada" : "";
  const todos = [lista[0], marcaModelo, usada, plural, ...lista.slice(1)].filter(Boolean) as string[];
  const vistos = new Set<string>();
  return todos.filter((h) => { const k = normal(h); if (vistos.has(k)) return false; vistos.add(k); return true; }).join(" ");
}

function dinero(v: number | null) {
  return typeof v === "number" ? `$${Number.isInteger(v) ? v : v.toFixed(2)}` : "";
}

function primeraPalabra(texto: string) {
  return txt(texto).split(/\s+/)[0] ?? "";
}

/** "WINDOWS 11 PRO" → "Windows 11 Pro". */
function tituloCaso(texto: string) {
  return txt(texto).toLocaleLowerCase("es").replace(/(^|\s)(\p{L})/gu, (_, espacio: string, letra: string) => espacio + letra.toLocaleUpperCase("es"));
}

function escaparHtml(texto: string) {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Los valores de los metacampos para un anuncio. */
export function valoresAnuncio(input: {
  unidades: DatosUnidadAnuncio[];
  alcance: AlcancePublicacion;
  tienda: DatosTienda;
  presentacion: string;
  precio: number | null;
}): Record<string, string> {
  const u = input.unidades[0];
  const t = input.tienda;
  const accesorios = input.alcance === "Unidad" ? (u?.accesorios ?? []) : accesoriosAnuncio(input.unidades);
  const vacio = !u;
  return {
    categoria: vacio ? "" : u.categoria,
    nombre: vacio ? "" : u.nombre,
    marca: vacio ? "" : u.marca,
    modelo: vacio ? "" : u.modelo,
    // "Producto usado con 6 meses de garantía" (va en medio de la frase).
    condicion: vacio ? "" : u.condicion.toLocaleLowerCase("es"),
    condicion_titulo: vacio ? "" : condicionTitulo(u.condicion, u.categoria),
    pantalla: vacio ? "" : u.pantalla,
    pantalla_titulo: vacio ? "" : u.pantallaTitulo,
    procesador: vacio ? "" : u.procesador,
    procesador_titulo: vacio ? "" : u.procesadorTitulo,
    graficos: vacio ? "" : u.graficos,
    ram: vacio ? "" : u.ram,
    ram_titulo: vacio ? "" : u.ramTitulo,
    disco: vacio ? "" : u.disco,
    disco_titulo: vacio ? "" : u.discoTitulo,
    conectividad: vacio ? "" : u.conectividad,
    caracteristicas: vacio ? "" : u.caracteristicas,
    sistema: vacio ? "" : u.sistema,
    sistema_texto: vacio ? "" : tituloCaso(u.sistema),
    pantalla_pulgadas: vacio ? "" : primeraPalabra(u.pantallaTitulo).replace(/["”″]/g, ""),
    ram_capacidad: vacio ? "" : primeraPalabra(u.ramTitulo),
    disco_capacidad: vacio ? "" : primeraPalabra(u.discoTitulo),
    // Tal como se escribieron (marcas y siglas intactas: "Cargador original Dell USB-C").
    accesorios_texto: accesorios.join(", "),
    bateria: bateriaAnuncio(input.unidades, input.alcance),
    accesorios: accesorios.join(", ").toLocaleUpperCase("es"),
    con_cargador: accesorios.some((a) => normal(a).includes("cargador")) ? "c/ cargador" : "",
    especificaciones: vacio ? "" : u.especificaciones,
    precio: dinero(input.precio),
    sku: vacio ? "" : u.sku,
    tienda_direccion: t.direccion,
    tienda_horario_semana: t.horarioSemana,
    tienda_horario_sabado: t.horarioSabado,
    tienda_whatsapp: t.whatsapp,
    tienda_telefono: t.telefonoFijo,
    tienda_web: t.web,
    tienda_pagos: t.metodosPago,
    tienda_garantia_corta: t.garantiaCorta,
    tienda_garantia_larga: t.garantiaLarga,
    presentacion: input.presentacion.trim(),
    hashtags: vacio ? "" : hashtagsAnuncio(u, t.hashtagsFijos),
  };
}

const PATRON_METACAMPO = /\{\{\s*([a-z_]+)\s*\}\}/g;

/**
 * Llena una plantilla. Una línea con metacampos que quedan TODOS vacíos se
 * quita entera; un metacampo desconocido se deja tal cual (para verlo y
 * corregir la plantilla). Sin líneas en blanco de más.
 */
export function llenarPlantilla(plantilla: string, valores: Record<string, string>, opciones: { html?: boolean } = {}): string {
  const lineas = plantilla.replace(/\r\n/g, "\n").split("\n");
  const salida: string[] = [];
  for (const linea of lineas) {
    const claves = Array.from(linea.matchAll(PATRON_METACAMPO), (m) => m[1]);
    const conocidas = claves.filter((c) => c in valores);
    if (conocidas.length && conocidas.every((c) => !txt(valores[c]))) continue;
    salida.push(linea.replace(PATRON_METACAMPO, (todo, clave: string) => (clave in valores ? (opciones.html ? escaparHtml(txt(valores[clave])) : txt(valores[clave])) : todo)).replace(/[ \t]{2,}/g, " ").replace(/[ \t]+$/, ""));
  }
  return salida.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Título en una línea, sin espacios de más. */
export function llenarTitulo(plantilla: string, valores: Record<string, string>): string {
  return llenarPlantilla(plantilla.replace(/\n+/g, " "), valores).replace(/\s+/g, " ").trim();
}

/** Las plantillas activas que sirven para un canal y categoría: las propias primero, luego las de "Otros". */
export function plantillasDisponibles(plantillas: PlantillaPublicacion[], categoria: string, canal: CanalPublicacion): PlantillaPublicacion[] {
  const activas = plantillas.filter((p) => p.activa && p.canal === canal);
  return [
    ...activas.filter((p) => normal(p.categoria) === normal(categoria)),
    ...activas.filter((p) => normal(p.categoria) === "otros" && normal(categoria) !== "otros"),
  ];
}

/** La plantilla de la categoría, o la de "Otros" si no tiene propia. */
export function elegirPlantilla(plantillas: PlantillaPublicacion[], categoria: string, canal: CanalPublicacion): PlantillaPublicacion | null {
  const activas = plantillas.filter((p) => p.activa && p.canal === canal);
  return activas.find((p) => normal(p.categoria) === normal(categoria)) ?? activas.find((p) => normal(p.categoria) === "otros") ?? null;
}

/** Nombre del registro de Shipping Publicaciones: "LAP-000500 · Marketplace · Producto". */
export function nombrePublicacion(sku: string, canal: CanalPublicacion, alcance: AlcancePublicacion, serie?: string | null) {
  return [sku, canal, alcance === "Unidad" ? `S/N ${normalizarSerie(serie) || "unidad"}` : "Producto"].join(" · ");
}

// ─── Anuncios por retirar / por actualizar (10d-4) ───────────────────────────

/** Lo mínimo de cada registro del SKU para revisar sus anuncios. */
export type UnidadParaRevisar = { id: string; sku: string; estado: string; precio: number | null; numeroSerie?: string };

export type AnuncioPendiente = { publicacion: Publicacion; motivo: string };

function mismoSku(a: string, b: string) {
  return txt(a).toUpperCase() === txt(b).toUpperCase();
}

/**
 * Revisa los anuncios publicados contra el inventario:
 * - Por retirar: el anuncio ya no tiene nada que vender (producto: ninguna
 *   unidad a la venta; aparte: esa unidad se vendió o salió).
 * - Por actualizar: cambiaron los datos de la tienda después de publicarlo, o
 *   el precio del sistema ya no es el publicado.
 */
export function revisarAnuncios(
  publicaciones: Publicacion[],
  unidades: UnidadParaRevisar[],
  versionTienda: number
): { porRetirar: AnuncioPendiente[]; porActualizar: AnuncioPendiente[] } {
  const porRetirar: AnuncioPendiente[] = [];
  const porActualizar: AnuncioPendiente[] = [];
  for (const p of publicaciones) {
    if (p.estado !== "Publicado" && p.estado !== "Por retirar") continue;
    const delSku = unidades.filter((u) => mismoSku(u.sku, p.sku));
    const vivas = delSku.filter((u) => unidadViva(u));
    let precioActual: number | null = null;
    if (p.alcance === "Unidad") {
      const u = delSku.find((x) => x.id === p.unidadId);
      if (!u || !unidadViva(u)) {
        porRetirar.push({ publicacion: p, motivo: u ? `${u.numeroSerie ? `S/N ${u.numeroSerie}` : "La unidad"}: ${u.estado}` : "La unidad ya no existe" });
        continue;
      }
      precioActual = u.precio;
    } else {
      if (!vivas.length) {
        const estados = Array.from(new Set(delSku.map((u) => u.estado).filter(Boolean)));
        porRetirar.push({ publicacion: p, motivo: delSku.length ? `Sin unidades a la venta · ${estados.join(", ")}` : "El producto ya no existe" });
        continue;
      }
      precioActual = vivas.find((u) => u.precio !== null)?.precio ?? null;
    }
    const motivos: string[] = [];
    if ((p.versionTienda ?? 0) < versionTienda) motivos.push("Cambiaron los datos de la tienda");
    if (p.precio !== null && precioActual !== null && Math.abs(p.precio - precioActual) > 0.009) {
      motivos.push(`Precio ${dinero(p.precio)} → ${dinero(precioActual)}`);
    }
    if (motivos.length) porActualizar.push({ publicacion: p, motivo: motivos.join(" · ") });
  }
  return { porRetirar, porActualizar };
}
