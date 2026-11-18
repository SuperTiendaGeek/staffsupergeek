import "server-only";

// Caja de cobro en línea — lado servidor (punto 23 / 10D, 17-nov-2026).
// Reglas puras en ./reglas.ts; tabla en ./airtable.ts; pasarela en ./payphone.ts.
//
// UN SOLO MOTOR para todo lo que se cobra por enlace (dueño, 16-nov): hoy el
// pedido especial (/mi-pedido) y la orden de reparación (/presupuesto, maquetas
// 7a/7b del 17-nov); después, los enlaces de pago sueltos. Lo único que cambia
// por origen es "de dónde sale la cuenta" y "a quién se avisa" (cuentaCaja).
//
// Recorrido (Camila paga $105 de los repuestos de su orden):
//   1. abrirPago: el servidor calcula el monto con la cuenta del momento,
//      guarda el intento PL-000012 ("Abierto") y devuelve los datos de la cajita.
//   2. Camila paga en la cajita; PayPhone la devuelve a /api/publico/payphone/retorno.
//   3. procesarIntento: confirma con PayPhone (≤ 5 min), verifica código,
//      monto y moneda, guarda tarifa y neto ("Aprobado").
//   4. aplicarIntento: decide (Aplicado / En revisión), registra el abono
//      "PayPhone" UNA vez y su movimiento en Finanzas (Tarjetas en Tránsito,
//      pendiente de acreditar). Pedido: pasa por la puerta única
//      confirmarPedidoSiPagado. Orden: las reglas de compra deciden solas qué
//      repuestos se piden (pagados todos los del grupo).
// Cada paso se puede repetir sin duplicar el anterior: si algo falla a la
// mitad, el siguiente retorno o la siguiente visita del cliente lo completa.
//
// DeUna (etapa D, 18-nov) usa el MISMO motor: en el paso 1 se pide a DeUna un
// cobro de un solo uso (QR + enlace a la app); en el paso 3 se pregunta a
// DeUna (/payment/info) mientras el cliente espera, y su aviso (webhook) es el
// respaldo. Lo demás (abono, Finanzas por acreditar, anti-duplicado) es igual.
// Un pago DeUna que llega SIN nuestra referencia (QR impreso del mostrador)
// queda "Por asignar" en la bandeja "Pagos recibidos": nunca se asigna solo.

import { withLock } from "@/lib/concurrencia";
import {
  airtableMutation, airtableRequest, escapeFormulaString, firstNumber, tableUrl, type AirtableListResponse,
} from "@/lib/finanzas/airtable-client";
import { crearAbono } from "@/lib/operaciones/airtable";
import { createAbonoPorOrden } from "@/lib/tecnicos/airtable";
import { anularMovimientoDeAbono, crearMovimientoParaAbono } from "@/lib/finanzas/puentes/abonos";
import { verificarAbonoPermitido } from "@/lib/facturacion/gancho/cobroOrigen";
import {
  avisarPedido, confirmarPedidoSiPagado, cuentaParaCobroDelPedido, pedidoIdDelToken, tokenDelPedido, RUTA_PUBLICA_PEDIDO,
} from "@/lib/pedidos-especiales/enlace";
import {
  avisarOrden, cuentaParaCobroDeLaOrden, ordenIdDelToken, tokenDeLaOrden, RUTA_PUBLICA as RUTA_PUBLICA_ORDEN,
} from "@/lib/tecnicos/presupuesto/enlace";
import { hoyEcuador } from "@/lib/pedidos-especiales/retiro";
import { listPortalUsers } from "@/lib/airtable";
import { isAdministratorRole, isProviderRole, isTechnicianRole } from "@/lib/apps";
import { crearNotificacion } from "@/lib/notificaciones/airtable";
import { configPasarela, pasarelaDisponible, puedeConsultar } from "./config";
import { confirmarEnPayPhone, parametrosCajita, type ParametrosCajita } from "./payphone";
import { consultarPagoDeUna, solicitarCobroDeUna } from "./deuna";
import {
  MINUTOS_GRACIA_DEUNA, MINUTOS_VIGENCIA_DEUNA, evaluarInfo, problemasDeUna, nombrePropio, type AvisoDeUna, type InfoDeUna,
} from "./deuna-reglas";
import {
  actualizarIntento, crearIntento, intentoPorCodigo, intentosDeLaOrden, intentosDelPedido, intentosPorTransaccion, type IntentoRegistro,
} from "./airtable";
import {
  CODIGO_PAGO_REGEX, decidirAplicacion, decidirAplicacionOrden, desgloseIva, estadoVisible, evaluarConfirmacion,
  leerDecision, minutosDesde, montoACobrar, montoDeOpcion, opcionesDePagoOrden, resumenPago, tarifaYNeto, textoDecision,
  parteValida, type DecisionAplicar, type ParaPago, type Pasarela,
} from "./reglas";

const usd = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;

// ─── De dónde sale la cuenta ────────────────────────────────────────────────

export type Destino = { origen: "Pedido" | "Orden"; id: string };

const llave = (d: Destino) => `pago-en-linea:${d.id}`;

function destinoDe(i: IntentoRegistro): Destino | null {
  if (i.pedidoId) return { origen: "Pedido", id: i.pedidoId };
  if (i.ordenId) return { origen: "Orden", id: i.ordenId };
  return null;
}

/** Lo único que cambia entre un pedido y una orden. */
type CuentaCaja = {
  codigo: string;
  clienteNombre: string;
  /** Lo que ve el cliente en la cajita de PayPhone. */
  referencia: string;
  /** Huella de la elección del cliente (solo pedidos; en órdenes ""). */
  eleccion: string;
  monto(para: ParaPago): { ok: true; monto: number } | { ok: false; error: string };
  decidir(x: { para: ParaPago; monto: number; eleccionAlPagar: string }): DecisionAplicar;
};

async function cuentaCaja(d: Destino): Promise<CuentaCaja> {
  if (d.origen === "Pedido") {
    const c = await cuentaParaCobroDelPedido(d.id);
    return {
      codigo: c.codigo,
      clienteNombre: c.clienteNombre,
      referencia: `Pedido ${c.codigo}${c.producto ? ` · ${c.producto}` : ""}`,
      eleccion: c.eleccion,
      monto: (para) => montoACobrar(c.vista, para),
      decidir: (x) => decidirAplicacion({ para: x.para, monto: x.monto, cuenta: c.vista, eleccionAlPagar: x.eleccionAlPagar, eleccionAhora: c.eleccion }),
    };
  }
  const c = await cuentaParaCobroDeLaOrden(d.id);
  return {
    codigo: c.codigo,
    clienteNombre: c.clienteNombre,
    referencia: `Orden ${c.codigo}${c.equipo ? ` · ${c.equipo}` : ""}`,
    eleccion: "",
    monto: (para) => montoDeOpcion(opcionesDePagoOrden(c.cuenta), para),
    decidir: (x) => decidirAplicacionOrden({ monto: x.monto, cuenta: c.cuenta }),
  };
}

const intentosDe = (d: Destino) => (d.origen === "Pedido" ? intentosDelPedido(d.id) : intentosDeLaOrden(d.id));

function avisar(d: Destino, titulo: string, mensaje: string, prioridad: "Normal" | "Alta"): Promise<void> {
  return d.origen === "Pedido" ? avisarPedido(d.id, titulo, mensaje, prioridad) : avisarOrden(d.id, titulo, mensaje, prioridad);
}

/** A dónde vuelve el cliente: SIEMPRE el enlace guardado en el servidor. */
async function rutaPublica(d: Destino): Promise<string | null> {
  if (d.origen === "Pedido") {
    const token = await tokenDelPedido(d.id);
    return token ? `${RUTA_PUBLICA_PEDIDO}/${token}` : null;
  }
  const token = await tokenDeLaOrden(d.id);
  return token ? `${RUTA_PUBLICA_ORDEN}/${token}` : null;
}

// ─── 1. Abrir la cajita ─────────────────────────────────────────────────────

/** Lo que el navegador necesita para cobrar con DeUna (QR = imagen de DeUna). */
export type CobroDeUnaCliente = { deeplink: string; qr: string; venceEn: string };

export type ResultadoAbrir =
  | { ok: true; codigo: string; monto: number; cajita?: ParametrosCajita; deuna?: CobroDeUnaCliente }
  | { ok: false; status: number; error: string };

/** Pedido especial: el cliente paga desde /mi-pedido/<token>. */
export async function abrirPagoPedido(token: string, para: ParaPago, pasarela: Pasarela = "PayPhone", parte?: number): Promise<ResultadoAbrir> {
  const pedidoId = await pedidoIdDelToken(token);
  if (!pedidoId) return { ok: false, status: 404, error: "Este enlace no existe." };
  return abrirPago({ origen: "Pedido", id: pedidoId }, para, pasarela, parte);
}

/** Orden de reparación: el cliente paga desde /presupuesto/<token> (maquetas 7a/7b). */
export async function abrirPagoOrden(token: string, para: ParaPago, pasarela: Pasarela = "PayPhone", parte?: number): Promise<ResultadoAbrir> {
  const ordenId = await ordenIdDelToken(token);
  if (!ordenId) return { ok: false, status: 404, error: "Este enlace no existe." };
  return abrirPago({ origen: "Orden", id: ordenId }, para, pasarela, parte);
}

const MAX_INTENTOS_10_MIN = 8;

const NO_DISPONIBLE: Record<Pasarela, string> = {
  PayPhone: "El pago con tarjeta no está disponible ahora. Puedes pagar por transferencia.",
  DeUna: "El pago con DeUna no está disponible ahora. Puedes pagar con tarjeta o en la tienda.",
};

/**
 * parte: "Dividir el pago entre tarjeta y DeUna" (maqueta 7a). El cliente paga
 * primero una parte de la opción elegida y luego el resto (que vuelve a salir
 * como opción, con el monto que falta). Ej.: Repuestos $105 → $50 con tarjeta
 * → "Completa $55 con DeUna".
 */
async function abrirPago(d: Destino, para: ParaPago, pasarela: Pasarela, parte?: number): Promise<ResultadoAbrir> {
  const config = configPasarela(pasarela);
  // Antes de cobrar otra vez: ¿ya se pagó un QR de DeUna anterior? (fuera del candado: reanudar lo toma).
  await reanudar(d).catch((e) => console.error("[pagos en línea] revisar antes de abrir:", e));

  return withLock(llave(d), async (): Promise<ResultadoAbrir> => {
    const cuenta = await cuentaCaja(d);
    if (!pasarelaDisponible(config, cuenta.codigo)) return { ok: false, status: 409, error: NO_DISPONIBLE[pasarela] };
    const total = cuenta.monto(para);
    if (!total.ok) return { ok: false, status: 409, error: total.error };
    const m = parte == null ? total : parteValida(parte, total.monto);
    if (!m.ok) return { ok: false, status: 400, error: m.error };

    // Con factura o recibo ya emitidos, solo se cobra si queda saldo real
    // (misma regla que "Registrar pago" de la orden).
    if (d.origen === "Orden") {
      const noPermitido = await verificarAbonoPermitido({ tipo: "orden", recordId: d.id }, m.monto);
      if (noPermitido) return { ok: false, status: 409, error: "Este pago no se puede hacer en línea. Escríbenos o págalo en la tienda." };
    }

    const intentos = await intentosDe(d);
    // Freno simple contra abusos del enlace público: cada intento crea un
    // registro (y en DeUna, un cobro). Un cliente real no necesita más.
    if (intentos.filter((i) => minutosDesde(i.creado) <= 10).length >= MAX_INTENTOS_10_MIN) {
      return { ok: false, status: 429, error: "Hiciste muchos intentos seguidos. Espera unos minutos o paga en la tienda." };
    }
    if (intentos.some((i) => estadoVisible(i) === "sin_respuesta")) {
      return { ok: false, status: 409, error: "Estamos confirmando tu pago anterior. No pagues otra vez." };
    }
    const eleccion = para === "Lo que falta" ? "" : cuenta.eleccion;

    // Las cajitas abiertas que ya vencieron se marcan (solo orden en la tabla).
    const viejas = intentos.filter((i) => i.estado === "Abierto" && !i.idTransaccion && estadoVisible(i) === "vencido");
    await Promise.allSettled(viejas.map((i) => actualizarIntento(i.id, { estado: "Vencido" })));

    // Cada cajita lleva un código NUEVO. PayPhone no acepta dibujar dos veces
    // el mismo código ("Ya existe una transacción con el ClientTransactionId
    // especificado"): pasaba al pulsar Cancelar y volver a abrir (17-nov).
    // Doble clic: el botón se bloquea mientras abre. Dos pestañas pagadas a la
    // vez: el segundo pago queda "En revisión" (pagó de más) y nunca se pierde;
    // y si un pago ya volvió sin confirmar, no se deja pagar otra vez (arriba).
    const dIva = desgloseIva(m.monto);
    let intento = await crearIntento({
      origen: d.origen, pedidoId: d.origen === "Pedido" ? d.id : undefined, ordenId: d.origen === "Orden" ? d.id : undefined,
      pasarela, ambiente: config.ambiente, para,
      monto: m.monto, base: dIva.baseC / 100, iva: dIva.ivaC / 100, eleccion,
    });
    const pago = resumenPago({ codigo: intento.codigo, cuenta: cuenta.codigo, monto: m.monto, pasarela, ambiente: config.ambiente });

    if (pasarela === "DeUna") {
      // Un cobro DINÁMICO por intento: vale una sola vez y vence a los 15 min.
      try {
        const cobro = await solicitarCobroDeUna(config, { codigo: intento.codigo, monto: intento.monto, detalle: cuenta.referencia });
        intento = await actualizarIntento(intento.id, { pago, idTransaccion: cobro.transactionId });
        const venceEn = new Date(Date.parse(intento.creado || new Date().toISOString()) + MINUTOS_VIGENCIA_DEUNA * 60_000).toISOString();
        return { ok: true, codigo: intento.codigo, monto: intento.monto, deuna: { deeplink: cobro.deeplink, qr: cobro.qr, venceEn } };
      } catch (e) {
        console.error("[pagos en línea] DeUna no generó el cobro:", intento.codigo, e instanceof Error ? e.message : "error");
        await actualizarIntento(intento.id, { pago, estado: "Rechazado", detalle: "DeUna no generó el cobro (no se cobró nada)." }).catch(() => undefined);
        return { ok: false, status: 502, error: "DeUna no respondió. Intenta de nuevo en un momento o paga con tarjeta." };
      }
    }

    intento = await actualizarIntento(intento.id, { pago });
    return { ok: true, codigo: intento.codigo, monto: intento.monto, cajita: parametrosCajita(config, { codigo: intento.codigo, monto: intento.monto, referencia: cuenta.referencia }) };
  });
}

/**
 * Mostrador (pantalla del cliente, maqueta 9): el empleado pide el QR de DeUna
 * para la orden o el pedido que tiene enfrente. Mismo motor y mismas reglas
 * que el enlace del cliente (el monto lo calcula el servidor).
 */
export async function abrirPagoMostrador(d: Destino, para: ParaPago, pasarela: Pasarela): Promise<ResultadoAbrir> {
  return abrirPago(d, para, pasarela);
}

/** La pantalla del mostrador pregunta si ya pagó: se revisan los cobros abiertos. */
export async function reanudarPagosDe(d: Destino): Promise<void> {
  await reanudar(d);
}

// ─── 2. Volvió de PayPhone ──────────────────────────────────────────────────

/** Procesa el retorno y devuelve a dónde llevar al cliente (null si el código no existe). */
export async function procesarRetornoPayPhone(idPayPhone: string, codigo: string): Promise<string | null> {
  if (!CODIGO_PAGO_REGEX.test(codigo)) return null;
  const intento = await intentoPorCodigo(codigo);
  const d = intento ? destinoDe(intento) : null;
  if (!intento || !d) return null;
  const id = /^\d{1,15}$/.test(idPayPhone) ? idPayPhone : "";
  try {
    await procesarIntento(d, intento.codigo, id);
  } catch (e) {
    // El cliente vuelve igual a su página: verá "Estamos confirmando tu pago".
    console.error("[pagos en línea] retorno:", e);
  }
  const ruta = await rutaPublica(d);
  return ruta ? `${ruta}?pago=${encodeURIComponent(intento.codigo)}` : null;
}

/** Visita del cliente con un pago "sin respuesta": se reintenta confirmar o aplicar. */
export async function reanudarPagosDelEnlace(token: string): Promise<void> {
  const pedidoId = await pedidoIdDelToken(token);
  if (pedidoId) await reanudar({ origen: "Pedido", id: pedidoId });
}

/** Lo mismo para el enlace del presupuesto de una orden. */
export async function reanudarPagosDeLaOrden(token: string): Promise<void> {
  const ordenId = await ordenIdDelToken(token);
  if (ordenId) await reanudar({ origen: "Orden", id: ordenId });
}

/**
 * ¿Hay que preguntar por este intento? PayPhone: volvió y no se confirmó.
 * DeUna: el QR sigue vivo (o venció hace poco: el pago pudo llegar al final).
 */
function porConsultar(i: IntentoRegistro): boolean {
  if (i.estado === "Aprobado") return true;
  if (i.pasarela === "DeUna") {
    return (i.estado === "Abierto" || i.estado === "Vencido") && !!i.idTransaccion
      && minutosDesde(i.creado) <= MINUTOS_VIGENCIA_DEUNA + MINUTOS_GRACIA_DEUNA;
  }
  return i.estado === "Abierto" && !!i.idTransaccion;
}

async function reanudar(d: Destino): Promise<void> {
  const pendientes = (await intentosDe(d)).filter(porConsultar);
  for (const i of pendientes) {
    await procesarIntento(d, i.codigo, "").catch((e) => console.error("[pagos en línea] reanudar:", i.codigo, e));
  }
}

const TERMINADOS = new Set(["Aplicado", "En revisión", "Rechazado", "Por asignar", "No corresponde"]);

async function procesarIntento(d: Destino, codigo: string, idPayPhone: string): Promise<void> {
  await withLock(llave(d), async () => {
    let intento = await intentoPorCodigo(codigo);
    if (!intento) return;
    if (TERMINADOS.has(intento.estado)) return;
    if (intento.estado === "Aprobado") return aplicarConAviso(intento);
    if (intento.pasarela === "DeUna") return procesarDeUna(intento);

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

/** DeUna: preguntar cómo quedó el cobro (sin candado propio: lo llama procesarIntento). */
async function procesarDeUna(intento: IntentoRegistro): Promise<void> {
  const config = configPasarela("DeUna");
  if (!puedeConsultar(config) || !intento.idTransaccion) return;
  let info: InfoDeUna;
  try {
    info = await consultarPagoDeUna(config, intento.idTransaccion, "transaccion");
  } catch (e) {
    console.error("[pagos en línea] DeUna sin respuesta:", intento.codigo, e instanceof Error ? e.message : "error");
    return; // se reintenta en la próxima consulta o con el aviso de DeUna
  }
  const ev = evaluarInfo(intento, info, config.caja);
  if (ev.tipo === "pendiente" || ev.tipo === "no_encontrado") {
    if (intento.estado === "Abierto" && minutosDesde(intento.creado) > MINUTOS_VIGENCIA_DEUNA + MINUTOS_GRACIA_DEUNA) {
      await actualizarIntento(intento.id, { estado: "Vencido", detalle: "El QR de DeUna venció sin pago." });
    }
    return;
  }
  if (ev.tipo === "devuelto") {
    await actualizarIntento(intento.id, { estado: "Rechazado", detalle: ev.detalle });
    return;
  }
  if (ev.tipo === "sospechoso") {
    await marcarRevision(intento, ev.detalle);
    return;
  }
  const { tarifa, neto } = tarifaYNeto(intento.monto, "DeUna", "DeUna");
  const aprobado = await actualizarIntento(intento.id, {
    estado: "Aprobado", idTransaccion: ev.idTransaccion, autorizacion: ev.transferencia, medio: "DeUna",
    pagador: ev.pagador || undefined, identificacion: ev.identificacion || undefined,
    tarifa, neto, confirmadoEn: new Date().toISOString(),
  });
  await aplicarConAviso(aprobado);
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
    const d = destinoDe(intento);
    if (d) {
      await avisar(d, `Pago en línea sin registrar · ${intento.codigo}`,
        `${intento.pasarela} aprobó ${usd(intento.monto)} (${intento.codigo}) pero no se pudo registrar el abono. Se reintenta cuando el cliente abra su enlace; si no, avisa a Claude.`, "Alta")
        .catch(() => undefined);
    }
    throw e;
  }
}

// ─── 3. Registrar el dinero ─────────────────────────────────────────────────

async function aplicarIntento(intento: IntentoRegistro): Promise<void> {
  const d = destinoDe(intento);
  if (!d) return;

  const pasarela = intento.pasarela;
  // Anti-duplicado (opción A): el mismo pago de la pasarela en dos intentos →
  // gana el primero (el de número menor).
  const mismos = await intentosPorTransaccion(intento.idTransaccion);
  const anterior = mismos.find((o) => o.id !== intento.id && o.numero < intento.numero);
  if (anterior) {
    await marcarRevision(intento, `El mismo pago de ${pasarela} ya está registrado en ${anterior.codigo}.`);
    return;
  }

  // La decisión se guarda ANTES del abono: si hay que reintentar, se usa la misma.
  let decision = leerDecision(intento.detalle);
  if (!decision) {
    const cuenta = await cuentaCaja(d);
    decision = cuenta.decidir({ para: intento.para, monto: intento.monto, eleccionAlPagar: intento.eleccion });
    intento = await actualizarIntento(intento.id, { detalle: textoDecision(decision) });
  }

  const prueba = intento.ambiente === "Prueba";
  // DeUna: el abono lleva el N.º de transferencia (el que ve el cliente en su
  // app y el que el empleado escribe a mano): así un pago registrado también
  // en el mostrador se reconoce y no se duplica.
  const numero = pasarela === "DeUna" ? (intento.autorizacion || intento.idTransaccion) : intento.idTransaccion;
  const observacion = [
    prueba ? `PRUEBA ${pasarela} (no es dinero real)` : `Pago en línea ${pasarela}`,
    intento.codigo,
    pasarela === "DeUna" ? intento.pagador : intento.tarjeta || intento.medio,
    pasarela === "DeUna" ? (intento.autorizacion ? `transf. ${intento.autorizacion}` : "") : (intento.autorizacion ? `aut. ${intento.autorizacion}` : ""),
  ].filter(Boolean).join(" · ");
  const registradoPor = intento.asignadoPor
    ? `${intento.asignadoPor} (Pagos recibidos)`
    : `${pasarela} (${d.origen === "Pedido" ? "enlace del cliente" : "enlace del presupuesto"})`;
  const fecha = hoyEcuador();

  // El dinero es real: el abono se registra siempre (una sola vez).
  let abonoId = intento.abonoId ?? (await abonosDeTransaccion(numero, pasarela))[0]?.id ?? null;
  if (!abonoId) {
    if (d.origen === "Pedido") {
      const creado = await crearAbono({
        monto: intento.monto, metodoPago: pasarela, fechaAbono: fecha, numeroTransaccion: numero,
        observacion, registradoPor, operacionId: d.id, ordenId: null,
      });
      abonoId = creado.id;
    } else {
      // El mismo registro que "Registrar pago" de la orden (enlaza también su pedido viejo, si lo tiene).
      const creado = await createAbonoPorOrden({
        ordenRecordId: d.id, fecha, monto: intento.monto, metodoPago: pasarela,
        numeroTransaccion: numero, observacion, registradoPor,
      });
      abonoId = creado.abono.id;
    }
  }
  // Verificación posterior entre instancias: si quedaron dos abonos del mismo
  // pago, gana el de menor ID Abono y el otro se anula (nunca se borra).
  const abonos = await abonosDeTransaccion(numero, pasarela);
  if (abonos.length > 1) {
    const [ganador, ...sobran] = abonos;
    await Promise.allSettled(sobran.map((a) => anularAbonoDuplicado(a.id, pasarela)));
    abonoId = ganador.id;
  }
  if (intento.abonoId !== abonoId) intento = await actualizarIntento(intento.id, { abonoId });

  // Finanzas: Ingreso bruto "por acreditar" (PayPhone → Tarjetas en Tránsito;
  // DeUna → cuenta DeUna). En Prueba no se toca Finanzas. Nunca bloquea (mismo
  // criterio que el abono del empleado). Es idempotente: si el abono ya tenía
  // movimiento (registrado a mano), no crea otro.
  let aviso = "";
  if (!prueba) {
    const puente = await crearMovimientoParaAbono({
      abonoId, monto: intento.monto, metodoPago: pasarela, fecha, registradoPor,
      numeroTransaccion: numero, observacion,
    });
    if (!puente.ok) aviso = " No se pudo crear el movimiento en Finanzas: revísalo.";
  }

  await actualizarIntento(intento.id, { estado: decision.estado, detalle: textoDecision(decision) + aviso });

  const cuenta = await cuentaCaja(d);
  const quien = `${cuenta.clienteNombre || "El cliente"}`;
  if (decision.estado === "En revisión") {
    await avisar(d, `Pago en línea por revisar · ${cuenta.codigo}`,
      `${quien} pagó ${usd(intento.monto)} con ${pasarela} (${intento.codigo}). ${decision.motivo} El abono quedó registrado; decide qué hacer.${aviso}`, "Alta")
      .catch((e) => console.warn("[pagos en línea] aviso:", e));
    return;
  }
  let confirmado = false;
  // Un pago asignado desde la bandeja pasa por la misma puerta que el abono del
  // empleado: confirma el pedido solo si lo pagado cubre la elección vigente.
  if (d.origen === "Pedido" && (decision.confirmar || !!intento.asignadoPor)) {
    confirmado = await confirmarPedidoSiPagado(d.id, `Pago ${pasarela} verificado (${intento.codigo})`).catch((e) => {
      console.error("[pagos en línea] confirmar pedido:", e);
      return false;
    });
  }
  if (!confirmado) {
    await avisar(d, `Pago en línea recibido · ${cuenta.codigo}`,
      `${quien} pagó ${usd(intento.monto)} con ${pasarela} (${intento.codigo}).${aviso}`, "Normal")
      .catch((e) => console.warn("[pagos en línea] aviso:", e));
  }
}

async function marcarRevision(intento: IntentoRegistro, motivo: string): Promise<void> {
  await actualizarIntento(intento.id, { estado: "En revisión", detalle: textoDecision({ estado: "En revisión", motivo }) });
  const d = destinoDe(intento);
  if (d) {
    await avisar(d, `Pago en línea por revisar · ${intento.codigo}`,
      `${motivo} No se registró ningún abono automáticamente.`, "Alta").catch((e) => console.warn("[pagos en línea] aviso:", e));
  }
}

// ─── Abonos de una transacción (anti-duplicado) ─────────────────────────────

const T_ABONOS = "Abonos";

export async function abonosDeTransaccion(numero: string, metodo: Pasarela): Promise<Array<{ id: string; idAbono: number }>> {
  if (!numero) return [];
  const u = new URL(tableUrl(T_ABONOS));
  u.searchParams.set("filterByFormula",
    `AND(TRIM({Número de Transacción})='${escapeFormulaString(numero.trim())}',{Método de Pago}='${escapeFormulaString(metodo)}',{Estado del Abono}!='Anulado')`);
  u.searchParams.set("pageSize", "10");
  const data = await airtableRequest<AirtableListResponse>(u.toString());
  return (data.records ?? [])
    .map((r) => ({ id: r.id, idAbono: firstNumber(r.fields["ID Abono"]) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.idAbono - b.idAbono);
}

async function anularAbonoDuplicado(abonoId: string, pasarela: Pasarela): Promise<void> {
  await anularMovimientoDeAbono(abonoId);
  await airtableMutation(tableUrl(T_ABONOS), {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id: abonoId, fields: { "Estado del Abono": "Anulado", "Observación": `Duplicado de un pago ${pasarela} ya registrado (anulado por el sistema).` } }] }),
  });
}

// ─── 4. El aviso de DeUna (webhook) ─────────────────────────────────────────

export type ResultadoAviso = "procesado" | "por_asignar" | "ya_registrado" | "ignorado";

/**
 * DeUna avisa que hubo un pago. Nunca se cree el aviso: se pregunta a DeUna.
 * Lanza si DeUna no responde o el pago aún figura pendiente (DeUna reintenta
 * 3 veces cada 30 s; si no, la consulta del cliente o la bandeja lo recogen).
 */
export async function procesarAvisoDeUna(aviso: AvisoDeUna): Promise<ResultadoAviso> {
  const config = configPasarela("DeUna");
  if (!puedeConsultar(config)) throw new Error("DeUna sin credenciales para consultar.");
  const info = await consultarPagoDeUna(config, aviso.idTransaccion, "transaccion");
  if (info.status === "PENDING") throw new Error("DeUna aún figura pendiente.");
  if (info.status !== "APPROVED") return "ignorado";

  // ¿Es un cobro nuestro? Por la referencia PL-… o por el ID que guardamos al pedirlo.
  const ref = info.internalTransactionReference || aviso.referencia;
  let intento = CODIGO_PAGO_REGEX.test(ref) ? await intentoPorCodigo(ref) : null;
  if (!intento) intento = (await intentosPorTransaccion(info.transactionId || aviso.idTransaccion))[0] ?? null;
  if (intento && intento.pasarela === "DeUna") {
    const d = destinoDe(intento);
    if (!d) return "ya_registrado"; // ya está en la bandeja
    await procesarIntento(d, intento.codigo, "");
    return "procesado";
  }
  return registrarSinReferencia(info, config.caja);
}

/**
 * Pago DeUna sin nuestra referencia (QR impreso del mostrador u otro cobro):
 * se guarda "Por asignar" con quién pagó, para la bandeja. Nunca se asigna solo.
 * Si el empleado ya lo registró a mano (mismo N.º de transferencia), queda
 * enlazado a ese abono y no aparece por asignar.
 */
async function registrarSinReferencia(info: InfoDeUna, caja: string): Promise<ResultadoAviso> {
  return withLock(`pago-recibido:${info.transactionId}`, async (): Promise<ResultadoAviso> => {
    if ((await intentosPorTransaccion(info.transactionId)).length) return "ya_registrado";
    const monto = info.amount ?? 0;
    const problemas = problemasDeUna(info, caja);
    if (!(monto > 0)) problemas.push("monto vacío");
    const manual = (await abonosDeTransaccion(info.transferNumber, "DeUna"))[0] ?? null;
    const dIva = desgloseIva(monto);
    const { tarifa, neto } = tarifaYNeto(monto, "DeUna", "DeUna");
    const pagador = nombrePropio(info.ordererName);
    const estado = problemas.length ? "En revisión" : manual ? "Aplicado" : "Por asignar";
    const detalle = problemas.length
      ? textoDecision({ estado: "En revisión", motivo: `Pago DeUna sin referencia que no coincide: ${problemas.join("; ")}.` })
      : manual ? "Llegó sin referencia y ya estaba registrado a mano (mismo N.º de transferencia)." : "Llegó sin referencia (QR impreso u otro cobro de DeUna).";
    let intento = await crearIntento({
      origen: "Sin referencia", pasarela: "DeUna", ambiente: "Producción", para: "Lo que falta",
      monto, base: dIva.baseC / 100, iva: dIva.ivaC / 100, eleccion: "",
      estado, idTransaccion: info.transactionId, autorizacion: info.transferNumber, medio: "DeUna",
      tarifa, neto, pagador: pagador || undefined, identificacion: info.ordererIdentification || undefined,
      confirmadoEn: new Date().toISOString(), detalle,
    });
    intento = await actualizarIntento(intento.id, {
      pago: resumenPago({ codigo: intento.codigo, cuenta: "Sin referencia", monto, pasarela: "DeUna", ambiente: "Producción" }),
      abonoId: manual?.id,
    });
    if (estado === "Aplicado") return "ya_registrado";
    await avisarPersonal(
      estado === "Por asignar" ? `Pago DeUna por asignar · ${usd(monto)}` : `Pago DeUna por revisar · ${usd(monto)}`,
      `${pagador || "Un cliente"} pagó ${usd(monto)} con DeUna sin referencia (${intento.codigo}). Asígnalo en Pagos recibidos.`,
      estado === "Por asignar" ? "Normal" : "Alta",
    ).catch((e) => console.warn("[pagos en línea] aviso bandeja:", e));
    return "por_asignar";
  });
}

// ─── 5. Bandeja "Pagos recibidos": asignar o descartar ──────────────────────

export type ResultadoAsignar = { ok: true; codigo: string } | { ok: false; status: number; error: string };

/**
 * El empleado asigna un pago "Por asignar" a una orden o un pedido. Se aplica
 * con el MISMO motor (abono + Finanzas por acreditar), como "Lo que falta".
 * Ej.: Carlos pagó $20 con el QR impreso → OP-151 (falta $20) → abono DeUna.
 */
export async function asignarPagoRecibido(input: { codigo: string; destino: Destino; usuario: string }): Promise<ResultadoAsignar> {
  const d = input.destino;
  const previo = await intentoPorCodigo(input.codigo);
  if (!previo) return { ok: false, status: 404, error: "Ese pago no existe." };
  if (previo.estado !== "Por asignar") return { ok: false, status: 409, error: "Ese pago ya no está por asignar (alguien lo asignó o lo descartó)." };

  return withLock(llave(d), async (): Promise<ResultadoAsignar> => {
    const intento = await intentoPorCodigo(input.codigo);
    if (!intento || intento.estado !== "Por asignar") return { ok: false, status: 409, error: "Ese pago ya no está por asignar (alguien lo asignó o lo descartó)." };
    const cuenta = await cuentaCaja(d);
    const falta = cuenta.monto("Lo que falta");
    // En un pedido "por pagar" la opción es "Todo"/"Confirmar": se usa la más alta.
    const maximo = falta.ok ? falta.monto : Math.max(0, ...(["Todo", "Confirmar"] as ParaPago[]).map((p) => { const m = cuenta.monto(p); return m.ok ? m.monto : 0; }));
    if (!(maximo > 0)) return { ok: false, status: 409, error: `${cuenta.codigo} no tiene saldo pendiente.` };
    if (intento.monto > maximo + 0.009) return { ok: false, status: 409, error: `El pago (${usd(intento.monto)}) es mayor que lo que falta en ${cuenta.codigo} (${usd(maximo)}).` };
    if (d.origen === "Orden") {
      const noPermitido = await verificarAbonoPermitido({ tipo: "orden", recordId: d.id }, intento.monto);
      if (noPermitido) return { ok: false, status: 409, error: "Esa orden ya está facturada por completo: revisa antes de asignar." };
    }
    const asignado = await actualizarIntento(intento.id, {
      origen: d.origen, pedidoId: d.origen === "Pedido" ? d.id : undefined, ordenId: d.origen === "Orden" ? d.id : undefined,
      estado: "Aprobado", asignadoPor: input.usuario, asignadoEn: new Date().toISOString(),
      detalle: "",
      pago: resumenPago({ codigo: intento.codigo, cuenta: cuenta.codigo, monto: intento.monto, pasarela: intento.pasarela, ambiente: intento.ambiente }),
    });
    await aplicarConAviso(asignado);
    return { ok: true, codigo: intento.codigo };
  });
}

/** "No corresponde" (solo Administradores): el pago sale de la bandeja con su motivo. */
export async function descartarPagoRecibido(input: { codigo: string; motivo: string; usuario: string }): Promise<ResultadoAsignar> {
  const motivo = input.motivo.replace(/\s+/g, " ").trim().slice(0, 300);
  if (motivo.length < 3) return { ok: false, status: 400, error: "Escribe el motivo." };
  return withLock(`pago-recibido:${input.codigo}`, async (): Promise<ResultadoAsignar> => {
    const intento = await intentoPorCodigo(input.codigo);
    if (!intento) return { ok: false, status: 404, error: "Ese pago no existe." };
    if (intento.estado !== "Por asignar" && intento.estado !== "En revisión") return { ok: false, status: 409, error: "Ese pago ya fue resuelto." };
    if (intento.abonoId) return { ok: false, status: 409, error: "Ese pago ya tiene un abono registrado: anúlalo primero desde su orden o pedido." };
    await actualizarIntento(intento.id, {
      estado: "No corresponde", asignadoPor: input.usuario, asignadoEn: new Date().toISOString(),
      detalle: `No corresponde: ${motivo}`,
    });
    return { ok: true, codigo: intento.codigo };
  });
}

/**
 * "Marcar revisado" (solo Administradores): un pago "Por revisar" que YA tiene
 * su abono (p. ej. pagó de más) y que el personal resolvió en la cuenta
 * (devolución o saldo a favor). Sale de la bandeja con la nota.
 */
export async function marcarPagoRevisado(input: { codigo: string; nota: string; usuario: string }): Promise<ResultadoAsignar> {
  const nota = input.nota.replace(/\s+/g, " ").trim().slice(0, 300);
  if (nota.length < 3) return { ok: false, status: 400, error: "Escribe qué se hizo." };
  return withLock(`pago-recibido:${input.codigo}`, async (): Promise<ResultadoAsignar> => {
    const intento = await intentoPorCodigo(input.codigo);
    if (!intento) return { ok: false, status: 404, error: "Ese pago no existe." };
    if (intento.estado !== "En revisión") return { ok: false, status: 409, error: "Ese pago no está por revisar." };
    if (!intento.abonoId) return { ok: false, status: 409, error: "Ese pago no tiene abono: asígnalo o márcalo como «No corresponde»." };
    await actualizarIntento(intento.id, {
      estado: "Aplicado", asignadoPor: input.usuario, asignadoEn: new Date().toISOString(),
      detalle: `${intento.detalle} · Revisado: ${nota}`.slice(0, 1000),
    });
    return { ok: true, codigo: intento.codigo };
  });
}

/** Aviso a Administradores y Staff (la bandeja la usan ellos; no técnicos ni proveedores). */
async function avisarPersonal(titulo: string, mensaje: string, prioridad: "Normal" | "Alta"): Promise<void> {
  const usuarios = (await listPortalUsers()).filter((u) => u.activo && !isProviderRole(u.rol) && (isAdministratorRole(u.rol) || !isTechnicianRole(u.rol)));
  await Promise.allSettled(usuarios.map((u) => crearNotificacion({
    destinatarioId: u.id, tipo: "Sistema", titulo, mensaje, prioridad,
    urlAccion: "/pagos-recibidos", entidadTipo: "Sistema", entidadId: "pagos-recibidos",
  })));
}
