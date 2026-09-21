// Traducción de una pre-factura (gancho de cuenta unificada) a los datos que
// necesitan los formularios NO tributarios: recibo y proforma.
//
// Puro y sin dependencias de servidor (solo `import type`), para poder usarse
// desde componentes de cliente. La lógica de negocio —qué líneas existen, a
// qué precio y con qué IVA— ya la resolvió el servidor en construccion.ts;
// aquí solo se cambia de forma.
//
// Criterio de precio: el backend manda `precioUnitario` como BASE (sin IVA) y
// el impuesto aparte. Recibo y proforma trabajan con el precio FINAL (el que
// el cliente paga), así que se vuelve a sumar el impuesto. Es el mismo
// movimiento que hace FacturacionForm al precargar con "Precios incluyen IVA"
// activado, y mantiene el total idéntico al de la cuenta de la orden: cambiar
// de factura a recibo no debe cambiar cuánto paga el cliente.

import type { DatosVenta } from "../emitirFactura";
import type { LineaRecibo } from "../recibos/types";
import type { LineaProforma } from "../proformas/types";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// OJO con la división: `impuestos[0].valor` es el IVA de TODA la línea (ver
// construirLineaRepuestoHistorico en construccion.ts, la única que genera
// cantidad > 1 — ahí precioUnitario ya viene como base/cantidad mientras que
// el impuesto es el de la línea entera). Sumarlo sin dividir inflaba el
// precio unitario de esos renglones y el total dejaba de cuadrar con la
// cuenta de la orden. Para cantidad 1 —el resto de las líneas— dividir no
// cambia nada.
function precioFinal(d: DatosVenta["detalles"][number]): number {
  const cantidad = d.cantidad > 0 ? d.cantidad : 1;
  return round2(d.precioUnitario + (d.impuestos[0]?.valor ?? 0) / cantidad);
}

export type ClientePrefill = {
  esConsumidorFinal: boolean;
  tipoIdentificacion: string;
  identificacion: string;
  razonSocial: string;
  correo: string;
  telefono: string;
  direccion: string;
  airtableId?: string;
};

export function clienteDesdePrefactura(datosVenta: DatosVenta): ClientePrefill {
  if (datosVenta.tipoIdentificacionComprador === "07") {
    return {
      esConsumidorFinal: true, tipoIdentificacion: "07", identificacion: "9999999999999",
      razonSocial: "CONSUMIDOR FINAL", correo: "", telefono: "", direccion: "",
    };
  }
  return {
    esConsumidorFinal: false,
    tipoIdentificacion: datosVenta.tipoIdentificacionComprador,
    identificacion:     datosVenta.identificacionComprador,
    razonSocial:        datosVenta.razonSocialComprador,
    correo:             datosVenta.correoComprador ?? "",
    telefono:           "",
    direccion:          "",
    airtableId:         datosVenta.clienteRecordId,
  };
}

export function lineasReciboDesdePrefactura(datosVenta: DatosVenta): LineaRecibo[] {
  return datosVenta.detalles.map((d) => ({
    codigo:            d.codigoPrincipal ?? "",
    descripcion:       d.descripcion,
    unidadMedida:      d.unidadMedida ?? "UNIDAD",
    cantidad:          d.cantidad,
    precioUnitario:    precioFinal(d),
    descuento:         d.descuento,
    shippingItemId:    d.shippingItemId,
    productoDigitalId: d.productoDigitalId,
  }));
}

export function lineasProformaDesdePrefactura(datosVenta: DatosVenta): LineaProforma[] {
  return datosVenta.detalles.map((d) => ({
    codigo:         d.codigoPrincipal ?? "",
    descripcion:    d.descripcion,
    unidadMedida:   d.unidadMedida ?? "UNIDAD",
    cantidad:       d.cantidad,
    // LineaProforma.precioUnitario ya está definido como "CON IVA incluido".
    precioUnitario: precioFinal(d),
    descuento:      d.descuento,
    tarifaIva:      d.impuestos[0]?.codigoPorcentaje ?? "4",
    origen:         d.shippingItemId ? "shipping-item" : "manual",
    shippingItemId: d.shippingItemId,
  }));
}

export type AbonoPrefill = { total: number; formaPago: string; fecha?: string };

/**
 * Abonos ya cobrados (y ya registrados en /finanzas) que vienen en la
 * pre-factura. El recibo NO los vuelve a registrar: se muestran para que el
 * usuario vea de qué se compone el total y cuánto queda por cobrar hoy.
 */
export function abonosDesdePrefactura(datosVenta: DatosVenta): AbonoPrefill[] {
  return datosVenta.pagos
    .filter((p) => p.origenPago === "abono")
    .map((p) => ({ total: p.total, formaPago: p.formaPago, fecha: p.fechaAbono }));
}

/** Forma de pago sugerida para el saldo, según lo que armó el gancho. */
export function formaPagoSaldoDesdePrefactura(datosVenta: DatosVenta): string {
  return datosVenta.pagos.find((p) => p.origenPago === "saldo")?.formaPago ?? "01";
}
