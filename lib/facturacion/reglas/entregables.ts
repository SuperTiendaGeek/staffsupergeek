import "server-only";

// Auditoría Shipping V2, punto 1 — solo se factura lo que YA ESTÁ en la tienda.
//
// Regla del dueño (3 y 4-oct-2026): un artículo se puede RESERVAR desde que
// existe, aunque venga en camino; pero la factura o el recibo "se emiten
// únicamente cuando el artículo llega y se entrega al cliente". Vale para
// todos los caminos: mostrador, reserva, pedido de Operación Comercial y orden
// de reparación.
//
// Antes la única puerta era el stock (reglas/stock.ts): bastaba con Cantidad
// ≥ 1, y como las compras nacen con "Disponible para venta" encendido, se
// podía facturar algo que seguía en eBay o en la caja de Roberto.
//
// Esta verificación corre en los endpoints de emisión (factura y recibo),
// junto a la de stock, ANTES de emitir: después de la autorización del SRI ya
// no hay forma de echar atrás la venta. Falla cerrado: un ítem que no se pudo
// leer no se da por entregable.
//
// La regla en sí vive en lib/shipping-v2/item-venta.ts (evaluarVentaItem);
// aquí solo se leen los campos y se arma el mensaje.

import { fetchRecordsByIds, firstString } from "../gancho/airtableGancho";
import type { DetalleFactura } from "../types/factura";
import { evaluarVentaItem } from "@/lib/shipping-v2/item-venta";

const SHIPPING_ITEMS_TABLE = "Shipping Items";

export type ArticuloNoEntregable = {
  shippingItemId: string;
  descripcion: string;
  sku: string;
  detalle: string;
};

export type ItemEntregaFields = Record<string, unknown>;

// Parte pura, testeable sin red.
export function calcularNoEntregables(
  detalles: DetalleFactura[],
  registros: Map<string, ItemEntregaFields>
): ArticuloNoEntregable[] {
  const vistos = new Set<string>();
  const resultado: ArticuloNoEntregable[] = [];
  for (const d of detalles) {
    if (d.tipo !== "producto" || !d.shippingItemId || vistos.has(d.shippingItemId)) continue;
    vistos.add(d.shippingItemId);

    const f = registros.get(d.shippingItemId);
    if (!f) {
      resultado.push({
        shippingItemId: d.shippingItemId,
        descripcion: d.descripcion,
        sku: "",
        detalle: "no se encontró en el inventario",
      });
      continue;
    }

    const evaluacion = evaluarVentaItem({
      estado: firstString(f["Estado Item"]),
      estadoRevision: firstString(f["Estado de revisión"]),
      usoLocal: f["Es uso local"] === true,
      recibido: f["Recibido"] === true,
      requiereInspeccion: f["Requiere inspección"] === true,
      inspeccionFirmada: f["Revisado física/técnicamente"] === true,
    });
    if (!evaluacion.vendible) {
      resultado.push({
        shippingItemId: d.shippingItemId,
        descripcion: d.descripcion,
        sku: firstString(f["SKU"]),
        detalle: evaluacion.motivo === "bloqueado" ? `no se puede vender: ${evaluacion.detalle}` : evaluacion.detalle,
      });
    }
  }
  return resultado;
}

export async function verificarArticulosEntregables(detalles: DetalleFactura[]): Promise<ArticuloNoEntregable[]> {
  const itemIds = [
    ...new Set(
      detalles
        .filter((d) => d.tipo === "producto" && !!d.shippingItemId)
        .map((d) => d.shippingItemId as string)
    ),
  ];
  if (itemIds.length === 0) return [];

  const records = await fetchRecordsByIds(SHIPPING_ITEMS_TABLE, itemIds);
  const registros = new Map<string, ItemEntregaFields>(records.map((r) => [r.id, r.fields ?? {}]));
  return calcularNoEntregables(detalles, registros);
}

export function mensajeNoEntregables(lista: ArticuloNoEntregable[]): string {
  const partes = lista.map((a) => `"${a.descripcion}"${a.sku ? ` (${a.sku})` : ""} ${a.detalle}`);
  return `No se puede facturar todavía: ${partes.join("; ")}.`;
}
