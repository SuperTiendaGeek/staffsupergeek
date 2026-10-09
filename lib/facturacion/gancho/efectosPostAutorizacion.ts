import "server-only";

// Efectos de una factura AUTORIZADA: descargo de inventario (postEmision),
// ingreso en Finanzas (puente 20.2) y cierre de la reserva de origen.
//
// ─── Por qué vive aquí y no en el endpoint de emisión ───────────────────────
//
// Antes estos tres pasos estaban escritos a mano dentro de
// POST /api/facturacion/emitir, y SOLO corrían si el SRI autorizaba dentro de
// esa misma petición. Una factura que se autorizaba por otro camino
// ("⟳ Consultar estado", recuperar por clave, "Reintentar al SRI") quedaba
// AUTORIZADA sin descargar inventario, sin ingreso y sin vínculo a su origen.
// Pasó con 6 facturas reales (723, 746, 748, 753, 755 y 756 del 001-002) —
// ver docs/AUDITORIA_FACTURACION_DESCARGO_2026-10-07.md.
//
// Ahora hay un único punto de entrada para "lo que pasa después de
// autorizar", que usan todos los caminos:
//   - ejecutarEfectosPostAutorizacion(): la emisión normal, con los datos de
//     la venta en memoria.
//   - completarFacturaAutorizada(): cualquier otro camino; relee la factura y
//     sus "Líneas JSON" (que desde este cambio se guardan ya en la fila
//     RECIBIDA) y corre solo lo que falta. Es idempotente.
//
// Ninguno de los dos lanza: la factura ya es real ante el SRI y un fallo aquí
// no la deshace — queda reflejado en "Sincronización Inventario" (ERROR,
// visible en el historial con su botón de reintento).

import { postEmision, debeIntentarPostEmision } from "./postEmision";
import {
  actualizarSincronizacionInventario,
  leerVinculosFactura,
  obtenerFactura,
  vincularFacturaAOrigen,
} from "../airtable/facturas";
import { procesarPuenteFacturacion } from "@/lib/finanzas/puentes/facturacion";
import { marcarReservaFacturada } from "../reservas/airtable";
import { marcarOperacionEntregadaPorDocumento } from "@/lib/operaciones/airtable";
import { leerLineasFactura, planificarCompletarFactura, type LineasFacturaGuardadas } from "../reglas/lineasFactura";
import type { DatosVenta, ResultadoEmision } from "../emitirFactura";

const AMBIENTE_PRODUCCION = "2";

export type ResumenEfectos = {
  inventario?: { estado: "OK" | "ERROR"; detalle?: string };
  finanzas?:   "ejecutado" | "omitido";
  reserva?:    "cerrada" | "error" | "omitido";
  vinculos?:   "ok" | "error" | "omitido";
  /** Punto 6: la operación de origen pasa sola a "Entregado". */
  operacion?:  "entregada" | "error";
};

/**
 * Los tres efectos de siempre, con los datos de la venta en memoria. Es lo que
 * antes estaba escrito dentro de POST /api/facturacion/emitir, sin cambios de
 * comportamiento.
 */
export async function ejecutarEfectosPostAutorizacion(input: {
  resultado:     Pick<ResultadoEmision, "estado" | "recordId" | "ambiente">;
  datos:         DatosVenta;
  registradoPor: string;
}): Promise<ResumenEfectos> {
  const { resultado, datos } = input;
  const resumen: ResumenEfectos = {};

  // Inventario: la condición vive en debeIntentarPostEmision() y NO mira el
  // origen — el mostrador también descuenta desde la Fase 17.b.
  if (debeIntentarPostEmision(resultado)) {
    try {
      resumen.inventario = await postEmision({
        facturaRecordId: resultado.recordId,
        detalles:        datos.detalles,
        ambiente:        resultado.ambiente,
        // Con origen (orden/operación/reserva) la factura cumple la reserva.
        liberaReserva:   !!datos.origen,
      });
    } catch (e) {
      console.error("[efectosPostAutorizacion] postEmision falló:", e);
      resumen.inventario = { estado: "ERROR", detalle: e instanceof Error ? e.message : String(e) };
    }
  }

  // Finanzas — independiente del inventario. Nunca lanza.
  await procesarPuenteFacturacion(resultado as ResultadoEmision, datos, input.registradoPor);
  resumen.finanzas = "ejecutado";

  // Reserva — solo tras una autorización real de producción.
  if (
    resultado.estado === "AUTORIZADO" &&
    resultado.recordId &&
    resultado.ambiente === AMBIENTE_PRODUCCION &&
    datos.origen?.tipo === "reserva"
  ) {
    try {
      await marcarReservaFacturada(datos.origen.recordId, resultado.recordId);
      resumen.reserva = "cerrada";
    } catch (e) {
      console.error("[efectosPostAutorizacion] marcar reserva facturada falló:", e);
      resumen.reserva = "error";
    }
  }

  // Operación de origen → "Entregado" (punto 6): mismo criterio que la reserva.
  if (
    resultado.estado === "AUTORIZADO" &&
    resultado.recordId &&
    resultado.ambiente === AMBIENTE_PRODUCCION &&
    datos.origen?.tipo === "operacion"
  ) {
    try {
      await marcarOperacionEntregadaPorDocumento(datos.origen.recordId);
      resumen.operacion = "entregada";
    } catch (e) {
      console.error("[efectosPostAutorizacion] marcar operación entregada falló:", e);
      resumen.operacion = "error";
    }
  }

  return resumen;
}

/** DatosVenta mínimos que necesitan postEmision y el puente contable. */
function datosVentaDesdeLineas(lineas: LineasFacturaGuardadas, factura: {
  clienteNombre: string; clienteIdentificacion: string; clienteCorreo: string; total: number;
}): DatosVenta {
  return {
    tipoIdentificacionComprador: "",
    razonSocialComprador:        factura.clienteNombre,
    identificacionComprador:     factura.clienteIdentificacion,
    correoComprador:             factura.clienteCorreo || undefined,
    detalles:                    lineas.detalles,
    totalSinImpuestos:           0,
    totalDescuento:              0,
    totalConImpuestos:           [],
    importeTotal:                factura.total,
    pagos:                       lineas.pagos,
    infoAdicional:               lineas.infoAdicional,
    origen:                      lineas.origen,
    clienteRecordId:             lineas.clienteRecordId,
  };
}

export type ResultadoCompletar = {
  accion:  "nada" | "sin-lineas" | "en-curso" | "completada" | "no-encontrada";
  motivo?: string;
  efectos?: ResumenEfectos;
};

/**
 * Completa lo que falte de una factura YA AUTORIZADA, venga de donde venga
 * la autorización. Idempotente: se puede llamar cuantas veces haga falta.
 */
export async function completarFacturaAutorizada(recordId: string, registradoPor: string): Promise<ResultadoCompletar> {
  const factura = await obtenerFactura(recordId);
  if (!factura) return { accion: "no-encontrada", motivo: "Factura no encontrada" };

  const lineas = leerLineasFactura(factura.lineasJson);
  let vinculos;
  try {
    vinculos = await leerVinculosFactura(recordId);
  } catch (e) {
    console.error("[completarFacturaAutorizada] no se pudieron leer los vínculos:", e);
    vinculos = undefined;
  }

  const plan = planificarCompletarFactura({
    estado:                    factura.estado,
    ambiente:                  factura.ambiente,
    sincronizacionInventario:  factura.sincronizacionInventario,
    movimientosFinancierosIds: factura.movimientosFinancierosIds,
    lineas,
    vinculos,
    ahora: new Date(),
  });

  if (plan.accion === "nada") return { accion: "nada", motivo: plan.motivo };
  if (plan.accion === "en-curso") return { accion: "en-curso", motivo: plan.motivo };

  if (plan.accion === "sin-lineas") {
    // Que se VEA: antes esto quedaba como "N/A", indistinguible de una venta
    // sin artículos, y nadie se enteraba de que faltaba el descargo.
    await actualizarSincronizacionInventario(recordId, "ERROR", plan.motivo).catch((e) => {
      console.error("[completarFacturaAutorizada] no se pudo marcar ERROR (sin líneas):", e);
    });
    return { accion: "sin-lineas", motivo: plan.motivo };
  }

  const efectos: ResumenEfectos = {};
  const l = lineas!; // plan "completar" implica líneas legibles

  // Vínculos primero: cierran la puerta a una segunda factura sobre la misma
  // orden/operación aunque lo demás falle.
  if (plan.vincularOrigen && vinculos) {
    try {
      await vincularFacturaAOrigen(recordId, vinculos, {
        ordenId:     l.origen?.tipo === "orden" ? l.origen.recordId : undefined,
        operacionId: l.origen?.tipo === "operacion" ? l.origen.recordId : undefined,
        clienteId:   l.clienteRecordId,
      });
      efectos.vinculos = "ok";
    } catch (e) {
      console.error("[completarFacturaAutorizada] vincular origen falló:", e);
      efectos.vinculos = "error";
    }
  }

  const datos = datosVentaDesdeLineas(l, factura);
  const resultado = { estado: "AUTORIZADO" as const, recordId, ambiente: AMBIENTE_PRODUCCION };

  if (plan.inventario) {
    try {
      efectos.inventario = await postEmision({
        facturaRecordId: recordId,
        detalles:        l.detalles,
        ambiente:        AMBIENTE_PRODUCCION,
        liberaReserva:   !!l.origen,
      });
    } catch (e) {
      console.error("[completarFacturaAutorizada] postEmision falló:", e);
      efectos.inventario = { estado: "ERROR", detalle: e instanceof Error ? e.message : String(e) };
    }
  }

  if (plan.finanzas) {
    await procesarPuenteFacturacion(resultado as ResultadoEmision, datos, registradoPor);
    efectos.finanzas = "ejecutado";
  }

  if (plan.reserva && l.origen?.tipo === "reserva") {
    try {
      await marcarReservaFacturada(l.origen.recordId, recordId);
      efectos.reserva = "cerrada";
    } catch (e) {
      console.error("[completarFacturaAutorizada] marcar reserva facturada falló:", e);
      efectos.reserva = "error";
    }
  }

  // Operación de origen → "Entregado" (punto 6). Idempotente.
  if (l.origen?.tipo === "operacion") {
    try {
      await marcarOperacionEntregadaPorDocumento(l.origen.recordId);
      efectos.operacion = "entregada";
    } catch (e) {
      console.error("[completarFacturaAutorizada] marcar operación entregada falló:", e);
      efectos.operacion = "error";
    }
  }

  return { accion: "completada", efectos };
}
