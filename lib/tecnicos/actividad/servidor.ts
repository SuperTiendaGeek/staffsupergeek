import "server-only";

// Actividad de la orden — lado servidor (rediseño R3). Junta en una sola lista
// el historial (notas, estados, trabajos, regresos…), los pagos de la cuenta
// y las respuestas del cliente en su enlace. Las reglas están en ./reglas.ts.

import { getCuentaUnificada } from "@/lib/cuenta-unificada";
import { ids, porIds, texto } from "@/lib/estado-cuenta/airtable";
import { AIRTABLE_TABLES, loadAirtableEnv } from "@/lib/tecnicos/config/airtable";
import { createHistorialEntrada } from "@/lib/tecnicos/airtable";
import { leerRespuestasOrden } from "@/lib/tecnicos/presupuesto/airtable";
import { deHistorial, dePago, deRespuesta, novedadesParaCliente, ordenar, revisarNota, type EntradaActividad } from "./reglas";

export class ErrorActividad extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const CAMPOS_ORDEN = ["Historial de Estados", "Estado Actual", "Telefono", "ClienteTXT"];
const CAMPOS_HISTORIAL = ["Estado Nuevo", "Fecha", "Creado por Nombre", "Técnico", "Visibilidad", "Tipo de actividad", "Estado Generado IA"];

const primero = (v: unknown): string => (Array.isArray(v) ? texto(v[0]) : texto(v));

export async function leerActividad(ordenId: string): Promise<{
  entradas: EntradaActividad[];
  estado: string;
  telefono: string;
  cliente: string;
}> {
  const orden = (await porIds(AIRTABLE_TABLES.ordenes, [ordenId], CAMPOS_ORDEN)).get(ordenId);
  if (!orden) throw new ErrorActividad("Orden no encontrada.", 404);
  const f = orden.fields;

  const [historial, cuenta, respuestas] = await Promise.all([
    porIds(AIRTABLE_TABLES.historial, ids(f["Historial de Estados"]), CAMPOS_HISTORIAL),
    getCuentaUnificada({ ordenId }).catch((e) => { console.error("[actividad] pagos", e); return null; }),
    leerRespuestasOrden(ordenId).catch((e) => { console.error("[actividad] respuestas", e); return []; }),
  ]);

  const entradas: EntradaActividad[] = [
    ...[...historial.values()].map((r) => deHistorial({
      id: r.id,
      texto: texto(r.fields["Estado Nuevo"]),
      fecha: texto(r.fields["Fecha"]) || r.createdTime || "",
      autor: texto(r.fields["Creado por Nombre"]) || texto(r.fields["Técnico"]),
      tipo: r.fields["Tipo de actividad"],
      visibilidad: r.fields["Visibilidad"],
      mensajeIA: texto(r.fields["Estado Generado IA"]),
    })),
    ...(cuenta?.abonos ?? []).map((a) => dePago(a)),
    ...respuestas.map((r) => deRespuesta(r)),
  ];

  return {
    entradas: ordenar(entradas),
    estado: texto(f["Estado Actual"]),
    telefono: primero(f["Telefono"]),
    cliente: primero(f["ClienteTXT"]),
  };
}

/** «Novedades» del enlace del cliente: solo lo que el personal escribió para él. */
export async function novedadesDeLaOrden(ordenId: string): Promise<Array<{ fecha: string; texto: string }>> {
  const orden = (await porIds(AIRTABLE_TABLES.ordenes, [ordenId], ["Historial de Estados"])).get(ordenId);
  if (!orden) return [];
  const historial = await porIds(AIRTABLE_TABLES.historial, ids(orden.fields["Historial de Estados"]), ["Estado Nuevo", "Fecha", "Visibilidad", "Tipo de actividad"]);
  return novedadesParaCliente([...historial.values()].map((r) => deHistorial({
    id: r.id, texto: texto(r.fields["Estado Nuevo"]), fecha: texto(r.fields["Fecha"]) || r.createdTime || "", autor: "",
    tipo: r.fields["Tipo de actividad"], visibilidad: r.fields["Visibilidad"],
  })));
}

async function marcarClienteAvisado(ordenId: string): Promise<void> {
  const { token, baseId } = loadAirtableEnv();
  const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(AIRTABLE_TABLES.ordenes)}/${encodeURIComponent(ordenId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { "Cliente avisado": new Date().toISOString() } }),
  });
  if (!res.ok) throw new Error(`Airtable cliente avisado: HTTP ${res.status}`);
}

/**
 * Nota de una persona: «Interna» o «Al cliente». Si además se envió por
 * WhatsApp es un «Aviso al cliente»; con la orden ya Completada, queda
 * marcado que el cliente fue avisado (lo usan las alertas).
 */
export async function guardarNota(o: {
  ordenId: string;
  texto: unknown;
  visibilidad: unknown;
  enviado: boolean;
  usuario: { nombre: string | null; email: string | null; id: string | null };
}): Promise<EntradaActividad> {
  const r = revisarNota({ texto: o.texto, visibilidad: o.visibilidad });
  if (!r.ok) throw new ErrorActividad(r.error);
  const enviado = o.enviado && r.visibilidad === "Al cliente";
  const tipo = enviado ? "Aviso al cliente" : "Nota";
  const h = await createHistorialEntrada({
    ordenRecordId: o.ordenId,
    avanceTexto: r.texto,
    tipoActividad: tipo,
    visibilidad: r.visibilidad,
    creadoPorNombre: o.usuario.nombre,
    creadoPorEmail: o.usuario.email,
    creadoPorUsuarioId: o.usuario.id,
  });
  if (enviado) {
    const orden = (await porIds(AIRTABLE_TABLES.ordenes, [o.ordenId], ["Estado Actual"]).catch(() => new Map())).get(o.ordenId);
    if (orden && texto(orden.fields["Estado Actual"]) === "Completado") {
      await marcarClienteAvisado(o.ordenId).catch((e) => console.error("[actividad] cliente avisado", e));
    }
  }
  return {
    id: h.id, origen: "historial", tipo, visibilidad: r.visibilidad, fecha: h.fecha || new Date().toISOString(),
    texto: r.texto, autor: o.usuario.nombre || o.usuario.email || "",
  };
}

/** Lo que antes iba a la «nota interna» (técnico experto, votos del manual) ahora es una nota interna en la Actividad. */
export async function agregarNotaInterna(ordenId: string, textoNuevo: string, usuario: { nombre: string | null; email: string | null; id: string | null }): Promise<void> {
  await guardarNota({ ordenId, texto: textoNuevo, visibilidad: "Interna", enviado: false, usuario });
}
