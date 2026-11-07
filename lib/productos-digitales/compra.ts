// Productos digitales — COMPRA y GESTIÓN, reglas PURAS (auditoría ops, punto
// 5B-2 · 7-nov-2026). Sin servidor, sin Airtable, sin reloj propio.
//
// Decisión del dueño: la única entrada de una licencia es la COMPRA en
// Shipping V2 → Registrar compra (modo Producto digital), igual que un
// artículo físico. Odoo hace lo mismo con los números de serie: nacen al
// recibir la compra y la venta solo usa los que existen.
//
// Cada licencia comprada son DOS registros enlazados:
//   · el ARTÍCULO de Shipping (categoría "Licencia digital"): lleva el costo,
//     la orden de compra y el pago (egreso en Finanzas), y su Kardex;
//   · la unidad DIG (Productos Digitales): lleva las credenciales y el PDF.
// La DIG manda; el artículo la sigue (planArticuloDeLicencia). El artículo
// nunca se vende por sí solo en Facturación: se vende su DIG.

export const CATEGORIA_LICENCIA_DIGITAL = "Licencia digital";

export const esCategoriaLicencia = (categoria: string | null | undefined) =>
  (categoria ?? "").trim().toLowerCase() === CATEGORIA_LICENCIA_DIGITAL.toLowerCase();

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ─── La fila de "Registrar compra" ───────────────────────────────────────────

export type FilaLicencia = {
  catalogoId: string;
  costo: number | null;
  precio: number | null;
  /** Clave defectuosa que el proveedor repuso sin cobrar: costo $0. */
  reposicion: boolean;
};

/** Error de una fila (null = válida). Las credenciales las valida errorCredenciales (reglas.ts). */
export function errorFilaLicencia(f: FilaLicencia, catalogo: { activo: boolean } | null): string | null {
  if (!f.catalogoId || !catalogo) return "Elige el producto del catálogo.";
  if (!catalogo.activo) return "Ese producto está inactivo en el catálogo.";
  if (f.reposicion) {
    if (f.costo !== null && f.costo !== 0) return "Una reposición del proveedor va en $0.";
  } else if (f.costo === null || !(f.costo > 0)) {
    return "Escribe el costo (si el proveedor la repuso gratis, marca \"Reposición\").";
  }
  if (f.precio === null || !(f.precio > 0)) return "Escribe el precio de venta.";
  return null;
}

/** Costo que se guarda (la reposición siempre $0). */
export const costoDeFila = (f: FilaLicencia) => (f.reposicion ? 0 : r2(f.costo ?? 0));

/**
 * La solicitud que se compra con esta fila debe ser del MISMO producto del
 * catálogo que aprobó el cliente (no se le entrega otro por error).
 */
export function errorSolicitudDeFila(
  s: { codigo: string; estado: string; categoria: string } | null,
  lineaCatalogoId: string | null,
  catalogoId: string,
): string | null {
  if (!s) return "La solicitud de compra no existe.";
  if (s.estado !== "Por comprar") return `${s.codigo} ya no está por comprar. Quítala de la lista.`;
  if (!esCategoriaLicencia(s.categoria)) return `${s.codigo} no es de una licencia: cómprala como artículo.`;
  if (lineaCatalogoId && lineaCatalogoId !== catalogoId) return `${s.codigo} es de otro producto del catálogo.`;
  return null;
}

// ─── El artículo de Shipping sigue a su DIG ──────────────────────────────────

export type EstadoDigital = "Disponible" | "Reservado" | "Usado" | "Anulado" | "Vencido" | "En reclamo";

export type ArticuloActual = { estado: string; cantidad: number; disponibleVenta?: boolean };

export type PlanArticulo = {
  /** Campos a escribir en el artículo (vacío = ya está al día). */
  fields: Record<string, unknown>;
  /** Unidades que entran (+1) o salen (−1) del libro; 0 = nada en el Kardex. */
  delta: -1 | 0 | 1;
};

/**
 * Qué debe decir el artículo según su licencia. Nunca se ofrece en
 * Facturación ("Disponible para venta" siempre falso).
 *   Disponible → Disponible (1)      Reservado → Reservado (1)
 *   En reclamo → Con novedad (1)     Usado → Vendido (0)
 *   Anulado/Vencido → Dado de baja (0), salvo que ya estuviera vendido: una
 *   licencia vendida y luego devuelta (nota de crédito) sigue "Vendido".
 */
export function planArticuloDeLicencia(estadoDig: string, a: ArticuloActual): PlanArticulo {
  const destino: { estado: string; cantidad: number } = (() => {
    switch (estadoDig) {
      case "Reservado": return { estado: "Reservado", cantidad: 1 };
      case "En reclamo": return { estado: "Con novedad", cantidad: 1 };
      case "Usado": return { estado: "Vendido", cantidad: 0 };
      case "Anulado":
      case "Vencido":
        return a.estado === "Vendido" ? { estado: "Vendido", cantidad: 0 } : { estado: "Dado de baja", cantidad: 0 };
      default: return { estado: "Disponible", cantidad: 1 };
    }
  })();
  const fields: Record<string, unknown> = {};
  if (a.estado !== destino.estado) fields["Estado Item"] = destino.estado;
  if (a.cantidad !== destino.cantidad) fields["Cantidad"] = destino.cantidad;
  if (Object.keys(fields).length || a.disponibleVenta !== false) fields["Disponible para venta"] = false;
  const delta = (destino.cantidad - a.cantidad) as -1 | 0 | 1;
  return { fields, delta: delta > 0 ? 1 : delta < 0 ? -1 : 0 };
}

// ─── Gestión en Productos Digitales ──────────────────────────────────────────
// Lo que Staff y Administradores pueden hacer con una licencia en cada caso.

export type AccionGestion = "editar" | "reclamo" | "resolver" | "anular";

/**
 * El reclamo se abre sobre una licencia LIBRE. Si la que falló ya estaba en
 * una orden, primero se usa "Reemplazar" en la orden (la anterior vuelve al
 * inventario o queda anulada si el cliente ya la vio) y luego se reclama.
 */
export function accionesDeGestion(u: { estado: string }): AccionGestion[] {
  switch (u.estado) {
    case "Disponible": return ["editar", "reclamo", "anular"];
    case "Reservado": return ["editar"];
    case "En reclamo": return ["editar", "resolver"];
    case "Usado": return ["editar"];
    default: return [];
  }
}

export type ResolucionReclamo = "funciono" | "repuesta" | "no_repuesta";

export const TEXTO_RESOLUCION: Record<ResolucionReclamo, string> = {
  funciono: "Funcionó: vuelve a estar disponible",
  repuesta: "El proveedor la repuso: se anula y se registra la nueva en $0",
  no_repuesta: "El proveedor no la repuso: se anula",
};

export function destinoReclamo(r: ResolucionReclamo): "Disponible" | "Anulado" {
  return r === "funciono" ? "Disponible" : "Anulado";
}

/** Validar un cambio de gestión (null = permitido). */
export function errorGestion(accion: AccionGestion, u: { estado: string }, motivo: string): string | null {
  if (!accionesDeGestion(u).includes(accion)) return `No se puede ${accion === "reclamo" ? "abrir un reclamo" : accion} con la licencia en "${u.estado}".`;
  if ((accion === "reclamo" || accion === "anular" || accion === "resolver") && !motivo.trim()) return "Escribe el motivo.";
  return null;
}
