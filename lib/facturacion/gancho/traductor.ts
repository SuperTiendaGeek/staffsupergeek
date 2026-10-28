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
import { buscarDocumentoBloqueante } from "./idempotencia";
import type { FacturaVinculadaGancho, ReciboVinculadoGancho } from "./airtableGancho";
import {
  derivarTipoIdentificacion, construirLineaProducto, construirLineaServicio, construirLineaRepuestoHistorico,
  construirLineaProductoDigital, agruparTotalConImpuestos, evaluarItemNoListo, evaluarProductoDigitalNoListo,
  calcularFormasPago, round2, aplicarDescuentoALinea,
} from "./construccion";
import type { ItemNoListo, ProductoDigitalNoListo } from "./construccion";
import { saldoPorCobrar as calcularSaldoPorCobrar } from "../reglas/cobroDocumento";
import { descuentoPorCargo } from "@/lib/estado-cuenta/descuentos";

export type { ItemNoListo, ProductoDigitalNoListo } from "./construccion";

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type PreFacturaInput = { ordenId: string } | { operacionId: string };

export type PreFacturaBloqueada = {
  bloqueado:        true;
  motivo:           "FACTURA_EXISTENTE" | "RECIBO_EXISTENTE" | "ITEMS_NO_LISTOS" | "PRODUCTOS_DIGITALES_SIN_PRECIO" | "PRESUPUESTO_PENDIENTE" | "LINEA_NEGATIVA";
  facturaExistente?: FacturaVinculadaGancho;
  // Bloqueo cruzado: el recibo interno cierra la cuenta igual que una
  // factura (descuenta inventario y registra el ingreso), así que uno
  // vigente impide emitir cualquier otro documento de venta sobre el
  // mismo origen — ver buscarDocumentoBloqueante() en idempotencia.ts.
  reciboExistente?:  ReciboVinculadoGancho;
  itemsNoListos?:    ItemNoListo[];
  // Motivo análogo a itemsNoListos, propio de "Productos Digitales": un
  // producto vinculado a la orden sin precio utilizable (ni el fijado para
  // esta venta ni el del catálogo) — ver evaluarProductoDigitalNoListo() en
  // construccion.ts.
  productosDigitalesNoListos?: ProductoDigitalNoListo[];
  // Líneas del presupuesto que el cliente aprobó y todavía no tienen su
  // artículo (repuesto sin stock o bajo pedido aún sin pedir). Ya suman a la
  // cuenta (fase 3b); la factura/recibo espera a que el artículo exista.
  presupuestoPendiente?: Array<{ id: string; descripcion: string }>;
  // Cargos negativos en la cuenta (un descuento o ajuste registrado como
  // servicio de costo negativo, p. ej. la regularización de OR000423). Un
  // documento no puede llevar una línea negativa: se bloquea hasta que el
  // descuento tenga su propia herramienta (auditoría ops, punto 4).
  lineasNegativas?: Array<{ id: string; descripcion: string; monto: number }>;
};

export type PreFacturaLista = {
  bloqueado:        false;
  origen:           OrigenGancho;
  ordenIdVisible:    string | null;
  operacionCodigo:   string | null;
  datosVenta:        DatosVenta; // datosVenta.origen y .clienteRecordId siempre presentes aquí
  /**
   * Auditoría ops, punto 1: lo que falta cobrar de la cuenta (total − abonos
   * vigentes). Debe ser $0 para emitir: la cuenta se paga con abonos ANTES
   * del documento. Negativo = el cliente pagó de más.
   */
  saldoPorCobrar:    number;
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

  // ── 1. Idempotencia (factura O recibo vigente) ──────────────────────────────
  const documentoBloqueante = await buscarDocumentoBloqueante(origen);
  if (documentoBloqueante?.tipo === "factura") {
    return { bloqueado: true, motivo: "FACTURA_EXISTENTE", facturaExistente: documentoBloqueante.factura };
  }
  if (documentoBloqueante?.tipo === "recibo") {
    return { bloqueado: true, motivo: "RECIBO_EXISTENTE", reciboExistente: documentoBloqueante.recibo };
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

  // ── 3c. Aprobado sin artículo ───────────────────────────────────────────────
  // Regla del dueño (fase 3b): lo aprobado suma a la cuenta desde la
  // aprobación, pero la factura y el recibo ESPERAN a que el artículo exista.
  // Se usa la MISMA lista que la cuenta (cuenta.aprobadoSinArticulo), así el
  // bloqueo y el total nunca discrepan. Mientras haya algo aquí, la garantía
  // importeTotal === cuenta.totalCuenta no se pone a prueba: no se factura.
  if (cuenta.aprobadoSinArticulo.length > 0) {
    return {
      bloqueado: true,
      motivo: "PRESUPUESTO_PENDIENTE",
      presupuestoPendiente: cuenta.aprobadoSinArticulo.map((p) => ({ id: p.id, descripcion: p.nombre || "Línea sin descripción" })),
    };
  }

  // ── 3d. Cargos negativos (descuentos o ajustes registrados como servicio) ───
  const lineasNegativas = cuenta.servicios.filter((s) => s.costo < 0);
  if (lineasNegativas.length > 0) {
    return {
      bloqueado: true,
      motivo: "LINEA_NEGATIVA",
      lineasNegativas: lineasNegativas.map((s) => ({ id: s.id, descripcion: s.nombre, monto: s.costo })),
    };
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
  // Cada línea lleva su descuento de la cuenta, si tiene (punto 4B): la
  // MISMA lista que resta la calculadora, así importeTotal = cuenta.totalCuenta.
  const descuentos = descuentoPorCargo(cuenta.descuentos);
  const conDescuento = (d: DetalleFactura, cargoId: string) => aplicarDescuentoALinea(d, descuentos.get(cargoId)?.monto);
  const detallesProducto: DetalleFactura[] = cuenta.items.map((item) =>
    conDescuento(construirLineaProducto(item, detalleItems.get(item.id)), item.id)
  );
  const detallesServicio: DetalleFactura[] = cuenta.servicios.map((servicio, i) =>
    conDescuento(construirLineaServicio(servicio, i + 1), servicio.id)
  );
  // Repuestos de la tabla histórica: entran a la factura solo cuando cuentan
  // para el total de la cuenta (mismo criterio que usa cuenta.totalCuenta), de
  // forma que importeTotal y totalCuenta no puedan discrepar.
  const detallesRepuestoHistorico: DetalleFactura[] = cuenta.repuestosHistoricosCuentanParaTotal
    ? cuenta.repuestosHistoricos.map((r, i) => conDescuento(construirLineaRepuestoHistorico(r, i + 1), r.id))
    : [];
  // Productos digitales: siempre de la orden (cuenta.productosDigitales ya lo
  // garantiza — ver lib/cuenta-unificada/index.ts). La precondición de arriba
  // (3b) ya descartó los que no tienen precio utilizable, así que todos los
  // que llegan aquí producen una línea válida.
  const detallesProductoDigital: DetalleFactura[] = cuenta.productosDigitales.map((p, i) =>
    conDescuento(construirLineaProductoDigital(p, i + 1), p.id)
  );
  // Todas estas líneas son el bloque "cuenta" (auditoría ops, punto 1): no se
  // pueden cambiar al emitir — ver reglas/cobroDocumento.ts.
  const detalles = [...detallesProducto, ...detallesRepuestoHistorico, ...detallesServicio, ...detallesProductoDigital]
    .map((d) => ({ ...d, bloque: "cuenta" as const }));

  // ── 6. Totales agrupados por tarifa ───────────────────────────────────────────
  const totalConImpuestos = agruparTotalConImpuestos(detalles);
  const totalSinImpuestos = round2(detalles.reduce((s, d) => s + d.precioTotalSinImpuesto, 0));
  const totalIva          = round2(totalConImpuestos.reduce((s, t) => s + t.valor, 0));
  const importeTotal       = round2(totalSinImpuestos + totalIva);

  // ── 7. Formas de pago: abonos reales (no anulados) + saldo pendiente ─────────
  const abonosVigentes = cuenta.abonos.filter(esAbonoVigente);
  const pagos = calcularFormasPago(abonosVigentes, importeTotal);
  const saldoPorCobrar = calcularSaldoPorCobrar(importeTotal, abonosVigentes);

  const datosVenta: DatosVenta = {
    tipoIdentificacionComprador,
    razonSocialComprador,
    identificacionComprador,
    correoComprador: clienteCorreo || undefined,
    detalles,
    totalSinImpuestos,
    totalDescuento: round2(detalles.reduce((s, d) => s + (d.descuento || 0), 0)),
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
    saldoPorCobrar,
  };
}
