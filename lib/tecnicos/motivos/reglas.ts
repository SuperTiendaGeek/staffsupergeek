// Motivos de ingreso — reglas PURAS (rediseño R7, tableros 7 y 8 aprobados el
// 22-nov-2026). Una sola lista para el taller, con grupos; cada orden lleva
// uno o varios motivos (chips) más lo que dijo el cliente («Ingresa Por»).
//
// El buscador es instantáneo y sin IA: sin tildes, por inicio de palabra, con
// las «palabras parecidas» de cada motivo y tolerando un error pequeño
// («pasta ter» → «Limpieza y cambio de pasta térmica»). La IA solo revisa el
// significado al CREAR uno nuevo (servidor).

export const GRUPOS_MOTIVO = ["Falla", "Mantenimiento", "Software", "Otro servicio"] as const;
export type GrupoMotivo = (typeof GRUPOS_MOTIVO)[number];
export const esGrupoMotivo = (v: unknown): v is GrupoMotivo => GRUPOS_MOTIVO.includes(v as GrupoMotivo);

export type Motivo = {
  id: string;
  nombre: string;
  grupo: GrupoMotivo | null;
  palabras: string[];
  activo: boolean;
  nuevo: boolean;
  /** Órdenes que lo usan (todas) y en los últimos 90 días. */
  usos: number;
  usos90: number;
  /** Si se unió a otro motivo, el que queda. */
  unidoEn: string | null;
};

export type MotivoCorto = { id: string; nombre: string; grupo: GrupoMotivo | null };

// ─── Texto ───────────────────────────────────────────────────────────────────

/** Minúsculas y sin tildes, carácter por carácter (mismo largo que el original). */
export function plano(s: string): string {
  let r = "";
  for (const c of s) r += (c.normalize("NFD")[0] ?? c).toLowerCase();
  return r;
}

const SEPARADOR = /[^a-z0-9ñ]+/;

/** Palabras de un texto, sin tildes ni signos. */
export function palabrasDe(s: string): string[] {
  return plano(s).split(SEPARADOR).filter(Boolean);
}

/** «a, b; c» o una por línea → lista limpia sin repetidos. */
export function listaPalabras(s: string | null | undefined): string[] {
  const vistos = new Set<string>();
  const r: string[] = [];
  for (const p of (s ?? "").split(/[\n,;]+/)) {
    const t = p.trim().replace(/\s+/g, " ");
    const k = plano(t);
    if (t && !vistos.has(k)) { vistos.add(k); r.push(t); }
  }
  return r;
}

export function agregarPalabra(lista: string[], nueva: string): string[] {
  return listaPalabras([...lista, nueva].join("\n"));
}

/** Distancia de edición (con transposición), para perdonar un error al escribir. */
export function distancia(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

/** ¿La palabra empieza con lo escrito? (desde 4 letras se perdona un error). */
export function empiezaParecido(palabra: string, escrito: string): boolean {
  if (palabra.startsWith(escrito)) return true;
  if (escrito.length < 4) return false;
  return distancia(palabra.slice(0, escrito.length), escrito) <= 1 || distancia(palabra.slice(0, escrito.length + 1), escrito) <= 1;
}

// ─── Buscador ────────────────────────────────────────────────────────────────

export type Resultado = { motivo: Motivo; marcas: Array<[number, number]> };

/** Partes del nombre que coinciden con lo escrito (para resaltarlas). */
export function marcasEnNombre(nombre: string, escritos: string[]): Array<[number, number]> {
  const p = plano(nombre);
  const marcas: Array<[number, number]> = [];
  const re = /[a-z0-9ñ]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(p))) {
    const w = m[0];
    const e = escritos.find((x) => empiezaParecido(w, x));
    if (e) marcas.push([m.index, m.index + Math.min(e.length, w.length)]);
  }
  return marcas;
}

/**
 * Motivos activos que coinciden con lo escrito: cada palabra escrita debe
 * empezar alguna palabra del nombre o de sus palabras parecidas. Primero los
 * que coinciden por el nombre, después por uso reciente.
 */
export function buscarMotivos(catalogo: Motivo[], consulta: string, maximo = 6): Resultado[] {
  const escritos = palabrasDe(consulta);
  if (!escritos.length) return [];
  const puntuados: Array<{ m: Motivo; puntos: number }> = [];
  for (const m of catalogo) {
    if (!m.activo) continue;
    const delNombre = palabrasDe(m.nombre);
    const parecidas = m.palabras.flatMap(palabrasDe);
    let puntos = 0;
    let todas = true;
    for (const e of escritos) {
      if (delNombre.some((w) => w.startsWith(e))) puntos += 3;
      else if (delNombre.some((w) => empiezaParecido(w, e))) puntos += 2;
      else if (parecidas.some((w) => empiezaParecido(w, e))) puntos += 1;
      else { todas = false; break; }
    }
    if (todas) puntos += plano(m.nombre).startsWith(plano(consulta.trim())) ? 2 : 0;
    if (todas) puntos > 0 && puntuados.push({ m, puntos });
  }
  return puntuados
    .sort((a, b) => b.puntos - a.puntos || b.m.usos90 - a.m.usos90 || b.m.usos - a.m.usos || a.m.nombre.localeCompare(b.m.nombre, "es"))
    .slice(0, maximo)
    .map(({ m }) => ({ motivo: m, marcas: marcasEnNombre(m.nombre, escritos) }));
}

const VACIAS = new Set(["el", "la", "los", "las", "de", "del", "que", "con", "por", "para", "una", "uno", "sus", "muy", "equipo", "laptop", "computadora", "compu"]);

/**
 * El motivo más parecido aunque no coincidan TODAS las palabras (para sugerir
 * «Unir con…» en el catálogo, o cuando la IA no está disponible): gana el que
 * comparte más palabras con sentido; empate → el más usado.
 */
export function masParecido(catalogo: Motivo[], texto: string, excepto?: string): Motivo | null {
  const escritos = palabrasDe(texto).filter((w) => w.length >= 3 && !VACIAS.has(w));
  if (!escritos.length) return null;
  let mejor: { m: Motivo; puntos: number } | null = null;
  for (const m of catalogo) {
    if (!m.activo || m.nuevo || m.id === excepto) continue;
    const vocab = [...palabrasDe(m.nombre), ...m.palabras.flatMap(palabrasDe)];
    const puntos = escritos.filter((e) => vocab.some((w) => empiezaParecido(w, e))).length;
    if (puntos > 0 && (!mejor || puntos > mejor.puntos || (puntos === mejor.puntos && m.usos > mejor.m.usos))) mejor = { m, puntos };
  }
  return mejor?.m ?? null;
}

/** Lo escrito es exactamente un motivo que ya existe (sin tildes ni mayúsculas). */
export function motivoIgual(catalogo: Motivo[], texto: string): Motivo | null {
  const t = palabrasDe(texto).join(" ");
  if (!t) return null;
  return catalogo.find((m) => m.activo && (palabrasDe(m.nombre).join(" ") === t || m.palabras.some((p) => palabrasDe(p).join(" ") === t))) ?? null;
}

/** Los más usados (últimos 90 días, luego de siempre), sin los ya elegidos. */
export function frecuentes(catalogo: Motivo[], elegidos: string[], maximo = 6): Motivo[] {
  return catalogo
    .filter((m) => m.activo && !elegidos.includes(m.id))
    .sort((a, b) => b.usos90 - a.usos90 || b.usos - a.usos || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, maximo);
}

// ─── Validaciones ────────────────────────────────────────────────────────────

export type Revision<T> = { ok: true; valor: T } | { ok: false; error: string };

export function revisarNombreMotivo(v: unknown): Revision<string> {
  const t = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  if (t.length < 3) return { ok: false, error: "Escribe el motivo (al menos 3 letras)." };
  if (t.length > 60) return { ok: false, error: "El motivo es muy largo (máximo 60 letras). Lo que dijo el cliente va aparte." };
  return { ok: true, valor: t.charAt(0).toUpperCase() + t.slice(1) };
}

/** Motivos de una orden: al menos uno, sin repetidos, que existan y estén activos. */
export function revisarMotivosDeOrden(v: unknown, catalogo: Motivo[]): Revision<string[]> {
  const lista = Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string"))] : [];
  if (!lista.length) return { ok: false, error: "Elige al menos un motivo de ingreso." };
  if (lista.length > 8) return { ok: false, error: "Máximo 8 motivos por orden." };
  const activos = new Map(catalogo.filter((m) => m.activo).map((m) => [m.id, m]));
  if (lista.some((id) => !activos.has(id))) return { ok: false, error: "Uno de los motivos ya no existe o fue desactivado. Vuelve a elegirlo." };
  return { ok: true, valor: lista };
}

/** Texto corto de los motivos (para «Ingresa Por» cuando el cliente no dijo nada, impresos y la IA). */
export function textoMotivos(nombres: string[]): string {
  return nombres.filter(Boolean).join(" · ");
}

/** «Lo que dijo el cliente» solo se muestra si agrega algo a los chips. */
export function dijoElCliente(ingresaPor: string, nombres: string[]): string {
  const t = ingresaPor.trim();
  if (!t || /^(\\?-|\.|no disponible)$/i.test(t)) return "";
  return plano(t) === plano(textoMotivos(nombres)) ? "" : t;
}

// ─── Catálogo: unir dos motivos ──────────────────────────────────────────────

/** Al unir «origen» en «destino»: las órdenes pasan al que queda y su nombre queda como palabra parecida. */
export function planUnir(origen: Motivo, destino: Motivo): Revision<{ palabras: string[] }> {
  if (origen.id === destino.id) return { ok: false, error: "Elige otro motivo para unir." };
  if (!destino.activo) return { ok: false, error: "No se puede unir con un motivo desactivado." };
  return { ok: true, valor: { palabras: agregarPalabra([...destino.palabras, ...origen.palabras], origen.nombre) } };
}

// ─── IA: ¿es lo mismo que uno que ya existe? ─────────────────────────────────

export function pedidoParecido(nuevo: string, catalogo: Motivo[]): string {
  const lista = catalogo
    .filter((m) => m.activo)
    .map((m) => `- id=${m.id} · ${m.nombre}${m.palabras.length ? ` (también: ${m.palabras.slice(0, 8).join(", ")})` : ""}`)
    .join("\n");
  return [
    `Un técnico de un taller de computadoras quiere crear el motivo de ingreso «${nuevo}».`,
    "Estos motivos ya existen:",
    lista,
    "",
    "¿Significa LO MISMO que uno de ellos (mismo problema o mismo servicio, aunque esté escrito distinto)?",
    "Responde SOLO un JSON así: {\"igual\": \"id del que significa lo mismo o null\", \"grupo\": \"Falla | Mantenimiento | Software | Otro servicio\"}.",
    "Si es más específico o distinto, igual = null.",
  ].join("\n");
}

export function leerParecido(json: Record<string, unknown> | null, catalogo: Motivo[]): { igual: Motivo | null; grupo: GrupoMotivo | null } {
  const id = typeof json?.igual === "string" ? json.igual : null;
  const igual = id ? catalogo.find((m) => m.id === id && m.activo) ?? null : null;
  return { igual, grupo: esGrupoMotivo(json?.grupo) ? json.grupo : null };
}
