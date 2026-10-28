import "server-only";

// Foto de la cuenta para el mensaje al cliente (auditoría ops, punto 4C).
// Se calcula al pedir el mensaje y se guarda en el registro del historial
// ("Resumen de cuenta (sistema)"); la Automatización 2 la redacta.

import { loadAirtableEnv } from "@/lib/tecnicos/config/airtable";
import { getCuentaUnificada } from "@/lib/cuenta-unificada";
import { listarLineas } from "@/lib/tecnicos/presupuesto/airtable";
import { presupuestoPorConfirmar, resumenCuentaParaMensaje } from "./resumen-mensaje";

/** Orden a la que pertenece un registro de "Historial de Estados" (null si no se pudo leer). */
export async function ordenDeHistorial(historialId: string): Promise<string | null> {
  const { token, baseId } = loadAirtableEnv();
  const res = await fetch(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent("Historial de Estados")}/${encodeURIComponent(historialId)}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!res.ok) return null;
  const r = (await res.json()) as { fields?: Record<string, unknown> };
  const v = r.fields?.["Órdenes de Reparación"];
  return Array.isArray(v) && typeof v[0] === "string" ? v[0] : null;
}

/**
 * Resumen de la cuenta de la orden, listo para el mensaje. Si algo no se
 * puede leer devuelve "" (el mensaje sale igual, sin cifras: la
 * automatización no menciona montos si el campo viene vacío). Nunca inventa.
 */
export async function resumenParaMensajeDeOrden(ordenId: string): Promise<string> {
  try {
    const [cuenta, lineas] = await Promise.all([getCuentaUnificada({ ordenId }), listarLineas(ordenId)]);
    return resumenCuentaParaMensaje(cuenta, presupuestoPorConfirmar(lineas));
  } catch (err) {
    console.error("[resumen-mensaje] No se pudo calcular la cuenta:", err);
    return "";
  }
}
