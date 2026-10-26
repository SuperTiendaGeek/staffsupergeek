// Shipping V2 vive en UNA pantalla con pestañas en la cabecera (decisión del
// dueño, 6-oct-2026, auditoría punto 2). Cada pestaña sigue siendo su propia
// ruta, así los enlaces y los permisos por pantalla que ya existen siguen
// funcionando; lo que cambia es que la barra de pestañas está siempre arriba
// y dice cuánto trabajo pendiente hay en cada una.

import type { ShippingV2AccessPermissions } from "@/types/shipping-v2";

export type PestanaShippingKey = "items" | "activos" | "packings" | "recepcion" | "anuncios" | "control" | "kardex" | "pagos" | "novedades";

export type PestanaShipping = {
  key: PestanaShippingKey;
  label: string;
  href: string;
  /** Permiso de Shipping V2 que además hace falta para verla. */
  permiso: keyof ShippingV2AccessPermissions;
  /** Solo personal de la tienda (un proveedor externo no la ve). */
  soloStaff?: boolean;
  /** Punto 18: el técnico no la ve (solo atiende su trabajo técnico). */
  noTecnico?: boolean;
};

export const PESTANAS_SHIPPING_V2: readonly PestanaShipping[] = [
  { key: "items", label: "Artículos", href: "/shipping-v2/items", permiso: "canViewItems" },
  // Punto 4 (8-oct): los activos fijos de la tienda, aparte de la mercadería.
  { key: "activos", label: "Activos de la tienda", href: "/shipping-v2/activos", permiso: "canViewItems", soloStaff: true, noTecnico: true },
  // La pantalla de Packings pasa a llamarse Logística: cajas y artículos que
  // viajan solos, en una sola lista. La ruta se conserva.
  { key: "packings", label: "Logística", href: "/shipping-v2/packings", permiso: "canViewPackings" },
  { key: "recepcion", label: "Recepción", href: "/shipping-v2/recepcion", permiso: "canUseRecepcion" },
  // Punto 10d (18-oct): plantillas de anuncios, datos fijos de la tienda y, más adelante, anuncios por retirar.
  { key: "anuncios", label: "Anuncios", href: "/shipping-v2/anuncios", permiso: "canUseRecepcion", soloStaff: true, noTecnico: true },
  // Punto 10c (18-oct): revisión de inventario, conteos, fusionar SKU y cambios de código.
  { key: "control", label: "Control", href: "/shipping-v2/control", permiso: "canUseRecepcion", soloStaff: true, noTecnico: true },
  // Punto 12 (24-oct): libro de movimientos del inventario. Todo el personal lo ve; costos solo el Administrador.
  { key: "kardex", label: "Kardex", href: "/shipping-v2/kardex", permiso: "canViewItems", soloStaff: true, noTecnico: true },
  { key: "pagos", label: "Pagos", href: "/shipping-v2/pagos", permiso: "canViewPayments" },
  { key: "novedades", label: "Novedades", href: "/shipping-v2/novedades", permiso: "canViewNovedades" },
];

/** Pestaña que corresponde a una ruta (las subpantallas cuelgan de su pestaña). */
export function pestanaDeRuta(pathname: string): PestanaShippingKey | null {
  const found = PESTANAS_SHIPPING_V2.find((p) => pathname === p.href || pathname.startsWith(`${p.href}/`));
  return found?.key ?? null;
}

export type ResumenPestanas = {
  /** Cajas en tránsito + artículos sueltos que vienen en camino. */
  porLlegar: number;
  /** Artículos sueltos en camino sin ningún número de rastreo. */
  sinRastreo: number;
  /** Cajas abiertas ("En Proceso"). */
  cajasAbiertas: number;
  novedadesAbiertas: number;
  /** Anuncios publicados de algo que ya no está a la venta (10d-4). */
  anunciosPorRetirar?: number;
  /** Asuntos abiertos de la revisión de inventario (10c-1). */
  asuntosRevision?: number;
};

/** Texto corto del pendiente de cada pestaña, o null si no hay nada que mostrar. */
export function pendienteDePestana(key: PestanaShippingKey, r: ResumenPestanas | null): string | null {
  if (!r) return null;
  if (key === "recepcion" && r.porLlegar > 0) return `${r.porLlegar} por llegar`;
  if (key === "packings" && r.sinRastreo > 0) return `${r.sinRastreo} sin rastreo`;
  if (key === "packings" && r.cajasAbiertas > 0) return `${r.cajasAbiertas} caja${r.cajasAbiertas === 1 ? "" : "s"} abierta${r.cajasAbiertas === 1 ? "" : "s"}`;
  if (key === "anuncios" && (r.anunciosPorRetirar ?? 0) > 0) return `${r.anunciosPorRetirar} por retirar`;
  if (key === "control" && (r.asuntosRevision ?? 0) > 0) return `${r.asuntosRevision} asunto${r.asuntosRevision === 1 ? "" : "s"}`;
  if (key === "novedades" && r.novedadesAbiertas > 0) return `${r.novedadesAbiertas} abiertas`;
  return null;
}
