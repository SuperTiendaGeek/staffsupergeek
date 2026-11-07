// Entregar una licencia en la orden — regla PURA (auditoría ops, punto 5B ·
// 7-nov-2026). Como Odoo y las apps de licencias: la unidad se elige al
// ENTREGAR, no al aprobar (caso OR000517: aprobar tomaba sola la primera
// unidad libre y no era la que se le dio al cliente).
//
//   · Aprobar el presupuesto deja la línea "por entregar" (sin unidad).
//   · "Entregar licencia": se elige una unidad libre del MISMO producto del
//     catálogo (la comprada hace más tiempo primero). La unidad queda
//     "Reservado" para la orden; "Usado" lo pone la factura o el recibo.
//   · "Reemplazar" (con motivo): la anterior vuelve al inventario solo si su
//     PDF nunca se generó (nunca llegó al cliente); si ya se entregó, queda
//     "Anulado" (una clave que el cliente vio no se vuelve a vender).

export type LineaLicencia = {
  tipo: string;
  estado: string;
  productoCatalogoId: string | null;
  cargoProductoDigitalId: string | null;
};

export type UnidadLicencia = {
  id: string;
  sku: string;
  catalogoId: string | null;
  estado: string;
  ordenReparacionId: string | null;
  fechaCompra: string | null;
  numero: number | null;
  /** Ya se generó su PDF (= ya se le entregó al cliente). */
  tienePdf: boolean;
};

/** Libre para entregar: Disponible y sin orden. */
export function unidadLibre(u: UnidadLicencia): boolean {
  return u.estado === "Disponible" && !u.ordenReparacionId;
}

/** Candidatas para una línea: mismo producto, libres, la comprada hace más tiempo primero. */
export function candidatasParaLinea(linea: Pick<LineaLicencia, "productoCatalogoId">, unidades: readonly UnidadLicencia[]): UnidadLicencia[] {
  return unidades
    .filter((u) => u.catalogoId && u.catalogoId === linea.productoCatalogoId && unidadLibre(u))
    .sort((a, b) => (a.fechaCompra || "9999").localeCompare(b.fechaCompra || "9999") || (a.numero ?? 0) - (b.numero ?? 0));
}

/** Error al elegir (null = se puede). */
export function errorElegir(linea: LineaLicencia, unidad: UnidadLicencia | null, ordenId: string): string | null {
  if (linea.tipo !== "Producto digital") return "Esta línea no es un producto digital.";
  if (linea.estado === "Cargada" && linea.cargoProductoDigitalId) return "Esta línea ya tiene su licencia: usa «Reemplazar».";
  if (linea.estado !== "Aprobada") return "Primero aprueba la línea.";
  if (!unidad) return "Esa licencia ya no existe.";
  if (unidad.catalogoId !== linea.productoCatalogoId) return `${unidad.sku} es de otro producto.`;
  if (unidad.ordenReparacionId && unidad.ordenReparacionId !== ordenId) return `${unidad.sku} ya está entregada en otra orden.`;
  if (!unidadLibre(unidad) && unidad.ordenReparacionId !== ordenId) return `${unidad.sku} no está disponible (${unidad.estado}).`;
  return null;
}

export type DestinoAnterior = "Disponible" | "Anulado";

export type PlanReemplazo =
  | { ok: true; destinoAnterior: DestinoAnterior }
  | { ok: false; error: string };

export function planReemplazo(input: {
  linea: LineaLicencia;
  actual: UnidadLicencia | null;
  nueva: UnidadLicencia | null;
  ordenId: string;
  motivo: string;
}): PlanReemplazo {
  const { linea, actual, nueva } = input;
  if (linea.tipo !== "Producto digital" || linea.estado !== "Cargada" || !linea.cargoProductoDigitalId) {
    return { ok: false, error: "Esta línea no tiene una licencia entregada para reemplazar." };
  }
  if (!input.motivo.trim()) return { ok: false, error: "Escribe el motivo del reemplazo." };
  if (!actual) return { ok: false, error: "No se encontró la licencia actual." };
  if (actual.estado === "Usado") return { ok: false, error: `${actual.sku} ya se vendió con su documento: anúlalo primero.` };
  if (!nueva) return { ok: false, error: "Elige la licencia nueva." };
  if (nueva.id === actual.id) return { ok: false, error: "Elige una licencia distinta." };
  if (nueva.catalogoId !== linea.productoCatalogoId) return { ok: false, error: `${nueva.sku} es de otro producto.` };
  if (!unidadLibre(nueva)) return { ok: false, error: `${nueva.sku} no está disponible.` };
  return { ok: true, destinoAnterior: actual.tienePdf ? "Anulado" : "Disponible" };
}
