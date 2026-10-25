// Punto 18b (25-oct-2026): la lista de Artículos muestra UNA fila por SKU.
//
// Un producto es el grupo de registros que comparten SKU (decisión del
// 17-oct): cada registro es una unidad (con su serie) o un lote. La lista
// agrupa esos registros sin tocar el inventario: solo cambia cómo se lee.
//
// Reglas que pidió el dueño:
// - La fila del SKU suma solo los registros que cumplen el filtro.
// - El grupo va donde aparece su primer registro en el orden elegido; con
//   "Más nuevos primero", un SKU reutilizado sube arriba.
// - Un SKU de un solo registro se ve como siempre (sin flecha).
// - Al abrir la fila se elige primero una unidad disponible.
//
// Puro, sin red: se prueba en __tests__/items-por-sku.test.ts.

import { sigueEnInventario } from "@/lib/shipping-v2/ficha-articulo";

/** Clave del grupo: el SKU sin espacios ni mayúsculas; sin SKU, el registro va solo. */
export function claveSku(sku: string | null | undefined, id: string): string {
  const limpio = String(sku ?? "").trim().toUpperCase();
  return limpio ? `sku:${limpio}` : `id:${id}`;
}

export type EntradaIndiceSku = { id: string; sku?: string | null };
export type GrupoIndiceSku = { clave: string; ids: string[] };

/** Agrupa el índice ya ordenado; cada grupo queda donde aparece su primer registro. */
export function agruparIndicePorSku(indice: readonly EntradaIndiceSku[]): GrupoIndiceSku[] {
  const grupos = new Map<string, GrupoIndiceSku>();
  for (const entrada of indice) {
    const clave = claveSku(entrada.sku, entrada.id);
    const grupo = grupos.get(clave);
    if (grupo) grupo.ids.push(entrada.id);
    else grupos.set(clave, { clave, ids: [entrada.id] });
  }
  return [...grupos.values()];
}

export type PaginaDeGrupos = {
  grupos: GrupoIndiceSku[];
  pagina: number;
  totalPaginas: number;
  totalGrupos: number;
  totalRegistros: number;
};

export function paginaDeGrupos(grupos: readonly GrupoIndiceSku[], pagina: number, porPagina: number): PaginaDeGrupos {
  const tamano = Math.max(1, Math.trunc(porPagina) || 1);
  const totalPaginas = Math.max(1, Math.ceil(grupos.length / tamano));
  const actual = Math.min(Math.max(1, Math.trunc(pagina) || 1), totalPaginas);
  return {
    grupos: grupos.slice((actual - 1) * tamano, actual * tamano),
    pagina: actual,
    totalPaginas,
    totalGrupos: grupos.length,
    totalRegistros: grupos.reduce((total, grupo) => total + grupo.ids.length, 0),
  };
}

type ItemAgrupable = {
  id: string;
  sku?: string | null;
  cantidad?: number | null;
  /** Campo viejo de cantidad: se usa solo si "cantidad" está vacía (igual que la lista). */
  qty?: number | null;
  estado?: string | null;
  disponibleVenta?: boolean | null;
};

export type GrupoSku<T> = {
  clave: string;
  /** El primer registro del grupo en el orden de la lista. */
  principal: T;
  items: T[];
  /** Suma de las cantidades de los registros del grupo (los que cumplen el filtro). */
  cantidad: number;
};

/** Agrupa los artículos de la página, respetando el orden en que llegan. */
export function agruparItemsPorSku<T extends ItemAgrupable>(items: readonly T[]): GrupoSku<T>[] {
  const grupos = new Map<string, GrupoSku<T>>();
  for (const item of items) {
    const clave = claveSku(item.sku, item.id);
    const valor = typeof item.cantidad === "number" && Number.isFinite(item.cantidad) ? item.cantidad : item.qty;
    const cantidad = Math.max(0, Number(valor) || 0);
    const grupo = grupos.get(clave);
    if (grupo) {
      grupo.items.push(item);
      grupo.cantidad += cantidad;
    } else {
      grupos.set(clave, { clave, principal: item, items: [item], cantidad });
    }
  }
  return [...grupos.values()];
}

function normal(texto?: string | null) {
  return String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Qué unidad abre la fila del SKU: una disponible; si no, una en inventario; si no, la primera. */
export function unidadPorDefecto<T extends ItemAgrupable>(items: readonly T[]): T | undefined {
  return (
    items.find((item) => item.disponibleVenta === true || normal(item.estado) === "disponible") ??
    items.find((item) => sigueEnInventario(item)) ??
    items[0]
  );
}

/** Ordena los registros según el índice (los que no están en él van al final). */
export function ordenarSegunIndice<T extends { id: string }>(items: readonly T[], ids: readonly string[]): T[] {
  const posicion = new Map(ids.map((id, indice) => [id, indice]));
  return [...items].sort((a, b) => (posicion.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (posicion.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}
