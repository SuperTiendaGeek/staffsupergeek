import "server-only";

// Tabla "Configuración del portal" (tbl5h6iKhvvvvZogW, creada por Claude el
// 18-nov-2026 con aprobación del dueño). Un registro por grupo de ajustes
// (Clave), con su Valor en JSON, quién y cuándo lo cambió, y un historial.
// Solo el servidor escribe; nunca guardar aquí claves secretas en texto plano.

import {
  airtableMutation, airtableRequest, escapeFormulaString, tableUrl, type AirtableListResponse,
} from "@/lib/finanzas/airtable-client";

const T_CONFIG = "Configuración del portal";
const F = { clave: "Clave", valor: "Valor", por: "Actualizado por", en: "Actualizado en", historial: "Historial" } as const;

export type RegistroConfiguracion = {
  id: string | null;
  valor: unknown;
  actualizadoPor: string;
  actualizadoEn: string;
  historial: string;
};

const texto = (v: unknown) => (typeof v === "string" ? v : "");

export async function leerConfiguracion(clave: string): Promise<RegistroConfiguracion> {
  const u = new URL(tableUrl(T_CONFIG));
  u.searchParams.set("filterByFormula", `{${F.clave}}='${escapeFormulaString(clave)}'`);
  u.searchParams.set("maxRecords", "1");
  const r = (await airtableRequest<AirtableListResponse>(u.toString())).records?.[0];
  if (!r) return { id: null, valor: null, actualizadoPor: "", actualizadoEn: "", historial: "" };
  let valor: unknown = null;
  try { valor = JSON.parse(texto(r.fields[F.valor]) || "null"); } catch { valor = null; }
  return {
    id: r.id,
    valor,
    actualizadoPor: texto(r.fields[F.por]),
    actualizadoEn: texto(r.fields[F.en]),
    historial: texto(r.fields[F.historial]),
  };
}

/** Crea o reemplaza el registro de esa clave. */
export async function guardarConfiguracion(input: { id: string | null; clave: string; valor: unknown; por: string; historial: string }): Promise<void> {
  const fields = {
    [F.clave]: input.clave,
    [F.valor]: JSON.stringify(input.valor, null, 2),
    [F.por]: input.por,
    [F.en]: new Date().toISOString(),
    [F.historial]: input.historial,
  };
  await airtableMutation(tableUrl(T_CONFIG), {
    method: input.id ? "PATCH" : "POST",
    body: JSON.stringify({ records: [input.id ? { id: input.id, fields } : { fields }] }),
  });
}
