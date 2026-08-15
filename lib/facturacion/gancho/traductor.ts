import "server-only";

import { getCuentaUnificada } from "@/lib/cuenta-unificada";
import { esAbonoVigente } from "@/types/cuenta-unificada";
import type { GetCuentaUnificadaInput } from "@/types/cuenta-unificada";

import type { DatosVenta, OrigenGancho } from "../emitirFactura";
import type { DetalleFactura } from "../types/factura";
import {
  fetchOrden, fetchOperacion, fetchCliente, fetchDetalleItems,
  linkedIds, firstString,
} from "./airtableGancho";
import { buscarFacturaBloqueante } from "./idempotencia";
import type { FacturaVinculadaGancho } from "./airtableGancho";
import {
  derivarTipoIdentificacion, construirLineaProducto, construirLineaServicio, construirLineaRepuestoHistorico,
  construirLineaProductoDigital, agruparTotalConImpuestos, evaluarItemNoListo, evaluarProductoDigitalNoListo,
  calcularFormasPago, round2,
} from "./construccion";
import type { ItemNoListo, ProductoDigitalNoListo } from "./construccion";

export type { ItemNoListo, ProductoDigitalNoListo } from "./construccion";

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type PreFacturaInput = { ordenId: string } | { operacionId: string };

export type PreFacturaBloqueada = {
  bloqueado:        true;
  motivo:           "FACTURA_EXISTENTE" | "ITEMS_NO_LISTOS" | "PRODUCTOS_DIGITALES_SIN_PRECIO";
  facturaExistente?: FacturaVinculadaGancho;
  itemsNoListos?:    ItemNoListo[];
  // Motivo análogo a itemsNoListos, propio de "Productos Digitales": un
  // producto vinculado a la orden sin precio utilizable (ni el fijado para
  // esta venta ni el del catálogo) — ver evaluarProductoDigitalNoListo() en
  // construccion.ts.
  productosDigitalesNoListos?: ProductoDigitalNoListo[];
};

export type PreFacturaLista = {
  bloqueado:        false;
  origen:           OrigenGancho;
  ordenIdVisible:    string | null;
  operacionCodigo:   string | null;
  datosVenta:        DatosVenta; // datosVenta.origen y .clienteRecordId siempre presentes aquí
};

export type ResultadoPreFactura = PreFacturaBloqueada | PreFacturaLista;

// ─── Función principal ────────────────────────────────────────────────────────

/**
 * Traduce la cuenta unificada de una orden/operación a una pre-factura
 * (DatosVenta editable) o a un bloqueo con el detalle de por qué no se
 * puede generar todavía. Toda la lógica de negocio pura (líneas, IVA,
 * formas de pago, derivación de tipo de identificación) vive en
 * construccion.ts — aquí solo se orquesta el fetch de datos.
 */
export async function construirPreFactura(input: PreFacturaInput): Promise<ResultadoPreFactura> {
  const origen: OrigenGancho =
    "ordenId" in input
      ? { tipo: "orden", recordId: input.ordenId }
      : { tipo: "operacion", recordId: input.operacionId };

  // ── 1. Idempotencia ─────────────────────────────────────────────────────────
  const facturaBloqueante = await buscarFacturaBloqueante(origen);
  if (facturaBloqueante) {
    return { bloqueado: true, motivo: "FACTURA_EXISTENTE", facturaExistente: facturaBloqueante };
  }

  // ── 2. Cuenta unificada ──────────────────────────────────────────────────────
  const cuentaInput: GetCuentaUnificadaInput =
    "ordenId" in input ? { ordenId: input.ordenId } : { operacionId: input.operacionId };
  const cuenta = await getCuentaUnificada(cuentaInput);

  const [ordenRecord, operacionRecord] = await Promise.all([
    cuenta.ordenId ? fetchOrden(cuenta.ordenId) : Promise.resolve(null),
    cuenta.operacionId ? fetchOperacion(cuenta.operacionId) : Promise.resolve(null),
  ]);
  const registroOrigen = origen.tipo === "orden" ? ordenRecord : operacionRecord;
  const registroOtro   = origen.tipo === "orden" ? operacionRecord : ordenRecord;

  // ── 3. Precondición dura de items (Reservado, sin Factura previa) ───────────
  const detalleItems = await fetchDetalleItems(cuenta.items.map((i) => i.id));
  const itemsNoListos: ItemNoListo[] = [];
  for (const item of cuenta.items) {
    const bloqueo = evaluarItemNoListo(item, detalleItems.get(item.id));
    if (bloqueo) itemsNoListos.push(bloqueo);
  }
  if (itemsNoListos.length > 0) {
    return { bloqueado: true, motivo: "ITEMS_NO_LISTOS", itemsNoListos };
  }

  // ── 3b. Precondición dura de productos digitales (nombre y precio) ──────────
  // Sin esto, un producto digital sin nombre limpio o sin precio generaría
  // una línea rota (sin descripción, o de $0) e importeTotal volvería a
  // quedar corto en silencio — exactamente el fallo que este trabajo
  // arregla, solo que a medias.
  const productosDigitalesNoListos: ProductoDigitalNoListo[] = [];
  for (const producto of cuenta.productosDigitales) {
    const bloqueo = evaluarProductoDigitalNoListo(producto);
    if (bloqueo) productosDigitalesNoListos.push(bloqueo);
  }
  if (productosDigitalesNoListos.length > 0) {
    return { bloqueado: true, motivo: "PRODUCTOS_DIGITALES_SIN_PRECIO", productosDigitalesNoListos };
  }

  // ── 4. Cliente (link real de la orden/operación) ────────────────────────────
  const clienteIdsOrigen = linkedIds(registroOrigen?.fields["Cliente"]);
  const clienteIds = clienteIdsOrigen.length > 0 ? clienteIdsOrigen : linkedIds(registroOtro?.fields["Cliente"]);
  const clienteRecord = clienteIds[0] ? await fetchCliente(clienteIds[0]) : null;

  const clienteCedula = clienteRecord ? firstString(clienteRecord.fields["Cédula"]) : "";
  const clienteNombre = clienteRecord ? firstString(clienteRecord.fields["Nombre"]) : "";
  const clienteCorreo = clienteRecord ? firstString(clienteRecord.fields["Correo"]) : "";

  const tipoIdentificacionComprador = clienteRecord && clienteCedula
    ? derivarTipoIdentificacion(clienteCedula)
    : "07";
  const razonSocialComprador = clienteRecord && clienteNombre ? clienteNombre.toUpperCase() : "CONSUMIDOR FINAL";
  const identificacionComprador = clienteRecord && clienteCedula ? clienteCedula : "9999999999999";

  // ── 5. Líneas: productos + servicios + productos digitales ──────────────────
  const detallesProducto: DetalleFactura[] = cuenta.items.map((item) =>
    construirLineaProducto(item, detalleItems.get(item.id))
  );
  const detallesServicio: DetalleFactura[] = cuenta.servicios.map((servicio, i) =>
    construirLineaServicio(servicio, i + 1)
  );
  // Repuestos de la tabla histórica: entran a la factura solo cuando cuentan
  // para el total de la cuenta (mismo criterio que usa cuenta.totalCuenta), de
  // forma que importeTotal y totalCuenta no puedan discrepar.
  const detallesRepuestoHistorico: DetalleFactura[] = cuenta.repuestosHistoricosCuentanParaTotal
    ? cuenta.repuestosHistoricos.map((r, i) => construirLineaRepuestoHistorico(r, i + 1))
    : [];
  // Productos digitales: siempre de la orden (cuenta.productosDigitales ya lo
  // garantiza — ver lib/cuenta-unificada/index.ts). La precondición de arriba
  // (3b) ya descartó los que no tienen precio utilizable, así que todos los
  // que llegan aquí producen una línea válida.
  const detallesProductoDigital: DetalleFactura[] = cuenta.productosDigitales.map((p, i) =>
    construirLineaProductoDigital(p, i + 1)
  );
  const detalles = [...detallesProducto, ...detallesRepuestoHistorico, ...detallesServicio, ...detallesProductoDigital];

  // ── 6. Totales agrupados por tarifa ───────────────────────────────────────────
  const totalConImpuestos = agruparTotalConImpuestos(detalles);
  const totalSinImpuestos = round2(detalles.reduce((s, d) => s + d.precioTotalSinImpuesto, 0));
  const totalIva          = round2(totalConImpuestos.reduce((s, t) => s + t.valor, 0));
  const importeTotal       = round2(totalSinImpuestos + totalIva);

  // ── 7. Formas de pago: abonos reales (no anulados) + saldo pendiente ─────────
  const abonosVigentes = cuenta.abonos.filter(esAbonoVigente);
  const pagos = calcularFormasPago(abonosVigentes, importeTotal);

  const datosVenta: DatosVenta = {
    tipoIdentificacionComprador,
    razonSocialComprador,
    identificacionComprador,
    correoComprador: clienteCorreo || undefined,
    detalles,
    totalSinImpuestos,
    totalDescuento: 0,
    totalConImpuestos,
    importeTotal,
    pagos,
    origen,
    clienteRecordId: clienteRecord?.id,
  };

  return {
    bloqueado: false,
    origen,
    ordenIdVisible:  cuenta.ordenIdVisible,
    operacionCodigo: cuenta.operacionCodigo,
    datosVenta,
  };
}
