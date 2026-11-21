import "server-only";

// El documento de venta vigente de una cuenta (auditoría ops, punto 11).
// Es la MISMA búsqueda que bloquea emitir dos veces (cuenta completa: la orden
// y sus pedidos), con la forma que pinta la tarjeta "Cuenta". Si Airtable no
// responde, lanza: "no pude leer" nunca significa "no hay documento".

import { buscarDocumentoBloqueante } from "@/lib/facturacion/gancho/idempotencia";
import type { DocumentoCuenta } from "@/lib/estado-cuenta/tarjeta";

export async function documentoDeLaCuenta(origen: { tipo: "orden" | "operacion"; recordId: string }): Promise<DocumentoCuenta | null> {
  const b = await buscarDocumentoBloqueante(origen);
  if (!b) return null;
  return b.tipo === "factura"
    ? { tipo: "factura", numero: b.factura.numeroFactura, recordId: b.factura.recordId, estado: b.factura.estado }
    : { tipo: "recibo", numero: b.recibo.numero, recordId: b.recibo.recordId, estado: b.recibo.estado };
}
