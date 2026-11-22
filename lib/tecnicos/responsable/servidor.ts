import "server-only";

// Responsable de la orden (rediseño · decisión del dueño 22-nov): es quien la
// TOMA. Se llena con «Tomar orden», o solo: el primero que pasa un trabajo o
// la orden a "En proceso" queda como responsable si estaba vacío. Queda en la
// Actividad. Lo usan las alertas («Mías», resumen de cada técnico).

import { ids, porIds } from "@/lib/estado-cuenta/airtable";
import { AIRTABLE_TABLES, loadAirtableEnv } from "@/lib/tecnicos/config/airtable";
import { createHistorialEntrada } from "@/lib/tecnicos/airtable";

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
