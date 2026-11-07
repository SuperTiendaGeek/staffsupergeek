import "server-only";

// Lee lo que necesita el Comprobante de entrega ENT-<orden> y lo arma con la
// regla pura (./comprobante.ts). Solo LEE.

import { fetchCliente, fetchOrden, firstString, linkedIds } from "@/lib/facturacion/gancho/airtableGancho";
import { getFacturacionConfig } from "@/lib/facturacion/config";
import { armarComprobanteEntrega, type ComprobanteEntrega } from "./comprobante";

export type EmisorComprobanteEntrega = { nombreComercial: string; razonSocial: string; ruc: string; dirMatriz: string };

export type ResultadoComprobanteEntrega =
  | { ok: true; comprobante: ComprobanteEntrega; emisor: EmisorComprobanteEntrega }
  | { ok: false; status: number; motivo: string };

export async function cargarComprobanteEntrega(ordenId: string): Promise<ResultadoComprobanteEntrega> {
  try {
    const orden = await fetchOrden(ordenId);
    if (!orden) return { ok: false, status: 404, motivo: "Orden no encontrada." };
    const clienteId = linkedIds(orden.fields["Cliente"])[0];
    const c = clienteId ? await fetchCliente(clienteId) : null;
    const r = armarComprobanteEntrega({
      ordenCodigo: firstString(orden.fields["ID"], ordenId),
      estadoOrden: firstString(orden.fields["Estado Actual"]),
      equipo: firstString(orden.fields["Equipo"]),
      cliente: {
        nombre: c ? firstString(c.fields["Nombre"], "Consumidor final") : "Consumidor final",
        identificacion: c ? firstString(c.fields["Cédula"]) : "",
        telefono: c ? firstString(c.fields["Teléfono"]) || firstString(c.fields["Telefono"]) : "",
      },
      campos: orden.fields,
    });
    if (!r.ok) return { ok: false, status: 404, motivo: r.motivo };
    const cfg = getFacturacionConfig();
    return { ok: true, comprobante: r.comprobante, emisor: { nombreComercial: cfg.nombreComercial, razonSocial: cfg.razonSocial, ruc: cfg.ruc, dirMatriz: cfg.dirMatriz } };
  } catch (e) {
    console.error("[comprobante-entrega]", e);
    return { ok: false, status: 503, motivo: "No se pudo leer la orden. Intenta de nuevo en unos segundos." };
  }
}
