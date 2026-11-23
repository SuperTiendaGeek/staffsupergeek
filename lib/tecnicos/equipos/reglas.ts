// Ficha del equipo — reglas PURAS (rediseño de la orden, partes R4 + R5 ·
// 22-nov-2026, decisiones 3 y 4 del dueño).
//
// Antes: "Equipo" era texto libre con la serie mezclada ("Laptop HP
// 14-dq1004la SN SCD04450QJ"), no había tabla de equipos y la contraseña se
// escribía en la «nota interna».
//
// Ahora (Orderry / RepairShopr: cada equipo del cliente con su historia):
//   · Tabla «Equipos»: tipo, marca, modelo, serie, cliente y contraseña.
//   · Cada orden se liga a su ficha; la historia del equipo son sus órdenes.
//   · La contraseña vive en la ficha (se guarda para la próxima vez, decisión
//     del dueño 22-nov), oculta: se ve con «Mostrar» y cada vista queda en la
//     Actividad.
//   · Las órdenes viejas se ligan con un script; las contraseñas escritas en
//     la nota interna se pasan a la ficha (vista previa → aprobación).
//
// Sin red ni Airtable: lo usan el script, las rutas y la pantalla.

export const TABLA_EQUIPOS = "Equipos";

export const TIPOS_EQUIPO = [
  "Laptop", "Computador de escritorio", "Todo en uno", "Tablet", "Celular", "Monitor", "Impresora", "Consola", "Otro",
] as const;
export type TipoEquipo = (typeof TIPOS_EQUIPO)[number];

export type DatosEquipo = { tipo: TipoEquipo; marca: string; modelo: string; serie: string };

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const plano = (s: string) => sinTildes(s).toLowerCase().replace(/\s+/g, " ").trim();

/** Marca canónica por palabra (en minúsculas y sin tildes). */
const MARCAS: Record<string, string> = {
  hp: "HP", hewlett: "HP", lenovo: "Lenovo", dell: "Dell", asus: "Asus", acer: "Acer", apple: "Apple",
  macbook: "Apple", imac: "Apple", ipad: "Apple", iphone: "Apple", toshiba: "Toshiba", msi: "MSI",
  samsung: "Samsung", huawei: "Huawei", xiaomi: "Xiaomi", redmi: "Xiaomi", epson: "Epson", canon: "Canon",
  brother: "Brother", sony: "Sony", playstation: "Sony", microsoft: "Microsoft", xbox: "Microsoft",
  surface: "Microsoft", lg: "LG", gigabyte: "Gigabyte", alienware: "Alienware", razer: "Razer",
  motorola: "Motorola", nintendo: "Nintendo", zotac: "Zotac", generico: "Genérico", generica: "Genérico",
  aoc: "AOC", benq: "BenQ", viewsonic: "ViewSonic", amazon: "Amazon", kingston: "Kingston", xerox: "Xerox",
};

/** Palabras que dicen el tipo (se buscan en el texto plano). */
const PISTAS_TIPO: Array<[TipoEquipo, RegExp]> = [
  ["Todo en uno", /\b(todo en uno|all.?in.?one|aio|imac)\b/],
  ["Laptop", /^(laptop|portatil|notebook)\b|\b(macbook|chromebook|crombook|thinkpad|ideapad|vivobook|zenbook|elitebook|probook|latitude|notebook|omnibook|legion 5|rog strix|tuf gaming|aspire|satellite|xps|inspiron|inpirion|precision|pavilion|envy|spectre|yoga|victus|omen|nitro|predator|swift|travelmate)\b|^hp 1[0-7]-/],
  ["Computador de escritorio", /^(desktop|pc|cpu|torre)\b|\b(mini pc|prodesk|optiplex|escritorio|desktop)\b/],
  ["Impresora", /\b(impresora|printer|smarttank|ecotank)\b/],
  ["Consola", /\b(consola|playstation|xbox|nintendo|switch|mando|control de|ps[2-5])\b/],
  ["Celular", /\b(celular|iphone|motorola|galaxy s|galaxy a|redmi|telefono|smartphone)\b/],
  ["Tablet", /\b(tablet|ipad|galaxy tab)\b/],
  ["Monitor", /\bmonitor\b/],
];

/** Palabras de tipo que no son parte del modelo. */
const PALABRAS_TIPO = /^(laptop|portatil|portátil|notebook|desktop|pc|impresora|consola|celular|tablet|monitor|computador de escritorio|todo en uno)\b\s*/i;

/** Serie con etiqueta: SN, S/N, ST (service tag), N/S, Serie, S:, S/… */
// Ojo: Tailwind lee lib/** buscando clases; corchetes con dos puntos dentro generan CSS
// inválido y rompe el build. Por eso los ":" dentro de [...] van como \x3a.
const SERIE = /(?:^|\s)(?:s\/n|sn|st|n\/s|serie|serial|s\/|s\x3a)\s*[\x3a#>.\-]?\s*([a-z0-9][a-z0-9-]{4,})\s*$/i;

export function normalizarTipoEquipo(v: unknown): TipoEquipo | "" {
  const t = typeof v === "string" ? v.trim() : v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name ?? "") : "";
  return (TIPOS_EQUIPO as readonly string[]).includes(t) ? (t as TipoEquipo) : "";
}

/** Lee el texto libre de la orden y propone la ficha. */
export function interpretarEquipo(texto: string): DatosEquipo {
  let resto = (texto ?? "").replace(/\s+/g, " ").trim();
  let serie = "";
  const s = resto.match(SERIE);
  if (s) {
    serie = s[1].toUpperCase();
    resto = resto.slice(0, s.index).trim();
  }
  const p = plano(resto);
  const tipo = (PISTAS_TIPO.find(([, re]) => re.test(p))?.[0] ?? "Otro") as TipoEquipo;
  resto = resto.replace(PALABRAS_TIPO, "").trim();

  let marca = "";
  const palabras = resto.split(" ");
  const i = palabras.findIndex((w) => MARCAS[plano(w).replace(/[^a-z]/g, "")]);
  if (i >= 0) {
    marca = MARCAS[plano(palabras[i]).replace(/[^a-z]/g, "")];
    // "Hp", "macbook": la palabra de la marca sale del modelo salvo que sea el
    // nombre del producto (MacBook, iPad, PlayStation…).
    const w = plano(palabras[i]).replace(/[^a-z]/g, "");
    if (["hp", "hewlett", "lenovo", "dell", "asus", "acer", "apple", "toshiba", "msi", "samsung", "huawei", "xiaomi", "epson", "canon", "brother", "sony", "microsoft", "lg", "gigabyte", "razer", "motorola", "zotac", "generico", "generica", "aoc", "benq", "viewsonic", "amazon", "kingston", "xerox"].includes(w)) {
      palabras.splice(i, 1);
    }
  }
  const modelo = palabras.join(" ").replace(/^[\s,\x3a-]+|[\s,\x3a-]+$/g, "").trim();
  return { tipo, marca, modelo, serie };
}

/** "HP 14-dq1004la" — lo que se ve en la ficha y en las listas. */
export function nombreEquipo(d: Pick<DatosEquipo, "tipo" | "marca" | "modelo">): string {
  const n = [d.marca, d.modelo].filter(Boolean).join(" ").trim();
  return n || d.tipo || "Equipo";
}

/**
 * Para no repetir fichas del mismo cliente: por serie si la hay; si no, por
 * nombre (sin tildes ni mayúsculas).
 */
export function claveEquipo(clienteId: string, d: DatosEquipo): string {
  return d.serie ? `${clienteId}#S:${d.serie.toUpperCase()}` : `${clienteId}#N:${plano(nombreEquipo(d))}`;
}

// ─── Contraseña escrita en la nota interna ───────────────────────────────────

const ETIQUETA = /(contrase(?:ñ|n)as?|constrase(?:ñ|n)as?|clave|password|pass|pin|patr[oó]n)\b\s*(?:es\b)?\s*[\x3a>=]?\s*/gi;
/** Claves de licencia (Windows, Office…): no son la contraseña del equipo. */
const LICENCIA = /\b[a-z0-9]{5}(?:-[a-z0-9]{5}){4}\b|\b(windows|office|licencia|antivirus)\b/i;
const TELEFONO = /^0?9\d{8}$/;

export type Extraccion = {
  contrasena: string;
  /** alta: con etiqueta y valor corto. media: sin etiqueta (nota de una sola palabra) o valor largo. */
  confianza: "alta" | "media";
  /** Lo que queda de la nota sin la contraseña (pasa a la Actividad). */
  resto: string;
};

const limpiar = (s: string) => s.replace(/^[\s.,;\x3a>\-]+|[\s,;\x3a>\-]+$/g, "").replace(/\n{3,}/g, "\n\n").trim();

/**
 * Busca la contraseña en la nota interna. Solo la saca si tiene etiqueta
 * («Contraseña», «Clave», «Pass», «PIN», «Patrón») o si la nota entera es una
 * sola palabra o número que no es un teléfono. Si no, no toca nada.
 */
export function extraerContrasena(nota: string): Extraccion | null {
  const texto = (nota ?? "").trim();
  if (!texto) return null;

  // "102010 PIN": el valor va antes de la etiqueta.
  const antes = texto.match(/^(\S{3,20})\s+(?:pin|clave|pass)$/i);
  if (antes) return { contrasena: antes[1], confianza: "alta", resto: "" };

  // Puede haber varias etiquetas: se usa la primera que de verdad es una
  // contraseña ("Clave de Windows: …", "pin de carga" no lo son).
  ETIQUETA.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ETIQUETA.exec(texto))) {
    const desde = m.index + m[0].length;
    const linea = texto.slice(desde).replace(/^\s*\n\s*/, "");
    let valor = linea.split("\n")[0].trim();
    let fin = texto.length - linea.length + linea.split("\n")[0].length;
    // Varias líneas después de la etiqueta ("Contraseñas:\nMOTOROLA: 2222 IPHONE: 061983").
    if (!valor || /^\x3a/.test(valor) || /^\s*\x3a/.test(linea.split("\n")[1] ?? "")) {
      valor = linea.replace(/\s*\n\s*/g, " ").trim();
      fin = texto.length;
    }
    // "Pass 12345. Pitido al encender": corta en el punto seguido.
    const punto = valor.search(/\.\s+\S/);
    if (punto > 0) {
      fin -= valor.length - punto;
      valor = valor.slice(0, punto);
    }
    valor = valor.replace(/^[\x3a>=\s]+|[.\s]+$/g, "").trim();
    if (!valor || /^(sn|s\/n|st)\b/i.test(valor) || /^de\s/i.test(valor) || LICENCIA.test(valor)) continue;
    const resto = limpiar(texto.slice(0, m.index) + " " + texto.slice(Math.min(fin + 1, texto.length)));
    return { contrasena: valor, confianza: valor.split(/\s+/).length > 4 ? "media" : "alta", resto };
  }

  // La nota entera es una sola palabra o número: probablemente la contraseña.
  if (/^\S{3,20}$/.test(texto) && !TELEFONO.test(texto) && !/^(sn|st)[\x3a\s]/i.test(texto)) {
    return { contrasena: texto, confianza: "media", resto: "" };
  }
  return null;
}

/** Texto con que la nota vieja entra a la Actividad (sirve también para no repetirla). */
export const PREFIJO_NOTA_ANTERIOR = "Nota interna anterior: ";
export const textoNotaAnterior = (resto: string) => `${PREFIJO_NOTA_ANTERIOR}${resto.trim()}`;

// ─── Historia del equipo ─────────────────────────────────────────────────────

export type OrdenDeHistoria = {
  id: string;
  codigo: string;
  fecha: string;
  estado: string;
  motivo: string;
  tipoRegreso: string;
};

/** La historia del equipo: más reciente arriba, sin la orden que se está viendo. */
export function historiaSinActual(ordenes: readonly OrdenDeHistoria[], actualId: string | null): OrdenDeHistoria[] {
  return ordenes.filter((o) => o.id !== actualId).sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
}

export function revisarDatosEquipo(o: { tipo?: unknown; marca?: unknown; modelo?: unknown; serie?: unknown }):
  { ok: true; datos: DatosEquipo } | { ok: false; error: string } {
  const tipo = normalizarTipoEquipo(o.tipo);
  if (!tipo) return { ok: false, error: "Elige el tipo de equipo." };
  const t = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const datos = { tipo, marca: t(o.marca, 40), modelo: t(o.modelo, 80), serie: t(o.serie, 40).toUpperCase() };
  if (!datos.marca && !datos.modelo) return { ok: false, error: "Escribe la marca o el modelo." };
  return { ok: true, datos };
}
