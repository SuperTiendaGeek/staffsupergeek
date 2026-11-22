// Motor único de IA (punto 11B · 21-nov-2026) — la parte PURA.
//
// Lo que no depende de la red: sacar el texto y las fuentes de la respuesta
// de Claude, encontrar el JSON que pedimos aunque venga con texto alrededor,
// y traducir los errores a frases que entiende el personal. La llamada vive
// en ./claude.ts (necesita la clave ANTHROPIC_API_KEY de Vercel).

/** Bloque de contenido tal como lo devuelve la API de mensajes. */
export type BloqueRespuesta = {
  type: string;
  text?: string;
  citations?: Array<{ type?: string; url?: string; title?: string; cited_text?: string }> | null;
  content?: unknown;
  [clave: string]: unknown;
};

export type FuenteWeb = { url: string; titulo: string };

/** Sitios de confianza del técnico experto (aprobados por el dueño el 21-nov-2026). */
export const DOMINIOS_TECNICO = [
  "hp.com",
  "lenovo.com",
  "dell.com",
  "asus.com",
  "acer.com",
  "apple.com",
  "ifixit.com",
] as const;

/** Une el texto de la respuesta (las citas parten el texto en varios bloques). */
export function extraerTexto(bloques: readonly BloqueRespuesta[]): string {
  return bloques
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("");
}

/** Dominio corto para mostrar ("support.hp.com"). */
export function dominioDe(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Fuentes que respaldan la respuesta: primero las CITADAS; si no hubo citas,
 * los primeros resultados de la búsqueda. Sin repetir la misma página.
 */
export function extraerFuentes(bloques: readonly BloqueRespuesta[], maximo = 4): FuenteWeb[] {
  const vistas = new Set<string>();
  const fuentes: FuenteWeb[] = [];
  const agregar = (url?: string, titulo?: string) => {
    if (!url || !/^https?:\/\//i.test(url) || vistas.has(url) || fuentes.length >= maximo) return;
    vistas.add(url);
    fuentes.push({ url, titulo: (titulo ?? "").trim() || dominioDe(url) });
  };
  for (const b of bloques) {
    if (b.type !== "text" || !Array.isArray(b.citations)) continue;
    for (const c of b.citations) agregar(c?.url, c?.title);
  }
  if (fuentes.length === 0) {
    for (const b of bloques) {
      if (b.type !== "web_search_tool_result" || !Array.isArray(b.content)) continue;
      for (const r of b.content as Array<{ type?: string; url?: string; title?: string }>) {
        if (r?.type === "web_search_result") agregar(r.url, r.title);
      }
    }
  }
  return fuentes;
}

/** Cuántas búsquedas hizo (para el registro de costo). */
export function contarBusquedas(bloques: readonly BloqueRespuesta[]): number {
  return bloques.filter((b) => b.type === "server_tool_use" && b.name === "web_search").length;
}

/** Fin del objeto JSON que empieza en `inicio` (respeta comillas y escapes). */
function cierreDelObjeto(texto: string, inicio: number): number {
  let nivel = 0;
  let enCadena = false;
  let escape = false;
  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i];
    if (enCadena) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') enCadena = false;
      continue;
    }
    if (c === '"') enCadena = true;
    else if (c === "{") nivel++;
    else if (c === "}") {
      nivel--;
      if (nivel === 0) return i;
    }
  }
  return -1;
}

/**
 * El objeto JSON que pedimos, aunque Claude escriba algo antes ("Voy a
 * buscar…") o lo envuelva en ```json. Se queda con el ÚLTIMO objeto válido
 * del nivel más alto. Null si no hay ninguno.
 */
export function extraerJson(texto: string): Record<string, unknown> | null {
  const limpio = texto.trim();
  try {
    const directo = JSON.parse(limpio);
    if (directo && typeof directo === "object" && !Array.isArray(directo)) return directo as Record<string, unknown>;
  } catch { /* sigue */ }
  let ultimo: Record<string, unknown> | null = null;
  let i = 0;
  while (i < limpio.length) {
    const inicio = limpio.indexOf("{", i);
    if (inicio < 0) break;
    const fin = cierreDelObjeto(limpio, inicio);
    if (fin < 0) break;
    try {
      const obj = JSON.parse(limpio.slice(inicio, fin + 1));
      if (obj && typeof obj === "object" && !Array.isArray(obj)) ultimo = obj as Record<string, unknown>;
      i = fin + 1;
    } catch {
      i = inicio + 1;
    }
  }
  return ultimo;
}

/** Texto limpio de un campo de la respuesta (string o nada). */
export function textoDe(v: unknown, maximo = 2000): string {
  if (typeof v !== "string") return "";
  const t = v.replace(/\r\n/g, "\n").trim();
  return t.length > maximo ? `${t.slice(0, maximo - 1)}…` : t;
}

/** Lista de textos limpios (descarta vacíos y lo que no es texto). */
export function listaDe(v: unknown, maximo = 8): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => textoDe(x, 600)).filter(Boolean).slice(0, maximo);
}

/** Frase para el personal según lo que respondió la API. */
export function mensajeErrorIA(status: number, detalle = ""): string {
  if (status === 401) return "La clave de IA no es válida. Revísala en Vercel.";
  if (status === 429) return "La IA está ocupada. Intenta en un momento.";
  if (status === 529) return "La IA está saturada. Intenta en un momento.";
  if (status === 400 && /credit|billing/i.test(detalle)) return "La cuenta de IA no tiene saldo. Revisa Billing en platform.claude.com.";
  return "La IA no pudo responder. Intenta de nuevo.";
}
