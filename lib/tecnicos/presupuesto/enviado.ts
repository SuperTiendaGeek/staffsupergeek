import "server-only";

// «Presupuesto enviado» (rediseño R1): se marca cuando alguien copia el enlace
// del presupuesto o lo abre en WhatsApp. Lo usan las etapas de la orden
// («Enviar» → «Esperar la respuesta del cliente») y, después, las alertas.
// Una constancia en la Actividad como mucho cada hora (copiar dos veces no
// llena la línea de tiempo).

import { porIds, texto } from "@/lib/estado-cuenta/airtable";
import { AIRTABLE_TABLES, loadAirtableEnv } from "@/lib/tecnicos/config/airtable";
import { createHistorialEntrada } from "@/lib/tecnicos/airtable";

export const CAMPO_PRESUPUESTO_ENVIADO = "Presupuesto enviado";
const UNA_HORA = 3_600_000;

export type MedioEnvio = "copiado" | "whatsapp";
export const esMedioEnvio = (v: unknown): v is MedioEnvio => v === "copiado" || v === "whatsapp";

/** Hace falta dejar constancia si nunca se envió o la última vez fue hace más de una hora. */
export function tocaConstancia(anterior: string | null, ahora: Date): boolean {
  if (!anterior) return true;
  const t = Date.parse(anterior);
  return !Number.isFinite(t) || ahora.getTime() - t > UNA_HORA;
}

export async function marcarPresupuestoEnviado(o: {
  ordenId: string;
  medio: MedioEnvio;
  usuario: { nombre: string | null; email: string | null; id: string | null };
}): Promise<string> {
  const ahora = new Date();
  const fila = (await porIds(AIRTABLE_TABLES.ordenes, [o.ordenId], [CAMPO_PRESUPUESTO_ENVIADO])).get(o.ordenId);
  const anterior = fila ? texto(fila.fields[CAMPO_PRESUPUESTO_ENVIADO]) || null : null;
  const { token, baseId } = loadAirtableEnv();
  const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(AIRTABLE_TABLES.ordenes)}/${encodeURIComponent(o.ordenId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { [CAMPO_PRESUPUESTO_ENVIADO]: ahora.toISOString() } }),
  });
  if (!res.ok) throw new Error(`Airtable presupuesto enviado: HTTP ${res.status}`);
  if (tocaConstancia(anterior, ahora)) {
    await createHistorialEntrada({
      ordenRecordId: o.ordenId,
      avanceTexto: o.medio === "whatsapp" ? "Presupuesto enviado al cliente por WhatsApp" : "Enlace del presupuesto copiado para el cliente",
      tipoActividad: "Aviso al cliente",
      visibilidad: "Interna",
      creadoPorNombre: o.usuario.nombre,
      creadoPorEmail: o.usuario.email,
      creadoPorUsuarioId: o.usuario.id,
    });
  }
  return ahora.toISOString();
}
