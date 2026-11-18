// DeUna (Banco Pichincha) — reglas PURAS de la pasarela (etapa D, 18-nov-2026).
// Sin red ni Airtable: se prueban en __tests__/deuna-reglas.test.ts.
// Documentación: "TRBD-Documentación técnica Deuna _ Negocios" (fuera del repo).
//
// Recorrido (Ana paga $105 de los repuestos de su orden con DeUna):
//   1. El servidor pide a DeUna un cobro DINÁMICO de $105 con la referencia
//      PL-000027 (vale una sola vez y vence). DeUna devuelve el enlace (celular)
//      y el QR (computadora o pantalla del cliente).
//   2. Ana paga en su app DeUna.
//   3. Mientras Ana espera, el servidor pregunta a DeUna (/payment/info) cada
//      pocos segundos; además DeUna nos AVISA (webhook) como respaldo.
//   4. Antes de registrar el abono: APPROVED + mismo monto + USD + nuestra caja
//      + nuestra referencia. El aviso de DeUna nunca se cree solo: se vuelve a
//      preguntar a DeUna.

import { createHash, timingSafeEqual } from "crypto";

/** Cuánto vive el QR / enlace de cada cobro (DeUna permite 1–720 min). */
export const MINUTOS_VIGENCIA_DEUNA = 15;
/** Después de vencer, se sigue preguntando un rato por si el pago llegó justo al final. */
export const MINUTOS_GRACIA_DEUNA = 15;

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const centavos = (n: number) => Math.round((Number(n) || 0) * 100 + Number.EPSILON);
const usd = (n: number) => `$${r2(n).toFixed(2)}`;
const texto = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

// ─── 1. Pedir el cobro ──────────────────────────────────────────────────────

export type SolicitudCobro = {
  pointOfSale: string;
  qrType: "dynamic";
  amount: number;
  detail: string;
  internalTransactionReference: string;
  format: "2";
  expiredTime: number;
  qrFormat: "svgQr300x300_bw";
};

/** Cuerpo de /payment/request. Siempre dinámico (un uso) con QR y enlace. */
export function cuerpoSolicitud(input: { pointOfSale: string; monto: number; codigo: string; detalle: string }): SolicitudCobro {
  if (!(input.monto >= 0.01)) throw new Error("El monto mínimo de DeUna es $0,01.");
  if (input.codigo.length >= 20) throw new Error("La referencia de DeUna debe tener menos de 20 caracteres.");
  return {
    pointOfSale: input.pointOfSale,
    qrType: "dynamic",
    amount: r2(input.monto),
    detail: input.detalle.replace(/\s+/g, " ").trim().slice(0, 50),
    internalTransactionReference: input.codigo,
    format: "2",
    expiredTime: MINUTOS_VIGENCIA_DEUNA,
    qrFormat: "svgQr300x300_bw",
  };
}

export type CobroDeUna = { transactionId: string; deeplink: string; qr: string };

/** Respuesta de /payment/request → lo que necesitamos, o null si no sirve. */
export function leerRespuestaSolicitud(r: unknown): CobroDeUna | null {
  const o = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
  const transactionId = texto(o.transactionId);
  const deeplink = texto(o.deeplink);
  const qr = texto(o.qr);
  if (texto(o.status) !== "1" || !transactionId) return null;
  if (deeplink && !/^https:\/\//i.test(deeplink)) return null;
  // Solo imágenes: el QR se pinta tal cual en la página del cliente.
  if (qr && !/^data:image\/(svg\+xml|png)[;,]/i.test(qr)) return null;
  if (!deeplink && !qr) return null;
  return { transactionId, deeplink, qr };
}

// ─── 2. ¿Cómo quedó el pago? (/payment/info) ────────────────────────────────

export type EstadoDeUna = "APPROVED" | "PENDING" | "REVERSED" | "REVERSED_FAILED" | "NOT_FOUND";

export type InfoDeUna = {
  status: string;
  internalTransactionReference: string;
  amount: number | null;
  transactionId: string;
  transferNumber: string;
  date: string;
  branchId: string;
  posId: string;
  currency: string;
  ordererName: string;
  ordererIdentification: string;
};

export function leerInfo(r: unknown): InfoDeUna {
  const o = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
  const monto = typeof o.amount === "number" ? o.amount : texto(o.amount) ? Number(texto(o.amount)) : NaN;
  return {
    status: texto(o.status).toUpperCase(),
    internalTransactionReference: texto(o.internalTransactionReference),
    amount: Number.isFinite(monto) ? monto : null,
    transactionId: texto(o.transactionId),
    transferNumber: texto(o.transferNumber),
    date: texto(o.date),
    branchId: texto(o.branchId),
    posId: texto(o.posId),
    currency: texto(o.currency).toUpperCase(),
    ordererName: texto(o.ordererName),
    ordererIdentification: texto(o.ordererIdentification),
  };
}

export type ResultadoDeUna =
  | { tipo: "aprobado"; idTransaccion: string; transferencia: string; pagador: string; identificacion: string }
  | { tipo: "pendiente" }
  | { tipo: "devuelto"; detalle: string }
  | { tipo: "no_encontrado" }
  | { tipo: "sospechoso"; detalle: string };

/**
 * ¿Qué nos dijo DeUna de un cobro NUESTRO (PL-…)? No basta con APPROVED: el
 * monto, la moneda, la caja y la referencia deben ser los que guardamos.
 * Ej.: PL-000027 por $105 en la caja 399118 → solo "aprobado" si DeUna dice
 * exactamente eso; si dice $1 → "sospechoso" (no se registra abono).
 */
export function evaluarInfo(
  intento: { codigo: string; monto: number; idTransaccion: string },
  info: InfoDeUna,
  cajaEsperada: string,
): ResultadoDeUna {
  if (info.status === "PENDING") return { tipo: "pendiente" };
  if (info.status === "NOT_FOUND") return { tipo: "no_encontrado" };
  if (info.status === "REVERSED" || info.status === "REVERSED_FAILED") {
    return { tipo: "devuelto", detalle: `DeUna marca este pago como ${info.status === "REVERSED" ? "devuelto al cliente" : "devolución fallida"}.` };
  }
  if (info.status !== "APPROVED") return { tipo: "sospechoso", detalle: `Estado desconocido de DeUna: ${info.status || "—"}.` };
  const problemas = problemasDeUna(info, cajaEsperada);
  if (info.amount == null || centavos(info.amount) !== centavos(intento.monto)) {
    problemas.push(`monto ${info.amount == null ? "—" : usd(info.amount)} ≠ ${usd(intento.monto)}`);
  }
  if (info.internalTransactionReference && info.internalTransactionReference !== intento.codigo) {
    problemas.push(`referencia ${info.internalTransactionReference} ≠ ${intento.codigo}`);
  }
  if (intento.idTransaccion && info.transactionId && info.transactionId !== intento.idTransaccion) {
    problemas.push("otro ID de transacción");
  }
  if (problemas.length) return { tipo: "sospechoso", detalle: `Aprobado por DeUna pero no coincide: ${problemas.join("; ")}.` };
  return {
    tipo: "aprobado",
    idTransaccion: info.transactionId || intento.idTransaccion,
    transferencia: info.transferNumber,
    pagador: nombrePropio(info.ordererName),
    identificacion: info.ordererIdentification,
  };
}

/** Lo que debe cumplir CUALQUIER pago DeUna (también los que llegan sin referencia). */
export function problemasDeUna(info: InfoDeUna, cajaEsperada: string): string[] {
  const p: string[] = [];
  if (info.currency && info.currency !== "USD") p.push(`moneda ${info.currency}`);
  if (cajaEsperada && info.posId && info.posId !== cajaEsperada) p.push(`caja ${info.posId} ≠ ${cajaEsperada}`);
  if (!info.transactionId) p.push("sin ID de transacción");
  if (!info.transferNumber) p.push("sin número de transferencia");
  return p;
}

/** "JUAN CARLOS ZAMBRANO LOPEZ" → "Juan Carlos Zambrano Lopez". */
export function nombrePropio(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|[\s'-])(\p{L})/gu, (_m, sep: string, l: string) => sep + l.toUpperCase());
}

/** Cédula a la vista: "···4521" (nunca completa en pantallas de lista). */
export function identificacionCorta(id: string): string {
  const d = (id ?? "").replace(/\s/g, "");
  return d.length > 4 ? `···${d.slice(-4)}` : d;
}

// ─── 3. El aviso de DeUna (webhook) ─────────────────────────────────────────

export type AvisoDeUna = { idTransaccion: string; referencia: string };

/**
 * Del cuerpo del aviso solo se usan los identificadores: el monto, el nombre
 * y el estado se vuelven a preguntar a DeUna (el aviso podría ser falso).
 */
export function leerAviso(cuerpo: unknown): AvisoDeUna | null {
  const o = cuerpo && typeof cuerpo === "object" ? (cuerpo as Record<string, unknown>) : null;
  if (!o) return null;
  if (texto(o.status).toUpperCase() !== "SUCCESS") return null;
  const idTransaccion = texto(o.idTransaction);
  if (!/^[0-9a-zA-Z-]{8,36}$/.test(idTransaccion)) return null;
  const referencia = texto(o.internalTransactionReference);
  return { idTransaccion, referencia: referencia.length < 40 ? referencia : "" };
}

/** Nombre de la cabecera secreta (no es secreto; la clave sí). */
export const CABECERA_AVISO_DEUNA = "x-supergeek-deuna";
/** La clave del aviso debe ser larga; una corta o vacía = aviso apagado. */
export const LARGO_MINIMO_SECRETO = 32;

export type ResultadoCabecera = "sin_configurar" | "rechazado" | "ok";

/**
 * Codex (18-nov): el receptor RECHAZA todo hasta que la clave esté
 * configurada en el portal Y en DeUna. Comparación en tiempo constante.
 */
export function verificarCabecera(configurada: string, recibida: string | null): ResultadoCabecera {
  const clave = (configurada ?? "").trim();
  if (clave.length < LARGO_MINIMO_SECRETO) return "sin_configurar";
  if (!recibida) return "rechazado";
  // Se comparan huellas del mismo largo: no se filtra el largo de la clave.
  const a = createHash("sha256").update(clave).digest();
  const b = createHash("sha256").update(recibida.trim()).digest();
  return timingSafeEqual(a, b) ? "ok" : "rechazado";
}
