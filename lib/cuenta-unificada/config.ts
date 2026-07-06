import type { ModoRepuestos } from "@/types/cuenta-unificada";

// Campo "Modo repuestos" (singleSelect Legacy/V2) en Órdenes de Reparación.
// Todas las órdenes existentes se backfillearon a "Legacy"; toda orden nueva
// nace en "V2" (ver createOrdenReparacion). El admin cambia a mano a V2 las
// pocas órdenes abiertas que migran al sistema nuevo.
//
// Fallback a "legacy" si el campo viene vacío/desconocido: es el valor seguro
// (preserva el comportamiento actual) para cualquier registro que por algún
// motivo no haya pasado por el backfill.
export function resolveModoRepuestos(modoRepuestosField: unknown): ModoRepuestos {
  return modoRepuestosField === "V2" ? "v2" : "legacy";
}
