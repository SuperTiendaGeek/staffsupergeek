import "server-only";

// Puente Recibo → Movimientos Financieros, para el recibo emitido DESDE una
// orden/operación (gancho de cuenta unificada).
//
// El recibo de mostrador ya tenía su propio asiento simple en
// lib/facturacion/recibos/efectos.ts (registrarIngresoRecibo): un Ingreso por
// el total, categoría "Venta Mostrador". Eso es correcto cuando nadie pagó
// nada antes. Pero una orden de reparación casi siempre llega con abonos ya
// cobrados y YA registrados en /finanzas (puente de Abonos). Registrar el
// total otra vez contaría ese dinero dos veces.
//
// Así que aquí se hace lo mismo que hace la factura (ver
// lib/finanzas/puentes/facturacion.ts, procesarConOrigen): los movimientos de
// los abonos vigentes se marcan como documentados —enlazándolos al recibo— y
// solo se crea un movimiento nuevo por el SALDO, que es el dinero que se está
// cobrando recién en este momento.

import { esAbonoVigente } from "@/types/cuenta-unificada";
import { getCuentaUnificada } from "@/lib/cuenta-unificada";
import type { OrigenGancho } from "@/lib/facturacion/emitirFactura";
import type { CategoriaMovimiento, EstadoMovimiento, MetodoMovimiento } from "@/types/finanzas";
import { fetchCuentaPorNombre } from "../cuentas";
import { actualizarMovimiento, crearMovimiento, fetchMovimientoById } from "../movimientos";
import { fetchRecordById, firstLinkedId } from "../airtable-client";

const AMBIENTE_PRODUCCION = "2";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Mismo mapa que usa el recibo de mostrador (efectos.ts) y el puente de
// facturación: código SRI de forma de pago → cuenta / estado / método.
const MAPA_FORMA_PAGO: Record<string, { cuenta: string; estado: EstadoMovimiento; metodo: MetodoMovimiento } | null> = {
  "01": { cuenta: "Caja Registradora",   estado: "Confirmado", metodo: "Efectivo" },
  "16": { cuenta: "Tarjetas en Tránsito", estado: "Pendiente",  metodo: "Tarjeta débito" },
  "19": { cuenta: "Tarjetas en Tránsito", estado: "Pendiente",  metodo: "Tarjeta crédito" },
  "18": { cuenta: "Tarjetas en Tránsito", estado: "Pendiente",  metodo: "Tarjeta débito" },
  "17": { cuenta: "SGINGRESOS",           estado: "Confirmado", metodo: "Dinero electrónico" },
  "15": null, "20": null, "21": null,
};

export type PuenteReciboInput = {
  reciboRecordId:   string;
  numeroRecibo:     string;
  origen:           OrigenGancho;
  /** Total del recibo tal como se guardó (ya con descuentos aplicados). */
  total:            number;
  /** Código SRI de la forma de pago con la que se cobró el saldo. */
  formaPagoSaldo:   string;
  clienteRecordId?: string;
  registradoPor:    string;
  ambiente?:        string;
};

export type ResultadoPuenteRecibo = {
  estado: "OK" | "OMITIDO" | "ERROR";
  /** Monto por el que se creó un movimiento nuevo (0 si los abonos cubrían todo). */
  saldoRegistrado: number;
  /** Abonos cuyo movimiento quedó enlazado a este recibo. */
  abonosMarcados:  number;
  detalle?: string;
};

/**
 * Nunca lanza: el recibo ya existe y su PDF ya se generó cuando esto corre.
 * Un fallo aquí se reporta en el campo "Movimiento Contable" del recibo
 * (lo hace quien llama), nunca revierte el documento.
 */
export async function procesarPuenteRecibo(input: PuenteReciboInput): Promise<ResultadoPuenteRecibo> {
  // Guard de ambiente: /finanzas son datos reales compartidos — en PRUEBAS
  // nunca se tocan (mismo criterio que el puente de facturación).
  if (input.ambiente !== AMBIENTE_PRODUCCION) return { estado: "OMITIDO", saldoRegistrado: 0, abonosMarcados: 0 };
  if (input.origen.tipo === "reserva") {
    // No existe hoy un recibo desde reserva; si algún día existe, se trata
    // aparte (la reserva no tiene cuenta unificada).
    return { estado: "OMITIDO", saldoRegistrado: 0, abonosMarcados: 0 };
  }

  const problemas: string[] = [];
  let abonosMarcados = 0;
  let sumaAbonos = 0;

  try {
    const cuenta = await getCuentaUnificada(
      input.origen.tipo === "orden" ? { ordenId: input.origen.recordId } : { operacionId: input.origen.recordId }
    );
    const abonosVigentes = cuenta.abonos.filter(esAbonoVigente);
    sumaAbonos = round2(abonosVigentes.reduce((s, a) => s + a.monto, 0));

    for (const abono of abonosVigentes) {
      const abonoRecord = await fetchRecordById("Abonos", abono.id);
      const movimientoId = abonoRecord ? firstLinkedId(abonoRecord.fields["Movimiento Financiero"]) : null;
      if (!movimientoId) {
        problemas.push(`Abono ${abono.id} sin Movimiento Financiero — no se pudo marcar como documentado.`);
        continue;
      }
      try {
        await actualizarMovimiento(movimientoId, {
          reciboId: input.reciboRecordId,
          estadoDistribucion: "Pendiente de clasificar",
        });
        abonosMarcados += 1;
      } catch (e) {
        problemas.push(`Abono ${abono.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch (e) {
    problemas.push(`No se pudo leer la cuenta del origen: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Saldo = lo que el recibo cobra menos lo ya abonado. Mismo cálculo que
  // calcularFormasPago() en el gancho, con la misma tolerancia de centavo.
  const saldo = round2(input.total - sumaAbonos);
  let saldoRegistrado = 0;

  if (saldo > 0.01) {
    try {
      const mapeo = MAPA_FORMA_PAGO[input.formaPagoSaldo] ?? null;
      const cuentaFin = mapeo ? await fetchCuentaPorNombre(mapeo.cuenta) : null;
      await crearMovimiento(
        {
          tipo: "Ingreso",
          origen: "Facturación",
          // Misma regla que la factura: orden → servicio, operación → producto.
          categoria: (input.origen.tipo === "orden" ? "Servicio Reparación" : "Venta Producto") as CategoriaMovimiento,
          monto: saldo,
          cuentaDestinoId: cuentaFin?.id ?? null,
          estado: mapeo?.estado ?? "Confirmado",
          estadoDistribucion: "Pendiente de clasificar",
          metodo: mapeo?.metodo,
          fecha: new Date().toISOString(),
          registradoPor: input.registradoPor,
          clienteId: input.clienteRecordId,
          reciboId: input.reciboRecordId,
          observacion: `Recibo interno ${input.numeroRecibo} (documento no tributario, sin IVA) — saldo cobrado al emitir`,
        },
        { permitirCuentaFaltante: cuentaFin === null }
      );
      saldoRegistrado = saldo;
    } catch (e) {
      problemas.push(`Saldo: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else if (saldo < -0.01) {
    problemas.push(`Los abonos ($${sumaAbonos}) exceden el total del recibo ($${input.total}). Revisar manualmente.`);
  }

  if (problemas.length > 0) {
    console.error("[Finanzas] Puente de recibo con problemas", { recibo: input.numeroRecibo, problemas });
    return { estado: "ERROR", saldoRegistrado, abonosMarcados, detalle: problemas.join(" ") };
  }
  return { estado: "OK", saldoRegistrado, abonosMarcados };
}

/**
 * Reverso al anular un recibo con origen. No se puede revertir "el total":
 * los abonos previos ya estaban registrados ANTES del recibo y su dinero no
 * vuelve al cliente por anular el documento. Solo se devuelve lo que este
 * recibo llegó a registrar de verdad — el movimiento del saldo.
 *
 * Se identifica leyendo los movimientos enlazados al recibo (inverso
 * "Movimientos Financieros") y quedándose con los que NO vienen de un abono:
 * los de abono llegaron por el puente de Abonos y solo fueron marcados aquí.
 */
export async function revertirPuenteRecibo(input: {
  reciboRecordId: string;
  numeroRecibo:   string;
  movimientoIds:  string[];
  clienteRecordId?: string;
  registradoPor:  string;
  ambiente?:      string;
}): Promise<{ montoRevertido: number }> {
  if (input.ambiente !== AMBIENTE_PRODUCCION) return { montoRevertido: 0 };
  if (input.movimientoIds.length === 0) return { montoRevertido: 0 };

  let monto = 0;
  let metodo: string | undefined;
  for (const id of input.movimientoIds) {
    const mov = await fetchMovimientoById(id).catch(() => null);
    if (!mov) continue;
    if (mov.estado === "Anulado") continue;
    if (mov.abonoIds.length > 0) continue;   // vino del puente de Abonos, no de este recibo
    if (mov.tipo !== "Ingreso") continue;    // nunca revertir un egreso previo
    monto = round2(monto + mov.monto);
    metodo = metodo ?? mov.metodo;
  }
  if (!(monto > 0)) return { montoRevertido: 0 };

  const mapeo = Object.values(MAPA_FORMA_PAGO).find((m) => m && m.metodo === metodo) ?? null;
  const cuenta = mapeo ? await fetchCuentaPorNombre(mapeo.cuenta) : null;
  await crearMovimiento(
    {
      tipo: "Egreso",
      origen: "Facturación",
      categoria: "Devolución",
      monto,
      cuentaOrigenId: cuenta?.id ?? null,
      estado: "Confirmado",
      fecha: new Date().toISOString(),
      registradoPor: input.registradoPor,
      clienteId: input.clienteRecordId,
      reciboId: input.reciboRecordId,
      observacion: `Anulación del recibo interno ${input.numeroRecibo} — reversa del saldo cobrado al emitir`,
    },
    { permitirCuentaFaltante: cuenta === null }
  ).catch((e) => { console.error("[revertirPuenteRecibo]", e); });

  return { montoRevertido: monto };
}
