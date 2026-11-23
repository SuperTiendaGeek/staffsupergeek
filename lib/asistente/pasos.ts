// «Sugerir pasos» del técnico experto (rediseño R7, tablero 9 aprobado el
// 22-nov) — la parte PURA.
//
// Con los motivos de ingreso (chips) y el modelo, la IA busca en sitios de
// confianza (iFixit y fabricantes) y arma una guía corta: pasos clave,
// un cuidado, tiempo estimado y qué repuestos o insumos suelen hacer falta.
// Reglas:
//   - Las GUÍAS son solo las páginas que la IA de verdad consultó y citó
//     (nunca enlaces que escribió de memoria).
//   - Los REPUESTOS los busca el servidor en el inventario (SKU real); la IA
//     solo da los nombres para buscar.
//   - Se pide con un botón: no se gasta IA cada vez que se abre el panel.

import { DOMINIOS_TECNICO, dominioDe, listaDe, textoDe, type FuenteWeb } from "@/lib/ia/respuesta";
import { textoTecnico, type DatosTecnicoIA } from "./contexto";
import { palabrasDe } from "@/lib/tecnicos/motivos/reglas";

export type Guia = { url: string; titulo: string; dominio: string };
export type RepuestoInventario = { sku: string; nombre: string; unidades: number; precio: number | null };

export type PasosIA = {
  titulo: string;
  pasos: string[];
  cuidado: string | null;
  tiempo: string;
  /** Nombres cortos para buscar en el inventario (no se muestran tal cual). */
  buscar: string[];
};

export type RespuestaPasos = Omit<PasosIA, "buscar"> & {
  motivos: string[];
  guias: Guia[];
  repuestos: RepuestoInventario[];
  hora: string;
};

const SISTEMA_PASOS = [
  "Eres un técnico experto en reparación de laptops, PCs, impresoras y celulares que acompaña al técnico de SUPER GEEK (Otavalo, Ecuador).",
  "Arma una guía corta y práctica para el trabajo que pide la orden, para ESTE modelo.",
  "Busca en la web la guía de desarme o el manual de servicio del modelo (iFixit y los sitios del fabricante) y úsala; si no hay del modelo exacto, usa la del más cercano y dilo en el título.",
  "Si te paso «Probado en SUPER GEEK» y encaja, tenlo en cuenta en los pasos.",
  "No inventes números de parte ni precios. Habla de tú, en español de Ecuador, directo.",
].join(" ");

const FORMATO_PASOS = [
  "Responde SOLO con un objeto JSON, sin texto alrededor:",
  '{"titulo": "el trabajo en pocas palabras (ej.: Cambio de palmrest · HP 14-dq)",',
  ' "pasos": ["paso clave 1", "paso 2"],',
  ' "cuidado": "el cuidado más importante (batería, flex, tornillos, datos del cliente) o null",',
  ' "tiempo": "tiempo estimado de mano de obra, ej.: 1 h 30 min",',
  ' "buscar": ["pasta térmica", "batería HP 14-dq"]}',
  "Máximo 7 pasos, cada uno de una línea. «buscar»: hasta 3 repuestos o insumos que suelen hacer falta, con nombres cortos para buscarlos en el inventario (vacío si no aplica).",
].join("\n");

export function pedidoPasos(d: DatosTecnicoIA, motivos: string[]): { sistema: string; mensaje: string; maxTokens: number } {
  return {
    sistema: SISTEMA_PASOS,
    maxTokens: 1500,
    mensaje: [
      textoTecnico(d),
      "",
      `MOTIVOS DE INGRESO (chips): ${motivos.length ? motivos.join(" · ") : "sin chips; usa el motivo de ingreso de arriba"}`,
      "",
      FORMATO_PASOS,
    ].join("\n"),
  };
}

export function normalizarPasos(json: Record<string, unknown> | null): PasosIA {
  const cuidado = textoDe(json?.cuidado, 400);
  return {
    titulo: textoDe(json?.titulo, 120),
    pasos: listaDe(json?.pasos, 7),
    cuidado: cuidado && !/^null$/i.test(cuidado) ? cuidado : null,
    tiempo: textoDe(json?.tiempo, 40),
    buscar: listaDe(json?.buscar, 3).map((b) => b.slice(0, 60)),
  };
}

/** Guías = páginas citadas de verdad, solo de los sitios de confianza; iFixit primero. */
export function guiasDeFuentes(fuentes: readonly FuenteWeb[], maximo = 3): Guia[] {
  const vistas = new Set<string>();
  const guias: Guia[] = [];
  for (const f of fuentes) {
    const dominio = dominioDe(f.url);
    const confiable = DOMINIOS_TECNICO.some((d) => dominio === d || dominio.endsWith(`.${d}`));
    if (!confiable || vistas.has(f.url)) continue;
    vistas.add(f.url);
    guias.push({ url: f.url, titulo: f.titulo || dominio, dominio });
  }
  return guias
    .sort((a, b) => Number(b.dominio.includes("ifixit")) - Number(a.dominio.includes("ifixit")))
    .slice(0, maximo);
}

/**
 * Cómo buscar un repuesto en el inventario: Airtable busca la palabra más
 * larga y aquí se exige que el nombre tenga TODAS las palabras (sin tildes),
 * para no ofrecer la batería de otro modelo.
 */
export function busquedaInventario(termino: string): { palabra: string; todas: string[] } | null {
  const todas = palabrasDe(termino).filter((w) => w.length >= 2);
  // Airtable no ignora tildes: se busca el trozo más largo SIN tildes
  // («batería» → «bater», «pasta térmica» → «pasta») y aquí se filtra sin tildes.
  const trozos = termino.toLowerCase().split(/[^a-z0-9áéíóúüñ]+/).map((w) => w.split(/[áéíóúüñ]/)[0]).filter((w) => w.length >= 3);
  if (!todas.length || !trozos.length) return null;
  const palabra = [...trozos].sort((a, b) => b.length - a.length)[0];
  return { palabra, todas };
}

export function nombreCoincide(nombre: string, todas: string[]): boolean {
  const del = palabrasDe(nombre);
  return todas.every((t) => del.some((w) => w.startsWith(t)));
}

/** Unidades del inventario agrupadas por SKU (cada lote viene como una fila). */
export function agruparInventario(items: Array<{ sku: string; nombre: string; precioVentaFinal: number | null }>, maximo = 4): RepuestoInventario[] {
  const porSku = new Map<string, RepuestoInventario>();
  for (const it of items) {
    if (!it.sku) continue;
    const r = porSku.get(it.sku);
    if (r) r.unidades += 1;
    else porSku.set(it.sku, { sku: it.sku, nombre: it.nombre, unidades: 1, precio: it.precioVentaFinal });
  }
  return [...porSku.values()].slice(0, maximo);
}

/** Texto para «Guardar como nota interna» (va a la Actividad). */
export function textoPlanoPasos(r: Pick<RespuestaPasos, "titulo" | "pasos" | "cuidado" | "tiempo" | "guias" | "repuestos">): string {
  return [
    r.titulo ? `Pasos sugeridos · ${r.titulo}` : "Pasos sugeridos",
    r.pasos.map((p, i) => `${i + 1}. ${p}`).join("\n"),
    r.cuidado ? `Cuidado: ${r.cuidado}` : "",
    r.tiempo ? `Tiempo estimado: ${r.tiempo}` : "",
    r.repuestos.length ? `En inventario: ${r.repuestos.map((x) => `${x.nombre} (${x.sku})`).join(", ")}` : "",
    r.guias.length ? `Guías: ${r.guias.map((g) => g.url).join(" · ")}` : "",
  ].filter(Boolean).join("\n");
}
