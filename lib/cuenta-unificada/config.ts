import type { ModoRepuestos } from "@/types/cuenta-unificada";

// Corte Legacy/V2 para el modo de repuestos de la cuenta unificada (Fase 11).
// Toda orden creada ANTES de esta fecha usa "legacy" (repuestos desde la tabla
// "Repuestos por Orden", cálculo sin cambios). Toda orden creada EN O DESPUÉS
// de esta fecha usa "v2" (repuestos desde Shipping Items vía "Saldo Item").
//
// Placeholder a propósito en el futuro: la Etapa 2 (UI que permite agregar
// repuestos V2 desde Shipping Items) todavía no existe, así que hoy TODA orden
// debe salir "legacy". Actualizar esta fecha cuando Etapa 2 salga a producción.
export const REPUESTOS_V2_CUTOVER_DATE = "2099-01-01T00:00:00.000Z";

export function resolveModoRepuestos(ordenCreatedTime: string): ModoRepuestos {
  return ordenCreatedTime < REPUESTOS_V2_CUTOVER_DATE ? "legacy" : "v2";
}
