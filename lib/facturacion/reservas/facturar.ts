import "server-only";

// Fase 2 — facturar una reserva. Construye un DatosVenta a partir de la reserva
// (cliente + ítem + pagos = abonos previos + saldo) con origen {tipo:"reserva"}.
// La emisión pasa por el MISMO endpoint /api/facturacion/emitir que el resto:
//   · verificarStockDisponible → el ítem reservado tiene Cantidad ≥ 1, pasa.
//   · postEmision → descuenta inventario y marca el ítem Vendido.
//   · procesarPuenteFacturacion → rama "reserva": marca los movimientos de los
//     abonos como facturados y solo cobra el SALDO como ingreso nuevo
//     ("Venta Producto"), sin doble conteo.
//   · el endpoint marca la reserva como Facturada (solo en producción).
//
// Los abonos ya traen el CÓDIGO SRI de forma de pago en el JSON de la reserva,
// así que las líneas de pago "abono" se arman directo (no se re-mapea método).

import type { DatosVenta } from "../emitirFactura";
import type { DetalleFactura, Pago } from "../types/factura";
import { fetchDetalleItems } from "../gancho/airtableGancho";
import {
  construirLineaProducto, agruparTotalConImpuestos, derivarTipoIdentificacion, round2,
} from "../gancho/construccion";
import { FORMA_PAGO_SALDO_DEFAULT } from "../gancho/config";
import { obtenerReservaPorId } from "./airtable";

export type PreFacturaReservaBloqueada = {
  bloqueado: true;
  motivo: string;
};

export type PreFacturaReservaLista = {
  bloqueado: false;
  datosVenta: DatosVenta;
  resumen: {
    numero: string;
    descripcionItem: string;
    importeTotal: number;
    totalAbonado: number;
    saldo: number;
  };
};

export type ResultadoPreFacturaReserva = PreFacturaReservaBloqueada | PreFacturaReservaLista;

export async function construirPreFacturaReserva(
  reservaId: string,
  saldoFormaPago?: string,
): Promise<ResultadoPreFacturaReserva> {
  const reserva = await obtenerReservaPorId(reservaId);
  if (!reserva) return { bloqueado: true, motivo: "La reserva no existe." };

  // Idempotencia / estado: solo una reserva Activa y sin factura previa se factura.
  if (reserva.facturaRecordId) return { bloqueado: true, motivo: "La reserva ya tiene una factura vinculada." };
  if (reserva.estado !== "Activa") return { bloqueado: true, motivo: `La reserva está ${reserva.estado.toLowerCase()}; no se puede facturar.` };
  if (!reserva.shippingItemId) return { bloqueado: true, motivo: "La reserva no tiene un ítem vinculado." };
  if (!(reserva.precio > 0)) return { bloqueado: true, motivo: "La reserva no tiene un precio válido." };

  // Detalle del ítem (SKU + tarifa IVA) — también confirma que aún existe.
  const detalleItems = await fetchDetalleItems([reserva.shippingItemId]);
  const detalleItem = detalleItems.get(reserva.shippingItemId);
  if (!detalleItem) return { bloqueado: true, motivo: "El ítem reservado ya no existe en inventario." };

  // Línea de producto (precio de la reserva = precio final CON IVA incluido).
  const linea: DetalleFactura = construirLineaProducto(
    { id: reserva.shippingItemId, nombre: reserva.descripcionItem || "Ítem reservado", precio: reserva.precio },
    detalleItem,
  );
  const detalles = [linea];

  // Totales.
  const totalConImpuestos = agruparTotalConImpuestos(detalles);
  const totalSinImpuestos = round2(detalles.reduce((s, d) => s + d.precioTotalSinImpuesto, 0));
  const totalIva = round2(totalConImpuestos.reduce((s, t) => s + t.valor, 0));
  const importeTotal = round2(totalSinImpuestos + totalIva);

  // Pagos: un componente "abono" por cada abono previo (forma de pago ya en
  // código SRI) + el saldo por cobrar en el instante de facturar.
  const abonoPagos: Pago[] = reserva.abonos.map((a) => ({
    formaPago: a.formaPago,
    total: round2(a.monto),
    origenPago: "abono",
    fechaAbono: a.fecha,
  }));
  const sumaAbonos = round2(abonoPagos.reduce((s, p) => s + p.total, 0));
  const saldo = round2(importeTotal - sumaAbonos);

  const pagos: Pago[] = [...abonoPagos];
  if (saldo > 0.01) {
    pagos.push({ formaPago: saldoFormaPago?.trim() || FORMA_PAGO_SALDO_DEFAULT, total: saldo, origenPago: "saldo" });
  }
  if (pagos.length === 0) {
    // Reserva sin abonos registrados (caso borde): todo el total es saldo.
    pagos.push({ formaPago: saldoFormaPago?.trim() || FORMA_PAGO_SALDO_DEFAULT, total: importeTotal, origenPago: "saldo" });
  }

  // Cliente (la reserva siempre queda vinculada a un cliente real).
  const identificacion = reserva.cliente.identificacion?.trim() || "";
  const tipoIdentificacionComprador = identificacion ? derivarTipoIdentificacion(identificacion) : "07";
  const razonSocialComprador = (reserva.cliente.razonSocial || "CONSUMIDOR FINAL").toUpperCase();
  const identificacionComprador = identificacion || "9999999999999";

  const datosVenta: DatosVenta = {
    tipoIdentificacionComprador,
    razonSocialComprador,
    identificacionComprador,
    correoComprador: reserva.cliente.correo?.trim() || undefined,
    detalles,
    totalSinImpuestos,
    totalDescuento: 0,
    totalConImpuestos,
    importeTotal,
    pagos,
    origen: { tipo: "reserva", recordId: reserva.recordId },
    clienteRecordId: reserva.clienteRecordId,
  };

  return {
    bloqueado: false,
    datosVenta,
    resumen: {
      numero: reserva.numero,
      descripcionItem: reserva.descripcionItem,
      importeTotal,
      totalAbonado: sumaAbonos,
      saldo: saldo > 0.01 ? saldo : 0,
    },
  };
}
