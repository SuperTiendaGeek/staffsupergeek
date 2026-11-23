import "server-only";

// Motivos de ingreso — lado servidor (rediseño R7). Reglas en ./reglas.ts.
// Tabla «Motivos de ingreso» (creada el 22-nov con permiso del dueño) y el
// enlace «Motivos» de cada orden. Nunca se borra un motivo: se une a otro o
// se desactiva (solo administrador).

import { ids, listarTodo, porIds, texto } from "@/lib/estado-cuenta/airtable";
import { airtableMutation, tableUrl } from "@/lib/finanzas/airtable-client";
import { AIRTABLE_TABLES } from "@/lib/tecnicos/config/airtable";
import { createHistorialEntrada } from "@/lib/tecnicos/airtable";
import { withLock } from "@/lib/concurrencia";
import { iaDisponible, llamarClaude } from "@/lib/ia/claude";
import { extraerJson } from "@/lib/ia/respuesta";
import {
  agregarPalabra, esGrupoMotivo, masParecido, leerParecido, listaPalabras, motivoIgual, pedidoParecido, planUnir,
  revisarMotivosDeOrden, revisarNombreMotivo, textoMotivos,
  type GrupoMotivo, type Motivo, type MotivoCorto,
} from "./reglas";

export const TABLA_MOTIVOS = "Motivos de ingreso";
export const M = {
  nombre: "Motivo", grupo: "Grupo", palabras: "Palabras parecidas", activo: "Activo", nuevo: "Nuevo",
  creadoPor: "Creado por", unidoEn: "Unido en", ordenes: "Órdenes",
} as const;
export const CAMPO_MOTIVOS_ORDEN = "Motivos";

export class ErrorMotivo extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

type Usuario = { nombre: string | null; email: string | null; id: string | null };

// ─── Lectura (con una memoria corta: el registro de órdenes la pide seguido) ──

let memoria: { en: number; catalogo: Motivo[] } | null = null;
const VIGENCIA_MS = 60_000;
export function olvidarCatalogo() { memoria = null; }

function aMotivo(r: { id: string; fields: Record<string, unknown> }, usos90: Map<string, number>): Motivo {
  const f = r.fields;
  const grupo = texto(f[M.grupo]);
  return {
    id: r.id,
    nombre: texto(f[M.nombre]),
    grupo: esGrupoMotivo(grupo) ? grupo : null,
    palabras: listaPalabras(texto(f[M.palabras])),
    activo: f[M.activo] === true,
    nuevo: f[M.nuevo] === true,
    usos: ids(f[M.ordenes]).length,
    usos90: usos90.get(r.id) ?? 0,
    unidoEn: ids(f[M.unidoEn])[0] ?? null,
  };
}

export async function leerCatalogo(): Promise<Motivo[]> {
  if (memoria && Date.now() - memoria.en < VIGENCIA_MS) return memoria.catalogo;
  const [filas, recientes] = await Promise.all([
    listarTodo(TABLA_MOTIVOS, [M.nombre, M.grupo, M.palabras, M.activo, M.nuevo, M.unidoEn, M.ordenes]),
    listarTodo(AIRTABLE_TABLES.ordenes, [CAMPO_MOTIVOS_ORDEN], `AND({${CAMPO_MOTIVOS_ORDEN}} != '', IS_AFTER({Fecha de Ingreso}, DATEADD(TODAY(), -90, 'days')))`),
  ]);
  const usos90 = new Map<string, number>();
  for (const o of recientes) for (const id of ids(o.fields[CAMPO_MOTIVOS_ORDEN])) usos90.set(id, (usos90.get(id) ?? 0) + 1);
  const catalogo = filas.map((r) => aMotivo(r, usos90)).filter((m) => m.nombre);
  memoria = { en: Date.now(), catalogo };
  return catalogo;
}

/**
 * El catálogo con estos motivos adentro. La memoria es por servidor: un motivo
 * recién creado en otro puede no estar todavía → se vuelve a leer una vez.
 */
async function catalogoCon(lista: unknown): Promise<Motivo[]> {
  const buscados = Array.isArray(lista) ? lista.filter((x): x is string => typeof x === "string") : [];
  const catalogo = await leerCatalogo();
  if (buscados.every((id) => catalogo.some((m) => m.id === id))) return catalogo;
  olvidarCatalogo();
  return leerCatalogo();
}

async function patchMotivo(id: string, fields: Record<string, unknown>) {
  await airtableMutation(`${tableUrl(TABLA_MOTIVOS)}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ fields, typecast: true }) });
  olvidarCatalogo();
}

// ─── Crear desde el registro (con la revisión «¿Es lo mismo que…?») ─────────

export type ResultadoCrear =
  | { tipo: "existente"; motivo: Motivo }
  | { tipo: "parecido"; motivo: Motivo; grupo: GrupoMotivo | null }
  | { tipo: "creado"; motivo: Motivo };

async function preguntarIA(nombre: string, catalogo: Motivo[]): Promise<{ igual: Motivo | null; grupo: GrupoMotivo | null } | null> {
  if (!iaDisponible()) return null;
  try {
    const r = await llamarClaude({
      sistema: "Ordenas los motivos de ingreso de un taller de computadoras en Ecuador. Respondes solo JSON.",
      mensajes: [{ role: "user", content: pedidoParecido(nombre, catalogo) }],
      maxTokens: 120,
      esfuerzo: "low",
      tiempoMs: 12_000,
      uso: "motivo-parecido",
    });
    return leerParecido(extraerJson(r.texto), catalogo);
  } catch (e) {
    console.error("[motivos] revisión con IA", e);
    return null;
  }
}

export async function crearMotivo(o: { nombre: unknown; forzar?: boolean; grupo?: unknown; usuario: Usuario }): Promise<ResultadoCrear> {
  const r = revisarNombreMotivo(o.nombre);
  if (!r.ok) throw new ErrorMotivo(r.error);
  const catalogo = await leerCatalogo();
  const igual = motivoIgual(catalogo, r.valor);
  if (igual) return { tipo: "existente", motivo: igual };

  let grupo: GrupoMotivo | null = esGrupoMotivo(o.grupo) ? o.grupo : null;
  if (!o.forzar) {
    const ia = await preguntarIA(r.valor, catalogo);
    // Sin IA: se propone el que comparte más palabras con sentido.
    const parecido = ia ? ia.igual : masParecido(catalogo, r.valor);
    grupo = ia?.grupo ?? grupo;
    if (parecido) return { tipo: "parecido", motivo: parecido, grupo };
  }

  const creado = await airtableMutation<{ records?: Array<{ id: string; fields: Record<string, unknown> }> }>(tableUrl(TABLA_MOTIVOS), {
    method: "POST",
    body: JSON.stringify({
      records: [{ fields: {
        [M.nombre]: r.valor, [M.activo]: true, [M.nuevo]: true,
        [M.creadoPor]: o.usuario.nombre || o.usuario.email || "",
        ...(grupo ? { [M.grupo]: grupo } : {}),
      } }],
      typecast: true,
    }),
  });
  const fila = creado.records?.[0];
  if (!fila) throw new Error("Airtable no devolvió el motivo creado.");
  olvidarCatalogo();
  return { tipo: "creado", motivo: aMotivo(fila, new Map()) };
}

/** «Usar «No enciende»»: lo que se escribió queda como palabra parecida de ese motivo. */
export async function agregarPalabraParecida(id: string, palabra: unknown): Promise<void> {
  const t = typeof palabra === "string" ? palabra.trim() : "";
  if (t.length < 3 || t.length > 60) return;
  const m = (await catalogoCon([id])).find((x) => x.id === id);
  if (!m) throw new ErrorMotivo("Motivo no encontrado.", 404);
  const lista = agregarPalabra(m.palabras, t);
  if (lista.length !== m.palabras.length) await patchMotivo(id, { [M.palabras]: lista.join("\n") });
}

// ─── Catálogo (solo administrador) ───────────────────────────────────────────

export async function actualizarMotivo(id: string, cambios: Record<string, unknown>): Promise<Motivo> {
  const catalogo = await catalogoCon([id]);
  const m = catalogo.find((x) => x.id === id);
  if (!m) throw new ErrorMotivo("Motivo no encontrado.", 404);
  const fields: Record<string, unknown> = {};
  if ("nombre" in cambios) {
    const r = revisarNombreMotivo(cambios.nombre);
    if (!r.ok) throw new ErrorMotivo(r.error);
    const otro = motivoIgual(catalogo.filter((x) => x.id !== id), r.valor);
    if (otro) throw new ErrorMotivo(`Ya existe «${otro.nombre}». Usa «Unir» si son lo mismo.`);
    fields[M.nombre] = r.valor;
  }
  if ("grupo" in cambios) {
    if (!esGrupoMotivo(cambios.grupo)) throw new ErrorMotivo("Elige un grupo.");
    fields[M.grupo] = cambios.grupo;
  }
  if ("palabras" in cambios) fields[M.palabras] = listaPalabras(typeof cambios.palabras === "string" ? cambios.palabras : "").join("\n");
  if ("activo" in cambios) fields[M.activo] = cambios.activo === true;
  if ("nuevo" in cambios) fields[M.nuevo] = cambios.nuevo === true;
  if (!Object.keys(fields).length) return m;
  await patchMotivo(id, fields);
  return (await leerCatalogo()).find((x) => x.id === id) ?? m;
}

/** Une «origen» en «destino»: sus órdenes pasan al que queda; el origen queda desactivado y «Unido en». */
export async function unirMotivos(origenId: string, destinoId: unknown): Promise<{ ordenesMovidas: number }> {
  return withLock("motivos-unir", async () => {
    const catalogo = await catalogoCon([origenId, destinoId]);
    const origen = catalogo.find((x) => x.id === origenId);
    const destino = catalogo.find((x) => x.id === destinoId);
    if (!origen || !destino) throw new ErrorMotivo("Motivo no encontrado.", 404);
    const plan = planUnir(origen, destino);
    if (!plan.ok) throw new ErrorMotivo(plan.error);

    const fila = (await porIds(TABLA_MOTIVOS, [origen.id], [M.ordenes])).get(origen.id);
    const ordenes = fila ? ids(fila.fields[M.ordenes]) : [];
    const actuales = await porIds(AIRTABLE_TABLES.ordenes, ordenes, [CAMPO_MOTIVOS_ORDEN]);
    const cambios = ordenes.map((oid) => {
      const lista = ids(actuales.get(oid)?.fields[CAMPO_MOTIVOS_ORDEN]).map((x) => (x === origen.id ? destino.id : x));
      return { id: oid, fields: { [CAMPO_MOTIVOS_ORDEN]: [...new Set(lista)] } };
    });
    for (let i = 0; i < cambios.length; i += 10) {
      await airtableMutation(tableUrl(AIRTABLE_TABLES.ordenes), { method: "PATCH", body: JSON.stringify({ records: cambios.slice(i, i + 10) }) });
    }
    await patchMotivo(destino.id, { [M.palabras]: plan.valor.palabras.join("\n") });
    await patchMotivo(origen.id, { [M.activo]: false, [M.nuevo]: false, [M.unidoEn]: [destino.id] });
    return { ordenesMovidas: cambios.length };
  });
}

// ─── Motivos de una orden ────────────────────────────────────────────────────

export async function motivosDeOrden(ordenId: string): Promise<{ motivos: MotivoCorto[]; ingresaPor: string }> {
  const o = (await porIds(AIRTABLE_TABLES.ordenes, [ordenId], [CAMPO_MOTIVOS_ORDEN, "Ingresa Por"])).get(ordenId);
  if (!o) throw new ErrorMotivo("Orden no encontrada.", 404);
  const lista = ids(o.fields[CAMPO_MOTIVOS_ORDEN]);
  const catalogo = await catalogoCon(lista);
  const motivos = lista
    .map((id) => catalogo.find((m) => m.id === id))
    .filter((m): m is Motivo => !!m)
    .map((m) => ({ id: m.id, nombre: m.nombre, grupo: m.grupo }));
  return { motivos, ingresaPor: texto(o.fields["Ingresa Por"]) };
}

/** Campos de la orden nueva (o del regreso) a partir de los chips y lo que dijo el cliente. */
export async function camposDeMotivos(motivoIds: unknown, clienteDice: string): Promise<{ fields: Record<string, unknown>; nombres: string[] }> {
  const catalogo = await catalogoCon(motivoIds);
  const r = revisarMotivosDeOrden(motivoIds, catalogo);
  if (!r.ok) throw new ErrorMotivo(r.error);
  const nombres = r.valor.map((id) => catalogo.find((m) => m.id === id)?.nombre ?? "");
  return {
    fields: { [CAMPO_MOTIVOS_ORDEN]: r.valor, "Ingresa Por": clienteDice.trim() || textoMotivos(nombres) },
    nombres,
  };
}

export async function guardarMotivosDeOrden(o: { ordenId: string; motivoIds: unknown; clienteDice?: unknown; usuario: Usuario }): Promise<{ motivos: MotivoCorto[]; ingresaPor: string }> {
  const antes = await motivosDeOrden(o.ordenId);
  const dice = typeof o.clienteDice === "string" ? o.clienteDice.trim().slice(0, 500) : null;
  const { fields, nombres } = await camposDeMotivos(o.motivoIds, dice ?? "");
  // Si no se tocó «Lo que dijo el cliente», se respeta el que había.
  if (dice === null) delete fields["Ingresa Por"];
  await airtableMutation(`${tableUrl(AIRTABLE_TABLES.ordenes)}/${encodeURIComponent(o.ordenId)}`, {
    method: "PATCH", body: JSON.stringify({ fields }),
  });
  olvidarCatalogo();
  const antesTexto = textoMotivos(antes.motivos.map((m) => m.nombre));
  const ahoraTexto = textoMotivos(nombres);
  if (antesTexto !== ahoraTexto) {
    await createHistorialEntrada({
      ordenRecordId: o.ordenId,
      avanceTexto: `Motivo de ingreso: ${ahoraTexto}${antesTexto ? ` (antes: ${antesTexto})` : ""}`,
      tipoActividad: "Sistema",
      visibilidad: "Interna",
      creadoPorNombre: o.usuario.nombre,
      creadoPorEmail: o.usuario.email,
      creadoPorUsuarioId: o.usuario.id,
    });
  }
  return motivosDeOrden(o.ordenId);
}
