/**
 * Emparejar los items del sistema de facturación viejo con los Shipping Items
 * que ya existen en el portal.
 *
 * Sin "server-only": funciones puras, sin red y sin Airtable, para poder
 * probarlas de verdad. El que decide qué se crea es un script aparte.
 *
 * ─── El problema ─────────────────────────────────────────────────────────────
 *
 * Durante un tiempo se usó el portal para la logística y el sistema viejo para
 * facturar. Así que hay artículos que están en los dos lados, y son la MISMA
 * mercadería física: si se importan sin más, el inventario queda inflado al
 * doble.
 *
 * Emparejar por nombre a secas no sirve — "Lenovo ThinkCentre M70q 16 gb" y
 * "LENOVO THINKCENTRE M70Q 16GB" son el mismo equipo escrito distinto. De ahí
 * que aquí se normalice primero con el mismo vocabulario que ya usa el resto
 * del módulo (normalizeItemNameFast: "16 gb" → "16GB", "win 11" → "Windows 11",
 * "i5" → "Core i5") y se compare después.
 *
 * ─── El criterio ─────────────────────────────────────────────────────────────
 *
 * Nada se decide solo. La clasificación es una PROPUESTA para revisar en una
 * hoja de cálculo:
 *
 *   · YA EXISTE          nombre idéntico una vez normalizado → se omite
 *   · POSIBLE DUPLICADO  se parece mucho → lo mira una persona
 *   · NUEVO              no se parece a nada → se crea
 *
 * Ante la duda, "POSIBLE DUPLICADO". Un falso duplicado cuesta una revisión;
 * un duplicado que se cuela cuesta inventario mal contado.
 */

import { normalizeItemNameFast } from "./item-name-normalizer";

// ─── Normalización para comparar ─────────────────────────────────────────────

/**
 * Deja el nombre en su forma canónica para comparar: aplica el vocabulario del
 * módulo, quita tildes, signos y mayúsculas.
 *
 * NO se usa para guardar — el nombre que se guarda es el original.
 */
export function normalizarParaComparar(nombre: string): string {
  return normalizeItemNameFast(nombre ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // tildes
    .replace(/[^a-z0-9\s]/g, " ")      // signos, guiones, barras
    .replace(/\s+/g, " ")
    .trim();
}

/** Palabras que no distinguen un equipo de otro y solo ensucian la comparación. */
const VACIAS = new Set([
  "de", "del", "la", "el", "los", "las", "con", "sin", "para", "por", "y", "o",
  "un", "una", "en", "a", "c", "w",
]);

export function tokens(nombre: string): string[] {
  return normalizarParaComparar(nombre)
    .split(" ")
    .filter((t) => t.length > 0 && !VACIAS.has(t));
}

// ─── Parecido ────────────────────────────────────────────────────────────────

/**
 * Cuánto se parecen dos nombres, de 0 a 1.
 *
 * Se usa Jaccard sobre las palabras: cuántas comparten frente al total de
 * palabras distintas. Es robusto al orden y a las palabras de más, que es
 * exactamente cómo varían estos nombres entre un sistema y otro.
 */
export function parecido(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;

  let comunes = 0;
  for (const t of ta) if (tb.has(t)) comunes++;

  const union = ta.size + tb.size - comunes;
  return union === 0 ? 0 : comunes / union;
}

/**
 * Cuánta parte del nombre MÁS CORTO aparece en el más largo, de 0 a 1.
 *
 * Hace falta además del parecido normal porque el caso más traicionero es que
 * el sistema viejo tenga el nombre resumido y el portal el completo:
 *
 *   viejo:  "Lenovo ThinkPad P1 Gen 3"
 *   portal: "Lenovo ThinkPad P1 Gen 3 15.6\" Core i7-10750H 1TB 32GB B T2000"
 *
 * Ahí el parecido normal baja al 36% —las nueve palabras de más lo hunden— y
 * el item se habría creado por duplicado. La contención, en cambio, da 100%:
 * el nombre corto está entero dentro del largo.
 */
export function contencion(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;

  const [chico, grande] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  let comunes = 0;
  for (const t of chico) if (grande.has(t)) comunes++;
  return comunes / chico.size;
}

/**
 * Palabras que casi siempre identifican un equipo concreto: modelos y
 * capacidades. Que coincidan pesa más que compartir la marca.
 */
export function tokensDistintivos(nombre: string): string[] {
  return tokens(nombre).filter(
    (t) => /\d/.test(t) && t.length >= 2   // "m70q", "i5", "10400t", "16gb", "240gb"
  );
}

// ─── Clasificación ───────────────────────────────────────────────────────────

export type ItemPortal = {
  recordId: string;
  sku: string;
  nombre: string;
  cantidad: number;
  precioVentaFinal: number | null;
};

export type ItemViejo = {
  nombre: string;
  codigo?: string;
  cantidad: number;
  costo?: number | null;
  precioVenta?: number | null;
};

export type Clasificacion = "YA EXISTE" | "POSIBLE DUPLICADO" | "NUEVO";

export type Emparejamiento = {
  clasificacion: Clasificacion;
  /** El item del portal con el que se parece, si lo hay. */
  candidato?: ItemPortal;
  /** 0 a 1. */
  parecido: number;
  /** Por qué se clasificó así, en español, para la hoja de revisión. */
  motivo: string;
};

/** A partir de este parecido se considera el mismo artículo escrito distinto. */
export const UMBRAL_DUPLICADO = 0.85;
/** A partir de aquí lo mira una persona. */
export const UMBRAL_REVISION  = 0.55;
/**
 * Contención a partir de la cual el nombre corto se considera "el mismo con
 * menos detalle". Se exige además que el corto tenga al menos 3 palabras: con
 * una o dos ("Memoria RAM") cualquier cosa contiene a cualquier cosa.
 */
export const UMBRAL_CONTENCION = 0.85;
const MIN_TOKENS_CONTENCION    = 3;

export function emparejar(viejo: ItemViejo, portal: readonly ItemPortal[]): Emparejamiento {
  const normViejo = normalizarParaComparar(viejo.nombre);

  if (!normViejo) {
    return { clasificacion: "POSIBLE DUPLICADO", parecido: 0, motivo: "El item no tiene nombre; revisar a mano." };
  }

  // 1. Mismo SKU exacto. Es la señal más fuerte cuando existe, aunque el
  //    sistema viejo use otra estructura de códigos y casi nunca coincida.
  if (viejo.codigo?.trim()) {
    const porSku = portal.find(
      (p) => p.sku.trim().toUpperCase() === viejo.codigo!.trim().toUpperCase()
    );
    if (porSku) {
      return {
        clasificacion: "YA EXISTE",
        candidato: porSku,
        parecido: 1,
        motivo: `Mismo código que el SKU ${porSku.sku} del portal.`,
      };
    }
  }

  // 2. Nombre idéntico una vez normalizado.
  const exacto = portal.find((p) => normalizarParaComparar(p.nombre) === normViejo);
  if (exacto) {
    return {
      clasificacion: "YA EXISTE",
      candidato: exacto,
      parecido: 1,
      motivo: `Mismo nombre que ${exacto.sku} (ignorando mayúsculas y forma de escribir).`,
    };
  }

  // 3. El más parecido, mirando las dos medidas.
  let mejor: ItemPortal | undefined;
  let mejorParecido = 0;
  let mejorContenido = false;

  const tokensViejo = tokens(viejo.nombre);

  for (const p of portal) {
    const s = parecido(viejo.nombre, p.nombre);
    const c = contencion(viejo.nombre, p.nombre);

    // Un nombre corto contenido entero en uno largo es el mismo artículo con
    // menos detalle, aunque el parecido normal salga bajo.
    const contenido =
      c >= UMBRAL_CONTENCION &&
      Math.min(tokensViejo.length, tokens(p.nombre).length) >= MIN_TOKENS_CONTENCION;

    // Se ordena por el mejor de los dos: así un candidato contenido gana a
    // otro que solo comparte la marca.
    const puntaje = contenido ? Math.max(s, c) : s;
    if (puntaje > mejorParecido) {
      mejorParecido  = puntaje;
      mejor          = p;
      mejorContenido = contenido;
    }
  }

  if (mejorContenido && mejor) {
    return {
      clasificacion: "POSIBLE DUPLICADO",
      candidato: mejor,
      parecido: mejorParecido,
      motivo:
        `El nombre está contenido entero en ${mejor.sku} — probablemente es el mismo ` +
        `artículo con menos detalle. Confírmalo.`,
    };
  }

  if (!mejor || mejorParecido < UMBRAL_REVISION) {
    return {
      clasificacion: "NUEVO",
      parecido: mejorParecido,
      motivo: mejor
        ? `No se parece a nada del portal (lo más cercano: ${mejor.sku}, ${Math.round(mejorParecido * 100)}%).`
        : "No hay nada parecido en el portal.",
    };
  }

  // Si además comparten los códigos de modelo y capacidades, casi seguro es el
  // mismo equipo.
  const distViejo  = new Set(tokensDistintivos(viejo.nombre));
  const distPortal = new Set(tokensDistintivos(mejor.nombre));
  const distComunes = [...distViejo].filter((t) => distPortal.has(t));
  const compartenModelo =
    distViejo.size > 0 && distComunes.length === distViejo.size && distComunes.length === distPortal.size;

  if (mejorParecido >= UMBRAL_DUPLICADO || (compartenModelo && mejorParecido >= UMBRAL_REVISION)) {
    return {
      clasificacion: "POSIBLE DUPLICADO",
      candidato: mejor,
      parecido: mejorParecido,
      motivo: compartenModelo
        ? `Coinciden modelo y capacidades con ${mejor.sku} (${Math.round(mejorParecido * 100)}% de parecido).`
        : `Se parece mucho a ${mejor.sku} (${Math.round(mejorParecido * 100)}%).`,
    };
  }

  return {
    clasificacion: "POSIBLE DUPLICADO",
    candidato: mejor,
    parecido: mejorParecido,
    motivo: `Podría ser el mismo que ${mejor.sku} (${Math.round(mejorParecido * 100)}%). Confírmalo.`,
  };
}

// ─── Categoría propuesta ─────────────────────────────────────────────────────

/**
 * Las 20 opciones del desplegable "Categoría" en Shipping Items. Si alguna
 * cambia en Airtable, hay que cambiarla aquí: el script escribe estos valores
 * tal cual.
 */
export const CATEGORIAS = [
  "Laptop", "Desktop", "All in One", "Monitor", "Consola", "RAM", "SSD", "HDD",
  "Tablet", "Pantalla", "Teclado", "Batería", "Cargador", "Mainboard",
  "Tarjeta gráfica", "Fuente de poder", "Cable", "Accesorio", "Repuesto", "Otro",
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

/**
 * Pistas por categoría, de la más específica a la más general. El orden
 * importa: "cargador de laptop" es un Cargador, no una Laptop.
 */
/**
 * Frases que mandan por encima de todo, incluida la posición.
 *
 * Son los casos donde una palabra que normalmente indica el tipo aquí es solo
 * un complemento. Salieron de auditar el export real:
 *
 *   "Kensington Combination Laptop Lock"  →  no es una Laptop, es un candado
 *   "Adaptador Wi-Fi USB"                 →  no es un Cargador
 *   "NexiGo Glow Light … para pantalla"   →  no es una Pantalla
 *
 * La regla de posición no las salva porque la palabra engañosa va primero.
 */
const FRASES: Array<{ categoria: Categoria; frases: string[] }> = [
  { categoria: "Accesorio", frases: [
      "laptop lock", "candado", "lock",
      "adaptador wi fi", "adaptador wifi", "antena",
      "glow light", "luz para", "lector de tarjetas", "lector usb",
  ] },
];

const PISTAS: Array<{ categoria: Categoria; palabras: string[] }> = [
  { categoria: "Cargador",        palabras: ["cargador", "charger", "adaptador de corriente", "adaptador de poder", "adaptador ac"] },
  { categoria: "Batería",         palabras: ["bateria", "battery"] },
  { categoria: "Teclado",         palabras: ["teclado", "keyboard"] },
  { categoria: "Pantalla",        palabras: ["pantalla", "display", "lcd"] },
  { categoria: "Mainboard",       palabras: ["mainboard", "motherboard", "placa", "board"] },
  { categoria: "Tarjeta gráfica", palabras: ["grafica", "gpu", "geforce", "radeon", "quadro", "nvidia"] },
  { categoria: "Fuente de poder", palabras: ["fuente", "psu"] },
  { categoria: "RAM",             palabras: ["ram", "ddr3", "ddr4", "ddr5", "sodimm", "dimm", "memoria"] },
  { categoria: "SSD",             palabras: ["ssd", "nvme", "m2"] },
  { categoria: "HDD",             palabras: ["hdd", "disco duro"] },
  { categoria: "Monitor",         palabras: ["monitor"] },
  { categoria: "All in One",      palabras: ["all in one", "aio", "imac"] },
  { categoria: "Consola",         palabras: ["playstation", "xbox", "nintendo", "consola", "ps4", "ps5"] },
  { categoria: "Tablet",          palabras: ["tablet", "ipad"] },
  { categoria: "Cable",           palabras: ["cable", "hdmi", "usb c", "displayport"] },
  { categoria: "Laptop",          palabras: ["laptop", "notebook", "thinkpad", "latitude", "elitebook", "macbook", "inspiron", "vivobook", "ideapad", "probook"] },
  { categoria: "Desktop",         palabras: ["desktop", "thinkcentre", "optiplex", "prodesk", "elitedesk", "torre", "mini pc", "minipc", "nuc", "thinksmart", "beelink", "wintel"] },
  // Audio, video y periféricos. Salieron del export real del sistema viejo:
  // 103 de 283 artículos no tenían ninguna pista, y la mayoría eran audífonos,
  // parlantes, cámaras y micrófonos. Todos caen en "Accesorio", que sí existe
  // en el desplegable de Airtable.
  { categoria: "Accesorio",       palabras: [
      "mouse", "funda", "estuche", "soporte", "hub", "docking", "dock", "base",
      "audifono", "audifonos", "headset", "headphones", "earbuds", "airpods", "auriculares",
      "parlante", "parlantes", "speaker", "altavoz",
      "camara", "webcam",
      "microfono", "mic",
  ] },
  { categoria: "Otro",            palabras: ["licencia", "office 365", "microsoft office"] },
];

/**
 * Propone una categoría leyendo el nombre. Devuelve undefined si no hay una
 * pista clara — y ese es el punto: la hoja de revisión deja la celda vacía
 * para que una persona la llene, en vez de inventar "Otro" y que pase de largo.
 */
/**
 * Propone una categoría leyendo el nombre.
 *
 * ─── Por qué gana la palabra que aparece ANTES ───────────────────────────────
 *
 * El tipo de artículo va al principio del nombre; lo que viene después son
 * especificaciones y accesorios. En:
 *
 *   "Lenovo ThinkCentre M70q Mini Desktop Core i5 240GB SSD 16GB RAM … c/ cargador"
 *
 * aparecen "Desktop", "SSD", "RAM" y "cargador". Solo la primera es el tipo;
 * las otras tres describen lo que lleva dentro o lo que viene con él. Buscar
 * por lista de prioridad daba "Cargador" o "RAM" — lo detectó una prueba en
 * seco con datos reales.
 *
 * Empate a la misma posición: gana la pista más específica, que es el orden en
 * que están escritas en PISTAS.
 *
 * Devuelve undefined cuando no hay ninguna pista, y ese es el punto: la hoja
 * de revisión deja la celda vacía para que una persona la llene, en vez de
 * rellenar con "Otro" y que el problema pase de largo.
 */
export function proponerCategoria(nombre: string): Categoria | undefined {
  const n = normalizarParaComparar(nombre);
  if (!n) return undefined;

  for (const { categoria, frases } of FRASES) {
    if (frases.some((f) => n.includes(f))) return categoria;
  }

  let mejor: { categoria: Categoria; posicion: number; prioridad: number } | undefined;

  PISTAS.forEach(({ categoria, palabras }, prioridad) => {
    for (const p of palabras) {
      const patron = new RegExp(`(^|\\s)${p.replace(/\s+/g, "\\s+")}(\\s|$)`);
      const m = patron.exec(n);
      if (!m) continue;

      const posicion = m.index;
      const gana =
        !mejor ||
        posicion < mejor.posicion ||
        (posicion === mejor.posicion && prioridad < mejor.prioridad);

      if (gana) mejor = { categoria, posicion, prioridad };
    }
  });

  return mejor?.categoria;
}

