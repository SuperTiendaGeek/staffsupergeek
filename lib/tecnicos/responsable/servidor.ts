import "server-only";

// Responsable de la orden (rediseño · decisión del dueño 22-nov): es quien la
// TOMA. Se llena con «Tomar orden», o solo: el primero que pasa un trabajo o
// la orden a "En proceso" queda como responsable si estaba vacío. Queda en la
// Actividad. Lo usan las alertas («Mías», resumen de cada técnico).

import { ids, porIds } from "@/lib/estado-cuenta/airtable";
import { AIRTABLE_TABLES, loadAirtableEnv } from "@/lib/tecnicos/config/airtable";
import { createHistorialEntrada } from "@/lib/tecnicos/airtable";
import { listPortalUsers } from "@/lib/airtable";
import { opcionesResponsable, revisarAsignacion, textoAsignacion, type OpcionResponsable } from "./reglas";

export const CAMPO_RESPONSABLE = "Responsable";

type Usuario = { id: string | null; nombre: string | null; email: string | null };

async function escribirResponsable(ordenId: string, usuarioId: string | null): Promise<void> {
  const { token, baseId } = loadAirtableEnv();
  const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(AIRTABLE_TABLES.ordenes)}/${encodeURIComponent(ordenId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { [CAMPO_RESPONSABLE]: usuarioId ? [usuarioId] : [] } }),
  });
  if (!res.ok) throw new Error(`Airtable responsable ${ordenId}: HTTP ${res.status} ${await res.text()}`);
}

export async function responsableDe(ordenId: string): Promise<string | null> {
  const r = (await porIds(AIRTABLE_TABLES.ordenes, [ordenId], [CAMPO_RESPONSABLE])).get(ordenId);
  return r ? ids(r.fields[CAMPO_RESPONSABLE])[0] ?? null : null;
}

/** Si la orden no tiene responsable, queda quien está trabajando. Nunca frena. */
export async function tomarSiNoTieneResponsable(ordenId: string, usuario: Usuario): Promise<boolean> {
  if (!usuario.id) return false;
  try {
    if (await responsableDe(ordenId)) return false;
    await escribirResponsable(ordenId, usuario.id);
    await createHistorialEntrada({
      ordenRecordId: ordenId,
      avanceTexto: `${usuario.nombre || usuario.email || "Alguien"} toma la orden`,
      tipoActividad: "Responsable",
      visibilidad: "Interna",
      creadoPorNombre: usuario.nombre,
      creadoPorEmail: usuario.email,
      creadoPorUsuarioId: usuario.id,
    });
    return true;
  } catch (e) {
    console.error("[responsable] tomar", e);
    return false;
  }
}

// ─── Selector de la cabecera (rediseño R1) ──────────────────────────────────

export class ErrorResponsable extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

async function opciones(): Promise<OpcionResponsable[]> {
  return opcionesResponsable(await listPortalUsers());
}

export async function leerResponsable(ordenId: string): Promise<{ actual: OpcionResponsable | null; opciones: OpcionResponsable[] }> {
  const [id, lista] = await Promise.all([responsableDe(ordenId), opciones()]);
  const actual = id ? lista.find((o) => o.id === id) ?? { id, nombre: "Usuario inactivo", iniciales: "?" } : null;
  return { actual, opciones: lista };
}

/** Tomar la orden, pasarla a otra persona o dejarla sin responsable. */
export async function asignarResponsable(o: { ordenId: string; body: unknown; usuario: Usuario }): Promise<{ actual: OpcionResponsable | null }> {
  const lista = await opciones();
  const r = revisarAsignacion(o.body, lista);
  if (!r.ok) throw new ErrorResponsable(r.error);
  const antes = await responsableDe(o.ordenId);
  const nuevo = r.usuarioId ? lista.find((x) => x.id === r.usuarioId) ?? null : null;
  if (antes === r.usuarioId) return { actual: nuevo };
  await escribirResponsable(o.ordenId, r.usuarioId);
  const quien = { id: o.usuario.id, nombre: o.usuario.nombre || o.usuario.email || "Alguien" };
  await createHistorialEntrada({
    ordenRecordId: o.ordenId,
    avanceTexto: textoAsignacion(quien, nuevo),
    tipoActividad: "Responsable",
    visibilidad: "Interna",
    creadoPorNombre: o.usuario.nombre,
    creadoPorEmail: o.usuario.email,
    creadoPorUsuarioId: o.usuario.id,
  });
  return { actual: nuevo };
}
