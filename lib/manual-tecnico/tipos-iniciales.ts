// Ajuste de datos del punto 11B (21-nov-2026) — regla PURA.
// Las 8 notas que ya había en «Manual Técnico» no tienen Tipo ni Estado.
// Se les pone el Tipo que corresponde (decidido con el dueño al aprobar el
// tablero 9: 4 procedimientos, 2 reglas de la tienda, 2 notas) y quedan
// «Verificada» (las escribió la tienda). No se toca su texto ni se borra nada.
// Cada una se reconoce por su Cod. Y por una palabra de su texto: si alguien
// cambió la nota, se salta y se avisa en vez de adivinar.

import type { EstadoManual, TipoManual } from "./reglas";

export const QUIEN_AJUSTA = "Ajuste auditoría 11B";

export const TIPOS_INICIALES: ReadonlyArray<{ cod: number; tipo: TipoManual; contiene: string | null }> = [
  { cod: 1, tipo: "Procedimiento", contiene: "F2" },
  { cod: 2, tipo: "Procedimiento", contiene: "F12" },
  { cod: 3, tipo: "Nota", contiene: null }, // vacía
  { cod: 4, tipo: "Regla de la tienda", contiene: "tintas no originales" },
  { cod: 5, tipo: "Regla de la tienda", contiene: "Canon de cartucho" },
  { cod: 6, tipo: "Nota", contiene: "Office" },
  { cod: 7, tipo: "Procedimiento", contiene: "/forceit" },
  { cod: 8, tipo: "Procedimiento", contiene: "diskpart" },
];

export type RegistroNota = { id: string; cod: number | null; notas: string; claves: string; tipo: string; estado: string };

export type AccionTipo = { id: string; cod: number; tipo: TipoManual; estado: EstadoManual; resumen: string };
export type PlanTipos = { acciones: AccionTipo[]; saltadas: Array<{ cod: number; motivo: string }> };

export function planTiposIniciales(registros: readonly RegistroNota[]): PlanTipos {
  const acciones: AccionTipo[] = [];
  const saltadas: PlanTipos["saltadas"] = [];
  for (const regla of TIPOS_INICIALES) {
    const r = registros.find((x) => x.cod === regla.cod);
    if (!r) { saltadas.push({ cod: regla.cod, motivo: "no existe" }); continue; }
    if (r.tipo && r.estado) continue; // ya ajustada: la vista previa queda en 0
    const texto = `${r.notas} ${r.claves}`;
    const coincide = regla.contiene === null ? !r.notas.trim() : texto.toLowerCase().includes(regla.contiene.toLowerCase());
    if (!coincide) {
      saltadas.push({ cod: regla.cod, motivo: regla.contiene === null ? "ya no está vacía" : `su texto ya no dice «${regla.contiene}»` });
      continue;
    }
    const primera = r.notas.split("\n").map((l) => l.replace(/^[:\s=]+/, "").trim()).find(Boolean) ?? "(vacía)";
    acciones.push({ id: r.id, cod: regla.cod, tipo: regla.tipo, estado: "Verificada", resumen: primera.slice(0, 70) });
  }
  return { acciones, saltadas };
}
