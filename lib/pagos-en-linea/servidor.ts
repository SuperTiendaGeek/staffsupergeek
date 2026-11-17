import "server-only";

// Caja de cobro en línea — lado servidor (punto 23 / 10D, 17-nov-2026).
// Reglas puras en ./reglas.ts; tabla en ./airtable.ts; pasarela en ./payphone.ts.
//
// Recorrido (Camila paga $205 del monitor):
//   1. abrirPagoPedido: el servidor calcula el monto con la cuenta del momento,
//      guarda el intento PL-000001 ("Abierto") y devuelve los datos de la cajita.
//   2. Camila paga en la cajita; PayPhone la devuelve a /api/publico/payphone/retorno.
//   3. procesarIntento: confirma con PayPhone (≤ 5 min), verifica código,
//      monto y moneda, guarda tarifa y neto ("Aprobado").
//   4. aplicarIntento: decide (Aplicado / En revisión), registra el abono
//      "PayPhone" UNA vez, su movimiento en Finanzas (Tarjetas en Tránsito,
//      pendiente de acreditar) y pasa por la puerta única
//      confirmarPedidoSiPagado → "Pedido confirmado".
// Cada paso se puede repetir sin duplicar el anterior: si algo falla a la
// mitad, el siguiente retorno o la siguiente visita del cliente lo completa.

import { withLock } from "@/lib/concurrencia";
import {
  airtableMutation, airtableRequest, escapeFormulaString, firstNumber, tableUrl, type AirtableListResponse,
} from "@/lib/finanzas/airtable-client";
import { crearAbono } from "@/lib/operaciones/airtable";
import { anularMovimientoDeAbono, crearMovimientoParaAbono } from "@/lib/finanzas/puentes/abonos";
import {
  avisarPedido, confirmarPedidoSiPagado, cuentaParaCobroDelPedido, pedidoIdDelToken, tokenDelPedido, RUTA_PUBLICA_PEDIDO,
} from "@/lib/pedidos-especiales/enlace";
import { hoyEcuador } from "@/lib/pedidos-especiales/retiro";
import { configPasarela, pasarelaDisponible } from "./config";
import { confirmarEnPayPhone, parametrosCajita, type ParametrosCajita } from "./payphone";
import {
  actualizarIntento, crearIntento, intentoPorCodigo, intentosDelPedido, intentosPorTransaccion, type IntentoRegistro,
} from "./airtable";
import {
  CODIGO_PAGO_REGEX, MINUTOS_VIGENCIA_CAJITA, decidirAplicacion, desgloseIva, estadoVisible, evaluarConfirmacion,
  leerDecision, minutosDesde, montoACobrar, resumenPago, tarifaYNeto, textoDecision, type ParaPago,
} from "./reglas";

const usd = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;
const llave = (pedidoId: string) => `pago-en-linea:${pedidoId}`;

// ─── 1. Abrir la cajita ─────────────────────────────────────────────────────

export type ResultadoAbrir =
  | { ok: true; codigo: string; monto: number; cajita: ParametrosCajita }
  | { ok: false; status: number; error: string };

export async function abrirPagoPedido(token: string, para: ParaPago): Promise<ResultadoAbrir> {
  const pedidoId = await pedidoIdDelToken(token);
  if (!pedidoId) return { ok: false, status: 404, error: "Este enlace no existe." };
  const config = configPasarela("PayPhone");

  return withLock(llave(pedidoId), async (): Promise<ResultadoAbrir> => {
    const cuenta = await cuentaParaCobroDelPedido(pedidoId);
    if (!pasarelaDisponible(config, cuenta.codigo)) return { ok: false, status: 409, error: "El pago con tarjeta no está disponible ahora. Puedes pagar por transferencia." };
    const m = montoACobrar(cuenta.vista, para);
    if (!m.ok) return { ok: false, status: 409, error: m.error };

    const intentos = await intentosDelPedido(pedidoId);
    if (intentos.some((i) => estadoVisible(i) === "sin_respuesta")) {
      return { ok: false, status: 409, error: "Estamos confirmando tu pago anterior. No pagues otra vez." };
    }
    const eleccion = para === "Lo que falta" ? "" : cuenta.eleccion;

    // Las cajitas abiertas que ya vencieron se marcan (solo orden en la tabla).
    const viejas = intentos.filter((i) => i.estado === "Abierto" && !i.idTransaccion && estadoVisible(i) === "vencido");
    await Promise.allSettled(viejas.map((i) => actualizarIntento(i.id, { estado: "Vencido" })));

    // Una segunda pestaña o un doble clic reusan la misma cajita (mismo código):
    // PayPhone no cobra dos veces el mismo código.
    const reusable = [...intentos].reverse().find((i) =>
      i.estado === "Abierto" && !i.idTransaccion && i.para === para && Math.abs(i.monto - m.monto) < 0.005 &&
      i.eleccion === eleccion && i.ambiente === config.ambiente && minutosDesde(i.creado) < MINUTOS_VIGENCIA_CAJITA - 2,
    );
    let intento = reusable;
    if (!intento) {
      const d = desgloseIva(m.monto);
      intento = await crearIntento({
        origen: "Pedido", pedidoId, pasarela: "PayPhone", ambiente: config.ambiente, para,
        monto: m.monto, base: d.baseC / 100, iva: d.ivaC / 100, eleccion,
      });
      intento = await actualizarIntento(intento.id, {
        pago: resumenPago({ codigo: intento.codigo, cuenta: cuenta.codigo, monto: m.monto, pasarela: "PayPhone", ambiente: config.ambiente }),
      });
    }
    const referencia = `Pedido ${cuenta.codigo}${cuenta.producto ? ` · ${cuenta.producto}` : ""}`;
    return { ok: true, codigo: intento.codigo, monto: intento.monto, cajita: parametrosCajita(config, { codigo: intento.codigo, monto: intento.monto, referencia }) };
  });
}

// ─── 2. Volvió de PayPhone ──────────────────────────────────────────────────

/** Procesa el retorno y devuelve a dónde llevar al cliente (null si el código no existe). */
export async function procesarRetornoPayPhone(idPayPhone: string, codigo: string): Promise<string | null> {
  if (!CODIGO_PAGO_REGEX.test(codigo)) return null;
  const intento = await intentoPorCodigo(codigo);
  if (!intento?.pedidoId) return null;
  const id = /^\d{1,15}$/.test(idPayPhone) ? idPayPhone : "";
  try {
    await procesarIntento(intento.pedidoId, intento.codigo, id);
  } catch (e) {
    // El cliente vuelve igual a su página: verá "Estamos confirmando tu pago".
    console.error("[pagos en línea] retorno:", e);
  }
  const token = await tokenDelPedido(intento.pedidoId);
  return token ? `${RUTA_PUBLICA_PEDIDO}/${token}?pago=${encodeURIComponent(intento.codigo)}` : null;
}

/** Visita del cliente con un pago "sin respuesta": se reintenta confirmar o aplicar. */
export async function reanudarPagosDelEnlace(token: string): Promise<void> {
  const pedidoId = await pedidoIdDelToken(token);
  if (!pedidoId) return;
  const pendientes = (await intentosDelPedido(pedidoId)).filter((i) => i.estado === "Aprobado" || (i.estado === "Abierto" && !!i.idTransaccion));
  for (const i of pendientes) {
    await procesarIntento(pedidoId, i.codigo, "").catch((e) => console.error("[pagos en línea] reanudar:", i.codigo, e));
  }
}

async function procesarIntento(pedidoId: string, codigo: string, idPayPhone: string): Promise<void> {
  await withLock(llave(pedidoId), async () => {
    let intento = await intentoPorCodigo(codigo);
    if (!intento) return;
    if (intento.estado === "Aplicado" || intento.estado === "En revisión" || intento.estado === "Rechazado") return;
    if (intento.estado === "Aprobado") return aplicarConAviso(intento);

    if (intento.idTransaccion && idPayPhone && intento.idTransaccion !== idPayPhone) {
      await marcarRevision(intento, `PayPhone devolvió otro ID (${idPayPhone}); ya teníamos ${intento.idTransaccion}.`);
      return;
    }
    const id = intento.idTransaccion || idPayPhone;
    if (!id) return;
    // Primero se guarda el ID: si después algo falla, no se pierde el rastro.
    if (!intento.idTransaccion) intento = await actualizarIntento(intento.id, { idTransaccion: id });

    // Aunque la pasarela se haya apagado, un pago que ya ocurrió se confirma.
    const config = configPasarela(intento.pasarela);
    if (!config.token) {
      console.error("[pagos en línea] sin token para confirmar", intento.codigo);
      return;
    }
    let respuesta;
    try {
      respuesta = await confirmarEnPayPhone(config, Number(id), intento.codigo);
    } catch (e) {
      await actualizarIntento(intento.id, { detalle: `Sin respuesta de PayPhone al confirmar: se reintenta. (${e instanceof Error ? e.message : "error"})` });
      return;
    }
    const ev = evaluarConfirmacion(intento, respuesta);
    if (ev.tipo === "rechazado") {
      await actualizarIntento(intento.id, { estado: "Rechazado", detalle: ev.detalle });
      return;
    }
    if (ev.tipo === "desconocido") {
      // PayPhone reversa lo no confirmado a los 5 minutos: pasados 15 sin
      // aprobación, ya no hubo cobro y se libera el botón.
      const cerrar = minutosDesde(intento.creado) > 15;
      await actualizarIntento(intento.id, cerrar ? { estado: "Rechazado", detalle: `Sin aprobación de PayPhone. ${ev.detalle}` } : { detalle: ev.detalle });
      return;
    }
    if (ev.tipo === "sospechoso") {
      await marcarRevision(intento, ev.detalle);
      return;
    }
    const { tarifa, neto } = tarifaYNeto(intento.monto, intento.pasarela, ev.medio);
    intento = await actualizarIntento(intento.id, {
      estado: "Aprobado", idTransaccion: ev.idTransaccion, autorizacion: ev.autorizacion, medio: ev.medio,
      tarjeta: ev.tarjeta, tarifa, neto, confirmadoEn: new Date().toISOString(),
    });
    await aplicarConAviso(intento);
  });
}

/**
 * Si el dinero ya fue aprobado pero no se pudo registrar (p. ej. Airtable
 * caído), el personal se entera aunque el cliente no vuelva a su enlace. El
 * pago queda "Aprobado" y se completa en el siguiente intento.
 */
async function aplicarConAviso(intento: IntentoRegistro): Promise<void> {
  try {
    await aplicarIntento(intento);
  } catch (e) {
    console.error("[pagos en línea] aplicar:", intento.codigo, e);
    if (intento.pedidoId) {
      await avisarPedido(intento.pedidoId, `Pago en línea sin registrar · ${intento.codigo}`,
        `PayPhone aprobó ${usd(intento.monto)} (${intento.codigo}) pero no se pudo registrar el abono. Se reintenta cuando el cliente abra su enlace; si no, avisa a Claude.`, "Alta")
        .catch(() => undefined);
    }
    throw e;
  }
}

// ─── 3. Registrar el dinero ─────────────────────────────────────────────────

async function aplicarIntento(intento: IntentoRegistro): Promise<void> {
  const pedidoId = intento.pedidoId;
  if (!pedidoId) return;

  // Anti-duplicado (opción A): el mismo pago de PayPhone en dos intentos →
  // gana el primero (el de número menor).
  const mismos = await intentosPorTransaccion(intento.idTransaccion);
  const anterior = mismos.find((o) => o.id !== intento.id && o.numero < intento.numero);
  if (anterior) {
    await marcarRevision(intento, `El mismo pago de PayPhone ya está registrado en ${anterior.codigo}.`);
    return;
  }

  // La decisión se guarda ANTES del abono: si hay que reintentar, se usa la misma.
  let decision = leerDecision(intento.detalle);
  if (!decision) {
    const cuenta = await cuentaParaCobroDelPedido(pedidoId);
    decision = decidirAplicacion({
      para: intento.para, monto: intento.monto, cuenta: cuenta.vista,
      eleccionAlPagar: intento.eleccion, eleccionAhora: cuenta.eleccion,
    });
    intento = await actualizarIntento(intento.id, { detalle: textoDecision(decision) });
  }

  const prueba = intento.ambiente === "Prueba";
  const observacion = [
    prueba ? "PRUEBA PayPhone (no es dinero real)" : "Pago en línea PayPhone",
    intento.codigo,
    intento.tarjeta || intento.medio,
    intento.autorizacion ? `aut. ${intento.autorizacion}` : "",
  ].filter(Boolean).join(" · ");
  const registradoPor = "PayPhone (enlace del cliente)";
  const fecha = hoyEcuador();

  // El dinero es real: el abono se registra siempre (una sola vez).
  let abonoId = intento.abonoId ?? (await abonosDeTransaccion(intento.idTransaccion))[0]?.id ?? null;
  if (!abonoId) {
    const creado = await crearAbono({
      monto: intento.monto, metodoPago: "PayPhone", fechaAbono: fecha, numeroTransaccion: intento.idTransaccion,
      observacion, registradoPor, operacionId: pedidoId, ordenId: null,
    });
    abonoId = creado.id;
  }
  // Verificación posterior entre instancias: si quedaron dos abonos del mismo
  // pago, gana el de menor ID Abono y el otro se anula (nunca se borra).
  const abonos = await abonosDeTransaccion(intento.idTransaccion);
  if (abonos.length > 1) {
    const [ganador, ...sobran] = abonos;
    await Promise.allSettled(sobran.map((a) => anularAbonoDuplicado(a.id)));
    abonoId = ganador.id;
  }
  if (intento.abonoId !== abonoId) intento = await actualizarIntento(intento.id, { abonoId });

  // Finanzas: Ingreso bruto en "Tarjetas en Tránsito", pendiente de acreditar.
  // En Prueba no se toca Finanzas. Nunca bloquea (mismo criterio que el abono del empleado).
  let aviso = "";
  if (!prueba) {
    const puente = await crearMovimientoParaAbono({
      abonoId, monto: intento.monto, metodoPago: "PayPhone", fecha, registradoPor,
      numeroTransaccion: intento.idTransaccion, observacion,
    });
    if (!puente.ok) aviso = " No se pudo crear el movimiento en Finanzas: revísalo.";
  }

  await actualizarIntento(intento.id, { estado: decision.estado, detalle: textoDecision(decision) + aviso });

  const cuenta = await cuentaParaCobroDelPedido(pedidoId);
  const quien = `${cuenta.clienteNombre || "El cliente"}`;
  if (decision.estado === "En revisión") {
    await avisarPedido(pedidoId, `Pago en línea por revisar · ${cuenta.codigo}`,
      `${quien} pagó ${usd(intento.monto)} con PayPhone (${intento.codigo}). ${decision.motivo} El abono quedó registrado; decide qué hacer.${aviso}`, "Alta")
      .catch((e) => console.warn("[pagos en línea] aviso:", e));
    return;
  }
  let confirmado = false;
  if (decision.confirmar) {
    confirmado = await confirmarPedidoSiPagado(pedidoId, `Pago PayPhone verificado (${intento.codigo})`).catch((e) => {
      console.error("[pagos en línea] confirmar pedido:", e);
      return false;
    });
  }
  if (!confirmado) {
    await avisarPedido(pedidoId, `Pago en línea recibido · ${cuenta.codigo}`,
      `${quien} pagó ${usd(intento.monto)} con PayPhone (${intento.codigo}).${aviso}`, "Normal")
      .catch((e) => console.warn("[pagos en línea] aviso:", e));
  }
}

async function marcarRevision(intento: IntentoRegistro, motivo: string): Promise<void> {
  await actualizarIntento(intento.id, { estado: "En revisión", detalle: textoDecision({ estado: "En revisión", motivo }) });
  if (intento.pedidoId) {
    await avisarPedido(intento.pedidoId, `Pago en línea por revisar · ${intento.codigo}`,
      `${motivo} No se registró ningún abono automáticamente.`, "Alta").catch((e) => console.warn("[pagos en línea] aviso:", e));
  }
}

// ─── Abonos de una transacción (anti-duplicado) ─────────────────────────────

const T_ABONOS = "Abonos";

async function abonosDeTransaccion(idTransaccion: string): Promise<Array<{ id: string; idAbono: number }>> {
  if (!idTransaccion) return [];
  const u = new URL(tableUrl(T_ABONOS));
  u.searchParams.set("filterByFormula",
    `AND({Número de Transacción}='${escapeFormulaString(idTransaccion)}',{Método de Pago}='PayPhone',{Estado del Abono}!='Anulado')`);
  u.searchParams.set("pageSize", "10");
  const data = await airtableRequest<AirtableListResponse>(u.toString());
  return (data.records ?? [])
    .map((r) => ({ id: r.id, idAbono: firstNumber(r.fields["ID Abono"]) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.idAbono - b.idAbono);
}

async function anularAbonoDuplicado(abonoId: string): Promise<void> {
  await anularMovimientoDeAbono(abonoId);
  await airtableMutation(tableUrl(T_ABONOS), {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id: abonoId, fields: { "Estado del Abono": "Anulado", "Observación": "Duplicado de un pago PayPhone ya registrado (anulado por el sistema)." } }] }),
  });
}
