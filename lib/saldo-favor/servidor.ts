import "server-only";

// Saldo a favor del cliente — acciones del SERVIDOR (auditoría ops, punto 13B).
// Las reglas viven en ./reglas.ts (puras, con pruebas); aquí se lee la cuenta
// real, se valida y se escribe: el abono de la cuenta, el movimiento del
// saldo y su asiento en Finanzas.
//
// Ejemplos del día a día:
//   · Pasar a saldo a favor — el cliente pagó $100 por una reparación que al
//     final costó $80. En la orden: "−$20 Pasado a saldo a favor"; la cuenta
//     queda en $0 y el cliente tiene $20 para su próxima compra.
//   · Devolver — el mismo caso, pero el cliente quiere sus $20: el
//     administrador elige SGINGRESOS, transferencia y número; en la orden
//     queda "−$20 Devuelto al cliente" y en Finanzas sale $20 de SGINGRESOS.
//   · Usar — el cliente vuelve con un cargador de $35: en "Registrar pago"
//     elige "Saldo a favor ($20)", y paga los $15 restantes en efectivo.
//
// Finanzas (decisión del dueño, 28-oct-2026; mismo criterio que las NC):
//   · al generarse: Egreso "Saldo a favor de cliente" SIN cuenta (deja de ser
//     venta, no mueve caja);
//   · al usarse:    Ingreso "Saldo a favor de cliente" SIN cuenta (vuelve a ser venta);
//   · al devolver:  Egreso "Devolución" DESDE la cuenta real (sí sale dinero).
//
// Orden de escritura: primero el abono (la cuenta queda en $0), luego el
// movimiento del saldo; si este falla, se anula el abono para no dejar la
// cuenta en $0 sin el saldo del cliente. Finanzas va al final y nunca
// bloquea (mismo criterio que el puente de abonos): si falla, se avisa.

import { isAdministratorRole } from "@/lib/apps";
import { withLock } from "@/lib/concurrencia";
import { getCuentaUnificada } from "@/lib/cuenta-unificada";
import { verificarAbonoPermitido } from "@/lib/facturacion/gancho/cobroOrigen";
import { validarSolicitudReembolso, type SolicitudReembolso } from "@/lib/facturacion/notaCredito/reembolso";
import { fetchRecordById, firstLinkedId, linkedIds } from "@/lib/finanzas/airtable-client";
import { fetchCuentaById } from "@/lib/finanzas/cuentas";
import { crearMovimiento } from "@/lib/finanzas/movimientos";
import { crearAbono } from "@/lib/operaciones/airtable";
import { anularAbonoPorOrden, createAbonoPorOrden } from "@/lib/tecnicos/airtable";
import type { StaffSession } from "@/lib/session";
import {
  actualizarMovimientoSaldo,
  anularMovimientoSaldo,
  crearMovimientoSaldo,
  movimientosDeCliente,
  movimientosPorIds,
  CAMPO_INVERSO,
} from "./airtable";
import {
  METODO_SALDO_A_FAVOR,
  calcularSaldoCliente,
  descripcionMovimiento,
  observacionAbonoSalida,
  validarDevolverSobrante,
  validarPasarASaldo,
  validarUsoDeSaldo,
  venceDe,
  type SaldoCliente,
} from "./reglas";

export const CATEGORIA_SALDO = "Saldo a favor de cliente";
/** Método del abono negativo de una devolución (no es un método de cobro). */
export const METODO_DEVOLUCION = "Devolución";

export type OrigenCuenta = { tipo: "orden" | "operacion"; recordId: string };
export type ResultadoSaldo<T = Record<string, unknown>> =
  | ({ ok: true; warning?: string | null } & T)
  | { ok: false; error: string; status: number };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const dinero = (n: number) => `$${r2(n).toFixed(2)}`;
const FALLA = (error: string, status = 400) => ({ ok: false as const, error, status });

/** "aaaa-mm-dd" en Ecuador (UTC−5). */
export function hoyEcuador(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

function nombreUsuario(session: StaffSession): string {
  return session.user.nombre?.trim() || session.user.email?.trim() || "Portal";
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

/** Saldo a favor de un cliente hoy. */
export async function saldoDeCliente(clienteId: string): Promise<SaldoCliente> {
  return calcularSaldoCliente(await movimientosDeCliente(clienteId), hoyEcuador());
}

type DatosCuenta = {
  cuenta: Awaited<ReturnType<typeof getCuentaUnificada>>;
  clienteId: string | null;
  clienteNombre: string;
  ordenId: string | null;
  operacionId: string | null;
  etiqueta: string;
};

async function leerCuenta(origen: OrigenCuenta): Promise<DatosCuenta> {
  const cuenta = await getCuentaUnificada(origen.tipo === "orden" ? { ordenId: origen.recordId } : { operacionId: origen.recordId });
  let clienteId: string | null = null;
  if (cuenta.ordenId) {
    const orden = await fetchRecordById("Órdenes de Reparación", cuenta.ordenId);
    clienteId = firstLinkedId(orden?.fields["Cliente"]);
  }
  if (!clienteId && cuenta.operacionId) {
    const op = await fetchRecordById("Operación Comercial", cuenta.operacionId);
    clienteId = firstLinkedId(op?.fields["Cliente"]);
  }
  const cliente = clienteId ? await fetchRecordById("Clientes", clienteId) : null;
  const clienteNombre = typeof cliente?.fields["Nombre"] === "string" ? (cliente.fields["Nombre"] as string) : "";
  return {
    cuenta,
    clienteId,
    clienteNombre,
    ordenId: cuenta.ordenId,
    operacionId: cuenta.operacionId,
    etiqueta: cuenta.ordenIdVisible ?? cuenta.operacionCodigo ?? origen.recordId,
  };
}

/** Saldo del cliente de una cuenta (para la pantalla de la orden o el pedido). */
export async function saldoDeLaCuenta(origen: OrigenCuenta): Promise<{ clienteId: string | null; saldo: SaldoCliente | null }> {
  const d = await leerCuenta(origen);
  return { clienteId: d.clienteId, saldo: d.clienteId ? await saldoDeCliente(d.clienteId) : null };
}

// ─── Abonos de la cuenta ─────────────────────────────────────────────────────

async function crearAbonoEnCuenta(input: {
  origen: OrigenCuenta;
  datos: DatosCuenta;
  monto: number;
  metodo: string;
  observacion: string;
  numeroTransaccion?: string;
  registradoPor: string;
}): Promise<string> {
  const hoy = hoyEcuador();
  if (input.origen.tipo === "orden") {
    const r = await createAbonoPorOrden({
      ordenRecordId: input.origen.recordId,
      fecha: hoy,
      monto: input.monto,
      metodoPago: input.metodo,
      observacion: input.observacion,
      numeroTransaccion: input.numeroTransaccion ?? null,
      registradoPor: input.registradoPor,
    });
    return r.abono.id;
  }
  const r = await crearAbono({
    operacionId: input.origen.recordId,
    ordenId: input.datos.ordenId,
    monto: input.monto,
    metodoPago: input.metodo,
    fechaAbono: new Date().toISOString(),
    numeroTransaccion: input.numeroTransaccion,
    observacion: input.observacion,
    registradoPor: input.registradoPor,
  });
  return r.id;
}

async function enlazarMovimientoFinanciero(saldoId: string | null, movimientoId: string): Promise<void> {
  if (saldoId) await actualizarMovimientoSaldo(saldoId, { "Movimiento Financiero": [movimientoId] });
}

// ─── Pasar a saldo a favor ───────────────────────────────────────────────────

export async function pasarCuentaASaldoAFavor(input: { origen: OrigenCuenta; session: StaffSession }): Promise<ResultadoSaldo<{ monto: number; codigo: string }>> {
  return withLock(`saldo-cuenta:${input.origen.recordId}`, async () => {
    let d: DatosCuenta;
    try { d = await leerCuenta(input.origen); } catch (e) {
      console.error("[saldo-favor] No se pudo leer la cuenta:", e);
      return FALLA("No se pudo leer la cuenta. Intenta de nuevo.", 503);
    }
    const v = validarPasarASaldo({ aFavorCuenta: d.cuenta.saldo < 0 ? -d.cuenta.saldo : 0, clienteId: d.clienteId });
    if (!v.ok) return FALLA(v.motivo);
    const clienteId = d.clienteId!;
    const registradoPor = nombreUsuario(input.session);
    const fecha = new Date().toISOString();

    const abonoId = await crearAbonoEnCuenta({
      origen: input.origen, datos: d, monto: -v.monto, metodo: METODO_SALDO_A_FAVOR,
      observacion: observacionAbonoSalida("Generado"), registradoPor,
    });

    let saldo;
    try {
      saldo = await crearMovimientoSaldo({
        descripcion: descripcionMovimiento({ tipo: "Generado", monto: v.monto, cliente: d.clienteNombre, referencia: d.etiqueta }),
        clienteId, tipo: "Generado", monto: v.monto, fecha, vence: venceDe(fecha),
        ordenId: d.ordenId, operacionId: d.operacionId, abonoId,
        motivo: `Sobrante de la cuenta ${d.etiqueta}.`, registradoPor,
      });
    } catch (e) {
      console.error("[saldo-favor] Falló el movimiento del saldo; se anula el abono:", e);
      await anularAbonoPorOrden({ abonoRecordId: abonoId }).catch((err) => console.error("[saldo-favor] No se pudo anular el abono", abonoId, err));
      return FALLA("No se pudo guardar el saldo a favor. No se hizo ningún cambio; intenta de nuevo.", 500);
    }

    let warning: string | null = null;
    try {
      const mov = await crearMovimiento(
        {
          tipo: "Egreso", origen: "Abonos", categoria: CATEGORIA_SALDO, monto: v.monto,
          cuentaOrigenId: null, estado: "Confirmado", estadoDistribucion: "No aplica", metodo: "No aplica", fecha,
          observacion: `Saldo a favor de ${d.clienteNombre || "cliente"} (${d.etiqueta}): sobrante de la cuenta. No mueve caja.`,
          registradoPor, abonoId, clienteId,
        },
        { permitirCuentaFaltante: true },
      );
      await enlazarMovimientoFinanciero(saldo.id, mov.id);
    } catch (e) {
      console.error("[saldo-favor] No se pudo registrar en Finanzas:", e);
      warning = "El saldo a favor quedó guardado, pero no se pudo registrar en Finanzas. Avísale al administrador.";
    }
    return { ok: true, monto: v.monto, codigo: saldo.codigo, warning };
  });
}

// ─── Devolver el sobrante ────────────────────────────────────────────────────

export async function devolverSobranteDeCuenta(input: {
  origen: OrigenCuenta;
  session: StaffSession;
  solicitud: SolicitudReembolso;
}): Promise<ResultadoSaldo<{ monto: number }>> {
  return withLock(`saldo-cuenta:${input.origen.recordId}`, async () => {
    let d: DatosCuenta;
    try { d = await leerCuenta(input.origen); } catch (e) {
      console.error("[saldo-favor] No se pudo leer la cuenta:", e);
      return FALLA("No se pudo leer la cuenta. Intenta de nuevo.", 503);
    }
    const v = validarDevolverSobrante({
      aFavorCuenta: d.cuenta.saldo < 0 ? -d.cuenta.saldo : 0,
      esAdministrador: isAdministratorRole(input.session.user.rol),
    });
    if (!v.ok) return FALLA(v.motivo, isAdministratorRole(input.session.user.rol) ? 400 : 403);

    const cuentaId = typeof input.solicitud?.cuentaOrigenId === "string" ? input.solicitud.cuentaOrigenId.trim() : "";
    const cuentaFin = cuentaId ? await fetchCuentaById(cuentaId).catch(() => null) : null;
    const sol = validarSolicitudReembolso(
      input.solicitud,
      cuentaFin ? { id: cuentaFin.id, nombre: cuentaFin.nombre, tipo: String(cuentaFin.tipo), activa: cuentaFin.activa } : null,
    );
    if (!sol.ok) return FALLA(sol.motivo);
    const registradoPor = nombreUsuario(input.session);
    const ref = sol.datos.transaccionId ? `, ref. ${sol.datos.transaccionId}` : "";
    const detalle = `${sol.datos.metodo} desde ${sol.datos.cuentaOrigenNombre}${ref}`;

    const abonoId = await crearAbonoEnCuenta({
      origen: input.origen, datos: d, monto: -v.monto, metodo: METODO_DEVOLUCION,
      observacion: observacionAbonoSalida("Devuelto", detalle), numeroTransaccion: sol.datos.transaccionId, registradoPor,
    });

    // Aquí SÍ sale dinero: si Finanzas falla, se avisa fuerte.
    let warning: string | null = null;
    try {
      await crearMovimiento({
        tipo: "Egreso", origen: "Abonos", categoria: "Devolución", monto: v.monto,
        cuentaOrigenId: sol.datos.cuentaOrigenId, estado: "Confirmado", estadoDistribucion: "No aplica",
        metodo: sol.datos.metodo, transaccionId: sol.datos.transaccionId, fecha: new Date().toISOString(),
        observacion: `Devolución a ${d.clienteNombre || "cliente"} del sobrante de ${d.etiqueta}: ${detalle}.`,
        registradoPor, abonoId, clienteId: d.clienteId ?? undefined,
      });
    } catch (e) {
      console.error("[saldo-favor] No se pudo registrar la devolución en Finanzas:", e);
      warning = `La devolución quedó en la cuenta, pero NO se registró la salida de ${dinero(v.monto)} en Finanzas. Regístrala a mano en ${sol.datos.cuentaOrigenNombre}.`;
    }
    return { ok: true, monto: v.monto, warning };
  });
}

// ─── Usar el saldo como pago ─────────────────────────────────────────────────

export async function usarSaldoEnCuenta(input: {
  origen: OrigenCuenta;
  session: StaffSession;
  monto: number;
}): Promise<ResultadoSaldo<{ monto: number; abonoId: string }>> {
  let d: DatosCuenta;
  try { d = await leerCuenta(input.origen); } catch (e) {
    console.error("[saldo-favor] No se pudo leer la cuenta:", e);
    return FALLA("No se pudo leer la cuenta. Intenta de nuevo.", 503);
  }
  if (!d.clienteId) return FALLA("La cuenta no tiene cliente.");
  const clienteId = d.clienteId;
  return withLock(`saldo-cliente:${clienteId}`, async () => {
    const saldo = await saldoDeCliente(clienteId);
    const v = validarUsoDeSaldo({ monto: input.monto, disponible: saldo.disponible, porCobrar: Math.max(0, d.cuenta.saldo) });
    if (!v.ok) return FALLA(v.motivo);
    const noPermitido = await verificarAbonoPermitido(input.origen, v.monto);
    if (noPermitido) return FALLA(noPermitido.error, noPermitido.status);

    const registradoPor = nombreUsuario(input.session);
    const fecha = new Date().toISOString();
    const abonoId = await crearAbonoEnCuenta({
      origen: input.origen, datos: d, monto: v.monto, metodo: METODO_SALDO_A_FAVOR,
      observacion: "Pagado con saldo a favor del cliente", registradoPor,
    });
    let mov;
    try {
      mov = await crearMovimientoSaldo({
        descripcion: descripcionMovimiento({ tipo: "Usado", monto: v.monto, cliente: d.clienteNombre, referencia: d.etiqueta }),
        clienteId, tipo: "Usado", monto: v.monto, fecha,
        ordenId: d.ordenId, operacionId: d.operacionId, abonoId,
        motivo: `Pago de la cuenta ${d.etiqueta}.`, registradoPor,
      });
    } catch (e) {
      console.error("[saldo-favor] Falló el movimiento Usado; se anula el abono:", e);
      await anularAbonoPorOrden({ abonoRecordId: abonoId }).catch((err) => console.error("[saldo-favor] No se pudo anular el abono", abonoId, err));
      return FALLA("No se pudo usar el saldo a favor. No se hizo ningún cambio; intenta de nuevo.", 500);
    }
    let warning: string | null = null;
    try {
      const fin = await crearMovimiento(
        {
          tipo: "Ingreso", origen: "Abonos", categoria: CATEGORIA_SALDO, monto: v.monto,
          cuentaDestinoId: null, estado: "Confirmado", estadoDistribucion: "Sin distribuir", metodo: "No aplica", fecha,
          observacion: `Pago de ${d.etiqueta} con saldo a favor de ${d.clienteNombre || "cliente"}. No es dinero nuevo.`,
          registradoPor, abonoId, clienteId,
        },
        { permitirCuentaFaltante: true },
      );
      await enlazarMovimientoFinanciero(mov.id, fin.id);
    } catch (e) {
      console.error("[saldo-favor] No se pudo registrar el uso en Finanzas:", e);
      warning = "El pago con saldo a favor quedó registrado, pero no se pudo anotar en Finanzas. Avísale al administrador.";
    }
    return { ok: true, monto: v.monto, abonoId, warning };
  });
}

// ─── Anular un abono que mueve el saldo ──────────────────────────────────────

/**
 * Antes de anular un abono, revisa si es parte del saldo a favor:
 *   · "Pagado con saldo a favor" (Usado): se anula también el Usado; el
 *     cliente recupera ese saldo. Ej.: se usó $20 en la orden equivocada.
 *   · "Pasado a saldo a favor" (Generado): solo si el cliente todavía tiene
 *     ese saldo sin usar; se anula el Generado y el dinero vuelve a la cuenta.
 *   · "Devuelto al cliente": no se anula desde aquí (el dinero ya salió).
 * Devuelve null si el abono no toca el saldo (se anula como siempre).
 */
export async function prepararAnulacionDeAbono(abonoId: string): Promise<{ ok: true; despues: () => Promise<void> } | { ok: false; error: string; status: number } | null> {
  const abono = await fetchRecordById("Abonos", abonoId);
  if (!abono) return null;
  const metodo = typeof abono.fields["Método de Pago"] === "string" ? (abono.fields["Método de Pago"] as string) : "";
  if (metodo === METODO_DEVOLUCION) {
    return FALLA("Una devolución no se anula desde la orden: el dinero ya salió de la cuenta. Pídele al administrador que la corrija en Finanzas.", 409);
  }
  const ids = linkedIds(abono.fields[CAMPO_INVERSO]);
  if (!ids.length) return null;
  const movs = (await movimientosPorIds(ids)).filter((m) => m.estado !== "Anulado");
  if (!movs.length) return null;
  const generado = movs.find((m) => m.tipo === "Generado");
  if (generado && generado.clienteId) {
    const saldo = await saldoDeCliente(generado.clienteId);
    const lote = saldo.lotes.find((l) => l.id === generado.id);
    if (!lote || lote.restante + 0.01 < generado.monto) {
      return FALLA(`El cliente ya usó parte de ese saldo a favor (${generado.codigo}). No se puede anular este movimiento.`, 409);
    }
  }
  return {
    ok: true,
    despues: async () => {
      for (const m of movs) await anularMovimientoSaldo(m.id, `abono ${abonoId} anulado en la cuenta.`);
    },
  };
}

// ─── Reserva liberada → saldo a favor ────────────────────────────────────────

/**
 * Lo abonado a una reserva liberada (a mano o por el proceso diario) pasa al
 * saldo a favor del cliente. Ej.: Karina Flores apartó un adaptador UGREEN
 * con $10 y no volvió; el 20-oct se liberó sola → Generado $10, vence 20-abr.
 *
 * Idempotente: si la reserva ya tiene su "Generado" vigente, no hace nada.
 * `fecha` = cuándo se liberó (para la migración de las reservas viejas).
 */
export async function generarSaldoPorReserva(input: {
  reservaId: string;
  fecha?: string;
  registradoPor: string;
}): Promise<{ estado: "creado"; codigo: string; monto: number } | { estado: "omitido"; motivo: string }> {
  const reserva = await fetchRecordById("Reservas", input.reservaId);
  if (!reserva) return { estado: "omitido", motivo: "La reserva no existe." };
  const f = reserva.fields;
  const estado = typeof f["Estado"] === "string" ? f["Estado"] : "";
  if (estado !== "Liberada") return { estado: "omitido", motivo: `La reserva está ${estado || "sin estado"}, no liberada.` };
  const monto = r2(typeof f["Saldo a Favor Generado"] === "number" ? (f["Saldo a Favor Generado"] as number) : 0);
  if (!(monto > 0.01)) return { estado: "omitido", motivo: "La reserva no dejó saldo a favor." };
  const clienteId = firstLinkedId(f["Cliente"]);
  if (!clienteId) return { estado: "omitido", motivo: "La reserva no tiene cliente enlazado." };
  const previos = (await movimientosPorIds(linkedIds(f[CAMPO_INVERSO]))).filter((m) => m.estado !== "Anulado" && m.tipo === "Generado");
  if (previos.length) return { estado: "omitido", motivo: `Ya tiene su saldo a favor (${previos[0].codigo}).` };

  const numero = typeof f["Número"] === "string" ? (f["Número"] as string) : input.reservaId;
  const cliente = typeof f["Cliente Nombre"] === "string" ? (f["Cliente Nombre"] as string) : "";
  const fecha = input.fecha ?? new Date().toISOString();
  const saldo = await crearMovimientoSaldo({
    descripcion: descripcionMovimiento({ tipo: "Generado", monto, cliente, referencia: numero }),
    clienteId, tipo: "Generado", monto, fecha, vence: venceDe(fecha),
    reservaId: input.reservaId, motivo: `Abonos de la reserva ${numero}, liberada sin completar el pago.`,
    registradoPor: input.registradoPor,
  });
  try {
    const mov = await crearMovimiento(
      {
        tipo: "Egreso", origen: "Abonos", categoria: CATEGORIA_SALDO, monto,
        cuentaOrigenId: null, estado: "Confirmado", estadoDistribucion: "No aplica", metodo: "No aplica", fecha,
        observacion: `Saldo a favor de ${cliente || "cliente"}: abonos de la reserva liberada ${numero}. No mueve caja.`,
        registradoPor: input.registradoPor, clienteId,
      },
      { permitirCuentaFaltante: true },
    );
    await enlazarMovimientoFinanciero(saldo.id, mov.id);
  } catch (e) {
    console.error("[saldo-favor] Reserva liberada: no se pudo registrar en Finanzas", numero, e);
  }
  return { estado: "creado", codigo: saldo.codigo, monto };
}
