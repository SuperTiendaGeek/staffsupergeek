import "server-only";

// Lee lo que necesita el comprobante de entrega en garantía y lo arma con la
// regla pura (./comprobante.ts). Solo LEE.

import { fetchCliente, fetchOrden, firstString, linkedIds } from "@/lib/facturacion/gancho/airtableGancho";
import { getFacturacionConfig } from "@/lib/facturacion/config";
import { porIds, texto } from "@/lib/estado-cuenta/airtable";
import { listarLineas } from "@/lib/tecnicos/presupuesto/airtable";
import { hoyEcuador } from "@/lib/saldo-favor/servidor";
import { armarComprobanteGarantia, type ComprobanteGarantia } from "./comprobante";

export type EmisorComprobanteGarantia = { nombreComercial: string; razonSocial: string; ruc: string; dirMatriz: string };

export type ResultadoComprobanteGarantia =
  | { ok: true; comprobante: ComprobanteGarantia; emisor: EmisorComprobanteGarantia }
  | { ok: false; status: number; motivo: string };

export async function cargarComprobanteGarantia(ordenId: string): Promise<ResultadoComprobanteGarantia> {
  try {
    const orden = await fetchOrden(ordenId);
    if (!orden) return { ok: false, status: 404, motivo: "Orden no encontrada." };
    const lineas = await listarLineas(ordenId);
    const itemIds = lineas.map((l) => l.itemId).filter((x): x is string => !!x);
    const catIds = lineas.map((l) => l.servicioCatalogoId).filter((x): x is string => !!x);
    const [items, catalogo] = await Promise.all([
      porIds("Shipping Items", itemIds, ["SKU", "Categoría"]),
      porIds("Catálogo Servicios", catIds, ["Garantía (días)"]),
    ]);
    const clienteId = linkedIds(orden.fields["Cliente"])[0];
    const c = clienteId ? await fetchCliente(clienteId) : null;
    const comprobante = armarComprobanteGarantia({
      ordenCodigo: firstString(orden.fields["ID"], ordenId),
      equipo: firstString(orden.fields["Equipo"]),
      cliente: {
        nombre: c ? firstString(c.fields["Nombre"], "Consumidor final") : "Consumidor final",
        identificacion: c ? firstString(c.fields["Cédula"]) : "",
        telefono: c ? firstString(c.fields["Teléfono"]) || firstString(c.fields["Telefono"]) : "",
      },
      lineas: lineas.map((l) => {
        const it = l.itemId ? items.get(l.itemId) : undefined;
        const dias = l.servicioCatalogoId ? catalogo.get(l.servicioCatalogoId)?.fields["Garantía (días)"] : undefined;
        return { ...l, sku: texto(it?.fields["SKU"]), categoria: texto(it?.fields["Categoría"]), diasCatalogo: typeof dias === "number" ? dias : null };
      }),
      hoy: hoyEcuador(),
    });
    if (!comprobante) return { ok: false, status: 404, motivo: "Esta orden no tiene nada en garantía confirmada." };
    const cfg = getFacturacionConfig();
    return { ok: true, comprobante, emisor: { nombreComercial: cfg.nombreComercial, razonSocial: cfg.razonSocial, ruc: cfg.ruc, dirMatriz: cfg.dirMatriz } };
  } catch (e) {
    console.error("[comprobante-garantia]", e);
    return { ok: false, status: 503, motivo: "No se pudo leer la orden. Intenta de nuevo en unos segundos." };
  }
}
