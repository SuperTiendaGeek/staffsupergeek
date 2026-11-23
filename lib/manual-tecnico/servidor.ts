import "server-only";

// Manual técnico (punto 11B · 21-nov-2026) — servidor. La regla vive en
// ./reglas.ts; aquí solo se lee y se escribe la tabla «Manual Técnico» y se
// avisa a los administradores. Nada se borra: se archiva.

import { withLock } from "@/lib/concurrencia";
import { listarTodo, texto } from "@/lib/estado-cuenta/airtable";
import { airtableMutation, fetchRecordById, tableUrl, type AirtableRecord } from "@/lib/finanzas/airtable-client";
import { fetchOrden, firstString } from "@/lib/facturacion/gancho/airtableGancho";
import { agregarNotaInterna } from "@/lib/tecnicos/actividad/servidor";
import {
  CAMPOS_MANUAL, TABLA_MANUAL, accionesPermitidas, aplicarVoto, buscarCoincidencias, camposArchivar, camposCorreccion,
  camposNuevaNota, camposNuevaSolucion, camposVerificar, entradaDesdeRegistro, errorFicha, errorNota, textoNotaVoto,
  tituloEntrada, type Coincidencias, type EntradaManual, type FichaSolucion, type NotaManual,
} from "./reglas";

export class ErrorManual extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const CAMPOS_LECTURA = Object.values(CAMPOS_MANUAL);

export async function listarManual(): Promise<EntradaManual[]> {
  const registros = await listarTodo(TABLA_MANUAL, CAMPOS_LECTURA);
  return registros.map(entradaDesdeRegistro).sort((a, b) => (b.cod ?? 0) - (a.cod ?? 0));
}

export async function leerEntrada(id: string): Promise<EntradaManual> {
  const r = await fetchRecordById(TABLA_MANUAL, id);
  if (!r) throw new ErrorManual("No se encontró esa entrada del Manual técnico.", 404);
  return entradaDesdeRegistro(r);
}

async function escribir(id: string | null, fields: Record<string, unknown>): Promise<EntradaManual> {
  const url = id ? `${tableUrl(TABLA_MANUAL)}/${id}` : tableUrl(TABLA_MANUAL);
  const r = await airtableMutation<AirtableRecord>(url, {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify({ fields, typecast: true }),
  });
  return entradaDesdeRegistro(r);
}

export async function coincidenciasParaOrden(o: { equipo: string; sintoma: string }): Promise<Coincidencias> {
  try {
    return buscarCoincidencias(await listarManual(), o);
  } catch (e) {
    // Si el Manual no se puede leer, el técnico experto sigue con internet.
    console.error("[manual-tecnico] no se pudo leer la biblioteca", e);
    return { probadas: [], parecidas: [], relacionadas: [] };
  }
}

/** La solución ya guardada desde esta orden (una por orden). */
export async function solucionDeLaOrden(ordenCodigo: string): Promise<EntradaManual | null> {
  if (!/^[A-Z]{2}\d{3,}$/.test(ordenCodigo)) return null;
  const formula = `AND({${CAMPOS_MANUAL.ordenOrigen}}='${ordenCodigo}',{${CAMPOS_MANUAL.tipo}}='Solución')`;
  const r = await listarTodo(TABLA_MANUAL, CAMPOS_LECTURA, formula);
  return r.length ? entradaDesdeRegistro(r[0]) : null;
}

/** recordId de cada orden por su código (para los enlaces del Manual). */
export async function idsDeOrdenes(codigos: string[]): Promise<Record<string, string>> {
  const unicos = [...new Set(codigos.filter((c) => /^[A-Z]{2}\d{3,}$/.test(c)))];
  const out: Record<string, string> = {};
  for (let i = 0; i < unicos.length; i += 40) {
    const lote = unicos.slice(i, i + 40);
    const formula = lote.length === 1 ? `{ID}='${lote[0]}'` : `OR(${lote.map((c) => `{ID}='${c}'`).join(",")})`;
    for (const r of await listarTodo("Órdenes de Reparación", ["ID"], formula)) out[texto(r.fields["ID"])] = r.id;
  }
  return out;
}

async function codigoDeOrden(ordenId: string): Promise<string> {
  const orden = await fetchOrden(ordenId).catch(() => null);
  if (!orden) throw new ErrorManual("Orden no encontrada.", 404);
  return firstString(orden.fields["ID"], ordenId);
}

/** Avisa a cada administrador activo (mismo camino que «Garantía por confirmar»). */
async function avisarAdministradores(o: { titulo: string; mensaje: string; url: string; ordenId?: string | null }): Promise<void> {
  const [{ listPortalUsers }, { isAdministratorRole }, { crearNotificacion }] = await Promise.all([
    import("@/lib/airtable"), import("@/lib/apps"), import("@/lib/notificaciones/airtable"),
  ]);
  const admins = (await listPortalUsers()).filter((u) => u.activo && isAdministratorRole(u.rol));
  await Promise.allSettled(admins.map((u) => crearNotificacion({
    destinatarioId: u.id,
    tipo: "Reparación",
    titulo: o.titulo,
    mensaje: o.mensaje,
    prioridad: "Normal",
    urlAccion: o.url,
    entidadTipo: o.ordenId ? "Orden Reparación" : "Sistema",
    entidadId: o.ordenId ?? null,
  })));
}

// ─── Guardar ─────────────────────────────────────────────────────────────────

export async function guardarSolucionDeOrden(o: {
  ordenId: string;
  ficha: FichaSolucion;
  usuario: string;
  esAdmin: boolean;
}): Promise<{ entrada: EntradaManual; yaExistia: boolean }> {
  const error = errorFicha(o.ficha);
  if (error) throw new ErrorManual(error);
  return withLock(`manual:orden:${o.ordenId}`, async () => {
    const ordenCodigo = await codigoDeOrden(o.ordenId);
    const previa = await solucionDeLaOrden(ordenCodigo);
    if (previa) return { entrada: previa, yaExistia: true };
    const entrada = await escribir(null, camposNuevaSolucion(o.ficha, {
      ordenCodigo, usuario: o.usuario, esAdmin: o.esAdmin, ahora: new Date().toISOString(),
    }));
    if (!o.esAdmin) {
      await avisarAdministradores({
        titulo: `Solución por verificar · ${tituloEntrada(entrada)}`,
        mensaje: `${o.usuario || "Un técnico"} guardó en el Manual técnico (${ordenCodigo}): «${entrada.sintoma}»`
          + (entrada.causa ? ` → ${entrada.causa}` : "")
          + ". Verifícala en Técnicos → Manual técnico.",
        url: `/tecnicos/manual-tecnico?ver=${entrada.id}`,
        ordenId: o.ordenId,
      }).catch((e) => console.error("[manual-tecnico] aviso al administrador", e));
    }
    return { entrada, yaExistia: false };
  });
}

export async function crearNota(o: { nota: NotaManual; usuario: string; esAdmin: boolean }): Promise<EntradaManual> {
  const error = errorNota(o.nota);
  if (error) throw new ErrorManual(error);
  const entrada = await escribir(null, camposNuevaNota(o.nota, { usuario: o.usuario, esAdmin: o.esAdmin, ahora: new Date().toISOString() }));
  if (!o.esAdmin) {
    await avisarAdministradores({
      titulo: `${o.nota.tipo} por verificar · Manual técnico`,
      mensaje: `${o.usuario || "Un técnico"} agregó: «${tituloEntrada(entrada)}». Verifícala en Técnicos → Manual técnico.`,
      url: `/tecnicos/manual-tecnico?ver=${entrada.id}`,
    }).catch((e) => console.error("[manual-tecnico] aviso al administrador", e));
  }
  return entrada;
}

// ─── Reusar (un toque) ───────────────────────────────────────────────────────

export async function votarSolucion(o: {
  entradaId: string;
  ordenId: string;
  funciono: boolean;
  usuario: string;
}): Promise<{ entrada: EntradaManual; yaEstaba: boolean; anotado: boolean }> {
  const ordenCodigo = await codigoDeOrden(o.ordenId);
  const { entrada, resultado } = await withLock(`manual:${o.entradaId}`, async () => {
    const actual = await leerEntrada(o.entradaId);
    if (actual.tipo !== "Solución") throw new ErrorManual("Solo las soluciones se marcan como funcionó o no.");
    const resultado = aplicarVoto(actual, { ordenCodigo, funciono: o.funciono, usuario: o.usuario, ahora: new Date().toISOString() });
    const entrada = resultado.yaEstaba ? actual : await escribir(actual.id, resultado.campos);
    return { entrada, resultado };
  });
  if (resultado.yaEstaba) return { entrada, yaEstaba: true, anotado: false };

  // «Anotado en la orden y en la solución» (lienzo, tablero 8). Rediseño R3:
  // en la Actividad de la orden, como nota interna (ya no en «Nota interna»).
  const anotado = await agregarNotaInterna(o.ordenId, textoNotaVoto(entrada, o.funciono), { nombre: o.usuario || null, email: null, id: null })
    .then(() => true)
    .catch((e) => { console.error("[manual-tecnico] actividad", e); return false; });
  if (resultado.pasaARevisar) {
    await avisarAdministradores({
      titulo: `Solución para revisar · ${tituloEntrada(entrada)}`,
      mensaje: `${o.usuario || "Un técnico"} marcó que ${entrada.codigo} no funcionó en ${ordenCodigo}. Corrígela o archívala en Técnicos → Manual técnico.`,
      url: `/tecnicos/manual-tecnico?ver=${entrada.id}`,
      ordenId: o.ordenId,
    }).catch((e) => console.error("[manual-tecnico] aviso al administrador", e));
  }
  return { entrada, yaEstaba: false, anotado };
}

// ─── Lo que hace el administrador ────────────────────────────────────────────

export async function accionDeAdministrador(o: {
  entradaId: string;
  accion: "verificar" | "corregir" | "archivar";
  cambios?: Record<string, unknown>;
  usuario: string;
  esAdmin: boolean;
}): Promise<EntradaManual> {
  return withLock(`manual:${o.entradaId}`, async () => {
    const actual = await leerEntrada(o.entradaId);
    if (!accionesPermitidas(o.esAdmin, actual).includes(o.accion)) {
      throw new ErrorManual(o.esAdmin ? "Esa acción no aplica a esta entrada." : "Solo un administrador puede hacer esto.", o.esAdmin ? 409 : 403);
    }
    if (o.accion === "verificar") return escribir(actual.id, camposVerificar({ usuario: o.usuario, ahora: new Date().toISOString() }));
    if (o.accion === "archivar") return escribir(actual.id, camposArchivar());
    const campos = camposCorreccion(actual, o.cambios ?? {});
    if (actual.tipo === "Solución") {
      const error = errorFicha({
        marca: String(campos[CAMPOS_MANUAL.marca] ?? ""), modelo: String(campos[CAMPOS_MANUAL.modelo] ?? ""),
        sistema: "", sintoma: String(campos[CAMPOS_MANUAL.sintoma] ?? ""), causa: String(campos[CAMPOS_MANUAL.causa] ?? ""),
        solucion: String(campos[CAMPOS_MANUAL.solucion] ?? "").split("\n").filter(Boolean), noFunciono: "",
      });
      if (error) throw new ErrorManual(error);
    } else if (!String(campos[CAMPOS_MANUAL.notas] ?? "").trim()) {
      throw new ErrorManual("Escribe la nota.");
    }
    return escribir(actual.id, campos);
  });
}
