// Ajuste de datos del inventario general del 7-nov-2026, aprobado por el dueño
// el 9-nov-2026: piezas registradas por error con "Despiece de equipo".
//
// Son repuestos que YA salieron del despiece de algún equipo; el empleado eligió
// "Despiece de equipo" (que deja el artículo "Destinado a partes", fuera de la
// venta, como si hubiera que desarmarlo) en vez de "Reajuste de inventario".
//
// - Tipo de operación → "Reajuste de inventario".
// - "Destinado a partes" → la etiqueta que le toca por la regla de llegada:
//   "En revisión" si su categoría pide inspección y no está firmada; si no,
//   "Disponible" y a la venta (si tiene unidades libres).
// - Un artículo que ya salió (Vendido, Dado de baja…) solo corrige el tipo.
// - Un equipo de verdad en despiece (tiene piezas hijas o despiece en curso)
//   no se toca: se lista para revisar.
//
// Módulo puro: sin red.

export type RegistroDespieceError = {
  id: string;
  sku: string;
  tipoOperacion: string;
  estado: string;
  recibido: boolean;
  requiereInspeccion: boolean;
  inspeccionFirmada: boolean;
  estadoRevision: string;
  cantidad: number;
  cantidadReservada: number;
  /** Tiene piezas hijas o un despiece en curso: es un equipo que sí se desarma. */
  tieneDespiece: boolean;
};

export type PlanDespieceError =
  | { tipo: "nada" }
  | { tipo: "cambio"; id: string; sku: string; fields: Record<string, unknown>; estadoAnterior: string; estadoNuevo: string; resumen: string }
  | { tipo: "revisar"; sku: string; motivo: string };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const REVISION_OK = new Set(["recibido correctamente", "aceptado con observacion"]);

export function planDespieceError(r: RegistroDespieceError): PlanDespieceError {
  if (norm(r.tipoOperacion) !== "despiece de equipo") return { tipo: "nada" };
  if (r.tieneDespiece) return { tipo: "revisar", sku: r.sku, motivo: "Tiene piezas o despiece en curso: es un equipo que sí se desarma." };
  const tipo = { "Tipo de operación": "Reajuste de inventario" };
  if (norm(r.estado) !== "destinado a partes") {
    return { tipo: "cambio", id: r.id, sku: r.sku, fields: tipo, estadoAnterior: r.estado, estadoNuevo: r.estado, resumen: `Tipo → Reajuste de inventario (sigue ${r.estado})` };
  }
  if (!r.recibido || r.cantidad <= 0) return { tipo: "revisar", sku: r.sku, motivo: "Destinado a partes sin Recibido o sin unidades: lo decide el dueño." };
  const enRevision = r.requiereInspeccion && !r.inspeccionFirmada;
  const estadoNuevo = enRevision ? "En revisión" : "Disponible";
  const libres = Math.max(0, r.cantidad - Math.max(0, r.cantidadReservada));
  const aLaVenta = !enRevision && REVISION_OK.has(norm(r.estadoRevision)) && libres > 0;
  return {
    tipo: "cambio",
    id: r.id,
    sku: r.sku,
    fields: { ...tipo, "Estado Item": estadoNuevo, "Disponible para venta": aLaVenta },
    estadoAnterior: r.estado,
    estadoNuevo,
    resumen: `Destinado a partes → ${estadoNuevo}${aLaVenta ? " · a la venta" : enRevision ? " · falta su inspección" : ""}`,
  };
}
