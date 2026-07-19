import "server-only";

// Fase 17.b — verificación de stock ANTES de emitir (inventario por cantidad).
//
// Regla de negocio (decidida por el dueño, 2026-07-16): un item con
// Cantidad >= 1 está disponible y se puede facturar; con Cantidad 0 el
// sistema NO debe permitir facturar y debe alertar "sin stock disponible".
//
// Este chequeo corre en el endpoint de emisión ANTES de emitirFactura() —
// después de la autorización del SRI ya no hay forma de rechazar la venta
// (la factura es un documento tributario real), así que la única puerta
// válida está antes. postEmision() luego relee la cantidad justo antes de
// descontar (mitiga la carrera entre dos facturas simultáneas); si aún así
// quedara en negativo, deja constancia en "Sincronización Inventario" para
// corrección manual — pero este pre-chequeo hace que ese caso sea
// excepcional, no el camino normal.
//
// Fail-closed: item que no existe o sin campo Cantidad → disponible 0.
//
// Solo aplica a líneas con shippingItemId (gancho, y mostrador desde que el
// buscador las marca) — líneas manuales sin vínculo a inventario no se
// verifican, igual que nunca descontaron stock.

import { fetchRecordsByIds, numberOrZero } from "../gancho/airtableGancho";
import type { DetalleFactura } from "../types/factura";

const SHIPPING_ITEMS_TABLE = "Shipping Items";

export type FaltanteStock = {
  shippingItemId: string;
  descripcion:    string;
  solicitado:     number;
  disponible:     number;
};

// Parte pura, testeable sin red: agrupa lo solicitado por item (varias
// líneas pueden apuntar al mismo item) y lo compara contra lo disponible.
export function calcularFaltantes(
  detalles: DetalleFactura[],
  disponiblePorItem: Map<string, number>
): FaltanteStock[] {
  const solicitadoPorItem = new Map<string, { cantidad: number; descripcion: string }>();
  for (const d of detalles) {
    if (d.tipo !== "producto" || !d.shippingItemId) continue;
    const prev = solicitadoPorItem.get(d.shippingItemId);
    solicitadoPorItem.set(d.shippingItemId, {
      cantidad:    (prev?.cantidad ?? 0) + (Number.isFinite(d.cantidad) && d.cantidad > 0 ? d.cantidad : 0),
      descripcion: prev?.descripcion ?? d.descripcion,
    });
  }

  const faltantes: FaltanteStock[] = [];
  for (const [itemId, pedido] of solicitadoPorItem) {
    const disponible = disponiblePorItem.get(itemId) ?? 0;
    if (pedido.cantidad > disponible) {
      faltantes.push({
        shippingItemId: itemId,
        descripcion:    pedido.descripcion,
        solicitado:     pedido.cantidad,
        disponible,
      });
    }
  }
  return faltantes;
}

export async function verificarStockDisponible(detalles: DetalleFactura[]): Promise<FaltanteStock[]> {
  const itemIds = [
    ...new Set(
      detalles
        .filter((d) => d.tipo === "producto" && !!d.shippingItemId)
        .map((d) => d.shippingItemId as string)
    ),
  ];
  if (itemIds.length === 0) return [];

  const records = await fetchRecordsByIds(SHIPPING_ITEMS_TABLE, itemIds);
  const disponiblePorItem = new Map<string, number>();
  for (const r of records) {
    disponiblePorItem.set(r.id, numberOrZero(r.fields["Cantidad"]));
  }

  return calcularFaltantes(detalles, disponiblePorItem);
}

export function mensajeFaltantes(faltantes: FaltanteStock[]): string {
  const lista = faltantes
    .map((f) =>
      f.disponible === 0
        ? `"${f.descripcion}" no tiene stock disponible`
        : `"${f.descripcion}" no tiene stock suficiente (solicitado: ${f.solicitado}, disponible: ${f.disponible})`
    )
    .join("; ");
  return `No se puede facturar: ${lista}.`;
}
