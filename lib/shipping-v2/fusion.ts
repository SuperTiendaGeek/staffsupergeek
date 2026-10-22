// Fusionar SKU (punto 10c-3 de la auditoría Shipping V2, 21-oct-2026).
// Solo reglas, sin red.
//
// Productos repetidos (de la época de "un SKU por unidad" o registrados dos
// veces) se juntan en uno: el PRINCIPAL. Cada registro de los demás pasa al
// SKU principal conservando SUS costos, su compra, su caja y sus documentos
// (las facturas, recibos, notas de crédito y reservas se enlazan al registro,
// no al texto del SKU). El código viejo queda en "SKUs anteriores" para que
// las etiquetas viejas sigan funcionando hasta reimprimirlas.
//
// - Lo que está en la tienda toma nombre, categoría y precio del principal.
// - Lo ya vendido o dado de baja solo cambia de código y categoría (su nombre
//   queda como se vendió).
// - No se juntan cosas que no son el mismo producto: activo con mercadería,
//   Nuevo con Usado en la tienda, o un lote que habría que separar en unidades.

import { ESTADOS_FUERA_TIENDA } from "./conteo";
import { seguimientoDe, type Seguimiento } from "./unidades-serie";

export type RegistroFusion = {
  id: string;
  sku: string;
  nombre: string;
  categoria: string;
  estado: string;
  cantidad: number;
  recibido: boolean;
  usoLocal: boolean;
  seguimiento: string;
  condicion: string;
  numeroSerie: string;
  precio: number | null;
  costoUnidad: number | null;
  /** Facturas y recibos vinculados (solo para mostrar). */
  documentos: number;
  skusAnteriores: string[];
  ultimaActualizacion: string;
};

export type ProductoFusion = {
  sku: string;
  nombre: string;
  categoria: string;
  condicion: string;
  usoLocal: boolean;
  precio: number | null;
  seguimiento: Seguimiento;
  registros: RegistroFusion[];
  /** Unidades en la tienda. */
  enTienda: number;
  documentos: number;
  costoMin: number | null;
  costoMax: number | null;
};

export const MAX_PRODUCTOS_FUSION = 10;

function normal(texto?: string | null) {
  return String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function normalSku(texto?: string | null) {
  return String(texto ?? "").trim().toUpperCase();
}

export function registroEnTienda(r: Pick<RegistroFusion, "recibido" | "cantidad" | "estado">) {
  return r.recibido && r.cantidad > 0 && !ESTADOS_FUERA_TIENDA.has(normal(r.estado));
}

/** Junta los registros por SKU. El "dato del producto" sale del registro en tienda más reciente. */
export function agruparProductos(registros: RegistroFusion[]): ProductoFusion[] {
  const porSku = new Map<string, RegistroFusion[]>();
  for (const r of registros) {
    const sku = normalSku(r.sku);
    if (!sku) continue;
    porSku.set(sku, [...(porSku.get(sku) ?? []), r]);
  }
  return Array.from(porSku.entries()).map(([sku, regs]) => {
    const orden = [...regs].sort((a, b) => b.ultimaActualizacion.localeCompare(a.ultimaActualizacion));
    const ref = orden.find(registroEnTienda) ?? orden[0];
    const costos = regs.map((r) => r.costoUnidad).filter((c): c is number => typeof c === "number" && Number.isFinite(c) && c > 0);
    return {
      sku,
      nombre: ref.nombre,
      categoria: ref.categoria,
      condicion: ref.condicion,
      usoLocal: ref.usoLocal,
      precio: orden.find((r) => registroEnTienda(r) && r.precio)?.precio ?? ref.precio ?? null,
      seguimiento: seguimientoDe(ref),
      registros: regs,
      enTienda: regs.filter(registroEnTienda).reduce((s, r) => s + r.cantidad, 0),
      documentos: regs.reduce((s, r) => s + r.documentos, 0),
      costoMin: costos.length ? Math.min(...costos) : null,
      costoMax: costos.length ? Math.max(...costos) : null,
    };
  });
}

/** El que más conviene dejar como principal: el que tiene unidades en la tienda (y más). */
export function sugerirPrincipal(productos: ProductoFusion[]): string {
  const orden = [...productos].sort((a, b) => b.enTienda - a.enTienda || b.registros.length - a.registros.length || a.sku.localeCompare(b.sku));
  return orden[0]?.sku ?? "";
}

export type CambioRegistro = {
  id: string;
  skuAntes: string;
  enTienda: boolean;
  campos: {
    sku: string;
    skusAnteriores: string[];
    categoria?: string;
    nombre?: string;
    precio?: number;
    seguimiento?: Seguimiento;
  };
};

export type PlanFusion =
  | {
      ok: true;
      principal: ProductoFusion;
      absorbidos: ProductoFusion[];
      cambios: CambioRegistro[];
      /** Registros en la tienda que cambian de código (etiquetas por reimprimir). */
      etiquetas: number;
      avisos: string[];
    }
  | { ok: false; motivo: string };

/** Qué cambia en cada registro, o por qué no se puede fusionar. */
export function planFusion(productos: ProductoFusion[], principalSku: string): PlanFusion {
  const skus = productos.map((p) => p.sku);
  if (new Set(skus).size !== skus.length) return { ok: false, motivo: "Hay un SKU repetido en la lista." };
  if (productos.length < 2) return { ok: false, motivo: "Elige al menos dos productos." };
  if (productos.length > MAX_PRODUCTOS_FUSION) return { ok: false, motivo: `Máximo ${MAX_PRODUCTOS_FUSION} productos por fusión.` };
  const principal = productos.find((p) => p.sku === normalSku(principalSku));
  if (!principal) return { ok: false, motivo: "Elige cuál queda como principal." };
  const absorbidos = productos.filter((p) => p !== principal);
  const avisos: string[] = [];
  const cambios: CambioRegistro[] = [];

  for (const p of absorbidos) {
    for (const r of p.registros) {
      if (r.usoLocal !== principal.usoLocal) {
        return { ok: false, motivo: principal.usoLocal ? `${p.sku} es mercadería y ${principal.sku} es un activo de la tienda.` : `${p.sku} es un activo de la tienda y ${principal.sku} es mercadería.` };
      }
      const enTienda = registroEnTienda(r);
      if (enTienda && principal.condicion && r.condicion && normal(r.condicion) !== normal(principal.condicion)) {
        return { ok: false, motivo: `${p.sku} está en la tienda como ${r.condicion} y ${principal.sku} es ${principal.condicion}: no son el mismo producto.` };
      }
      const seguimientoActual = seguimientoDe(r);
      let seguimiento: Seguimiento | undefined;
      if (enTienda && seguimientoActual !== principal.seguimiento) {
        if (principal.seguimiento === "Unidad" && r.cantidad > 1) {
          return { ok: false, motivo: `${p.sku} es un lote de ${r.cantidad} y ${principal.sku} se lleva uno por uno: primero sepáralo en unidades.` };
        }
        seguimiento = principal.seguimiento;
      }
      const anteriores = Array.from(new Set([...r.skusAnteriores.map(normalSku), normalSku(r.sku)].filter((s) => s && s !== principal.sku)));
      const campos: CambioRegistro["campos"] = { sku: principal.sku, skusAnteriores: anteriores };
      if (normal(r.categoria) !== normal(principal.categoria) && principal.categoria) campos.categoria = principal.categoria;
      if (enTienda) {
        if (principal.nombre && r.nombre !== principal.nombre) campos.nombre = principal.nombre;
        if (principal.precio && r.precio !== principal.precio) campos.precio = principal.precio;
        if (seguimiento) campos.seguimiento = seguimiento;
      }
      cambios.push({ id: r.id, skuAntes: normalSku(r.sku), enTienda, campos });
    }
    if (p.enTienda && principal.precio && p.precio && p.precio !== principal.precio) {
      avisos.push(`${p.sku} pasa de $${p.precio.toFixed(2).replace(".", ",")} a $${principal.precio.toFixed(2).replace(".", ",")}.`);
    }
  }
  if (!principal.precio && absorbidos.some((p) => p.enTienda)) avisos.push(`${principal.sku} no tiene precio: lo que está en la tienda conserva el suyo.`);
  return { ok: true, principal, absorbidos, cambios, etiquetas: cambios.filter((c) => c.enTienda).length, avisos };
}
