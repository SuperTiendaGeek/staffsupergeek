import "server-only";

import { getCuentaUnificada } from "@/lib/cuenta-unificada";
import type { GetCuentaUnificadaInput } from "@/types/cuenta-unificada";

import type { DatosVenta, OrigenGancho } from "../emitirFactura";
import type { DetalleFactura, TotalImpuesto, Pago } from "../types/factura";
import {
  fetchOrden, fetchOperacion, fetchCliente, fetchDetalleItems,
  linkedIds, firstString,
} from "./airtableGancho";
import { buscarFacturaBloqueante } from "./idempotencia";
import type { FacturaVinculadaGancho } from "./airtableGancho";
import {
  SERVICIO_IVA_DEFAULT, TARIFA_IVA_SRI, TARIFA_IVA_ITEM_DEFAULT,
  MAPA_METODO_PAGO_SRI, FORMA_PAGO_SALDO_DEFAULT, FORMA_PAGO_FALLBACK,
} from "./config";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type ItemNoListo = {
  id:      string;
  nombre:  string;
  motivo:  "NO_RESERVADO" | "YA_FACTURADO";
};

export type PreFacturaInput = { ordenId: string } | { operacionId: string };

export type PreFacturaBloqueada = {
  bloqueado:        true;
  motivo:           "FACTURA_EXISTENTE" | "ITEMS_NO_LISTOS";
  facturaExistente?: FacturaVinculadaGancho;
  itemsNoListos?:    ItemNoListo[];
};

export type PreFacturaLista = {
  bloqueado:        false;
  origen:           OrigenGancho;
  ordenIdVisible:    string | null;
  operacionCodigo:   string | null;
  datosVenta:        DatosVenta; // datosVenta.origen y .clienteRecordId siempre presentes aquí
};

export type ResultadoPreFactura = PreFacturaBloqueada | PreFacturaLista;

// ─── Derivar tipo de identificación (Decisión, ver diseño §4.1) ──────────────

function derivarTipoIdentificacion(cedula: string): "04" | "05" | "07" {
  const limpio = cedula.replace(/\D/g, "");
  if (limpio.length === 13 && limpio.endsWith("001")) return "04";
  if (limpio.length === 10) return "05";
  return "07";
}

// ─── Función principal ────────────────────────────────────────────────────────

/**
 * Traduce la cuenta unificada de una orden/operación a una pre-factura
 * (DatosVenta editable) o a un bloqueo con el detalle de por qué no se
 * puede generar todavía.
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
    const detalle = detalleItems.get(item.id);
    if (!detalle) continue;
    if (detalle.tieneFacturaPrevia) {
      itemsNoListos.push({ id: item.id, nombre: item.nombre, motivo: "YA_FACTURADO" });
    } else if (!detalle.reservado) {
      itemsNoListos.push({ id: item.id, nombre: item.nombre, motivo: "NO_RESERVADO" });
    }
  }
  if (itemsNoListos.length > 0) {
    return { bloqueado: true, motivo: "ITEMS_NO_LISTOS", itemsNoListos };
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

  // ── 5. Líneas: productos (Shipping Items) ────────────────────────────────────
  const detallesProducto: DetalleFactura[] = cuenta.items.map((item) => {
    const detalle = detalleItems.get(item.id);
    const tarifaKey = detalle?.tarifaIva || "15%";
    const { codigoPorcentaje, tarifa } = TARIFA_IVA_SRI[tarifaKey] ?? TARIFA_IVA_ITEM_DEFAULT;
    const base = round2(item.precio);
    const valorIva = round2(base * (tarifa / 100));
    return {
      codigoPrincipal: detalle?.sku || undefined,
      descripcion:     item.nombre,
      cantidad:        1,
      precioUnitario:  item.precio,
      descuento:       0,
      precioTotalSinImpuesto: base,
      impuestos: [{ codigo: "2", codigoPorcentaje, tarifa, baseImponible: base, valor: valorIva }],
      tipo:           "producto",
      shippingItemId: item.id,
    };
  });

  // ── 6. Líneas: servicios ──────────────────────────────────────────────────────
  const detallesServicio: DetalleFactura[] = cuenta.servicios.map((servicio, i) => {
    const { codigoPorcentaje, tarifa } = SERVICIO_IVA_DEFAULT;
    const base = round2(servicio.costo);
    const valorIva = round2(base * (tarifa / 100));
    return {
      codigoPrincipal: `SRV-${i + 1}`,
      descripcion:     servicio.nombre,
      cantidad:        1,
      precioUnitario:  servicio.costo,
      descuento:       0,
      precioTotalSinImpuesto: base,
      impuestos: [{ codigo: "2", codigoPorcentaje, tarifa, baseImponible: base, valor: valorIva }],
      tipo: "servicio",
    };
  });

  const detalles = [...detallesProducto, ...detallesServicio];

  // ── 7. Totales agrupados por tarifa ───────────────────────────────────────────
  const ivaMap = new Map<string, { base: number; valor: number; tarifa: number }>();
  for (const d of detalles) {
    for (const imp of d.impuestos) {
      const prev = ivaMap.get(imp.codigoPorcentaje) ?? { base: 0, valor: 0, tarifa: imp.tarifa };
      ivaMap.set(imp.codigoPorcentaje, {
        base:   round2(prev.base + imp.baseImponible),
        valor:  round2(prev.valor + imp.valor),
        tarifa: imp.tarifa,
      });
    }
  }
  const totalConImpuestos: TotalImpuesto[] = [...ivaMap.entries()].map(([cp, v]) => ({
    codigo: "2", codigoPorcentaje: cp, baseImponible: v.base, tarifa: v.tarifa, valor: v.valor,
  }));

  const totalSinImpuestos = round2(detalles.reduce((s, d) => s + d.precioTotalSinImpuesto, 0));
  const totalIva          = round2(totalConImpuestos.reduce((s, t) => s + t.valor, 0));
  const importeTotal       = round2(totalSinImpuestos + totalIva);

  // ── 8. Formas de pago: abonos reales (no anulados) + saldo pendiente ─────────
  const abonosVigentes = cuenta.abonos.filter((a) => a.estado !== "Anulado");
  const pagos: Pago[] = abonosVigentes.map((a) => ({
    formaPago: (a.metodoPago && MAPA_METODO_PAGO_SRI[a.metodoPago]) || FORMA_PAGO_FALLBACK,
    total:     round2(a.monto),
  }));

  const sumaAbonos      = round2(pagos.reduce((s, p) => s + p.total, 0));
  const saldoPendiente  = round2(importeTotal - sumaAbonos);

  if (saldoPendiente > 0.01) {
    pagos.push({ formaPago: FORMA_PAGO_SALDO_DEFAULT, total: saldoPendiente });
  } else if (saldoPendiente < -0.01) {
    // No debería pasar por construcción (se factura totalCuenta, nunca menos
    // de lo abonado) — si aparece, hay un desfase entre esta reconstrucción
    // y los rollups de getCuentaUnificada(); se loguea para revisar a mano,
    // no se bloquea la pre-factura (el humano la revisa antes de emitir).
    console.warn(
      `[gancho] Suma de abonos ($${sumaAbonos}) excede el total calculado ($${importeTotal}) ` +
      `para ${origen.tipo}=${origen.recordId}. Revisar manualmente antes de emitir.`
    );
  }
  if (pagos.length === 0) {
    // Cuenta en $0 sin abonos: el SRI exige al menos una forma de pago.
    pagos.push({ formaPago: FORMA_PAGO_SALDO_DEFAULT, total: importeTotal });
  }

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
