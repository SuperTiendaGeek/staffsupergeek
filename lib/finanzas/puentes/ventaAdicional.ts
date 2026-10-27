import "server-only";

// Puente "venta adicional" → Movimientos Financieros (auditoría ops, punto 1,
// 27-oct-2026). Es lo que el cliente compra de paso al retirar su equipo
// (mouse, webcam, envío) y se cobra al emitir el documento. Un movimiento por
// cada cobro, con la MISMA tabla método → cuenta que los abonos
// (resolverMapeoMetodoPago): nunca sale un ingreso sin cuenta.
//
// Lo usan el puente de facturación y el del recibo.

import type { CategoriaMovimiento } from "@/types/finanzas";
import { fetchCuentaPorNombre } from "../cuentas";
import { crearMovimiento } from "../movimientos";
import { resolverMapeoMetodoPago } from "./abonos";

export type CobroVentaAdicional = { metodoPago?: string; total: number; referencia?: string };

export async function crearMovimientosVentaAdicional(input: {
  cobros: CobroVentaAdicional[];
  documento: { facturaElectronicaId?: string; reciboId?: string; etiqueta: string };
  clienteId?: string;
  registradoPor: string;
}): Promise<{ creados: number; problemas: string[] }> {
  const problemas: string[] = [];
  let creados = 0;
  const fecha = new Date().toISOString();

  for (const cobro of input.cobros) {
    if (!(cobro.total > 0)) continue;
    const mapeo = resolverMapeoMetodoPago(cobro.metodoPago ?? null);
    const cuenta = mapeo ? await fetchCuentaPorNombre(mapeo.cuentaDestinoNombre) : null;
    if (!cuenta) {
      // La emisión ya validó el método; si aun así no hay cuenta, el
      // movimiento se crea con Alerta Descuadre para que Finanzas lo vea.
      problemas.push(`Cobro de $${cobro.total} (${cobro.metodoPago ?? "sin método"}) sin cuenta destino.`);
    }
    try {
      await crearMovimiento(
        {
          tipo: "Ingreso",
          origen: "Facturación",
          categoria: "Venta Mostrador" as CategoriaMovimiento,
          monto: cobro.total,
          cuentaDestinoId: cuenta?.id ?? null,
          estado: mapeo?.estado ?? "Confirmado",
          estadoDistribucion: "Pendiente de clasificar",
          metodo: mapeo?.metodo,
          fecha,
          transaccionId: cobro.referencia,
          registradoPor: input.registradoPor,
          clienteId: input.clienteId,
          facturaElectronicaId: input.documento.facturaElectronicaId,
          reciboId: input.documento.reciboId,
          observacion: `Venta adicional cobrada al emitir ${input.documento.etiqueta}`,
        },
        { permitirCuentaFaltante: cuenta === null }
      );
      creados += 1;
    } catch (e) {
      problemas.push(`Cobro de $${cobro.total}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { creados, problemas };
}
