// Ajuste de datos del punto 3 de la auditoría (Repuestos), aprobado por el
// dueño el 6-oct-2026: "Repuesto no es un estado del artículo, es una
// categoría". Los artículos que todavía tienen la etiqueta "Repuesto" pasan a
// la que les toca por la regla de llegada (Disponible / En revisión).
//
// Lo que NO está en la tienda (sin "Recibido") no se toca: se lista para que
// el dueño decida (RAM-000001 se eliminará a mano desde su ficha).
//
// Módulo puro: sin red.

export type RegistroAjuste3 = {
  id: string;
  sku: string;
  estado: string;
  recibido: boolean;
  requiereInspeccion: boolean;
  inspeccionFirmada: boolean;
  cantidad: number;
};

export type PlanAjuste3 =
  | { tipo: "nada" }
  | { tipo: "cambio"; id: string; sku: string; fields: Record<string, unknown>; resumen: string }
  | { tipo: "revisar"; sku: string; motivo: string };

export function planAjustePunto3(r: RegistroAjuste3): PlanAjuste3 {
  if (r.estado.trim().toLowerCase() !== "repuesto") return { tipo: "nada" };
  if (!r.recibido) return { tipo: "revisar", sku: r.sku, motivo: "No tiene Recibido: el dueño decide (eliminar o recibir)." };
  if (r.cantidad <= 0) {
    return { tipo: "cambio", id: r.id, sku: r.sku, fields: { "Estado Item": "Agotado" }, resumen: "Repuesto → Agotado (sin unidades)" };
  }
  const destino = r.requiereInspeccion && !r.inspeccionFirmada ? "En revisión" : "Disponible";
  return { tipo: "cambio", id: r.id, sku: r.sku, fields: { "Estado Item": destino }, resumen: `Repuesto → ${destino}` };
}
